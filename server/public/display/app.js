const socket = io();
const params = new URLSearchParams(window.location.search);
const displayId = params.get("displayId") || `display-${Math.random().toString(16).slice(2, 8)}`;
const screenId = params.get("screenId") || displayId;

const stage = document.getElementById("stage");
const displayIdText = document.getElementById("displayIdText");
const connState = document.getElementById("connState");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const mediaStats = document.getElementById("mediaStats");

displayIdText.textContent = `Display: ${displayId} | Screen: ${screenId}`;

const pcBySource = new Map();
const mediaBySource = new Map();
let currentState = null;
let renderedLayoutKey = null;

function isFullscreenActive() {
  return Boolean(document.fullscreenElement);
}

function updateFullscreenButtonVisibility() {
  if (!fullscreenBtn) {
    return;
  }

  fullscreenBtn.classList.toggle("hidden", isFullscreenActive());
}

async function requestFullscreenMode() {
  if (!document.documentElement.requestFullscreen) {
    return;
  }

  try {
    await document.documentElement.requestFullscreen();
  } catch (err) {
    console.error("Failed to enter fullscreen", err);
  }
}

function getCurrentScreen(state = currentState) {
  if (!state?.screens?.length) {
    return null;
  }

  return state.screens.find((screen) => screen.screenId === screenId) || state.screens[0];
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

function getSlideshow(slideshowId, state = currentState) {
  const slideshows = Array.isArray(state?.slideshows) ? state.slideshows : [];
  return slideshows.find((slideshow) => slideshow.slideshowId === slideshowId) || null;
}

function ensurePeerForSource(sourceId) {
  if (pcBySource.has(sourceId)) {
    return pcBySource.get(sourceId);
  }

  const pc = new RTCPeerConnection({ iceCandidatePoolSize: 2 });

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

// --- Audio Synthesizer for Display ---
let audioCtx = null;
let soundFxEnabled = true;

function getAudioContext() {
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (AudioCtxClass) {
      audioCtx = new AudioCtxClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

window.addEventListener("click", () => getAudioContext(), { passive: true });
window.addEventListener("keydown", () => getAudioContext(), { passive: true });

function playWhooshSound() {
  if (!soundFxEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(650, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.35);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  } catch (e) {}
}

function playTickSound(progress = 0) {
  if (!soundFxEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const baseFreq = 420 + Math.min(progress, 1) * 380;
    osc.type = "triangle";
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.04);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  } catch (e) {}
}

function playWinFanfareSound() {
  if (!soundFxEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;
  try {
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const noteTime = now + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, noteTime);

      const duration = idx === notes.length - 1 ? 0.9 : 0.35;
      gain.gain.setValueAtTime(0.01, noteTime);
      gain.gain.linearRampToValueAtTime(0.22, noteTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(noteTime);
      osc.stop(noteTime + duration + 0.05);
    });
  } catch (e) {}
}

// --- Particle FX Canvas ---
class RandomFxCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.particles = [];
    this.shockwaves = [];
    this.running = false;
    this.width = 0;
    this.height = 0;
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.max(1, Math.floor(this.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(this.height * dpr));
    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  spawnRollingSparks() {
    if (this.width <= 0 || this.height <= 0) return;
    const colors = ["#00f0ff", "#ff0077", "#ffaa00", "#7928ca", "#00ffaa", "#ffd700"];
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        type: "spark",
        x: this.width * (0.25 + Math.random() * 0.5),
        y: this.height * 0.5 + (Math.random() - 0.5) * 50,
        vx: (Math.random() - 0.5) * 7,
        vy: (Math.random() - 0.5) * 7 - 2,
        size: 2 + Math.random() * 3.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.03 + Math.random() * 0.04
      });
    }
    this.ensureRunning();
  }

  spawnConfettiExplosion() {
    if (this.width <= 0 || this.height <= 0) return;
    const colors = ["#ffd700", "#ff0077", "#00f0ff", "#00ff66", "#ff7700", "#a855f7", "#ffffff"];
    const count = Math.min(160, Math.max(70, Math.floor(this.width / 6)));
    const centerX = this.width * 0.5;
    const centerY = this.height * 0.5;

    this.shockwaves.push({
      x: centerX,
      y: centerY,
      radius: 10,
      maxRadius: Math.max(this.width, this.height) * 0.65,
      alpha: 1,
      color: "#ffd700"
    });

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 16;
      this.particles.push({
        type: "confetti",
        x: centerX + (Math.random() - 0.5) * 40,
        y: centerY + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 5,
        gravity: 0.28,
        drag: 0.96,
        width: 8 + Math.random() * 8,
        height: 5 + Math.random() * 6,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 18,
        tilt: Math.random() * 360,
        tiltSpeed: (Math.random() - 0.5) * 14,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.007 + Math.random() * 0.008
      });
    }

    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 10;
      this.particles.push({
        type: "star",
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 6,
        color: "#ffd700",
        alpha: 1,
        decay: 0.018 + Math.random() * 0.02
      });
    }

    this.ensureRunning();
  }

  ensureRunning() {
    if (!this.running) {
      this.running = true;
      this.loop();
    }
  }

  loop() {
    if (!this.running) return;
    this.updateAndDraw();
    if (this.particles.length === 0 && this.shockwaves.length === 0) {
      this.running = false;
      this.ctx.clearRect(0, 0, this.width, this.height);
      return;
    }
    requestAnimationFrame(() => this.loop());
  }

  updateAndDraw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += (sw.maxRadius - sw.radius) * 0.12 + 2;
      sw.alpha -= 0.025;
      if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.lineWidth = 4 * sw.alpha;
      ctx.strokeStyle = `rgba(255, 215, 0, ${sw.alpha * 0.8})`;
      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.restore();
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.alpha -= p.decay || 0.01;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      if (p.type === "spark") {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy *= 0.94;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.type === "star") {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.translate(p.x, p.y);
        ctx.beginPath();
        const s = p.size;
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.25, -s * 0.25);
        ctx.lineTo(s, 0);
        ctx.lineTo(s * 0.25, s * 0.25);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.25, s * 0.25);
        ctx.lineTo(-s, 0);
        ctx.lineTo(-s * 0.25, -s * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.type === "confetti") {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= p.drag;
        p.rotation += p.rotationSpeed;
        p.tilt += p.tiltSpeed;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        const scaleY = Math.cos((p.tilt * Math.PI) / 180);
        ctx.scale(1, scaleY);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        ctx.restore();
      }
    }
  }

  destroy() {
    this.running = false;
    this.particles = [];
    this.shockwaves = [];
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }
}

