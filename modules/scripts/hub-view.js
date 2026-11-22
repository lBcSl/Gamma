// hub-view.js
// Tela do Scripts no HUB: biblioteca, editor com prévia, pastas, nome do agente e pacotes .json.

import {
  PREFIXO,
  normalizarAtalho,
  listarScripts,
  scriptPorId,
  originalDoPadrao,
  listarPastas,
  salvarScript,
  excluirScript,
  restaurarPadrao,
  reexibirPadrao,
  criarPasta,
  renomearPasta,
  excluirPasta,
  moverPasta,
  montarPacote,
  analisarPacote,
  importarPacote
} from "./dados.js";
import { VARIAVEIS, previa } from "./variaveis.js";
import { contextoBase, copiarTexto, montarPerguntas } from "./usar.js";
import { getPerfil, salvarNomeDoAgente } from "../../core/perfil.js";
import { montarTemplate, escaparHtml } from "../../core/ui.js";
import { todayKey } from "../../core/datas.js";

const SEM_PASTA = "";
let selecionadoId = null; // null = novo script
let confirmandoExclusao = false;
let pacotePendente = null; // texto do .json aguardando a escolha manter/substituir

function carregarCss() {
  if (document.getElementById("css-scripts")) return;
  const link = document.createElement("link");
  link.id = "css-scripts";
  link.rel = "stylesheet";
  link.href = new URL("./scripts.css", import.meta.url).href;
  document.head.appendChild(link);
}

export async function montar(conteudo) {
  carregarCss();
  await montarTemplate(new URL("./hub-view.html", import.meta.url), conteudo);
  setupTabs();
  setupEditor();
  setupUso();
  setupConfig();
  await renderLista();
  await abrirNoEditor(null);
  await renderConfig();
}

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      buttons.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
      if (btn.dataset.view === "sc-config") await renderConfig();
    });
  });
}

function mostrarFeedback(id, texto, tipo = "ok") {
  const el = document.getElementById(id);
  el.textContent = texto;
  el.className = `feedback ${tipo}`;
}

