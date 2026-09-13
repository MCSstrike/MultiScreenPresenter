const socket = io();

const connStatus = document.getElementById("connStatus");
const slotControls = document.getElementById("slotControls");
const screenTabs = document.getElementById("screenTabs");
const displayPageLink = document.getElementById("displayPageLink");
const addScreenBtn = document.getElementById("addScreenBtn");
const removeScreenBtn = document.getElementById("removeScreenBtn");
const sourceLabelInput = document.getElementById("sourceLabel");
const streamProfileSelect = document.getElementById("streamProfile");
const streamProfileHint = document.getElementById("streamProfileHint");
const startSourceBtn = document.getElementById("startSourceBtn");
const stopSourceBtn = document.getElementById("stopSourceBtn");
const sourceInfo = document.getElementById("sourceInfo");
const slideshowNameInput = document.getElementById("slideshowName");
const slideshowIntervalInput = document.getElementById("slideshowInterval");
const slideshowFilesInput = document.getElementById("slideshowFiles");
const slideshowFolderInput = document.getElementById("slideshowFolder");
const slideshowUploadBtn = document.getElementById("slideshowUploadBtn");
const slideshowPptxInput = document.getElementById("slideshowPptx");
const slideshowUploadPptxBtn = document.getElementById("slideshowUploadPptxBtn");
const slideshowStatus = document.getElementById("slideshowStatus");
const slideshowSelect = document.getElementById("slideshowSelect");
const slideshowPlayBtn = document.getElementById("slideshowPlay");
const slideshowPauseBtn = document.getElementById("slideshowPause");
const slideshowPrevBtn = document.getElementById("slideshowPrev");
const slideshowNextBtn = document.getElementById("slideshowNext");
const slideshowDeleteBtn = document.getElementById("slideshowDelete");
const slideshowIndexInput = document.getElementById("slideshowIndex");
const slideshowIndexLabel = document.getElementById("slideshowIndexLabel");

const timerSecondsInput = document.getElementById("timerSeconds");
const timerPreview = document.getElementById("timerPreview");
const swPreview = document.getElementById("swPreview");
const randomOptions = document.getElementById("randomOptions");
const randomPreview = document.getElementById("randomPreview");
const randomSaveBtn = document.getElementById("randomSave");
const randomRollBtn = document.getElementById("randomRoll");
const layoutButtons = Array.from(document.querySelectorAll("[data-layout]"));

import { initRandomControl } from "./modules/random-control.js";
const randomControl = initRandomControl(socket, randomOptions, randomPreview, randomSaveBtn, randomRollBtn);

const pcBySourceAndTarget = new Map();
const localStreams = new Map();
const SOURCE_LABEL_STORAGE_KEY = "multiscreen-source-label";

const STREAM_PROFILES = {
  "lan-high": {
    label: "LAN High",
    maxFps: 30,
    maxBitrateBps: 12_000_000
  },
  balanced: {
    label: "Balanced",
    maxFps: 15,
    maxBitrateBps: 2_500_000
  },
  "mobile-10": {
    label: "Mobile Saver",
    maxFps: 10,
    maxBitrateBps: 900_000
  },
  "mobile-5": {
    label: "Mobile Ultra Saver",
    maxFps: 5,
    maxBitrateBps: 350_000
  }
};

let myName = `Controller-${Math.random().toString(16).slice(2, 6)}`;
let mySourceId = null;
let latestState = null;
let mySourceKind = null;
let selectedSlideshowId = null;

function getActiveScreen(state = latestState) {
  if (!state?.screens?.length) {
    return null;
  }

  return state.screens.find((screen) => screen.screenId === state.activeScreenId) || state.screens[0];
}

function key(sourceId, targetSocketId) {
  return `${sourceId}::${targetSocketId}`;
}

function getSelectedProfile() {
  return STREAM_PROFILES[streamProfileSelect.value] || STREAM_PROFILES.balanced;
}

function getRequiredSourceLabel() {
  const label = sourceLabelInput.value.trim();
  if (label) {
    return label;
  }

  sourceLabelInput.reportValidity();
  sourceLabelInput.focus();
  sourceInfo.textContent = "Enter a source name before sharing.";
  return null;
}