// --- Random Selector Widget Instance ---
const activeRandomWidgets = new Set();

function clearRandomWidgets() {
  for (const widget of activeRandomWidgets) {
    widget.destroy();
  }
  activeRandomWidgets.clear();
}

function updateRandomWidgets(state) {
  for (const widget of activeRandomWidgets) {
    widget.update(state);
  }
}

class RandomSelectorWidgetInstance {
  constructor(container, initialState) {
    this.container = container;
    this.isRolling = false;
    this.lastHandledRollId = null;
    this.animFrameId = null;

    this.setupDom();
    this.fx = new RandomFxCanvas(this.canvasEl);

    this.update(initialState);
  }

  setupDom() {
    this.container.className = "widget random-widget";
    this.container.innerHTML = "";

    const backdrop = document.createElement("div");
    backdrop.className = "random-backdrop-glow";
    this.container.appendChild(backdrop);

    this.canvasEl = document.createElement("canvas");
    this.canvasEl.className = "random-fx-canvas";
    this.container.appendChild(this.canvasEl);

    const header = document.createElement("div");
    header.className = "random-header";

    const badge = document.createElement("div");
    badge.className = "random-badge";
    const badgeDot = document.createElement("span");
    badgeDot.className = "random-badge-dot";
    this.badgeText = document.createElement("span");
    this.badgeText.className = "random-badge-text";
    this.badgeText.textContent = "🎲 Random Selector";
    badge.appendChild(badgeDot);
    badge.appendChild(this.badgeText);
    header.appendChild(badge);

    const soundToggle = document.createElement("button");
    soundToggle.type = "button";
    soundToggle.className = "random-sound-toggle";
    soundToggle.title = "Toggle Sound Effects";
    soundToggle.textContent = soundFxEnabled ? "🔊" : "🔇";
    soundToggle.onclick = (e) => {
      e.stopPropagation();
      soundFxEnabled = !soundFxEnabled;
      soundToggle.textContent = soundFxEnabled ? "🔊" : "🔇";
      if (soundFxEnabled) {
        getAudioContext();
        playTickSound(0.5);
      }
    };
    header.appendChild(soundToggle);
    this.container.appendChild(header);

    const stageWrap = document.createElement("div");
    stageWrap.className = "random-stage";

    const stageFrame = document.createElement("div");
    stageFrame.className = "random-stage-frame";

    const maskTop = document.createElement("div");
    maskTop.className = "random-mask-top";
    const maskBottom = document.createElement("div");
    maskBottom.className = "random-mask-bottom";
    stageFrame.appendChild(maskTop);
    stageFrame.appendChild(maskBottom);

    const centerGuide = document.createElement("div");
    centerGuide.className = "random-center-guide";
    const pLeft = document.createElement("span");
    pLeft.className = "random-pointer-left";
    pLeft.textContent = "▶";
    const pRight = document.createElement("span");
    pRight.className = "random-pointer-right";
    pRight.textContent = "◀";
    centerGuide.appendChild(pLeft);
    centerGuide.appendChild(pRight);
    stageFrame.appendChild(centerGuide);

    const viewport = document.createElement("div");
    viewport.className = "random-reel-viewport";
    this.reelTrack = document.createElement("div");
    this.reelTrack.className = "random-reel-track";
    viewport.appendChild(this.reelTrack);
    stageFrame.appendChild(viewport);

    stageWrap.appendChild(stageFrame);
    this.container.appendChild(stageWrap);

    const footer = document.createElement("div");
    footer.className = "random-footer";
    const footerLabel = document.createElement("span");
    footerLabel.textContent = "Options Pool:";
    this.footerCount = document.createElement("span");
    this.footerCount.className = "random-footer-count";
    this.footerCount.textContent = "0 options";
    footer.appendChild(footerLabel);
    footer.appendChild(this.footerCount);
    this.container.appendChild(footer);

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.isRolling) {
        const activeCard = this.reelTrack.querySelector(".random-card.is-active") || this.reelTrack.firstElementChild;
        if (activeCard) {
          this.centerOnCard(activeCard);
        }
      }
    });
    this.resizeObserver.observe(this.container);
  }

  centerOnCard(card) {
    if (!card) return;
    const cy = card.offsetTop + card.offsetHeight / 2;
    this.reelTrack.style.transform = `translate3d(0, ${-cy}px, 0)`;
  }

  update(state) {
    const rs = state?.randomSelector;
    if (!rs) return;

    this.footerCount.textContent = `${rs.options.length} option(s)`;

    if (rs.rollId && rs.rollId !== this.lastHandledRollId && rs.rolledAt) {
      const elapsed = Date.now() - rs.rolledAt;
      const duration = rs.durationMs || 2700;

      if (elapsed < duration + 400 && rs.options.length > 0) {
        this.lastHandledRollId = rs.rollId;
        this.startRoll(rs.options, rs.selected, rs.rolledAt, duration);
        return;
      } else {
        this.lastHandledRollId = rs.rollId;
        if (rs.selected) {
          this.renderStaticWinner(rs.selected);
          return;
        }
      }
    }

    if (this.isRolling) {
      return;
    }

    if (rs.selected) {
      this.renderStaticWinner(rs.selected);
    } else if (rs.options.length > 0) {
      this.renderStaticIdle(rs.options);
    } else {
      this.renderStaticEmpty();
    }
  }

  startRoll(options, winner, rolledAt, durationMs) {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.isRolling = true;
    this.container.classList.remove("has-winner");
    this.container.classList.add("is-rolling");
    this.badgeText.textContent = `⚡ ROLLING (${options.length} OPTIONS)...`;

    playWhooshSound();

    // Generate sequence ending on the winner
    const totalSteps = 26;
    const sequence = [];
    for (let i = 0; i < totalSteps - 1; i++) {
      const randomOption = options[Math.floor(Math.random() * options.length)] || "Option";
      sequence.push(randomOption);
    }
    sequence.push(winner || options[0] || "Winner");

    this.reelTrack.innerHTML = "";
    this.reelTrack.style.filter = "none";

    const cardElements = sequence.map((text, idx) => {
      const card = document.createElement("div");
      card.className = "random-card";
      if (idx === 0) card.classList.add("is-active");

      const cardText = document.createElement("div");
      cardText.className = "random-card-text";
      cardText.textContent = text;
      card.appendChild(cardText);

      this.reelTrack.appendChild(card);
      return card;
    });

    const firstCard = cardElements[0];
    const lastCard = cardElements[cardElements.length - 1];

    const y0 = firstCard.offsetTop + firstCard.offsetHeight / 2;
    const yEnd = lastCard.offsetTop + lastCard.offsetHeight / 2;

    this.reelTrack.style.transform = `translate3d(0, ${-y0}px, 0)`;

    let lastTickedStep = -1;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - rolledAt;
      const progress = Math.min(1, Math.max(0, elapsed / durationMs));

      // Cubic ease-out for energetic roll and clean landing
      const ease = 1 - Math.pow(1 - progress, 3);
      const currentY = -(y0 + ease * (yEnd - y0));

      this.reelTrack.style.transform = `translate3d(0, ${currentY}px, 0)`;

      const speed = 1 - progress;
      const blurPx = Math.max(0, Math.min(4, speed * 6));
      this.reelTrack.style.filter = blurPx > 0.4 ? `blur(${blurPx}px)` : "none";

      if (speed > 0.35) {
        this.fx.spawnRollingSparks();
      }

      const currentStep = Math.min(totalSteps - 1, Math.floor(ease * (totalSteps - 1)));
      if (currentStep !== lastTickedStep) {
        lastTickedStep = currentStep;
        playTickSound(progress);

        cardElements.forEach((c, i) => {
          c.classList.toggle("is-active", i === currentStep);
        });
      }

      if (progress < 1) {
        this.animFrameId = requestAnimationFrame(animate);
      } else {
        this.animFrameId = null;
        this.finishRoll(winner, lastCard);
      }
    };

    this.animFrameId = requestAnimationFrame(animate);
  }

  finishRoll(winner, winnerCard) {
    this.isRolling = false;
    this.container.classList.remove("is-rolling");
    this.container.classList.add("has-winner");
    this.badgeText.textContent = "🏆 WINNER SELECTED!";
    this.reelTrack.style.filter = "none";

    if (winnerCard) {
      winnerCard.classList.add("is-winner", "is-active");
      this.centerOnCard(winnerCard);
    }

    playWinFanfareSound();
    this.fx.spawnConfettiExplosion();
  }

  renderStaticWinner(winner) {
    this.container.classList.remove("is-rolling");
    this.container.classList.add("has-winner");
    this.badgeText.textContent = "🏆 WINNER SELECTED";
    this.reelTrack.innerHTML = "";
    this.reelTrack.style.filter = "none";

    const card = document.createElement("div");
    card.className = "random-card is-winner is-active";

    const cardText = document.createElement("div");
    cardText.className = "random-card-text";
    cardText.textContent = winner;
    card.appendChild(cardText);

    this.reelTrack.appendChild(card);
    this.centerOnCard(card);
  }

  renderStaticIdle(options) {
    this.container.classList.remove("is-rolling", "has-winner");
    this.badgeText.textContent = "🎲 RANDOM SELECTOR";
    this.reelTrack.innerHTML = "";
    this.reelTrack.style.filter = "none";

    const card = document.createElement("div");
    card.className = "random-card is-active";

    const cardText = document.createElement("div");
    cardText.className = "random-card-text";
    cardText.textContent = `Ready to Roll (${options.length} options)`;
    card.appendChild(cardText);

    this.reelTrack.appendChild(card);
    this.centerOnCard(card);
  }

  renderStaticEmpty() {
    this.container.classList.remove("is-rolling", "has-winner");
    this.badgeText.textContent = "🎲 RANDOM SELECTOR";
    this.reelTrack.innerHTML = "";
    this.reelTrack.style.filter = "none";

    const card = document.createElement("div");
    card.className = "random-card";

    const cardText = document.createElement("div");
    cardText.className = "random-card-text";
    cardText.textContent = "No options set (add in controller)";
    card.appendChild(cardText);

    this.reelTrack.appendChild(card);
    this.centerOnCard(card);
  }

  destroy() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.fx) {
      this.fx.destroy();
    }
  }
}