// ---------- lista ----------
function combinaBusca(s, termo) {
  if (!termo) return true;
  const t = termo.toLowerCase().replace(/^\//, "");
  return s.atalho.includes(t) || s.titulo.toLowerCase().includes(t) || s.texto.toLowerCase().includes(t);
}

async function renderLista() {
  const [scripts, pastas] = await Promise.all([listarScripts(), listarPastas()]);
  const termo = document.getElementById("scBusca").value.trim();
  const visiveis = scripts.filter((s) => combinaBusca(s, termo));
  const lista = document.getElementById("scLista");

  document.getElementById("scContagem").textContent =
    scripts.length === 1 ? "1 script" : `${scripts.length} scripts`;

  const grupos = [...pastas, { id: SEM_PASTA, nome: "Sem pasta" }].map((p) => ({
    ...p,
    itens: visiveis
      .filter((s) => (p.id === SEM_PASTA ? !pastas.some((x) => x.id === s.pastaId) : s.pastaId === p.id))
      .sort((a, b) => a.atalho.localeCompare(b.atalho))
  }));

  const html = grupos
    .filter((g) => g.itens.length)
    .map(
      (g) => `
      <div class="sc-grupo">
        <p class="sc-grupo-nome">${escaparHtml(g.nome)} <span>${g.itens.length}</span></p>
        ${g.itens
          .map(
            (s) => `
          <button type="button" class="sc-item${s.id === selecionadoId ? " active" : ""}" data-id="${escaparHtml(s.id)}">
            <span class="sc-chip-atalho">${PREFIXO}${escaparHtml(s.atalho)}</span>
            <span class="sc-item-texto">
              <strong>${escaparHtml(s.titulo)}</strong>
              <span>${escaparHtml(s.texto.replace(/\s+/g, " ").slice(0, 70))}</span>
            </span>
            ${s.modificado ? '<span class="sc-marca" title="Script padrão modificado">mod.</span>' : ""}
          </button>`
          )
          .join("")}
      </div>`
    )
    .join("");

  lista.innerHTML = html || `<p class="empty">${termo ? "Nenhum script encontrado." : "Nenhum script ainda."}</p>`;
  lista.querySelectorAll(".sc-item").forEach((btn) => {
    btn.addEventListener("click", () => abrirNoEditor(btn.dataset.id));
  });
}

// ---------- editor ----------
async function preencherPastas(valor) {
  const pastas = await listarPastas();
  const select = document.getElementById("scPasta");
  select.innerHTML = [...pastas, { id: SEM_PASTA, nome: "Sem pasta" }]
    .map((p) => `<option value="${escaparHtml(p.id)}">${escaparHtml(p.nome)}</option>`)
    .join("");
  select.value = pastas.some((p) => p.id === valor) ? valor : SEM_PASTA;
}

async function abrirNoEditor(id) {
  const script = id ? await scriptPorId(id) : null;
  selecionadoId = script ? script.id : null;
  confirmandoExclusao = false;
  const pastas = await listarPastas();

  document.getElementById("scTitulo").value = script ? script.titulo : "";
  document.getElementById("scAtalho").value = script ? script.atalho : "";
  document.getElementById("scTexto").value = script ? script.texto : "";
  await preencherPastas(script ? script.pastaId : pastas[0]?.id ?? SEM_PASTA);

  document.getElementById("scOrigem").textContent = !script
    ? "Novo script"
    : script.origem === "padrao"
      ? "Script padrão do Gamma"
      : "Script pessoal";
  document.getElementById("scTituloEditor").textContent = script ? `${PREFIXO}${script.atalho}` : "Novo script";
  document.getElementById("scBadgeMod").classList.toggle("hidden", !script?.modificado);
  document.getElementById("scRestaurar").classList.toggle("hidden", !script?.modificado);

  const excluir = document.getElementById("scExcluir");
  excluir.classList.toggle("hidden", !script);
  excluir.classList.remove("confirming");
  excluir.textContent = script?.origem === "padrao" ? "Ocultar" : "Excluir";
  document.getElementById("scUsar").classList.toggle("hidden", !script);
  document.getElementById("scFeedback").textContent = "";

  await atualizarPrevia();
  await renderLista();
}

async function atualizarPrevia() {
  const ctx = await contextoBase();
  const texto = document.getElementById("scTexto").value;
  document.getElementById("scPrevia").textContent = texto.trim() ? previa(texto, ctx) : "A prévia aparece aqui.";
}

function inserirNoTexto(trecho) {
  const area = document.getElementById("scTexto");
  const ini = area.selectionStart ?? area.value.length;
  const fim = area.selectionEnd ?? ini;
  area.value = area.value.slice(0, ini) + trecho + area.value.slice(fim);
  // {campo:Rótulo} / {opcao:A|B}: deixa selecionado o que a pessoa precisa trocar
  const m = trecho.match(/^\{(campo|opcao):(.*)\}$/);
  area.focus();
  if (m) area.setSelectionRange(ini + m[1].length + 2, ini + trecho.length - 1);
  else area.setSelectionRange(ini + trecho.length, ini + trecho.length);
  atualizarPrevia();
}

function setupEditor() {
  document.getElementById("scBusca").addEventListener("input", renderLista);
  document.getElementById("scNovo").addEventListener("click", () => {
    abrirNoEditor(null);
    document.getElementById("scTitulo").focus();
  });

  const atalho = document.getElementById("scAtalho");
  atalho.addEventListener("input", () => {
    const limpo = normalizarAtalho(atalho.value);
    if (limpo !== atalho.value) atalho.value = limpo;
  });
  document.getElementById("scTexto").addEventListener("input", atualizarPrevia);

  document.getElementById("scChips").innerHTML = VARIAVEIS.map(
    (v) => `<button type="button" class="sc-chip" data-var="${escaparHtml(v.exemplo)}" title="${escaparHtml(v.descricao)}">${escaparHtml(v.exemplo)}</button>`
  ).join("");
  document.querySelectorAll("#scChips .sc-chip").forEach((b) => {
    b.addEventListener("click", () => inserirNoTexto(b.dataset.var));
  });

  document.getElementById("scEditor").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await salvarScript({
      id: selecionadoId || undefined,
      titulo: document.getElementById("scTitulo").value,
      atalho: document.getElementById("scAtalho").value,
      pastaId: document.getElementById("scPasta").value,
      texto: document.getElementById("scTexto").value
    });
    if (!r.ok) return mostrarFeedback("scFeedback", r.erro, "err");
    await abrirNoEditor(r.id);
    mostrarFeedback("scFeedback", "Script salvo.");
  });

  document.getElementById("scRestaurar").addEventListener("click", async () => {
    const r = await restaurarPadrao(selecionadoId);
    if (!r.ok) return mostrarFeedback("scFeedback", r.erro, "err");
    await abrirNoEditor(selecionadoId);
    mostrarFeedback("scFeedback", "Texto original restaurado.");
  });

  document.getElementById("scExcluir").addEventListener("click", async () => {
    const btn = document.getElementById("scExcluir");
    const padrao = !!originalDoPadrao(selecionadoId);
    if (!confirmandoExclusao) {
      confirmandoExclusao = true;
      btn.textContent = padrao ? "Ocultar? Clique de novo" : "Excluir? Clique de novo";
      btn.classList.add("confirming");
      return;
    }
    await excluirScript(selecionadoId);
    await abrirNoEditor(null);
    mostrarFeedback("scFeedback", padrao ? "Script oculto. Dá para reexibir em Pastas e configurações." : "Script excluído.");
  });

  document.getElementById("scUsar").addEventListener("click", async () => {
    const script = await scriptPorId(selecionadoId);
    if (script) await usarScript(script);
  });
}

