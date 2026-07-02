const socket = io();
const params = new URLSearchParams(window.location.search);
const displayId = params.get("displayId") || `display-${Math.random().toString(16).slice(2, 8)}`;

const stage = document.getElementById("stage");
const displayIdText = document.getElementById("displayIdText");
const connState = document.getElementById("connState");

displayIdText.textContent = `Display: ${displayId}`;

const pcBySource = new Map();
const mediaBySource = new Map();
let currentState = null;

function formatTimer(sec) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function formatStopwatch(ms) {
  const m = Math.max(0, Math.floor(ms));
  const mins = String(Math.floor(m / 60000)).padStart(2, "0");
  const secs = String(Math.floor((m % 60000) / 1000)).padStart(2, "0");
  const milli = String(m % 1000).padStart(3, "0");
  return `${mins}:${secs}.${milli}`;
}

function computeTimer(state) {
  if (!state) return 0;
  const t = state.timer;
  if (!t.running || !t.startedAt) {
    return t.remainingSec;
  }
  const elapsed = (Date.now() - t.startedAt) / 1000;
  return Math.max(0, t.startedFromSec - elapsed);
}

function computeStopwatch(state) {
  if (!state) return 0;
  const s = state.stopwatch;
  if (!s.running || !s.startedAt) {
    return s.elapsedMs;
  }
  return s.elapsedMs + (Date.now() - s.startedAt);
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

function ensurePeerForSource(sourceId) {
  if (pcBySource.has(sourceId)) {
    return pcBySource.get(sourceId);
  }

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      if (!pc.__sourceOwnerSocketId) {
        return;
      }
      socket.emit("webrtc:ice", {
        sourceId,
        targetSocketId: pc.__sourceOwnerSocketId,
        candidate: ev.candidate
      });
    }
  };

  pc.ontrack = (ev) => {
    const [stream] = ev.streams;
    if (stream) {
      mediaBySource.set(sourceId, stream);
      renderState(currentState);
    }
  };

  pc.onconnectionstatechange = () => {
    if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
      pc.close();
      pcBySource.delete(sourceId);
      mediaBySource.delete(sourceId);
      renderState(currentState);
    }
  };

  pcBySource.set(sourceId, pc);
  socket.emit("stream:request", { sourceId });
  return pc;
}

function buildClock(slot) {
  const wrap = document.createElement("div");
  wrap.className = "widget";

  const big = document.createElement("div");
  big.className = "big";

  const small = document.createElement("div");
  small.className = "small";
  big.dataset.widget = "clock-big";
  small.dataset.widget = "clock-small";
  big.dataset.timezone = slot.timezone || "UTC";
  small.dataset.timezone = slot.timezone || "UTC";

  wrap.appendChild(big);
  wrap.appendChild(small);
  return wrap;
}

function buildTimer(state) {
  const wrap = document.createElement("div");
  wrap.className = "widget";
  const big = document.createElement("div");
  big.className = "big";
  big.dataset.widget = "timer";
  wrap.appendChild(big);
  return wrap;
}

function buildStopwatch(state) {
  const wrap = document.createElement("div");
  wrap.className = "widget";
  const big = document.createElement("div");
  big.className = "big";
  big.dataset.widget = "stopwatch";
  wrap.appendChild(big);
  return wrap;
}

function buildRandom(state) {
  const wrap = document.createElement("div");
  wrap.className = "widget";

  const big = document.createElement("div");
  big.className = "big";
  big.textContent = state.randomSelector.selected || "No selection";

  const small = document.createElement("div");
  small.className = "small";
  small.textContent = `${state.randomSelector.options.length} option(s)`;

  wrap.appendChild(big);
  wrap.appendChild(small);
  return wrap;
}

function buildStream(sourceId) {
  const slot = document.createElement("div");
  slot.className = "widget";

  const stream = mediaBySource.get(sourceId);
  if (stream) {
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    return video;
  }

  const msg = document.createElement("div");
  msg.className = "small";
  msg.textContent = "Waiting for stream...";

  if (sourceId) {
    ensurePeerForSource(sourceId);
  }

  slot.appendChild(msg);
  return slot;
}

