const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3000);
const ORIGIN = process.env.ORIGIN || "*";

const app = express();
app.use(cors({ origin: ORIGIN === "*" ? true : ORIGIN }));
app.use(express.static(path.join(__dirname, "..", "public")));

const CADDY_ROOT_CERT_PATH = "/caddy-data/caddy/pki/authorities/local/root.crt";

app.get("/health", (_, res) => {
  res.json({ ok: true, service: "multiscreen-server" });
});

app.get("/control", (_, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "control", "index.html"));
});

app.get("/display", (_, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "display", "index.html"));
});

app.get("/cert", (_, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "cert", "index.html"));
});

app.get("/api/cert/root.crt", (_, res) => {
  if (!fs.existsSync(CADDY_ROOT_CERT_PATH)) {
    return res.status(404).json({
      ok: false,
      message: "Certificate not found yet. Start the HTTPS proxy once, then try again."
    });
  }

  return res.download(CADDY_ROOT_CERT_PATH, "multiscreen-caddy-root.crt");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGIN === "*" ? true : ORIGIN },
  pingInterval: 10000,
  pingTimeout: 20000
});

const state = {
  layout: "single", // single | split-h | split-v | grid-2x2
  slotCount: 1,
  slots: [
    {
      slotId: 1,
      kind: "stream", // stream | clock | timer | stopwatch | random
      sourceId: null,
      timezone: "UTC"
    },
    {
      slotId: 2,
      kind: "stream",
      sourceId: null,
      timezone: "UTC"
    },
    {
      slotId: 3,
      kind: "stream",
      sourceId: null,
      timezone: "UTC"
    },
    {
      slotId: 4,
      kind: "stream",
      sourceId: null,
      timezone: "UTC"
    }
  ],
  timer: {
    durationSec: 300,
    startedFromSec: 300,
    running: false,
    startedAt: null,
    remainingSec: 300
  },
  stopwatch: {
    elapsedMs: 0,
    running: false,
    startedAt: null
  },
  randomSelector: {
    options: [],
    selected: null,
    updatedAt: Date.now()
  }
};

const controllers = new Map(); // socketId -> { name }
const displays = new Map(); // socketId -> { displayId }
const displayIdToSocket = new Map(); // displayId -> socketId
const streamSources = new Map(); // sourceId -> { ownerSocketId, label, createdAt }

function nowMs() {
  return Date.now();
}

function makeSourceId() {
  return `src_${crypto.randomUUID()}`;
}

function slotCountForLayout(layout) {
  switch (layout) {
    case "single":
      return 1;
    case "split-h":
    case "split-v":
      return 2;
    case "grid-2x2":
      return 4;
    default:
      return 1;
  }
}

function getPublicState() {
  return {
    ...state,
    streams: Array.from(streamSources.entries()).map(([sourceId, info]) => ({
      sourceId,
      label: info.label,
      ownerSocketId: info.ownerSocketId,
      createdAt: info.createdAt
    })),
    serverTimeMs: nowMs()
  };
}

function broadcastState() {
  io.emit("state:update", getPublicState());
}

function clampLayoutSlots() {
  const maxSlots = slotCountForLayout(state.layout);
  state.slotCount = maxSlots;
  for (const slot of state.slots) {
    if (slot.slotId > maxSlots) {
      slot.kind = "stream";
      slot.sourceId = null;
      slot.timezone = "UTC";
    }
  }
}

function cleanupSource(sourceId) {
  streamSources.delete(sourceId);
  for (const slot of state.slots) {
    if (slot.sourceId === sourceId) {
      slot.sourceId = null;
    }
  }
}

function removeControllerSources(socketId) {
  for (const [sourceId, info] of streamSources.entries()) {
    if (info.ownerSocketId === socketId) {
      cleanupSource(sourceId);
    }
  }
}

function effectiveTimerRemainingSec(timerState, atMs = nowMs()) {
  if (!timerState.running || !timerState.startedAt) {
    return Math.max(0, Math.floor(timerState.remainingSec));
  }
  const elapsedSec = (atMs - timerState.startedAt) / 1000;
  return Math.max(0, Math.floor(timerState.startedFromSec - elapsedSec));
}

function effectiveStopwatchElapsedMs(swState, atMs = nowMs()) {
  if (!swState.running || !swState.startedAt) {
    return Math.max(0, Math.floor(swState.elapsedMs));
  }
  return Math.max(0, Math.floor(swState.elapsedMs + (atMs - swState.startedAt)));
}

setInterval(() => {
  if (state.timer.running) {
    const remaining = effectiveTimerRemainingSec(state.timer);
    if (remaining <= 0) {
      state.timer.running = false;
      state.timer.startedAt = null;
      state.timer.remainingSec = 0;
      broadcastState();
    }
  }
}, 200);