// ---------- usar (copiar) ----------
let usoAtual = null;

async function usarScript(script) {
  const ctx = await contextoBase();
  const previaEl = document.getElementById("scUsoPrevia");
  usoAtual = montarPerguntas(document.getElementById("scUsoPerguntas"), script, ctx, (t) => (previaEl.textContent = t));
  if (!usoAtual.quantidade) {
    await copiarTexto(usoAtual.texto());
    return mostrarFeedback("scFeedback", "Copiado. É só colar com Ctrl+V.");
  }
  document.getElementById("scUsoTitulo").textContent = `${PREFIXO}${script.atalho}`;
  document.getElementById("scModalUso").classList.remove("hidden");
  usoAtual.primeiro?.focus();
}

function fecharUso() {
  document.getElementById("scModalUso").classList.add("hidden");
  usoAtual = null;
}

function setupUso() {
  document.getElementById("scUsoFechar").addEventListener("click", fecharUso);
  document.getElementById("scModalUso").addEventListener("click", (e) => {
    if (e.target.id === "scModalUso") fecharUso();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && usoAtual) fecharUso();
  });
  document.getElementById("scUsoForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await copiarTexto(usoAtual.texto());
    fecharUso();
    mostrarFeedback("scFeedback", "Copiado. É só colar com Ctrl+V.");
  });
}

// ---------- configurações ----------
async function renderConfig() {
  document.getElementById("scNome").value = (await getPerfil()).nome;

  const pastas = await listarPastas();
  const scripts = await listarScripts();
  const el = document.getElementById("scPastas");
  el.innerHTML = pastas.length
    ? pastas
        .map(
          (p, i) => `
      <div class="sc-pasta" data-id="${escaparHtml(p.id)}">
        <input type="text" value="${escaparHtml(p.nome)}" maxlength="40" aria-label="Nome da pasta" />
        <span class="sc-pasta-qtd">${scripts.filter((s) => s.pastaId === p.id).length}</span>
        <button type="button" class="btn-icon" data-acao="subir" title="Subir" aria-label="Subir" ${i === 0 ? "disabled" : ""}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button>
        <button type="button" class="btn-icon" data-acao="descer" title="Descer" aria-label="Descer" ${i === pastas.length - 1 ? "disabled" : ""}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
        <button type="button" class="btn-icon" data-acao="excluir" title="Excluir pasta" aria-label="Excluir pasta">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
      </div>`
        )
        .join("")
    : '<p class="empty">Nenhuma pasta.</p>';

  el.querySelectorAll(".sc-pasta").forEach((linha) => {
    const id = linha.dataset.id;
    const input = linha.querySelector("input");
    input.addEventListener("change", async () => {
      const r = await renomearPasta(id, input.value);
      if (!r.ok) {
        mostrarFeedback("scFeedbackPastas", r.erro, "err");
        return renderConfig();
      }
      mostrarFeedback("scFeedbackPastas", "Pasta renomeada.");
      await aposMudarPastas();
    });
    linha.querySelector('[data-acao="subir"]').addEventListener("click", async () => {
      await moverPasta(id, -1);
      await aposMudarPastas();
    });
    linha.querySelector('[data-acao="descer"]').addEventListener("click", async () => {
      await moverPasta(id, 1);
      await aposMudarPastas();
    });
    const btnExcluir = linha.querySelector('[data-acao="excluir"]');
    btnExcluir.addEventListener("click", async () => {
      if (!btnExcluir.classList.contains("confirming")) {
        btnExcluir.classList.add("confirming");
        btnExcluir.title = "Clique de novo para excluir";
        return;
      }
      await excluirPasta(id);
      mostrarFeedback("scFeedbackPastas", "Pasta excluída. Os scripts dela estão em \"Sem pasta\".");
      await aposMudarPastas();
    });
  });

  // padrões ocultos
  const ocultos = (await listarScripts({ incluirOcultos: true })).filter((s) => s.oculto);
  document.getElementById("scCardOcultos").classList.toggle("hidden", !ocultos.length);
  const elOcultos = document.getElementById("scOcultos");
  elOcultos.innerHTML = ocultos
    .map(
      (s) => `
      <div class="sc-pasta">
        <span class="sc-chip-atalho">${PREFIXO}${escaparHtml(s.atalho)}</span>
        <span class="sc-oculto-nome">${escaparHtml(s.titulo)}</span>
        <button type="button" class="btn-danger sc-btn-peq" data-id="${escaparHtml(s.id)}">Reexibir</button>
      </div>`
    )
    .join("");
  elOcultos.querySelectorAll("[data-id]").forEach((b) => {
    b.addEventListener("click", async () => {
      const r = await reexibirPadrao(b.dataset.id);
      if (!r.ok) return mostrarFeedback("scFeedbackPastas", r.erro, "err");
      await renderConfig();
      await renderLista();
    });
  });
}