function restoreSourceLabel() {
  try {
    sourceLabelInput.value = localStorage.getItem(SOURCE_LABEL_STORAGE_KEY) || "";
  } catch (err) {
    console.warn("Unable to restore source name", err);
  }
}

function saveSourceLabel() {
  try {
    localStorage.setItem(SOURCE_LABEL_STORAGE_KEY, sourceLabelInput.value.trim());
  } catch (err) {
    console.warn("Unable to save source name", err);
  }
}

function formatBitrate(bps) {
  if (bps >= 1_000_000) {
    return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  }
  return `${Math.round(bps / 1000)} kbps`;
}

function updateStreamProfileHint() {
  const profile = getSelectedProfile();
  streamProfileHint.textContent = `Profile: ${profile.label} | Up to ${profile.maxFps} FPS | Up to ${formatBitrate(
    profile.maxBitrateBps
  )}`;
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

function updateDisplayLink(screen) {
  const screenId = screen?.screenId || "screen-1";
  displayPageLink.href = `/display?screenId=${encodeURIComponent(screenId)}`;
}

function getAllSlideshows(state = latestState) {
  return Array.isArray(state?.slideshows) ? state.slideshows : [];
}

function getSelectedSlideshow(state = latestState) {
  const slideshows = getAllSlideshows(state);
  if (!slideshows.length) {
    return null;
  }

  if (selectedSlideshowId) {
    const selected = slideshows.find((slideshow) => slideshow.slideshowId === selectedSlideshowId);
    if (selected) {
      return selected;
    }
  }

  selectedSlideshowId = slideshows[0].slideshowId;
  return slideshows[0];
}

function setSlideshowStatus(message) {
  slideshowStatus.textContent = message;
}

async function readApiPayload(response) {
  const bodyText = await response.text();
  let payload = null;

  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch (_err) {
    payload = null;
  }

  if (!payload || typeof payload !== "object") {
    const fallback = bodyText ? bodyText.slice(0, 200).replace(/\s+/g, " ").trim() : "No response body";
    payload = {
      ok: false,
      error: `Server returned a non-JSON response (${response.status} ${response.statusText}). ${fallback}`
    };
  }

  return payload;
}

function renderSlideshowControls(state) {
  const slideshows = getAllSlideshows(state);
  const selected = getSelectedSlideshow(state);

  slideshowSelect.innerHTML = "";
  slideshows.forEach((slideshow) => {
    const opt = document.createElement("option");
    opt.value = slideshow.slideshowId;
    opt.textContent = `${slideshow.name} (${slideshow.slides.length} slide${slideshow.slides.length === 1 ? "" : "s"})`;
    if (selected && slideshow.slideshowId === selected.slideshowId) {
      opt.selected = true;
    }
    slideshowSelect.appendChild(opt);
  });

  const hasSelection = Boolean(selected);
  slideshowSelect.disabled = !slideshows.length;
  slideshowPlayBtn.disabled = !hasSelection;
  slideshowPauseBtn.disabled = !hasSelection;
  slideshowPrevBtn.disabled = !hasSelection;
  slideshowNextBtn.disabled = !hasSelection;
  slideshowDeleteBtn.disabled = !hasSelection;

  if (!selected) {
    slideshowIndexInput.value = "0";
    slideshowIndexInput.min = "0";
    slideshowIndexInput.max = "0";
    slideshowIndexInput.disabled = true;
    slideshowIndexLabel.textContent = "Slide 0 / 0";
    return;
  }

  slideshowIntervalInput.value = String(selected.intervalSec);
  slideshowIndexInput.disabled = false;
  slideshowIndexInput.min = "0";
  slideshowIndexInput.max = String(Math.max(0, selected.slides.length - 1));
  slideshowIndexInput.value = String(selected.currentIndex || 0);
  slideshowIndexLabel.textContent = `Slide ${(selected.currentIndex || 0) + 1} / ${selected.slides.length}`;
}

async function createSlideshowFromSelectedFiles() {
  const files = [...(slideshowFilesInput.files || []), ...(slideshowFolderInput.files || [])];
  if (!files.length) {
    setSlideshowStatus("Select pictures or a folder before creating a slideshow.");
    return;
  }

  const intervalSec = Number(slideshowIntervalInput.value || 5);
  const formData = new FormData();
  formData.append("name", slideshowNameInput.value.trim() || "Slideshow");
  formData.append("intervalSec", String(intervalSec));

  files.forEach((file) => {
    formData.append("slides", file, file.name);
  });

  setSlideshowStatus(`Uploading ${files.length} image(s)...`);

  try {
    const response = await fetch("/api/slideshows/images", {
      method: "POST",
      body: formData
    });
    const payload = await readApiPayload(response);

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Upload failed");
    }

    selectedSlideshowId = payload.slideshow.slideshowId;
    slideshowFilesInput.value = "";
    slideshowFolderInput.value = "";
    setSlideshowStatus(`Created slideshow \"${payload.slideshow.name}\" with ${payload.slideshow.slides.length} slides.`);
  } catch (err) {
    console.error("Failed creating slideshow", err);
    setSlideshowStatus(`Slideshow upload failed: ${err.message || "Unknown error"}`);
  }
}