function buildSlot(slotCfg, state) {
  const slot = document.createElement("section");
  slot.className = "slot";

  if (!slotCfg) {
    return slot;
  }

  switch (slotCfg.kind) {
    case "stream":
      slot.appendChild(buildStream(slotCfg.sourceId));
      break;
    case "clock":
      slot.appendChild(buildClock(slotCfg));
      break;
    case "timer":
      slot.appendChild(buildTimer(state));
      break;
    case "stopwatch":
      slot.appendChild(buildStopwatch(state));
      break;
    case "random":
      slot.appendChild(buildRandom(state));
      break;
    default:
      slot.appendChild(buildStream(slotCfg.sourceId));
      break;
  }

  return slot;
}

function renderState(state) {
  if (!state) return;
  currentState = state;

  const slotCount = slotCountForLayout(state.layout);
  stage.className = `layout-${state.layout}`;
  stage.innerHTML = "";

  for (let i = 1; i <= slotCount; i += 1) {
    const cfg = state.slots.find((s) => s.slotId === i);
    stage.appendChild(buildSlot(cfg, state));
  }

  tickWidgets();
}

function tickWidgets() {
  if (!currentState) {
    return;
  }

  stage.querySelectorAll('[data-widget="clock-big"]').forEach((el) => {
    const tz = el.dataset.timezone || "UTC";
    const now = new Date();
    el.textContent = now.toLocaleTimeString([], { hour12: false, timeZone: tz });
  });

  stage.querySelectorAll('[data-widget="clock-small"]').forEach((el) => {
    const tz = el.dataset.timezone || "UTC";
    const now = new Date();
    el.textContent = `${tz} | ${now.toLocaleDateString([], { timeZone: tz })}`;
  });

  stage.querySelectorAll('[data-widget="timer"]').forEach((el) => {
    el.textContent = formatTimer(computeTimer(currentState));
  });

  stage.querySelectorAll('[data-widget="stopwatch"]').forEach((el) => {
    el.textContent = formatStopwatch(computeStopwatch(currentState));
  });
}

socket.on("connect", () => {
  connState.textContent = `Connected ${socket.id.slice(0, 8)}`;
  socket.emit("register:display", { displayId });
});

socket.on("disconnect", () => {
  connState.textContent = "Disconnected";
});

socket.on("display:registered", ({ displayId: confirmed }) => {
  displayIdText.textContent = `Display: ${confirmed}`;
});

socket.on("state:init", renderState);
socket.on("state:update", renderState);

socket.on("source:ended", ({ sourceId }) => {
  const pc = pcBySource.get(sourceId);
  if (pc) pc.close();
  pcBySource.delete(sourceId);
  mediaBySource.delete(sourceId);
  renderState(currentState);
});

socket.on("stream:unavailable", ({ sourceId }) => {
  const pc = pcBySource.get(sourceId);
  if (pc) pc.close();
  pcBySource.delete(sourceId);
  mediaBySource.delete(sourceId);
  renderState(currentState);
});

socket.on("webrtc:offer", async ({ sourceId, fromSocketId, sdp }) => {
  const pc = ensurePeerForSource(sourceId);

  // Bind the sender socket id once known from signaling offer.
  pc.__sourceOwnerSocketId = fromSocketId;

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("webrtc:answer", {
      sourceId,
      targetSocketId: fromSocketId,
      sdp: answer
    });
  } catch (err) {
    console.error("Failed handling offer", err);
  }
});

socket.on("webrtc:ice", async ({ sourceId, fromSocketId, candidate }) => {
  const pc = ensurePeerForSource(sourceId);
  if (!candidate) return;

  if (!pc.__sourceOwnerSocketId) {
    pc.__sourceOwnerSocketId = fromSocketId;
  }

  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error("Failed adding ICE candidate", err);
  }
});

setInterval(tickWidgets, 100);