async function aposMudarPastas() {
  await renderConfig();
  await preencherPastas(document.getElementById("scPasta").value);
  await renderLista();
}

function setupConfig() {
  document.getElementById("scFormNome").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = document.getElementById("scNome").value.trim();
    if (!nome) return mostrarFeedback("scFeedbackNome", "Digite seu nome.", "err");
    await salvarNomeDoAgente(nome);
    mostrarFeedback("scFeedbackNome", "Nome salvo.");
    await atualizarPrevia();
  });

  document.getElementById("scFormPasta").addEventListener("submit", async (e) => {
    e.preventDefault();
    const campo = document.getElementById("scNovaPasta");
    const r = await criarPasta(campo.value);
    if (!r.ok) return mostrarFeedback("scFeedbackPastas", r.erro, "err");
    campo.value = "";
    mostrarFeedback("scFeedbackPastas", "Pasta criada.");
    await aposMudarPastas();
  });

  document.getElementById("scExportar").addEventListener("click", async () => {
    const pacote = await montarPacote();
    const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: `scripts-gamma-${todayKey()}.json`, saveAs: true });
  });

  const resumo = document.getElementById("scImportResumo");
  document.getElementById("scImportar").addEventListener("change", async (e) => {
    const arquivo = e.target.files[0];
    e.target.value = "";
    if (!arquivo) return;
    try {
      const texto = await arquivo.text();
      const a = await analisarPacote(texto);
      if (!a.conflitos) {
        const r = await importarPacote(texto);
        return aposImportar(r);
      }
      pacotePendente = texto;
      document.getElementById("scImportTexto").textContent =
        `${a.total} script(s) no arquivo: ${a.novos} novo(s) e ${a.conflitos} com atalho que você já usa. ` +
        "Manter os seus ou substituir pelos do arquivo?";
      resumo.classList.remove("hidden");
      document.getElementById("scFeedbackImport").textContent = "";
    } catch (err) {
      mostrarFeedback("scFeedbackImport", err.message || "Arquivo inválido.", "err");
    }
  });

  const finalizar = async (substituir) => {
    const texto = pacotePendente;
    pacotePendente = null;
    resumo.classList.add("hidden");
    if (texto === null || substituir === null) return;
    aposImportar(await importarPacote(texto, { substituir }));
  };
  document.getElementById("scImportManter").addEventListener("click", () => finalizar(false));
  document.getElementById("scImportSubstituir").addEventListener("click", () => finalizar(true));
  document.getElementById("scImportCancelar").addEventListener("click", () => finalizar(null));
}

async function aposImportar(r) {
  const partes = [`${r.criados} novo(s)`];
  if (r.substituidos) partes.push(`${r.substituidos} substituído(s)`);
  if (r.pulados) partes.push(`${r.pulados} mantido(s) como estava(m)`);
  mostrarFeedback("scFeedbackImport", `Importado: ${partes.join(", ")}.`);
  await renderConfig();
  await preencherPastas(document.getElementById("scPasta").value);
  await renderLista();
}
