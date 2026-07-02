const socket = io();

const connStatus = document.getElementById("connStatus");
const slotControls = document.getElementById("slotControls");
const sourceLabelInput = document.getElementById("sourceLabel");
const startSourceBtn = document.getElementById("startSourceBtn");
const stopSourceBtn = document.getElementById("stopSourceBtn");
const sourceInfo = document.getElementById("sourceInfo");

const timerSecondsInput = document.getElementById("timerSeconds");
const timerPreview = document.getElementById("timerPreview");
const swPreview = document.getElementById("swPreview");
const randomOptions = document.getElementById("randomOptions");
const randomPreview = document.getElementById("randomPreview");

const pcBySourceAndTarget = new Map();
const localStreams = new Map();

let myName = `Controller-${Math.random().toString(16).slice(2, 6)}`;
let mySourceId = null;
let latestState = null;

function key(sourceId, targetSocketId) {
  return `${sourceId}::${targetSocketId}`;
}

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

function getSlotPositionLabel(layout, slotId) {
  const id = Number(slotId);
  if (layout === "split-h") {
    return id === 1 ? "Top" : id === 2 ? "Bottom" : "";
  }
  if (layout === "split-v") {
    return id === 1 ? "Left" : id === 2 ? "Right" : "";
  }
  if (layout === "grid-2x2") {
    if (id === 1) return "Top Left";
    if (id === 2) return "Top Right";
    if (id === 3) return "Bottom Left";
    if (id === 4) return "Bottom Right";
  }
  if (layout === "single") {
    return "Main";
  }
  return "";
}

function buildSlotControls(state) {
  slotControls.innerHTML = "";
  const streams = state.streams || [];

  for (let i = 1; i <= state.slotCount; i += 1) {
    const slot = state.slots.find((s) => s.slotId === i);
    const panel = document.createElement("div");
    panel.className = "slot-panel";

    const title = document.createElement("h3");
    const posLabel = getSlotPositionLabel(state.layout, i);
    title.textContent = posLabel ? `Slot ${i} (${posLabel})` : `Slot ${i}`;

    const kindSelect = document.createElement("select");
    ["stream", "clock", "timer", "stopwatch", "random"].forEach((k) => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      if (slot.kind === k) opt.selected = true;
      kindSelect.appendChild(opt);
    });

    const streamSelect = document.createElement("select");
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "No stream";
    streamSelect.appendChild(none);
    streams.forEach((st) => {
      const opt = document.createElement("option");
      opt.value = st.sourceId;
      opt.textContent = `${st.label} (${st.sourceId.slice(0, 10)})`;
      if (slot.sourceId === st.sourceId) opt.selected = true;
      streamSelect.appendChild(opt);
    });

    const tzInput = document.createElement("input");
    tzInput.placeholder = "Timezone (e.g. Europe/London)";
    tzInput.value = slot.timezone || "UTC";

    const applyBtn = document.createElement("button");
    applyBtn.textContent = "Apply";
    applyBtn.onclick = () => {
      socket.emit("slot:set", {
        slotId: i,
        kind: kindSelect.value,
        sourceId: streamSelect.value || null,
        timezone: tzInput.value || "UTC"
      });
    };

    const row1 = document.createElement("div");
    row1.className = "row wrap";
    row1.appendChild(kindSelect);
    row1.appendChild(streamSelect);

    const row2 = document.createElement("div");
    row2.className = "row wrap";
    row2.appendChild(tzInput);
    row2.appendChild(applyBtn);

    panel.appendChild(title);
    panel.appendChild(row1);
    panel.appendChild(row2);
    slotControls.appendChild(panel);
  }
}

function renderState(state) {
  latestState = state;
  buildSlotControls(state);
  timerPreview.textContent = formatTimer(computeTimer(state));
  swPreview.textContent = formatStopwatch(computeStopwatch(state));
  randomPreview.textContent = state.randomSelector.selected || "No selection";
}

async function ensureSourceStarted() {
  if (mySourceId && localStreams.has(mySourceId)) {
    return;
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true
  });

  socket.emit("source:start", {
    label: sourceLabelInput.value.trim() || `${myName} Stream`
  });

  socket.once("source:started", ({ sourceId }) => {
    mySourceId = sourceId;
    localStreams.set(sourceId, stream);
    sourceInfo.textContent = `Active source: ${sourceId}`;
    stopSourceBtn.disabled = false;

    const [videoTrack] = stream.getVideoTracks();
    if (videoTrack) {
      videoTrack.addEventListener("ended", () => stopMySource());
    }
  });
}

