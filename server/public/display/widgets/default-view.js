import { buildClock } from "./clock-widgets.js";

export function getDefaultView(screen, state) {
  return state?.admin?.defaults?.[screen.screenId] || null;
}

export function getPrintingPrinters(state) {
  return (state?.admin?.printers || []).filter((printer) => printer.enabled && printer.printing).slice(0, 4);
}

export function getDefaultViewKey(screen, state) {
  const view = getDefaultView(screen, state);
  if (!screen.idle || !view || view.mode === "none") {
    return null;
  }
  if (view.mode === "printers") {
    return `printers:${getPrintingPrinters(state).map((printer) => printer.id).join(",")}`;
  }
  if (view.mode === "script") {
    return `script:${view.script}`;
  }
  return view.mode;
}

function layoutForCount(count) {
  if (count <= 1) return "layout-single";
  if (count === 2) return "layout-split-h";
  return "layout-grid-2x2";
}

function buildPrinterSlot(printer) {
  const slot = document.createElement("section");
  slot.className = "slot printer-slot";

  const img = document.createElement("img");
  img.className = "printer-feed";
  img.alt = printer.name;
  img.src = `/api/printers/${encodeURIComponent(printer.id)}/stream`;
  slot.appendChild(img);

  const label = document.createElement("div");
  label.className = "printer-label";
  label.textContent = printer.progress === null ? printer.name : `${printer.name} - ${printer.progress}%`;
  slot.appendChild(label);
  return slot;
}

function renderMessage(stage, text) {
  const slot = document.createElement("section");
  slot.className = "slot";
  const msg = document.createElement("div");
  msg.className = "widget";
  msg.textContent = text;
  slot.appendChild(msg);
  stage.className = "layout-single";
  stage.appendChild(slot);
}

const CLOCK_MOVE_INTERVAL_MS = 30000;

// Places the clock in a slot and periodically moves it to a new random position.
function mountMovingClock(stage) {
  stage.className = "layout-single";
  const slot = document.createElement("section");
  slot.className = "slot";

  const mover = document.createElement("div");
  mover.style.position = "absolute";
  mover.style.transform = "translate(-50%, -50%)";
  mover.style.transition = "left 3s ease-in-out, top 3s ease-in-out";
  mover.style.whiteSpace = "nowrap";
  mover.appendChild(buildClock({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
  slot.appendChild(mover);
  stage.appendChild(slot);

  const place = () => {
    mover.style.left = `${20 + Math.random() * 60}%`;
    mover.style.top = `${15 + Math.random() * 70}%`;
  };
  mover.style.left = "50%";
  mover.style.top = "50%";
  const timer = setInterval(place, CLOCK_MOVE_INTERVAL_MS);
  return () => clearInterval(timer);
}

// Renders the default view into the stage and returns an optional cleanup function.
export function renderDefaultView(stage, screen, state) {
  const view = getDefaultView(screen, state);
  stage.innerHTML = "";

  if (view.mode === "printers") {
    const printing = getPrintingPrinters(state);
    if (!printing.length) {
      return mountMovingClock(stage);
    }
    stage.className = layoutForCount(printing.length);
    printing.forEach((printer) => stage.appendChild(buildPrinterSlot(printer)));
    return null;
  }

  if (view.mode === "clock") {
    return mountMovingClock(stage);
  }

  if (view.mode === "script") {
    stage.className = "layout-single";
    const root = document.createElement("section");
    root.className = "slot custom-script-root";
    stage.appendChild(root);
    try {
      const fn = new Function("root", "screen", "state", view.script);
      const result = fn(root, screen, state);
      return typeof result === "function" ? result : null;
    } catch (err) {
      console.error("Default view script failed", err);
      stage.innerHTML = "";
      renderMessage(stage, `Script error: ${err.message}`);
    }
  }
  return null;
}
