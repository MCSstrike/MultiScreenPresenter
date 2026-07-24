const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const express = require("express");
const http = require("http");
const cors = require("cors");
const multer = require("multer");
const { Server } = require("socket.io");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3000);
const ORIGIN = process.env.ORIGIN || "*";
const DEFAULT_SCREEN_ID = "screen-1";
const UPLOAD_SLIDES_DIR = path.join(__dirname, "..", "public", "uploads", "slides");

fs.mkdirSync(UPLOAD_SLIDES_DIR, { recursive: true });

function sanitizeForFilename(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_SLIDES_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".bin";
    const base = sanitizeForFilename(path.basename(file.originalname || "slide", ext)) || "slide";
    cb(null, `${Date.now()}-${crypto.randomUUID()}-${base}${ext}`);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: {
    files: 500,
    fileSize: 25 * 1024 * 1024
  }
});

const app = express();
app.use(cors({ origin: ORIGIN === "*" ? true : ORIGIN }));
app.use(express.json({ limit: "5mb" }));
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
    slideshowId: null,
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
  },
  slideshows: []
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

function makeSlideshowId() {
  return `ss_${crypto.randomUUID()}`;
}

function clampIntervalSec(intervalSec) {
  return Math.max(0.5, Math.min(3600, Number(intervalSec || 5)));
}

function getSlideshow(slideshowId) {
  return state.slideshows.find((slideshow) => slideshow.slideshowId === slideshowId) || null;
}

function removeFileQuiet(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (_err) {
    // Best effort cleanup for rejected uploads.
  }
}

