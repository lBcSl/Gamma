// popup.js
// Casca do popup: abas, data de hoje e Configurações (backup geral).
// As abas de trabalho vêm do módulo. Por enquanto só o Backlog tem popup;
// quando houver um segundo módulo, entra aqui um seletor de módulos.

import { MODULOS } from "../core/modulos.js";
import { exportBackup, importBackup } from "../core/backup.js";

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("todayLabel").textContent = new Date().toLocaleDateString("pt-BR");
  setupConfig();

  const modulo = MODULOS.find((m) => m.popup);
  const view = await modulo.popup();
  await view.montar(document.querySelector("main.content"));
  setupTabs(view);
});

function setupTabs(view) {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      buttons.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      if (view.aoMostrarAba) await view.aoMostrarAba(btn.dataset.tab);
    });
  });
}

// ---------- config / backup ----------
function setupConfig() {
  document.getElementById("btnExportar").addEventListener("click", () => exportBackup());

  document.getElementById("inputImportar").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    const feedback = document.getElementById("feedbackConfig");
    if (!file) return;
    try {
      const text = await file.text();
      await importBackup(text);
      feedback.textContent = "Backup importado com sucesso. Reabra a extensão.";
      feedback.className = "feedback ok";
    } catch (err) {
      feedback.textContent = "Arquivo inválido.";
      feedback.className = "feedback err";
    }
  });
}