function stopMySource() {
  if (!mySourceId) return;
  const stream = localStreams.get(mySourceId);
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }

  for (const [k, pc] of pcBySourceAndTarget.entries()) {
    if (k.startsWith(`${mySourceId}::`)) {
      pc.close();
      pcBySourceAndTarget.delete(k);
    }
  }

  socket.emit("source:stop", { sourceId: mySourceId });
  localStreams.delete(mySourceId);
  sourceInfo.textContent = "No active source.";
  stopSourceBtn.disabled = true;
  mySourceId = null;
}

async function createOfferForTarget(sourceId, targetSocketId) {
  const stream = localStreams.get(sourceId);
  if (!stream) return;

  const k = key(sourceId, targetSocketId);
  let pc = pcBySourceAndTarget.get(k);
  if (!pc) {
    pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        socket.emit("webrtc:ice", {
          targetSocketId,
          sourceId,
          candidate: ev.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        pc.close();
        pcBySourceAndTarget.delete(k);
      }
    };

    pcBySourceAndTarget.set(k, pc);
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("webrtc:offer", {
    targetSocketId,
    sourceId,
    sdp: offer
  });
}

socket.on("connect", () => {
  connStatus.textContent = `Connected (${socket.id.slice(0, 8)})`;
  socket.emit("register:controller", { name: myName });
});

socket.on("disconnect", () => {
  connStatus.textContent = "Disconnected";
});

socket.on("state:init", renderState);
socket.on("state:update", renderState);

socket.on("source:ended", ({ sourceId }) => {
  if (sourceId === mySourceId) {
    stopMySource();
  }
});

socket.on("webrtc:offer-request", async ({ sourceId, targetSocketId }) => {
  if (!localStreams.has(sourceId)) return;
  try {
    await createOfferForTarget(sourceId, targetSocketId);
  } catch (err) {
    console.error("Failed creating offer", err);
  }
});

socket.on("webrtc:answer", async ({ sourceId, fromSocketId, sdp }) => {
  const k = key(sourceId, fromSocketId);
  const pc = pcBySourceAndTarget.get(k);
  if (!pc) return;
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  } catch (err) {
    console.error("Failed setting answer", err);
  }
});

socket.on("webrtc:ice", async ({ sourceId, fromSocketId, candidate }) => {
  const k = key(sourceId, fromSocketId);
  const pc = pcBySourceAndTarget.get(k);
  if (!pc || !candidate) return;
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error("Failed adding ICE candidate", err);
  }
});

document.querySelectorAll("[data-layout]").forEach((btn) => {
  btn.addEventListener("click", () => {
    socket.emit("layout:set", { layout: btn.dataset.layout });
  });
});

startSourceBtn.addEventListener("click", async () => {
  try {
    await ensureSourceStarted();
  } catch (err) {
    console.error(err);
    alert("Unable to capture screen/application. Check browser permissions.");
  }
});

stopSourceBtn.addEventListener("click", stopMySource);

document.getElementById("timerSet").onclick = () => {
  socket.emit("timer:set", { durationSec: Number(timerSecondsInput.value || 300) });
};

document.getElementById("timerStart").onclick = () => socket.emit("timer:start");
document.getElementById("timerStop").onclick = () => socket.emit("timer:stop");
document.getElementById("timerReset").onclick = () => socket.emit("timer:reset");

document.getElementById("swStart").onclick = () => socket.emit("stopwatch:start");
document.getElementById("swStop").onclick = () => socket.emit("stopwatch:stop");
document.getElementById("swReset").onclick = () => socket.emit("stopwatch:reset");

document.getElementById("randomSave").onclick = () => {
  const options = randomOptions.value
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  socket.emit("random:set-options", { options });
};

document.getElementById("randomRoll").onclick = () => socket.emit("random:roll");

setInterval(() => {
  if (latestState) {
    timerPreview.textContent = formatTimer(computeTimer(latestState));
    swPreview.textContent = formatStopwatch(computeStopwatch(latestState));
  }
}, 150);
