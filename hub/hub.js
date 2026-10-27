// hub.js
// Casca do HUB: monta o menu lateral a partir dos módulos registrados e abre
// a tela do módulo indicado na URL (hub.html#/<id>; sem id, abre o primeiro).

import { MODULOS, moduloPorId } from "../core/modulos.js";

const COM_TELA = MODULOS.filter((m) => m.hub);

function moduloDaUrl() {
  const id = location.hash.replace(/^#\/?/, "");
  const m = moduloPorId(id);
  return m && m.hub ? m : COM_TELA[0];
}

function montarMenu() {
  const nav = document.getElementById("navModulos");
  // Módulos de verdade vêm antes dos "em breve" que já estão no HTML.
  [...COM_TELA].reverse().forEach((m) => {
    const btn = document.createElement("button");
    btn.className = "nav-item";
    btn.dataset.module = m.id;
    btn.title = m.nome;
    btn.setAttribute("aria-label", m.nome);
    btn.innerHTML = m.icone;
    btn.addEventListener("click", () => (location.hash = `/${m.id}`));
    nav.prepend(btn);
  });
}

async function abrirModulo() {
  const m = moduloDaUrl();
  document.querySelectorAll("#navModulos [data-module]").forEach((b) => {
    b.classList.toggle("active", b.dataset.module === m.id);
  });
  document.getElementById("brandName").textContent = `Gamma - ${m.nome}`;
  document.title = `Gamma - ${m.nome}`;

  // Limpa o que o módulo anterior deixou: conteúdo e abas do topo.
  const conteudo = document.getElementById("conteudo");
  conteudo.innerHTML = "";
  const abas = document.createElement("nav");
  abas.className = "tabs";
  abas.dataset.slot = "abas-topo";
  document.querySelector('[data-slot="abas-topo"]').replaceWith(abas);

  const view = await m.hub();
  await view.montar(conteudo);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("todayLabel").textContent = new Date().toLocaleDateString("pt-BR");
  montarMenu();
  abrirModulo();
  window.addEventListener("hashchange", abrirModulo);
});
