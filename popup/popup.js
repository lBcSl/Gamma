// popup.js
// Casca do popup: abas, data de hoje e Configurações (backup geral e preferências).
// Cada módulo com `popup` traz suas abas; elas entram na mesma linha, na ordem de
// core/modulos.js, e a primeira aba do primeiro módulo abre ativa.

import { MODULOS } from "../core/modulos.js";
import { exportBackup, importBackup } from "../core/backup.js";
import { getPerfil, salvarNomeDoAgente } from "../core/perfil.js";
import { garantirNomeDoAgente } from "../core/boas-vindas.js";
// Preferência do cartão do HelpDesk (Backlog).
import { cartaoHelpdeskAtivo, definirCartaoHelpdeskAtivo } from "../modules/backlog/dados.js";

const VIEW_DA_ABA = new Map(); // data-tab -> view do módulo dono da aba

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("todayLabel").textContent = new Date().toLocaleDateString("pt-BR");
  setupConfig();

  const conteudo = document.querySelector("main.content");
  for (const modulo of MODULOS.filter((m) => m.popup)) {
    const view = await modulo.popup();
    const abas = await view.montar(conteudo);
    (abas || []).forEach((btn) => btn.dataset.tab && VIEW_DA_ABA.set(btn.dataset.tab, view));
  }
  ativarPrimeiraAba();
  setupTabs();
  await garantirNomeDoAgente();
});

// Cada template marca a sua primeira aba como ativa; só a do primeiro módulo fica.
function ativarPrimeiraAba() {
  const abas = [...document.querySelectorAll(".tabs .tab-btn")];
  abas.forEach((b, i) => b.classList.toggle("active", i === 0));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  if (abas[0]) document.getElementById(`tab-${abas[0].dataset.tab}`).classList.add("active");
}

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      buttons.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      if (btn.dataset.tab === "config") await carregarNome();
      const view = VIEW_DA_ABA.get(btn.dataset.tab);
      if (view && view.aoMostrarAba) await view.aoMostrarAba(btn.dataset.tab);
    });
  });
}

// ---------- config / backup ----------
async function carregarNome() {
  document.getElementById("cfgNome").value = (await getPerfil()).nome;
}

async function setupConfig() {
  document.getElementById("btnExportar").addEventListener("click", () => exportBackup());

  const cartao = document.getElementById("cfgCartaoHelpdesk");
  cartao.checked = await cartaoHelpdeskAtivo();
  cartao.addEventListener("change", () => definirCartaoHelpdeskAtivo(cartao.checked));

  const feedback = document.getElementById("feedbackConfig");
  await carregarNome();
  document.getElementById("formNome").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = document.getElementById("cfgNome").value.trim();
    if (!nome) {
      feedback.textContent = "Digite seu nome.";
      feedback.className = "feedback err";
      return;
    }
    await salvarNomeDoAgente(nome);
    feedback.textContent = "Nome salvo.";
    feedback.className = "feedback ok";
  });

  document.getElementById("inputImportar").addEventListener("change", async (e) => {
    const file = e.target.files[0];
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
