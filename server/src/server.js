const path = require("path");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3000);
const ORIGIN = process.env.ORIGIN || "*";
const DEFAULT_SCREEN_ID = "screen-1";

const app = express();
app.use(cors({ origin: ORIGIN === "*" ? true : ORIGIN }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/", (_, res) => {
  res.redirect("/control");
});

app.get("/health", (_, res) => {
  res.json({ ok: true, service: "multiscreen-server" });
});

app.get("/control", (_, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "control", "index.html"));
});

app.get("/display", (_, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "display", "index.html"));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGIN === "*" ? true : ORIGIN },
  pingInterval: 10000,
  pingTimeout: 20000
});

function createDefaultSlots() {
  return [1, 2, 3, 4].map((slotId) => ({
    slotId,
    kind: "stream",
    sourceId: null,
    timezone: "UTC"
  }));
}

function createScreen(screenId, name) {
  return {
    screenId,
    name: String(name || "Screen"),
    layout: "single",
    slotCount: 1,
    slots: createDefaultSlots()
  };
}

const state = {
  activeScreenId: DEFAULT_SCREEN_ID,
  screens: [createScreen(DEFAULT_SCREEN_ID, "Screen 1")],
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
const displays = new Map(); // socketId -> { displayId, screenId }
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

function getScreen(screenId) {
  return state.screens.find((screen) => screen.screenId === screenId) || null;
}

function getNextScreenName() {
  const screenId = makeScreenId();
  return `Screen ${screenId.slice("screen-".length)}`;
}

function ensureScreen(screenId, name = getNextScreenName()) {
  const existing = getScreen(screenId);
  if (existing) {
    return existing;
  }

  const screen = createScreen(screenId, name);
  state.screens.push(screen);
  return screen;
}

function getActiveScreen() {
  return getScreen(state.activeScreenId) || state.screens[0] || null;
}

function makeScreenId() {
  let index = 1;
  let screenId = `screen-${index}`;

  while (getScreen(screenId)) {
    index += 1;
    screenId = `screen-${index}`;
  }

  return screenId;
}

function getPublicState() {
  return {
    activeScreenId: state.activeScreenId,
    screens: state.screens.map((screen) => ({
      ...screen,
      slots: screen.slots.map((slot) => ({ ...slot }))
    })),
    timer: { ...state.timer },
    stopwatch: { ...state.stopwatch },
    randomSelector: {
      ...state.randomSelector,
      options: [...state.randomSelector.options]
    },
    streams: Array.from(streamSources.entries()).map(([sourceId, info]) => ({
      sourceId,
      label: info.label,
      ownerSocketId: info.ownerSocketId,
      createdAt: info.createdAt
    })),
    displays: Array.from(displays.values()).map((display) => ({ ...display })),
    serverTimeMs: nowMs()
  };
}

function broadcastState() {
  io.emit("state:update", getPublicState());
}

function clampScreenSlots(screen) {
  const maxSlots = slotCountForLayout(screen.layout);
  screen.slotCount = maxSlots;
  for (const slot of screen.slots) {
    if (slot.slotId > maxSlots) {
      slot.kind = "stream";
      slot.sourceId = null;
      slot.timezone = "UTC";
    }
  }
}

function cleanupSource(sourceId) {
  streamSources.delete(sourceId);
  for (const screen of state.screens) {
    for (const slot of screen.slots) {
      if (slot.sourceId === sourceId) {
        slot.sourceId = null;
      }
    }
  }
}

function assignSourceToScreen(screenId, sourceId) {
  const screen = getScreen(screenId) || getActiveScreen();
  if (!screen) {
    return;
  }

  const usableSlots = screen.slots.filter((slot) => slot.slotId <= screen.slotCount);
  if (!usableSlots.length) {
    return;
  }

  const targetSlot =
    usableSlots.find((slot) => slot.kind === "stream" && !slot.sourceId) ||
    usableSlots.find((slot) => slot.kind === "stream") ||
    usableSlots[0];

  targetSlot.kind = "stream";
  targetSlot.sourceId = sourceId;
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

  socket.on("register:display", ({ displayId, screenId }) => {
    const safeId = String(displayId || `display-${crypto.randomUUID().slice(0, 8)}`);
    const safeScreenId = String(screenId || safeId);

    ensureScreen(safeScreenId);
    displays.set(socket.id, { displayId: safeId, screenId: safeScreenId });
    socket.emit("display:registered", { displayId: safeId, screenId: safeScreenId });
    socket.emit("state:init", getPublicState());
    broadcastState();
  });

  socket.on("screen:select", ({ screenId }) => {
    if (!getScreen(screenId)) {
      return;
    }
    state.activeScreenId = screenId;
    broadcastState();
  });

  socket.on("screen:add", ({ name }) => {
    const screenId = makeScreenId();
    const screen = ensureScreen(screenId, String(name || getNextScreenName()));
    state.activeScreenId = screen.screenId;
    broadcastState();
  });

  socket.on("screen:remove", ({ screenId }) => {
    if (state.screens.length <= 1) {
      return;
    }

    const index = state.screens.findIndex((screen) => screen.screenId === screenId);
    if (index === -1) {
      return;
    }

    state.screens.splice(index, 1);

    if (state.activeScreenId === screenId) {
      state.activeScreenId = state.screens[0].screenId;
    }

    broadcastState();
  });

  socket.on("layout:set", ({ screenId, layout }) => {
    if (!["single", "split-h", "split-v", "grid-2x2"].includes(layout)) {
      return;
    }

    const screen = getScreen(screenId) || getActiveScreen();
    if (!screen) {
      return;
    }

    screen.layout = layout;
    clampScreenSlots(screen);
    broadcastState();
  });

  socket.on("slot:set", ({ screenId, slotId, kind, sourceId, timezone }) => {
    const screen = getScreen(screenId) || getActiveScreen();
    if (!screen) {
      return;
    }

    const slot = screen.slots.find((s) => s.slotId === Number(slotId));
    if (!slot || slot.slotId > screen.slotCount) {
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
    assignSourceToScreen(state.activeScreenId, sourceId);
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
      displays.delete(socket.id);
    }

    broadcastState();
  });
});

server.listen(PORT, () => {
  console.log(`MultiscreenDisplayManager server listening on :${PORT}`);
});