function removeDirQuiet(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (_err) {
    // Best effort cleanup.
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`Command failed: ${command} ${args.join(" ")} (exit ${code})`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

function sortSlidesByFilename(paths) {
  return [...paths].sort((a, b) => {
    const aName = path.basename(a);
    const bName = path.basename(b);
    const aMatch = aName.match(/(\d+)/);
    const bMatch = bName.match(/(\d+)/);
    const aNum = aMatch ? Number(aMatch[1]) : 0;
    const bNum = bMatch ? Number(bMatch[1]) : 0;
    if (aNum !== bNum) {
      return aNum - bNum;
    }
    return aName.localeCompare(bName, undefined, { sensitivity: "base" });
  });
}

function normalizePptxSlideName(value) {
  return sanitizeForFilename(path.basename(value || "slide", path.extname(value || ""))) || "slides";
}

function createSlideshowFromUploadedFiles(files, name, intervalSec) {
  const sorted = [...files].sort((a, b) =>
    String(a.originalname || "").localeCompare(String(b.originalname || ""), undefined, {
      numeric: true,
      sensitivity: "base"
    })
  );

  return {
    slideshowId: makeSlideshowId(),
    name,
    slides: sorted.map((file) => ({
      url: `/uploads/slides/${path.basename(file.filename)}`,
      name: String(file.originalname || path.basename(file.filename))
    })),
    currentIndex: 0,
    intervalSec: clampIntervalSec(intervalSec),
    playing: false,
    loop: true,
    lastAdvancedAt: null,
    createdAt: nowMs(),
    updatedAt: nowMs()
  };
}

function persistConvertedSlideFiles(slideFilePaths, baseName) {
  const slideshowBase = normalizePptxSlideName(baseName);
  const persisted = [];

  for (const sourcePath of slideFilePaths) {
    const ext = path.extname(sourcePath).toLowerCase() || ".png";
    const safeTargetName = `${Date.now()}-${crypto.randomUUID()}-${slideshowBase}${ext}`;
    const targetPath = path.join(UPLOAD_SLIDES_DIR, safeTargetName);
    fs.copyFileSync(sourcePath, targetPath);
    persisted.push({
      filename: safeTargetName,
      originalname: path.basename(sourcePath),
      path: targetPath
    });
  }

  return persisted;
}

function isPptxFile(file) {
  if (!file) {
    return false;
  }

  const ext = path.extname(file.originalname || "").toLowerCase();
  return ext === ".pptx";
}

function isImageFile(file) {
  if (!file) {
    return false;
  }

  if (String(file.mimetype || "").startsWith("image/")) {
    return true;
  }

  const ext = path.extname(file.originalname || "").toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].includes(ext);
}

function removeSlideshow(slideshowId) {
  const index = state.slideshows.findIndex((slideshow) => slideshow.slideshowId === slideshowId);
  if (index === -1) {
    return false;
  }

  state.slideshows.splice(index, 1);

  for (const screen of state.screens) {
    for (const slot of screen.slots) {
      if (slot.slideshowId === slideshowId) {
        slot.slideshowId = null;
        if (slot.kind === "slideshow") {
          slot.kind = "stream";
          slot.sourceId = null;
        }
      }
    }
  }

  return true;
}

function advanceSlideshow(slideshow, steps = 1) {
  if (!slideshow?.slides?.length) {
    return;
  }

  const maxIndex = slideshow.slides.length - 1;
  let nextIndex = slideshow.currentIndex + steps;

  if (slideshow.loop) {
    const len = slideshow.slides.length;
    nextIndex = ((nextIndex % len) + len) % len;
  } else {
    nextIndex = Math.max(0, Math.min(maxIndex, nextIndex));
    if (nextIndex === maxIndex && steps > 0) {
      slideshow.playing = false;
      slideshow.lastAdvancedAt = null;
    }
  }

  slideshow.currentIndex = nextIndex;
  slideshow.updatedAt = nowMs();
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
    slideshows: state.slideshows.map((slideshow) => ({
      ...slideshow,
      slides: slideshow.slides.map((slide) => ({ ...slide }))
    })),
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
      slot.slideshowId = null;
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

app.post("/api/slideshows/images", upload.array("slides", 500), (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) {
    return res.status(400).json({ ok: false, error: "No files uploaded" });
  }

  const rejected = files.filter((file) => !isImageFile(file));
  if (rejected.length) {
    files.forEach((file) => removeFileQuiet(file.path));
    return res.status(400).json({
      ok: false,
      error: "Only image files are supported. Export PowerPoint slides as images, then upload them."
    });
  }

  const slideshow = createSlideshowFromUploadedFiles(
    files,
    String(req.body?.name || "Slideshow").trim().slice(0, 120) || "Slideshow",
    req.body?.intervalSec
  );

  state.slideshows.push(slideshow);
  broadcastState();
  return res.json({ ok: true, slideshow });
});

app.post("/api/slideshows/pptx", upload.single("pptx"), async (req, res) => {
  const pptxFile = req.file;
  if (!pptxFile) {
    return res.status(400).json({ ok: false, error: "No PPTX file uploaded" });
  }

  if (!isPptxFile(pptxFile)) {
    removeFileQuiet(pptxFile.path);
    return res.status(400).json({ ok: false, error: "Only .pptx files are supported for this upload." });
  }

  let tempDirUsed = null;
  const copiedSlides = [];

  try {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "msp-pptx-work-"));
    tempDirUsed = tempDir;
    const localPptxPath = path.join(tempDir, path.basename(pptxFile.filename));
    fs.copyFileSync(pptxFile.path, localPptxPath);

    const generatedSlides = await (async () => {
      await runCommand("soffice", ["--headless", "--convert-to", "pdf", "--outdir", tempDir, localPptxPath]);

      const convertedEntries = fs.readdirSync(tempDir);
      const pdfName = convertedEntries.find((entry) => path.extname(entry).toLowerCase() === ".pdf");
      if (!pdfName) {
        throw new Error("PPTX conversion did not produce a PDF output.");
      }

      const pdfPath = path.join(tempDir, pdfName);
      const outputPrefix = path.join(tempDir, "slide");
      await runCommand("pdftoppm", ["-png", pdfPath, outputPrefix]);

      const pngSlides = sortSlidesByFilename(
        fs
          .readdirSync(tempDir)
          .filter((entry) => /^slide-\d+\.png$/i.test(entry))
          .map((entry) => path.join(tempDir, entry))
      );

      if (!pngSlides.length) {
        throw new Error("PPTX conversion succeeded but produced zero slide images.");
      }

      return pngSlides;
    })();

    const persisted = persistConvertedSlideFiles(generatedSlides, req.body?.name || pptxFile.originalname || "slides");
    copiedSlides.push(...persisted);

    const slideshow = createSlideshowFromUploadedFiles(
      persisted,
      String(req.body?.name || path.basename(pptxFile.originalname || "Slideshow", ".pptx")).trim().slice(0, 120) ||
        "Slideshow",
      req.body?.intervalSec
    );

    state.slideshows.push(slideshow);
    broadcastState();
    return res.json({ ok: true, slideshow });
  } catch (err) {
    copiedSlides.forEach((slide) => removeFileQuiet(slide.path));

    const missingBinary = err?.code === "ENOENT";
    if (missingBinary) {
      return res.status(500).json({
        ok: false,
        error:
          "PPTX conversion tools are not installed on this server. Install LibreOffice (soffice) and poppler (pdftoppm), then retry."
      });
    }

    return res.status(500).json({
      ok: false,
      error: `Failed to convert PPTX: ${err.message || "Unknown error"}`
    });
  } finally {
    removeFileQuiet(pptxFile.path);
    if (tempDirUsed) {
      removeDirQuiet(tempDirUsed);
    }
  }
});

