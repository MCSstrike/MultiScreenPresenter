const SVG_NS = "http://www.w3.org/2000/svg";
const TUBE_GROUPS = [[0, 1], "sep", [2, 3], "sep", [4, 5]];
const CYCLE_STEP_MS = 90;

// Single-stroke wire cathode outlines (viewBox 60x100), shaped like real nixie digits.
const SIX = "M47 13 C36 2 14 12 10 44 C7 72 16 95 32 95 C49 95 55 76 49 61 C43 46 22 45 12 61";
const CATHODE_PATHS = [
  "M30 5 C11 5 8 29 8 50 C8 71 11 95 30 95 C49 95 52 71 52 50 C52 29 49 5 30 5 Z",
  "M13 28 C20 24 27 17 32 7 L32 93 M18 93 L46 93",
  "M9 28 C9 12 22 5 32 5 C47 5 53 17 50 30 C47 46 26 66 9 93 L53 93",
  "M10 18 C17 6 41 3 48 19 C54 33 40 46 24 48 C43 48 55 60 50 77 C44 95 18 97 8 80",
  "M43 93 L43 6 L7 67 L55 67",
  "M49 7 L17 7 L12 46 C25 38 45 41 51 59 C57 79 41 97 22 93 C14 91 10 86 8 81",
  SIX,
  "M8 7 L53 7 C45 24 32 62 22 93",
  "M30 48 C13 46 10 33 14 21 C18 6 43 6 47 21 C51 33 47 46 30 48 C12 52 8 70 14 82 C20 97 44 95 48 82 C52 70 47 52 30 48 Z",
  SIX
];

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

function svgEl(tag, attrs, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (parent) parent.appendChild(node);
  return node;
}

function buildCathode(index) {
  const svg = svgEl("svg", { viewBox: "0 0 60 100", class: "nixie-d", "aria-hidden": "true" });
  const flip = index === 9 ? " rotate(180 30 50)" : "";
  // Cathodes further back are slightly smaller, as seen through real stacked wire digits.
  const depth = 1 - (9 - index) * 0.006;
  const group = svgEl(
    "g",
    { transform: `translate(30 50) scale(${depth}) translate(-30 -50)${flip}` },
    svg
  );
  svgEl("path", { class: "nx-halo", d: CATHODE_PATHS[index] }, group);
  svgEl("path", { class: "nx-wire", d: CATHODE_PATHS[index] }, group);
  svgEl("path", { class: "nx-core", d: CATHODE_PATHS[index] }, group);
  return svg;
}

function buildTube(parent) {
  const tube = el("div", "nixie-tube", parent);
  const glass = el("div", "nixie-glass", tube);

  el("div", "nixie-honeycomb", glass);
  el("span", "nixie-rod nixie-rod-left", glass);
  el("span", "nixie-rod nixie-rod-right", glass);
  el("div", "nixie-mica nixie-mica-top", glass);
  el("div", "nixie-mica nixie-mica-bottom", glass);

  const digits = el("div", "nixie-digits", glass);
  const cathodes = [];
  for (let i = 0; i < 10; i += 1) {
    const d = buildCathode(i);
    digits.appendChild(d);
    cathodes.push(d);
  }

  el("div", "nixie-getter", glass);
  el("div", "nixie-glow", glass);
  el("div", "nixie-shine", glass);
  el("div", "nixie-shine-right", glass);
  el("div", "nixie-shine-top", glass);
  el("div", "nixie-tip", glass);

  const base = el("div", "nixie-base", tube);
  el("div", "nixie-pins", base);
  return cathodes;
}

function buildSeparator(parent) {
  const sep = el("div", "nixie-sep", parent);
  el("span", "nixie-neon", sep);
  el("span", "nixie-neon", sep);
}

function buildVents(parent, side) {
  const vents = el("div", `nixie-vents nixie-vents-${side}`, parent);
  for (let i = 0; i < 6; i += 1) el("span", "nixie-vent", vents);
}

// Builds a nixie tube clock (HH:MM:SS). Returns the root element and a stop function.
export function buildNixieClock() {
  const root = el("div", "nixie-clock");
  const housing = el("div", "nixie-case", root);
  ["tl", "tr", "bl", "br"].forEach((pos) => el("span", `nixie-screw nixie-screw-${pos}`, housing));
  buildVents(housing, "left");
  buildVents(housing, "right");

  const bezel = el("div", "nixie-bezel", housing);
  const row = el("div", "nixie-tubes", bezel);
  const tubes = [];
  TUBE_GROUPS.forEach((group) => {
    if (group === "sep") {
      buildSeparator(row);
      return;
    }
    group.forEach(() => tubes.push(buildTube(row)));
  });
  el("div", "nixie-reflection", bezel);

  const plate = el("div", "nixie-plate", housing);
  const dateEl = el("span", "nixie-plate-date", plate);
  el("span", "nixie-plate-brand", plate).textContent = "\u25C6 Z568M \u00B7 NIXIE \u25C6";
  const zoneEl = el("span", "nixie-plate-zone", plate);
  zoneEl.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ");

  let lastDigits = "";
  let lastDate = "";

  function light(index, value) {
    tubes[index].forEach((cathode, n) => cathode.classList.toggle("lit", n === value));
  }

  function update() {
    const now = new Date();
    const cycling = now.getMinutes() === 0 && now.getSeconds() < 3;

    if (cycling) {
      // Hourly cathode anti-poisoning sweep.
      const step = Math.floor(now.getTime() / CYCLE_STEP_MS);
      tubes.forEach((_, i) => light(i, (step + i * 3) % 10));
      lastDigits = "";
    } else {
      const digits = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((n) => String(n).padStart(2, "0"))
        .join("");
      if (digits !== lastDigits) {
        lastDigits = digits;
        [...digits].forEach((ch, i) => light(i, Number(ch)));
      }
    }

    const dateText = now
      .toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      .toUpperCase();
    if (dateText !== lastDate) {
      lastDate = dateText;
      dateEl.textContent = dateText;
    }
  }

  update();
  const timer = setInterval(update, 100);
  return { element: root, stop: () => clearInterval(timer) };
}