async function createSlideshowFromPptx() {
  const pptxFile = slideshowPptxInput.files?.[0];
  if (!pptxFile) {
    setSlideshowStatus("Select a .pptx file before creating a slideshow.");
    return;
  }

  const intervalSec = Number(slideshowIntervalInput.value || 5);
  const formData = new FormData();
  formData.append("name", slideshowNameInput.value.trim() || pathBasenameWithoutExt(pptxFile.name) || "Slideshow");
  formData.append("intervalSec", String(intervalSec));
  formData.append("pptx", pptxFile, pptxFile.name);

  setSlideshowStatus("Uploading and converting PPTX. This can take a little while...");

  try {
    const response = await fetch("/api/slideshows/pptx", {
      method: "POST",
      body: formData
    });
    const payload = await readApiPayload(response);

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "PPTX conversion failed");
    }

    selectedSlideshowId = payload.slideshow.slideshowId;
    slideshowPptxInput.value = "";
    setSlideshowStatus(
      `Created slideshow \"${payload.slideshow.name}\" from PPTX with ${payload.slideshow.slides.length} slides.`
    );
  } catch (err) {
    console.error("Failed creating slideshow from PPTX", err);
    setSlideshowStatus(`PPTX upload failed: ${err.message || "Unknown error"}`);
  }
}

function pathBasenameWithoutExt(filename) {
  const name = String(filename || "").split(/[\\/]/).pop() || "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return name;
  }
  return name.slice(0, dot);
}

function buildScreenTabs(state) {
  screenTabs.innerHTML = "";

  (state.screens || []).forEach((screen) => {
    const btn = document.createElement("button");
    btn.className = `tab-btn${screen.screenId === state.activeScreenId ? " active" : ""}`;
    btn.textContent = screen.name || screen.screenId;
    btn.onclick = () => {
      socket.emit("screen:select", { screenId: screen.screenId });
    };
    screenTabs.appendChild(btn);
  });

  removeScreenBtn.disabled = (state.screens || []).length <= 1;
}

