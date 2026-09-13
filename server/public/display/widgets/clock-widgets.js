export function buildClock(slot) {
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

export function buildTimer(state) {
  const wrap = document.createElement("div");
  wrap.className = "widget";
  const big = document.createElement("div");
  big.className = "big";
  big.dataset.widget = "timer";
  wrap.appendChild(big);
  return wrap;
}

export function buildStopwatch(state) {
  const wrap = document.createElement("div");
  wrap.className = "widget";
  const big = document.createElement("div");
  big.className = "big";
  big.dataset.widget = "stopwatch";
  wrap.appendChild(big);
  return wrap;
}
