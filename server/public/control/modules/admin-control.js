export function initAdminControl(socket, getActiveScreen) {
  const el = (id) => document.getElementById(id);
  const idleInput = el("idleTimeoutSec");
  const modeSelect = el("defaultMode");
  const scriptInput = el("defaultScript");
  const screenName = el("adminScreenName");
  const printerList = el("printerList");
  const statusEl = el("adminStatus");
  const printerName = el("printerName");
  const printerUrl = el("printerUrl");
  const printerKey = el("printerKey");
  const printerCamera = el("printerCamera");
  const printerSave = el("printerSave");

  let editingPrinterId = null;
  let lastSynced = { idle: null, screenId: null, mode: null, script: null };
  let lastPrinterKey = null;

  function syncScriptVisibility() {
    scriptInput.style.display = modeSelect.value === "script" ? "" : "none";
  }

  function resetPrinterForm() {
    editingPrinterId = null;
    [printerName, printerUrl, printerKey, printerCamera].forEach((input) => {
      input.value = "";
    });
    printerSave.textContent = "Add printer";
  }

  el("idleTimeoutSave").onclick = () => {
    socket.emit("admin:set-idle-timeout", { idleTimeoutSec: Number(idleInput.value) });
  };

  el("defaultSave").onclick = () => {
    const screen = getActiveScreen();
    if (!screen) return;
    socket.emit("admin:set-default", {
      screenId: screen.screenId,
      mode: modeSelect.value,
      script: scriptInput.value
    });
  };

  modeSelect.addEventListener("change", syncScriptVisibility);

  printerSave.onclick = () => {
    const existing = editingPrinterId;
    socket.emit("admin:save-printer", {
      id: existing,
      name: printerName.value,
      baseUrl: printerUrl.value,
      apiKey: printerKey.value,
      cameraUrl: printerCamera.value,
      enabled: true
    });
    statusEl.textContent = "";
    resetPrinterForm();
  };

  socket.on("admin:error", ({ message }) => {
    statusEl.textContent = message;
  });

  function renderPrinters(printers) {
    const key = JSON.stringify(printers);
    if (key === lastPrinterKey) return;
    lastPrinterKey = key;
    printerList.innerHTML = "";

    if (!printers.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No printers configured.";
      printerList.appendChild(empty);
      return;
    }

    printers.forEach((printer) => {
      const row = document.createElement("div");
      row.className = "row wrap";

      const info = document.createElement("span");
      const state = printer.error ? `offline (${printer.error})` : printer.printing ? `printing ${printer.progress ?? "?"}%` : printer.status.toLowerCase();
      info.textContent = `${printer.name} - ${printer.baseUrl} - ${state}${printer.enabled ? "" : " (disabled)"}`;

      const editBtn = document.createElement("button");
      editBtn.textContent = "Edit";
      editBtn.onclick = () => {
        editingPrinterId = printer.id;
        printerName.value = printer.name;
        printerUrl.value = printer.baseUrl;
        printerKey.value = "";
        printerKey.placeholder = printer.hasApiKey ? "API key (leave blank to keep)" : "API key";
        printerCamera.value = printer.cameraUrl || "";
        printerSave.textContent = "Update printer";
      };

      const toggleBtn = document.createElement("button");
      toggleBtn.textContent = printer.enabled ? "Disable" : "Enable";
      toggleBtn.onclick = () => {
        socket.emit("admin:save-printer", { ...printer, apiKey: "", enabled: !printer.enabled });
      };

      const removeBtn = document.createElement("button");
      removeBtn.className = "danger";
      removeBtn.textContent = "Remove";
      removeBtn.onclick = () => {
        if (editingPrinterId === printer.id) resetPrinterForm();
        socket.emit("admin:remove-printer", { id: printer.id });
      };

      row.append(info, editBtn, toggleBtn, removeBtn);
      printerList.appendChild(row);
    });
  }

  return {
    updateState(state) {
      const admin = state?.admin;
      if (!admin) return;
      const screen = getActiveScreen(state);

      if (lastSynced.idle !== admin.idleTimeoutSec) {
        idleInput.value = admin.idleTimeoutSec;
        lastSynced.idle = admin.idleTimeoutSec;
      }

      if (screen) {
        screenName.textContent = screen.name || screen.screenId;
        const view = admin.defaults[screen.screenId] || { mode: "none", script: "" };
        if (
          lastSynced.screenId !== screen.screenId ||
          lastSynced.mode !== view.mode ||
          lastSynced.script !== view.script
        ) {
          modeSelect.value = view.mode;
          scriptInput.value = view.script;
          lastSynced = { ...lastSynced, screenId: screen.screenId, mode: view.mode, script: view.script };
        }
      }
      syncScriptVisibility();
      renderPrinters(admin.printers);
    }
  };
}