function buildSlotControls(state, screen) {
  slotControls.innerHTML = "";
  if (!screen) {
    return;
  }

  const streams = state.streams || [];
  const slideshows = state.slideshows || [];

  function emitSlotUpdate(slotId, kindValue, sourceValue, slideshowValue, timezoneValue) {
    socket.emit("slot:set", {
      screenId: screen.screenId,
      slotId,
      kind: kindValue,
      sourceId: sourceValue || null,
      slideshowId: slideshowValue || null,
      timezone: timezoneValue || "UTC"
    });
  }

  for (let i = 1; i <= screen.slotCount; i += 1) {
    const slot = screen.slots.find((s) => s.slotId === i);
    const panel = document.createElement("div");
    panel.className = "slot-panel";

    const title = document.createElement("h3");
    const posLabel = getSlotPositionLabel(screen.layout, i);
    title.textContent = posLabel ? `Slot ${i} (${posLabel})` : `Slot ${i}`;

    const kindSelect = document.createElement("select");
    ["stream", "slideshow", "clock", "timer", "stopwatch", "random"].forEach((k) => {
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

    const slideshowSelect = document.createElement("select");
    const noneSlideshow = document.createElement("option");
    noneSlideshow.value = "";
    noneSlideshow.textContent = "No slideshow";
    slideshowSelect.appendChild(noneSlideshow);
    slideshows.forEach((ss) => {
      const opt = document.createElement("option");
      opt.value = ss.slideshowId;
      opt.textContent = `${ss.name} (${ss.slides.length})`;
      if (slot.slideshowId === ss.slideshowId) opt.selected = true;
      slideshowSelect.appendChild(opt);
    });

    const tzInput = document.createElement("input");
    tzInput.placeholder = "Timezone (e.g. Europe/London)";
    tzInput.value = slot.timezone || "UTC";

    function syncSlotFieldVisibility() {
      streamSelect.style.display = kindSelect.value === "stream" ? "" : "none";
      slideshowSelect.style.display = kindSelect.value === "slideshow" ? "" : "none";
      tzInput.style.display = kindSelect.value === "clock" ? "" : "none";
    }

    kindSelect.addEventListener("change", () => {
      syncSlotFieldVisibility();
      emitSlotUpdate(i, kindSelect.value, streamSelect.value, slideshowSelect.value, tzInput.value);
    });

    streamSelect.addEventListener("change", () => {
      emitSlotUpdate(i, kindSelect.value, streamSelect.value, slideshowSelect.value, tzInput.value);
    });

    slideshowSelect.addEventListener("change", () => {
      emitSlotUpdate(i, kindSelect.value, streamSelect.value, slideshowSelect.value, tzInput.value);
    });

    tzInput.addEventListener("input", () => {
      emitSlotUpdate(i, kindSelect.value, streamSelect.value, slideshowSelect.value, tzInput.value);
    });

    const row1 = document.createElement("div");
    row1.className = "row wrap";
    row1.appendChild(kindSelect);
    row1.appendChild(streamSelect);
    row1.appendChild(slideshowSelect);

    const row2 = document.createElement("div");
    row2.className = "row wrap";
    row2.appendChild(tzInput);

    panel.appendChild(title);
    panel.appendChild(row1);
    panel.appendChild(row2);
    syncSlotFieldVisibility();
    slotControls.appendChild(panel);
  }
}

function renderState(state) {
  latestState = state;
  const activeScreen = getActiveScreen(state);
  buildScreenTabs(state);
  renderSlideshowControls(state);
  buildSlotControls(state, activeScreen);
  updateDisplayLink(activeScreen);
  layoutButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.layout === activeScreen?.layout);
  });
  timerPreview.textContent = formatTimer(computeTimer(state));
  swPreview.textContent = formatStopwatch(computeStopwatch(state));
  randomControl.updateState(state);
}

function describeShareError(err) {
  const name = err?.name || "Error";
  const message = err?.message || "Unknown error";

  if (name === "NotAllowedError") {
    return "Screen share was blocked. Allow screen sharing in the browser prompt and try again.";
  }
  if (name === "NotFoundError") {
    return "No shareable screen/window was found.";
  }
  if (name === "AbortError") {
    return "Screen sharing was canceled before starting.";
  }
  if (name === "InvalidStateError") {
    return "Screen share requires a direct user click. Try again by pressing Start Sharing manually.";
  }
  if (name === "TypeError") {
    return "This browser rejected the capture options. Try a different browser or disable audio capture.";
  }

  return `${name}: ${message}`;
}

function describeCameraError(err) {
  const name = err?.name || "Error";
  const message = err?.message || "Unknown error";

  if (name === "NotAllowedError") {
    return "Camera access was blocked. Allow camera permission in the browser and try again.";
  }
  if (name === "NotFoundError") {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError") {
    return "The camera is already in use by another app.";
  }

  return `${name}: ${message}`;
}

