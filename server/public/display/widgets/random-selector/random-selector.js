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

export function clearRandomWidgets() {
  for (const widget of activeRandomWidgets) {
    widget.destroy();
  }
  activeRandomWidgets.clear();
}

export function updateRandomWidgets(state) {
  for (const widget of activeRandomWidgets) {
    widget.update(state);
  }
}

export class RandomSelectorWidgetInstance {
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
          this.renderStaticWinner(rs.selected, rs.options);
          return;
        }
      }
    }

    if (this.isRolling) {
      return;
    }

    if (rs.selected) {
      this.renderStaticWinner(rs.selected, rs.options);
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

    // Add trailing buffer cards so items below the winner remain visible and fade out under the bottom mask
    const bufferCount = 4;
    for (let i = 0; i < bufferCount; i++) {
      const randomOption = options[Math.floor(Math.random() * options.length)] || options[i % options.length] || "Option";
      sequence.push(randomOption);
    }

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
    const winnerCard = cardElements[totalSteps - 1];

    const y0 = firstCard.offsetTop + firstCard.offsetHeight / 2;
    const yEnd = winnerCard.offsetTop + winnerCard.offsetHeight / 2;

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
        this.finishRoll(winner, winnerCard);
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

  renderStaticWinner(winner, options = []) {
    this.container.classList.remove("is-rolling");
    this.container.classList.add("has-winner");
    this.badgeText.textContent = "🏆 WINNER SELECTED";
    this.reelTrack.innerHTML = "";
    this.reelTrack.style.filter = "none";

    const opts = options && options.length ? options : [winner];
    const wIdx = Math.max(0, opts.indexOf(winner));

    const list = [];
    for (let i = -3; i <= 3; i++) {
      const idx = (((wIdx + i) % opts.length) + opts.length) % opts.length;
      list.push({ text: i === 0 ? winner : opts[idx], isWinner: i === 0 });
    }

    let winnerCardEl = null;
    list.forEach((item) => {
      const card = document.createElement("div");
      card.className = "random-card";
      if (item.isWinner) {
        card.classList.add("is-winner", "is-active");
        winnerCardEl = card;
      }
      const cardText = document.createElement("div");
      cardText.className = "random-card-text";
      cardText.textContent = item.text;
      card.appendChild(cardText);
      this.reelTrack.appendChild(card);
    });

    if (winnerCardEl) {
      this.centerOnCard(winnerCardEl);
    }
  }

  renderStaticIdle(options) {
    this.container.classList.remove("is-rolling", "has-winner");
    this.badgeText.textContent = "🎲 RANDOM SELECTOR";
    this.reelTrack.innerHTML = "";
    this.reelTrack.style.filter = "none";

    const opts = options || [];
    const count = Math.min(Math.max(opts.length, 1), 7);
    const mid = Math.floor(count / 2);
    let midCardEl = null;

    for (let i = 0; i < count; i++) {
      const card = document.createElement("div");
      card.className = "random-card";
      if (i === mid) {
        card.classList.add("is-active");
        midCardEl = card;
      }
      const cardText = document.createElement("div");
      cardText.className = "random-card-text";
      cardText.textContent = opts[i % opts.length] || "Ready";
      card.appendChild(cardText);
      this.reelTrack.appendChild(card);
    }

    if (midCardEl) {
      this.centerOnCard(midCardEl);
    }
  }

  renderStaticEmpty() {
    this.container.classList.remove("is-rolling", "has-winner");
    this.badgeText.textContent = "🎲 RANDOM SELECTOR";
    this.reelTrack.innerHTML = "";
    this.reelTrack.style.transform = "translate3d(0, 0, 0)";
    this.reelTrack.style.filter = "none";

    const card = document.createElement("div");
    card.className = "random-card";

    const cardText = document.createElement("div");
    cardText.className = "random-card-text";
    cardText.textContent = "No options set";
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

export function buildRandom(state) {
  const wrap = document.createElement("div");
  const instance = new RandomSelectorWidgetInstance(wrap, state);
  activeRandomWidgets.add(instance);
  return wrap;
}