function buildRandom(state) {
  const wrap = document.createElement("div");
  const instance = new RandomSelectorWidgetInstance(wrap, state);
  activeRandomWidgets.add(instance);
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

function buildSlideshow(slideshowId, state) {
  const wrap = document.createElement("div");
  wrap.className = "widget slideshow-widget";

  const slideshow = getSlideshow(slideshowId, state);
  if (!slideshow || !slideshow.slides.length) {
    const msg = document.createElement("div");
    msg.className = "small";
    msg.textContent = "No slideshow selected.";
    wrap.appendChild(msg);
    return wrap;
  }

  const safeIndex = Math.max(0, Math.min(slideshow.slides.length - 1, Number(slideshow.currentIndex || 0)));
  const slide = slideshow.slides[safeIndex];

  const image = document.createElement("img");
  image.src = slide.url;
  image.alt = slide.name || `Slide ${safeIndex + 1}`;
  image.loading = "eager";
  image.decoding = "async";
  image.className = "slide-image";
  image.dataset.slideshowId = slideshowId;
  wrap.appendChild(image);

  return wrap;
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
    case "slideshow":
      slot.appendChild(buildSlideshow(slotCfg.slideshowId, state));
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

function getLayoutKey(screen) {
  const slotCount = slotCountForLayout(screen.layout);
  const slotKey = Array.from({ length: slotCount }, (_, index) => {
    const slot = screen.slots.find((item) => item.slotId === index + 1) || {};
    return [slot.kind, slot.sourceId, slot.slideshowId, slot.timezone, mediaBySource.has(slot.sourceId)].join(":");
  });
  return `${screen.screenId}:${screen.layout}:${slotKey.join("|")}`;
}

function updateSlideshowImages(state) {
  stage.querySelectorAll("img[data-slideshow-id]").forEach((image) => {
    const slideshow = getSlideshow(image.dataset.slideshowId, state);
    const slide = slideshow?.slides?.[slideshow.currentIndex];
    if (slide && image.getAttribute("src") !== slide.url) {
      image.src = slide.url;
      image.alt = slide.name || "Slide";
    }
  });
}

function renderState(state) {
  if (!state) return;
  currentState = state;

  const screen = getCurrentScreen(state);
  if (!screen) {
    stage.innerHTML = "";
    renderedLayoutKey = null;
    return;
  }

  displayIdText.textContent = `Display: ${displayId} | Screen: ${screen.screenId}`;
  const layoutKey = getLayoutKey(screen);

  if (layoutKey !== renderedLayoutKey) {
    clearRandomWidgets();
    const slotCount = slotCountForLayout(screen.layout);
    stage.className = `layout-${screen.layout}`;
    stage.innerHTML = "";

    for (let i = 1; i <= slotCount; i += 1) {
      const cfg = screen.slots.find((slot) => slot.slotId === i);
      stage.appendChild(buildSlot(cfg, state));
    }

    renderedLayoutKey = layoutKey;
  } else {
    updateSlideshowImages(state);
    updateRandomWidgets(state);
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

function formatMilliseconds(seconds) {
  return `${Math.round(seconds * 1000)} ms`;
}

async function updateMediaStats() {
  if (!mediaStats) {
    return;
  }

  const connections = [...pcBySource.values()];
  if (!connections.length) {
    mediaStats.textContent = "Media: waiting";
    return;
  }

  try {
    const measurements = await Promise.all(
      connections.map(async (pc) => {
        const stats = await pc.getStats();
        const reports = [...stats.values()];
        const inbound = reports.find((report) => report.type === "inbound-rtp" && report.kind === "video");
        const pair = reports.find((report) => report.type === "candidate-pair" && report.nominated && report.state === "succeeded");
        return { inbound, pair };
      })
    );

    const inbound = measurements.map((measurement) => measurement.inbound).filter(Boolean);
    const pairs = measurements.map((measurement) => measurement.pair).filter(Boolean);
    if (!inbound.length) {
      mediaStats.textContent = "Media: connecting";
      return;
    }

    const fps = Math.round(inbound.reduce((total, report) => total + (report.framesPerSecond || 0), 0) / inbound.length);
    const loss = inbound.reduce((total, report) => total + (report.packetsLost || 0), 0);
    const bufferSamples = inbound.filter((report) => report.jitterBufferEmittedCount);
    const bufferMs = bufferSamples.length
      ? bufferSamples.reduce((total, report) => total + report.jitterBufferDelay / report.jitterBufferEmittedCount, 0) /
        bufferSamples.length
      : 0;
    const rttSamples = pairs.filter((report) => Number.isFinite(report.currentRoundTripTime));
    const rtt = rttSamples.length
      ? rttSamples.reduce((total, report) => total + report.currentRoundTripTime, 0) / rttSamples.length
      : null;

    mediaStats.textContent = `Media: ${fps} fps | ${rtt === null ? "--" : formatMilliseconds(rtt)} RTT | ${formatMilliseconds(bufferMs)} buffer | ${loss} lost`;
  } catch (err) {
    console.warn("Unable to read WebRTC stats", err);
    mediaStats.textContent = "Media: stats unavailable";
  }
}

socket.on("connect", () => {
  connState.textContent = `Connected ${socket.id.slice(0, 8)}`;
  socket.emit("register:display", { displayId, screenId });
});

socket.on("disconnect", () => {
  connState.textContent = "Disconnected";
});

socket.on("display:registered", ({ displayId: confirmed, screenId: confirmedScreenId }) => {
  displayIdText.textContent = `Display: ${confirmed} | Screen: ${confirmedScreenId}`;
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

if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", requestFullscreenMode);
}

document.addEventListener("fullscreenchange", updateFullscreenButtonVisibility);
updateFullscreenButtonVisibility();

setInterval(tickWidgets, 100);
setInterval(updateMediaStats, 1000);