async function getDisplayStreamWithFallback() {
  const profile = getSelectedProfile();
  if (!window.isSecureContext) {
    throw new Error(
      "Screen sharing needs a secure context (HTTPS or localhost). Open this page via HTTPS or run locally with localhost."
    );
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error("This browser does not support screen/application sharing (getDisplayMedia).");
  }

  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: profile.maxFps, max: profile.maxFps } },
      audio: true
    });
  } catch (err) {
    const isConstraintIssue = err?.name === "TypeError" || err?.name === "OverconstrainedError";
    if (!isConstraintIssue) {
      throw err;
    }

    // Some browser/OS combinations reject audio capture constraints.
    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: profile.maxFps, max: profile.maxFps } },
      audio: false
    });
  }
}

async function getCameraStream() {
  const profile = getSelectedProfile();
  if (!window.isSecureContext) {
    throw new Error(
      "Camera sharing needs a secure context (HTTPS or localhost). Open this page via HTTPS or run locally with localhost."
    );
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("This browser does not support camera capture (getUserMedia).");
  }

  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "environment",
      frameRate: { ideal: profile.maxFps, max: profile.maxFps }
    },
    audio: true
  });
}

async function getPreferredMediaStream() {
  if (navigator.mediaDevices?.getDisplayMedia) {
    try {
      const stream = await getDisplayStreamWithFallback();
      return { stream, sourceKind: "screen" };
    } catch (err) {
      const shouldTryCamera = ["NotFoundError", "TypeError", "OverconstrainedError", "NotSupportedError"].includes(
        err?.name
      );
      if (!shouldTryCamera) {
        throw err;
      }
    }
  }

  const stream = await getCameraStream();
  return { stream, sourceKind: "camera" };
}

