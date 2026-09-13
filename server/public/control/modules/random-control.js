export function updateControlRandomState(state, randomPreview, rollBtn, runtime) {
  const rs = state?.randomSelector;
  if (!rs || !randomPreview || !rollBtn) return;

  if (rs.rollId && rs.rollId !== runtime.lastRollId && rs.rolledAt) {
    runtime.lastRollId = rs.rollId;
    const elapsed = Date.now() - rs.rolledAt;
    const remaining = Math.max(0, (rs.durationMs || 2700) - elapsed);

    if (remaining > 0 && rs.options.length > 0) {
      if (runtime.rollTimer) clearInterval(runtime.rollTimer);
      rollBtn.classList.add("is-rolling");
      randomPreview.classList.add("is-rolling");
      randomPreview.classList.remove("is-winner");

      const startTime = Date.now();
      runtime.rollTimer = setInterval(() => {
        const timePassed = Date.now() - startTime;
        if (timePassed >= remaining) {
          clearInterval(runtime.rollTimer);
          runtime.rollTimer = null;
          rollBtn.classList.remove("is-rolling");
          randomPreview.classList.remove("is-rolling");
          randomPreview.textContent = rs.selected || "No selection";
          if (rs.selected) {
            randomPreview.classList.add("is-winner");
          }
        } else {
          const randIdx = Math.floor(Math.random() * rs.options.length);
          randomPreview.textContent = `🎲 ${rs.options[randIdx]}`;
        }
      }, 70);
      return;
    }
  }

  if (!runtime.rollTimer) {
    rollBtn.classList.remove("is-rolling");
    randomPreview.classList.remove("is-rolling");
    randomPreview.textContent = rs.selected || "No selection";
    randomPreview.classList.toggle("is-winner", Boolean(rs.selected));
  }
}

export function initRandomControl(socket, randomOptionsInput, randomPreviewEl, randomSaveBtn, randomRollBtn) {
  const runtime = {
    lastRollId: null,
    rollTimer: null
  };

  if (randomSaveBtn) {
    randomSaveBtn.onclick = () => {
      const options = randomOptionsInput.value
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      socket.emit("random:set-options", { options });
    };
  }

  if (randomRollBtn) {
    randomRollBtn.onclick = () => socket.emit("random:roll");
  }

  return {
    updateState: (state) => updateControlRandomState(state, randomPreviewEl, randomRollBtn, runtime)
  };
}