app.delete("/api/slideshows/:slideshowId", (req, res) => {
  const slideshowId = String(req.params.slideshowId || "");
  const removed = removeSlideshow(slideshowId);
  if (!removed) {
    return res.status(404).json({ ok: false, error: "Slideshow not found" });
  }

  broadcastState();
  return res.json({ ok: true });
});

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
  targetSlot.slideshowId = null;
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
  let changed = false;

  if (state.timer.running) {
    const remaining = effectiveTimerRemainingSec(state.timer);
    if (remaining <= 0) {
      state.timer.running = false;
      state.timer.startedAt = null;
      state.timer.remainingSec = 0;
      changed = true;
    }
  }

  const now = nowMs();
  for (const slideshow of state.slideshows) {
    if (!slideshow.playing || !slideshow.slides.length) {
      continue;
    }

    const stepMs = slideshow.intervalSec * 1000;
    if (!slideshow.lastAdvancedAt) {
      slideshow.lastAdvancedAt = now;
      continue;
    }

    if (now - slideshow.lastAdvancedAt >= stepMs) {
      const steps = Math.max(1, Math.floor((now - slideshow.lastAdvancedAt) / stepMs));
      advanceSlideshow(slideshow, steps);
      slideshow.lastAdvancedAt = now;
      changed = true;
    }
  }

  if (changed) {
    broadcastState();
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

  socket.on("slot:set", ({ screenId, slotId, kind, sourceId, slideshowId, timezone }) => {
    const screen = getScreen(screenId) || getActiveScreen();
    if (!screen) {
      return;
    }

    const slot = screen.slots.find((s) => s.slotId === Number(slotId));
    if (!slot || slot.slotId > screen.slotCount) {
      return;
    }
    if (!["stream", "clock", "timer", "stopwatch", "random", "slideshow"].includes(kind)) {
      return;
    }

    slot.kind = kind;
    if (kind === "stream") {
      slot.sourceId = streamSources.has(sourceId) ? sourceId : null;
      slot.slideshowId = null;
    } else if (kind === "slideshow") {
      slot.slideshowId = getSlideshow(slideshowId)?.slideshowId || null;
      slot.sourceId = null;
    } else {
      slot.sourceId = null;
      slot.slideshowId = null;
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

  socket.on("slideshow:play", ({ slideshowId }) => {
    const slideshow = getSlideshow(slideshowId);
    if (!slideshow || !slideshow.slides.length) {
      return;
    }
    slideshow.playing = true;
    slideshow.lastAdvancedAt = nowMs();
    slideshow.updatedAt = nowMs();
    broadcastState();
  });

  socket.on("slideshow:pause", ({ slideshowId }) => {
    const slideshow = getSlideshow(slideshowId);
    if (!slideshow) {
      return;
    }
    slideshow.playing = false;
    slideshow.lastAdvancedAt = null;
    slideshow.updatedAt = nowMs();
    broadcastState();
  });

  socket.on("slideshow:next", ({ slideshowId }) => {
    const slideshow = getSlideshow(slideshowId);
    if (!slideshow) {
      return;
    }
    advanceSlideshow(slideshow, 1);
    if (slideshow.playing) {
      slideshow.lastAdvancedAt = nowMs();
    }
    broadcastState();
  });

  socket.on("slideshow:prev", ({ slideshowId }) => {
    const slideshow = getSlideshow(slideshowId);
    if (!slideshow) {
      return;
    }
    advanceSlideshow(slideshow, -1);
    if (slideshow.playing) {
      slideshow.lastAdvancedAt = nowMs();
    }
    broadcastState();
  });

  socket.on("slideshow:set-interval", ({ slideshowId, intervalSec }) => {
    const slideshow = getSlideshow(slideshowId);
    if (!slideshow) {
      return;
    }
    slideshow.intervalSec = clampIntervalSec(intervalSec);
    if (slideshow.playing) {
      slideshow.lastAdvancedAt = nowMs();
    }
    slideshow.updatedAt = nowMs();
    broadcastState();
  });

  socket.on("slideshow:set-index", ({ slideshowId, index }) => {
    const slideshow = getSlideshow(slideshowId);
    if (!slideshow || !slideshow.slides.length) {
      return;
    }
    const safeIndex = Math.max(0, Math.min(slideshow.slides.length - 1, Number(index || 0)));
    slideshow.currentIndex = safeIndex;
    if (slideshow.playing) {
      slideshow.lastAdvancedAt = nowMs();
    }
    slideshow.updatedAt = nowMs();
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