async function ensureSourceStarted() {
  if (mySourceId && localStreams.has(mySourceId)) {
    return;
  }

  const sourceLabel = getRequiredSourceLabel();
  if (!sourceLabel) {
    return;
  }

  const { stream, sourceKind } = await getPreferredMediaStream();
  const [videoTrack] = stream.getVideoTracks();
  if (videoTrack && "contentHint" in videoTrack) {
    videoTrack.contentHint = sourceKind === "screen" ? "detail" : "motion";
  }

  socket.emit("source:start", {
    label: sourceLabel
  });

  socket.once("source:started", ({ sourceId }) => {
    mySourceId = sourceId;
    mySourceKind = sourceKind;
    localStreams.set(sourceId, stream);
    sourceInfo.textContent = `Active ${sourceKind}: ${sourceId} (${getSelectedProfile().label})`;
    stopSourceBtn.disabled = false;

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
  mySourceKind = null;
}

async function applyProfileToPeerConnection(pc, profile) {
  const videoSender = pc.getSenders().find((sender) => sender.track?.kind === "video");
  if (!videoSender) {
    return;
  }

  try {
    const params = videoSender.getParameters();
    if (!params.encodings || !params.encodings.length) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = profile.maxBitrateBps;
    params.encodings[0].maxFramerate = profile.maxFps;
    await videoSender.setParameters(params);
  } catch (err) {
    console.warn("Unable to set sender bitrate/fps parameters", err);
  }
}

async function applyProfileToCurrentSource() {
  if (!mySourceId) {
    return;
  }

  const profile = getSelectedProfile();
  const stream = localStreams.get(mySourceId);
  const [videoTrack] = stream?.getVideoTracks() || [];

  if (videoTrack) {
    try {
      await videoTrack.applyConstraints({ frameRate: { ideal: profile.maxFps, max: profile.maxFps } });
    } catch (err) {
      console.warn("Unable to apply video track constraints", err);
    }
  }

  const pending = [];
  for (const [pcKey, pc] of pcBySourceAndTarget.entries()) {
    if (pcKey.startsWith(`${mySourceId}::`)) {
      pending.push(applyProfileToPeerConnection(pc, profile));
    }
  }

  await Promise.all(pending);
  sourceInfo.textContent = `Active ${mySourceKind || "source"}: ${mySourceId} (${profile.label})`;
}

async function createOfferForTarget(sourceId, targetSocketId) {
  const stream = localStreams.get(sourceId);
  if (!stream) return;

  const k = key(sourceId, targetSocketId);
  let pc = pcBySourceAndTarget.get(k);
  if (!pc) {
    pc = new RTCPeerConnection({
      iceCandidatePoolSize: 2
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

  await applyProfileToPeerConnection(pc, getSelectedProfile());

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

layoutButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const activeScreen = getActiveScreen();
    if (!activeScreen) return;
    socket.emit("layout:set", {
      screenId: activeScreen.screenId,
      layout: btn.dataset.layout
    });
  });
});

addScreenBtn.addEventListener("click", () => {
  socket.emit("screen:add", {});
});

removeScreenBtn.addEventListener("click", () => {
  const activeScreen = getActiveScreen();
  if (!activeScreen) return;
  socket.emit("screen:remove", { screenId: activeScreen.screenId });
});

streamProfileSelect.addEventListener("change", async () => {
  updateStreamProfileHint();
  await applyProfileToCurrentSource();
});

sourceLabelInput.addEventListener("input", saveSourceLabel);

startSourceBtn.addEventListener("click", async () => {
  try {
    await ensureSourceStarted();
  } catch (err) {
    console.error(err);
    const detail = err?.message?.includes("camera") || err?.message?.includes("Camera") ? describeCameraError(err) : describeShareError(err);
    sourceInfo.textContent = `Share failed: ${detail}`;
    alert(`Unable to start sharing. ${detail}`);
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

slideshowUploadBtn.addEventListener("click", createSlideshowFromSelectedFiles);
slideshowUploadPptxBtn.addEventListener("click", createSlideshowFromPptx);

slideshowSelect.addEventListener("change", () => {
  selectedSlideshowId = slideshowSelect.value || null;
  if (latestState) {
    renderSlideshowControls(latestState);
  }
});

slideshowPlayBtn.addEventListener("click", () => {
  const slideshow = getSelectedSlideshow();
  if (!slideshow) return;
  socket.emit("slideshow:play", { slideshowId: slideshow.slideshowId });
});

slideshowPauseBtn.addEventListener("click", () => {
  const slideshow = getSelectedSlideshow();
  if (!slideshow) return;
  socket.emit("slideshow:pause", { slideshowId: slideshow.slideshowId });
});

slideshowPrevBtn.addEventListener("click", () => {
  const slideshow = getSelectedSlideshow();
  if (!slideshow) return;
  socket.emit("slideshow:prev", { slideshowId: slideshow.slideshowId });
});

slideshowNextBtn.addEventListener("click", () => {
  const slideshow = getSelectedSlideshow();
  if (!slideshow) return;
  socket.emit("slideshow:next", { slideshowId: slideshow.slideshowId });
});

slideshowIntervalInput.addEventListener("change", () => {
  const slideshow = getSelectedSlideshow();
  if (!slideshow) return;
  socket.emit("slideshow:set-interval", {
    slideshowId: slideshow.slideshowId,
    intervalSec: Number(slideshowIntervalInput.value || 5)
  });
});

slideshowIndexInput.addEventListener("input", () => {
  const slideshow = getSelectedSlideshow();
  if (!slideshow) return;
  slideshowIndexLabel.textContent = `Slide ${Number(slideshowIndexInput.value) + 1} / ${slideshow.slides.length}`;
});

slideshowIndexInput.addEventListener("change", () => {
  const slideshow = getSelectedSlideshow();
  if (!slideshow) return;
  socket.emit("slideshow:set-index", {
    slideshowId: slideshow.slideshowId,
    index: Number(slideshowIndexInput.value || 0)
  });
});

slideshowDeleteBtn.addEventListener("click", async () => {
  const slideshow = getSelectedSlideshow();
  if (!slideshow) return;

  try {
    const response = await fetch(`/api/slideshows/${encodeURIComponent(slideshow.slideshowId)}`, {
      method: "DELETE"
    });
    const payload = await readApiPayload(response);
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Delete failed");
    }
    selectedSlideshowId = null;
    setSlideshowStatus(`Deleted slideshow \"${slideshow.name}\".`);
  } catch (err) {
    console.error("Failed deleting slideshow", err);
    setSlideshowStatus(`Delete failed: ${err.message || "Unknown error"}`);
  }
});

setInterval(() => {
  if (latestState) {
    timerPreview.textContent = formatTimer(computeTimer(latestState));
    swPreview.textContent = formatStopwatch(computeStopwatch(latestState));
  }
}, 150);

restoreSourceLabel();
updateStreamProfileHint();