io.on("connection", (socket) => {
  socket.on("register:controller", ({ name }) => {
    controllers.set(socket.id, { name: String(name || "Controller") });
    socket.emit("state:init", getPublicState());
    broadcastState();
  });

  socket.on("register:display", ({ displayId }) => {
    const safeId = String(displayId || `display-${crypto.randomUUID().slice(0, 8)}`);
    displays.set(socket.id, { displayId: safeId });
    displayIdToSocket.set(safeId, socket.id);
    socket.emit("display:registered", { displayId: safeId });
    socket.emit("state:init", getPublicState());
    broadcastState();
  });

  socket.on("layout:set", ({ layout }) => {
    if (!["single", "split-h", "split-v", "grid-2x2"].includes(layout)) {
      return;
    }
    state.layout = layout;
    clampLayoutSlots();
    broadcastState();
  });

  socket.on("slot:set", ({ slotId, kind, sourceId, timezone }) => {
    const slot = state.slots.find((s) => s.slotId === Number(slotId));
    if (!slot || slot.slotId > state.slotCount) {
      return;
    }
    if (!["stream", "clock", "timer", "stopwatch", "random"].includes(kind)) {
      return;
    }

    slot.kind = kind;
    if (kind === "stream") {
      slot.sourceId = streamSources.has(sourceId) ? sourceId : null;
    } else {
      slot.sourceId = null;
    }

    if (kind === "clock") {
      slot.timezone = String(timezone || "UTC");
    }

    broadcastState();
  });

  socket.on("source:start", ({ label }) => {
    const sourceId = makeSourceId();
    streamSources.set(sourceId, {
      ownerSocketId: socket.id,
      label: String(label || "Shared Screen"),
      createdAt: nowMs()
    });
    socket.emit("source:started", { sourceId });
    broadcastState();
  });

  socket.on("source:stop", ({ sourceId }) => {
    const source = streamSources.get(sourceId);
    if (!source) {
      return;
    }
    if (source.ownerSocketId !== socket.id) {
      return;
    }
    cleanupSource(sourceId);
    io.emit("source:ended", { sourceId });
    broadcastState();
  });

  socket.on("stream:request", ({ sourceId }) => {
    const source = streamSources.get(sourceId);
    if (!source) {
      socket.emit("stream:unavailable", { sourceId });
      return;
    }
    io.to(source.ownerSocketId).emit("webrtc:offer-request", {
      sourceId,
      targetSocketId: socket.id
    });
  });

  socket.on("webrtc:offer", ({ targetSocketId, sourceId, sdp }) => {
    io.to(targetSocketId).emit("webrtc:offer", {
      sourceId,
      fromSocketId: socket.id,
      sdp
    });
  });

  socket.on("webrtc:answer", ({ targetSocketId, sourceId, sdp }) => {
    io.to(targetSocketId).emit("webrtc:answer", {
      sourceId,
      fromSocketId: socket.id,
      sdp
    });
  });

  socket.on("webrtc:ice", ({ targetSocketId, sourceId, candidate }) => {
    io.to(targetSocketId).emit("webrtc:ice", {
      sourceId,
      fromSocketId: socket.id,
      candidate
    });
  });

  socket.on("timer:set", ({ durationSec }) => {
    const dur = Math.max(1, Math.min(86400, Number(durationSec || 1)));
    state.timer.durationSec = dur;
    state.timer.startedFromSec = dur;
    state.timer.remainingSec = dur;
    state.timer.running = false;
    state.timer.startedAt = null;
    broadcastState();
  });

  socket.on("timer:start", () => {
    if (!state.timer.running) {
      const remaining = effectiveTimerRemainingSec(state.timer);
      state.timer.remainingSec = remaining;
      state.timer.startedFromSec = remaining;
      state.timer.running = true;
      state.timer.startedAt = nowMs();
      broadcastState();
    }
  });

  socket.on("timer:stop", () => {
    if (state.timer.running) {
      state.timer.remainingSec = effectiveTimerRemainingSec(state.timer);
      state.timer.running = false;
      state.timer.startedAt = null;
      broadcastState();
    }
  });

  socket.on("timer:reset", () => {
    state.timer.running = false;
    state.timer.startedAt = null;
    state.timer.startedFromSec = state.timer.durationSec;
    state.timer.remainingSec = state.timer.durationSec;
    broadcastState();
  });

  socket.on("stopwatch:start", () => {
    if (!state.stopwatch.running) {
      state.stopwatch.running = true;
      state.stopwatch.startedAt = nowMs();
      broadcastState();
    }
  });

  socket.on("stopwatch:stop", () => {
    if (state.stopwatch.running) {
      state.stopwatch.elapsedMs = effectiveStopwatchElapsedMs(state.stopwatch);
      state.stopwatch.running = false;
      state.stopwatch.startedAt = null;
      broadcastState();
    }
  });

  socket.on("stopwatch:reset", () => {
    state.stopwatch.elapsedMs = 0;
    state.stopwatch.running = false;
    state.stopwatch.startedAt = null;
    broadcastState();
  });

  socket.on("random:set-options", ({ options }) => {
    const cleaned = Array.isArray(options)
      ? options
          .map((x) => String(x || "").trim())
          .filter(Boolean)
          .slice(0, 100)
      : [];
    state.randomSelector.options = cleaned;
    state.randomSelector.selected = null;
    state.randomSelector.updatedAt = nowMs();
    broadcastState();
  });

  socket.on("random:roll", () => {
    if (!state.randomSelector.options.length) {
      state.randomSelector.selected = null;
    } else {
      const idx = Math.floor(Math.random() * state.randomSelector.options.length);
      state.randomSelector.selected = state.randomSelector.options[idx];
    }
    state.randomSelector.updatedAt = nowMs();
    broadcastState();
  });

  socket.on("disconnect", () => {
    if (controllers.has(socket.id)) {
      removeControllerSources(socket.id);
      controllers.delete(socket.id);
    }

    if (displays.has(socket.id)) {
      const { displayId } = displays.get(socket.id);
      displayIdToSocket.delete(displayId);
      displays.delete(socket.id);
    }

    broadcastState();
  });
});

server.listen(PORT, () => {
  console.log(`MultiscreenDisplayManager server listening on :${PORT}`);
});
