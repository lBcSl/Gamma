// paleta.js
// Paleta de scripts dentro dos sites: o atalho (padrão Ctrl+Shift+Espaço) abre uma caixa
// para buscar o script; ao escolher, o texto entra onde o cursor estava e também fica
// copiado (pronto para Ctrl+V). Sem campo de texto selecionado, só copia.
//
// O que a paleta faz na página: só insere o texto escolhido no campo onde a pessoa já
// estava digitando, do mesmo jeito que colar. Não lê o conteúdo da página. A caixa
// fica numa área isolada (Shadow DOM fechado): o CSS da página não a afeta e vice-versa.
// Lista, contexto e texto final vêm do background (servico-paleta.js).
//
// Roda como script comum (não módulo) em todos os frames.

(() => {
  if (window.__gammaPaleta) return;
  window.__gammaPaleta = true;

  const TIPOS_INPUT = ["text", "search", "email", "url", "tel", ""];

  let host = null; // caixa aberta (ou null)
  let raiz = null; // shadow root
  let alvo = null; // onde inserir: { el, tipo: "campo" | "editavel", inicio, fim, range }
  let focoAnterior = null; // elemento em foco ao abrir (para devolver no Esc)
  let dados = { scripts: [], pastas: [] };
  let filtroPasta = "*"; // "*" = todas, "" = sem pasta
  let visiveis = [];
  let indice = 0;
  let uso = null; // script escolhido que está nas perguntas: { script, ctx }
  let desligado = false;

  // ---------- conversa com o background ----------
  async function pedir(tipo, extra = {}) {
    if (desligado) return null;
    try {
      return await chrome.runtime.sendMessage({ tipo: `gamma:scripts:${tipo}`, ...extra });
    } catch (err) {
      // "Extension context invalidated": a extensão foi recarregada; a página também precisa ser.
      desligado = true;
      return null;
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== chrome.runtime.id || !msg || msg.tipo !== "gamma:paleta:abrir") return;
    if (host) return fechar(true);
    if (!devoAbrir()) return;
    abrir();
  });

  // O atalho chega em todos os frames da aba; abre só no frame onde está o foco.
  // Sem foco na página (ex: cursor na barra de endereço), abre na página principal.
  function devoAbrir() {
    if (!document.hasFocus()) return window === window.top;
    const ativo = elementoAtivo();
    return !(ativo && /^(IFRAME|FRAME)$/.test(ativo.tagName));
  }

  // ---------- onde inserir ----------
  function elementoAtivo() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  function capturarAlvo() {
    const el = elementoAtivo();
    if (!el || el === document.body) return null;
    if (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && TIPOS_INPUT.includes((el.getAttribute("type") || "").toLowerCase()))) {
      if (el.readOnly || el.disabled) return null;
      return { el, tipo: "campo", inicio: el.selectionStart ?? el.value.length, fim: el.selectionEnd ?? el.value.length };
    }
    if (el.isContentEditable) {
      const sel = el.getRootNode().getSelection ? el.getRootNode().getSelection() : window.getSelection();
      const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      return { el, tipo: "editavel", range };
    }
    return null;
  }

  function restaurarFoco() {
    if (!alvo || !alvo.el.isConnected) {
      // Sem campo para inserir (ex: senha): só devolve o foco para onde estava.
      if (focoAnterior && focoAnterior.isConnected && focoAnterior.focus) focoAnterior.focus();
      return false;
    }
    alvo.el.focus();
    if (alvo.tipo === "campo") {
      try {
        alvo.el.setSelectionRange(alvo.inicio, alvo.fim);
      } catch (e) {
        /* email/number não aceitam seleção */
      }
    } else if (alvo.range) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(alvo.range);
    }
    return true;
  }

  function inserir(texto, cursor) {
    if (!restaurarFoco()) return false;
    const el = alvo.el;
    let ok = false;
    try {
      // Igual a digitar/colar: entra no desfazer (Ctrl+Z) e o site percebe a mudança.
      ok = document.execCommand("insertText", false, texto);
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      if (alvo.tipo === "campo") {
        el.setRangeText(texto, alvo.inicio, alvo.fim, "end");
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: texto }));
      } else if (alvo.range) {
        alvo.range.deleteContents();
        const no = document.createTextNode(texto);
        alvo.range.insertNode(no);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.collapse(no, no.length);
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: texto }));
      } else {
        return false;
      }
    }
    // {cursor}: volta o cursor até o ponto marcado.
    if (cursor >= 0 && cursor < texto.length) {
      const voltar = texto.length - cursor;
      if (alvo.tipo === "campo") {
        const pos = Math.max(0, el.selectionEnd - voltar);
        el.setSelectionRange(pos, pos);
      } else {
        const sel = window.getSelection();
        for (let i = 0; i < voltar; i++) sel.modify("move", "backward", "character");
      }
    }
    return true;
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (e) {
      // Sem a API (site sem https, por ex.): copia por um campo escondido dentro da caixa.
      const area = document.createElement("textarea");
      area.value = texto;
      area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      (raiz || document.body).appendChild(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (err) {
        ok = false;
      }
      area.remove();
      return ok;
    }
  }

  // ---------- caixa ----------
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .fundo { position: fixed; inset: 0; z-index: 2147483647; display: flex; justify-content: center;
      align-items: flex-start; padding: 12vh 16px 16px; background: rgba(10,10,10,.28);
      font: 14px/1.45 "Plus Jakarta Sans", -apple-system, "Segoe UI", Roboto, sans-serif; color: #0a0a0a; }
    .caixa { width: 640px; max-width: 100%; max-height: 72vh; display: flex; flex-direction: column;
      background: #fff; border: 1px solid #d4d4d4; border-radius: 18px; overflow: hidden;
      box-shadow: 0 24px 60px rgba(0,0,0,.25), 0 2px 8px rgba(0,0,0,.08); }
    .topo { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid #eaeaea; }
    .logo { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 8px; background: #0a0a0a; color: #fff;
      display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
    .busca { flex: 1; min-width: 0; height: 36px; border: 0; outline: 0; background: transparent; color: inherit;
      font: inherit; font-size: 16px; font-weight: 500; }
    .busca::placeholder { color: #a3a3a3; }
    .modo { flex: 0 0 auto; font-size: 11px; font-weight: 600; color: #525252; background: #f0f0f0;
      padding: 4px 9px; border-radius: 999px; white-space: nowrap; }
    .pastas { display: flex; gap: 6px; padding: 10px 14px; overflow-x: auto; border-bottom: 1px solid #eaeaea; }
    .pasta { flex: 0 0 auto; height: 28px; padding: 0 12px; border: 0; border-radius: 999px; background: #f0f0f0;
      color: #262626; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
    .pasta:hover { background: #e5e5e5; }
    .pasta.on { background: #0a0a0a; color: #fff; }
    .corpo { display: flex; min-height: 0; flex: 1; }
    .lista { flex: 1 1 55%; min-width: 0; margin: 0; padding: 6px; list-style: none; overflow-y: auto; max-height: 46vh; }
    .item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; cursor: pointer; }
    .item.on { background: #0a0a0a; color: #fff; }
    .item.on .at { background: #262626; color: #fff; }
    .item.on .pn { color: #d4d4d4; }
    .at { flex: 0 0 auto; padding: 3px 8px; border-radius: 999px; background: #eaeaea; color: #262626;
      font: 700 12px/1.4 ui-monospace, "Cascadia Mono", Consolas, monospace; }
    .tx { display: flex; flex-direction: column; min-width: 0; }
    .tt { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pn { font-size: 11px; color: #737373; }
    .vazio { padding: 24px 12px; text-align: center; color: #737373; }
    .previa { flex: 1 1 45%; min-width: 0; padding: 14px 16px; border-left: 1px solid #eaeaea; overflow-y: auto;
      max-height: 46vh; white-space: pre-wrap; word-break: break-word; color: #404040; font-size: 13px; }
    .var { padding: 0 4px; border-radius: 5px; background: #eaeaea; color: #0a0a0a; font-weight: 600; }
    form { display: flex; flex-direction: column; gap: 10px; padding: 14px; overflow-y: auto; }
    .cab { display: flex; align-items: center; gap: 8px; }
    .voltar { border: 0; background: #f0f0f0; color: inherit; height: 30px; padding: 0 12px; border-radius: 999px;
      font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
    .cab strong { font-size: 15px; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: #404040; }
    input.campo, select { height: 38px; padding: 0 10px; border: 1px solid #d4d4d4; border-radius: 10px;
      background: #fff; color: inherit; font: inherit; font-size: 14px; }
    input.campo:focus, select:focus { outline: 2px solid #0a0a0a; outline-offset: 1px; }
    .final { padding: 10px 12px; border-radius: 10px; background: #f5f5f5; white-space: pre-wrap;
      word-break: break-word; font-size: 13px; color: #404040; }
    .usar { height: 40px; border: 0; border-radius: 999px; background: #0a0a0a; color: #fff; font: inherit;
      font-weight: 600; cursor: pointer; }
    .rodape { display: flex; gap: 14px; padding: 8px 14px; border-top: 1px solid #eaeaea; font-size: 11px; color: #737373; }
    kbd { font: 600 10px/1 ui-monospace, Consolas, monospace; padding: 2px 5px; border-radius: 4px; background: #f0f0f0; color: #404040; }
    .erro { padding: 12px 14px; color: #b42318; font-weight: 600; }
    .hidden { display: none !important; }
    @media (max-width: 560px) { .previa { display: none; } }
    @media (prefers-color-scheme: dark) {
      .fundo { color: #f5f5f5; background: rgba(0,0,0,.45); }
      .caixa { background: #171717; border-color: #333; }
      .topo, .pastas, .rodape { border-color: #2a2a2a; }
      .previa { border-color: #2a2a2a; color: #d4d4d4; }
      .logo, .pasta.on, .item.on, .usar { background: #fafafa; color: #0a0a0a; }
      .item.on .at { background: #d4d4d4; color: #0a0a0a; }
      .item.on .pn { color: #404040; }
      .modo, .pasta, .voltar, kbd { background: #262626; color: #d4d4d4; }
      .pasta:hover { background: #333; }
      .at, .var { background: #2e2e2e; color: #f5f5f5; }
      label { color: #d4d4d4; }
      input.campo, select { background: #262626; border-color: #404040; }
      input.campo:focus, select:focus { outline-color: #fafafa; }
      .final { background: #1f1f1f; color: #d4d4d4; }
      .erro { color: #f97066; }
    }`;

  const HTML = `
    <div class="fundo" data-el="fundo">
      <div class="caixa" role="dialog" aria-modal="true" aria-label="Gamma: scripts">
        <div class="topo">
          <span class="logo" aria-hidden="true">G</span>
          <input class="busca" data-el="busca" type="text" autocomplete="off" spellcheck="false"
            placeholder="Buscar script ou /atalho" aria-label="Buscar script" />
          <span class="modo" data-el="modo"></span>
        </div>
        <div data-el="tela-lista">
          <div class="pastas" data-el="pastas" role="tablist" aria-label="Pastas"></div>
          <div class="corpo">
            <ul class="lista" data-el="lista" role="listbox" aria-label="Scripts"></ul>
            <div class="previa" data-el="previa"></div>
          </div>
        </div>
        <form class="hidden" data-el="tela-perguntas" autocomplete="off">
          <div class="cab">
            <button type="button" class="voltar" data-el="voltar">← Voltar</button>
            <strong data-el="uso-titulo"></strong>
          </div>
          <div data-el="campos" style="display:flex;flex-direction:column;gap:10px"></div>
          <div class="final" data-el="final"></div>
          <button type="submit" class="usar" data-el="usar"></button>
        </form>
        <p class="erro hidden" data-el="erro"></p>
        <div class="rodape">
          <span><kbd>↑</kbd> <kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> usar</span>
          <span><kbd>Tab</kbd> pasta</span>
          <span><kbd>Esc</kbd> fechar</span>
        </div>
      </div>
    </div>`;

  const $ = (nome) => raiz.querySelector(`[data-el="${nome}"]`);

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  async function abrir() {
    focoAnterior = elementoAtivo();
    alvo = capturarAlvo();
    uso = null;
    filtroPasta = "*";
    indice = 0;

    host = document.createElement("gamma-paleta");
    raiz = host.attachShadow({ mode: "closed" });
    raiz.innerHTML = `<style>${CSS}</style>${HTML}`;
    // Teclas e cliques da caixa não chegam aos atalhos do site.
    ["keydown", "keyup", "keypress", "input", "click", "mousedown", "focusin"].forEach((t) =>
      host.addEventListener(t, (e) => e.stopPropagation())
    );
    document.documentElement.appendChild(host);

    $("modo").textContent = alvo ? "Insere no campo e copia" : "Sem campo selecionado: só copia";
    $("usar").textContent = alvo ? "Inserir" : "Copiar";
    $("fundo").addEventListener("mousedown", (e) => {
      if (e.target === $("fundo")) fechar(true);
    });
    $("busca").addEventListener("input", () => {
      indice = 0;
      renderLista();
    });
    $("busca").addEventListener("keydown", teclaNaBusca);
    $("tela-perguntas").addEventListener("keydown", teclaNasPerguntas);
    $("tela-perguntas").addEventListener("submit", (e) => {
      e.preventDefault();
      concluir();
    });
    $("voltar").addEventListener("click", voltarParaLista);
    $("busca").focus();

    const resp = await pedir("listar");
    if (!host) return;
    if (!resp || resp.erro) return mostrarErro();
    dados = resp;
    renderPastas();
    renderLista();
  }

  function mostrarErro() {
    const el = $("erro");
    el.textContent = "O Gamma foi atualizado. Recarregue a página (F5) para usar a paleta.";
    el.classList.remove("hidden");
    $("tela-lista").classList.add("hidden");
  }

  // devolverFoco: fechar sem usar (Esc/clique fora) devolve o cursor para onde estava.
  function fechar(devolverFoco) {
    if (!host) return;
    host.remove();
    host = null;
    raiz = null;
    uso = null;
    if (devolverFoco) restaurarFoco();
  }

  // ---------- lista ----------
  function grupos() {
    const ids = new Set(dados.pastas.map((p) => p.id));
    const lista = [{ id: "*", nome: "Todas" }, ...dados.pastas];
    if (dados.scripts.some((s) => !ids.has(s.pastaId))) lista.push({ id: "", nome: "Sem pasta" });
    return lista;
  }

  function nomePasta(s) {
    return dados.pastas.find((p) => p.id === s.pastaId)?.nome || "Sem pasta";
  }

  function renderPastas() {
    $("pastas").innerHTML = grupos()
      .map((p) => `<button type="button" class="pasta${p.id === filtroPasta ? " on" : ""}" role="tab"
        aria-selected="${p.id === filtroPasta}" data-pasta="${esc(p.id)}">${esc(p.nome)}</button>`)
      .join("");
    $("pastas").querySelectorAll(".pasta").forEach((b) =>
      b.addEventListener("click", () => {
        filtroPasta = b.dataset.pasta;
        indice = 0;
        renderPastas();
        renderLista();
        $("busca").focus();
      })
    );
  }

  function trocarPasta(passo) {
    const g = grupos();
    const i = g.findIndex((p) => p.id === filtroPasta);
    filtroPasta = g[(i + passo + g.length) % g.length].id;
    indice = 0;
    renderPastas();
    renderLista();
  }

  // Atalho exato > atalho que começa com o termo > nome > texto.
  function pontuar(s, t) {
    if (!t) return 1;
    if (s.atalho === t) return 4;
    if (s.atalho.startsWith(t)) return 3;
    if (s.titulo.toLowerCase().includes(t)) return 2;
    if (s.texto.toLowerCase().includes(t)) return 1;
    return 0;
  }

  function renderLista() {
    const termo = $("busca").value.trim().toLowerCase().replace(/^\//, "");
    const ids = new Set(dados.pastas.map((p) => p.id));
    const ordem = (s) => {
      const i = dados.pastas.findIndex((p) => p.id === s.pastaId);
      return i === -1 ? dados.pastas.length : i;
    };
    visiveis = dados.scripts
      .filter((s) => filtroPasta === "*" || (filtroPasta === "" ? !ids.has(s.pastaId) : s.pastaId === filtroPasta))
      .map((s) => ({ s, p: pontuar(s, termo) }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p || ordem(a.s) - ordem(b.s) || a.s.atalho.localeCompare(b.s.atalho))
      .map((x) => x.s);
    indice = Math.min(indice, Math.max(0, visiveis.length - 1));

    const lista = $("lista");
    if (!visiveis.length) {
      lista.innerHTML = `<li class="vazio">${dados.scripts.length ? "Nenhum script encontrado." : "Nenhum script. Crie no HUB do Gamma."}</li>`;
      $("previa").textContent = "";
      return;
    }
    lista.innerHTML = visiveis
      .map((s, i) => `
        <li class="item${i === indice ? " on" : ""}" role="option" aria-selected="${i === indice}" data-i="${i}">
          <span class="at">/${esc(s.atalho)}</span>
          <span class="tx"><span class="tt">${esc(s.titulo)}</span><span class="pn">${esc(nomePasta(s))}</span></span>
        </li>`)
      .join("");
    lista.querySelectorAll(".item").forEach((li) => {
      li.addEventListener("mousemove", () => {
        if (Number(li.dataset.i) !== indice) selecionar(Number(li.dataset.i), false);
      });
      li.addEventListener("click", () => escolher(visiveis[Number(li.dataset.i)]));
    });
    renderPrevia();
  }

  function selecionar(i, rolar = true) {
    indice = i;
    $("lista").querySelectorAll(".item").forEach((li) => {
      const on = Number(li.dataset.i) === i;
      li.classList.toggle("on", on);
      li.setAttribute("aria-selected", on);
      if (on && rolar) li.scrollIntoView({ block: "nearest" });
    });
    renderPrevia();
  }

  // Prévia do texto do script, com as variáveis destacadas.
  function renderPrevia() {
    const s = visiveis[indice];
    $("previa").innerHTML = s ? esc(s.texto).replace(/\{[^{}\n]+\}/g, (v) => `<span class="var">${v}</span>`) : "";
  }

  function teclaNaBusca(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!visiveis.length) return;
      const passo = e.key === "ArrowDown" ? 1 : -1;
      selecionar((indice + passo + visiveis.length) % visiveis.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (visiveis[indice]) escolher(visiveis[indice]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      trocarPasta(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      fechar(true);
    }
  }

  // ---------- perguntas e uso ----------
  async function escolher(script) {
    if (uso) return; // já escolhido (Enter repetido)
    uso = { script, ctx: null };
    // Trava a busca já: o que for digitado enquanto prepara não pode cair nela.
    $("busca").readOnly = true;
    const resp = await pedir("preparar", { id: script.id });
    if (!host) return;
    if (!resp || resp.erro) return mostrarErro();
    uso.ctx = resp.ctx;
    if (!resp.perguntas.length) return concluir();

    $("tela-lista").classList.add("hidden");
    $("tela-perguntas").classList.remove("hidden");
    $("uso-titulo").textContent = `/${script.atalho} · ${script.titulo}`;
    $("campos").innerHTML = resp.perguntas
      .map((p) => {
        const campo = p.tipo === "opcao"
          ? `<select data-chave="${esc(p.chave)}">${p.opcoes.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select>`
          : `<input class="campo" type="text" data-chave="${esc(p.chave)}" />`;
        return `<label>${esc(p.rotulo)}${campo}</label>`;
      })
      .join("");
    $("campos").querySelectorAll("[data-chave]").forEach((el) => {
      el.addEventListener("input", agendarFinal);
      el.addEventListener("change", agendarFinal);
    });
    $("campos").querySelector("[data-chave]").focus();
    atualizarFinal();
  }

  function respostas() {
    const r = {};
    $("campos").querySelectorAll("[data-chave]").forEach((el) => (r[el.dataset.chave] = el.value));
    return r;
  }

  let timerFinal = null;
  function agendarFinal() {
    clearTimeout(timerFinal);
    timerFinal = setTimeout(atualizarFinal, 120);
  }

  async function atualizarFinal() {
    if (!uso) return;
    const r = await pedir("renderizar", { id: uso.script.id, ctx: uso.ctx, respostas: respostas() });
    if (host && uso && r && !r.erro) $("final").textContent = r.texto;
  }

  function teclaNasPerguntas(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      voltarParaLista();
    } else if (e.key === "Enter" && e.target.tagName === "SELECT") {
      e.preventDefault();
      $("tela-perguntas").requestSubmit();
    }
  }

  function voltarParaLista() {
    uso = null;
    $("tela-perguntas").classList.add("hidden");
    $("tela-lista").classList.remove("hidden");
    $("busca").readOnly = false;
    $("busca").focus();
  }

  async function concluir() {
    if (!uso) return;
    const r = await pedir("renderizar", {
      id: uso.script.id,
      ctx: uso.ctx,
      respostas: raiz && !$("tela-perguntas").classList.contains("hidden") ? respostas() : {}
    });
    if (!host) return;
    if (!r || r.erro) return mostrarErro();
    // Copia antes de fechar (a cópia precisa da página em foco).
    const copiado = await copiar(r.texto);
    fechar(false);
    const inserido = alvo ? inserir(r.texto, r.cursor) : false;
    if (!inserido) aviso(copiado ? "Copiado. É só colar com Ctrl+V." : "Não deu para copiar nesta página.");
  }

  // Aviso rápido no canto (quando não houve campo para inserir).
  function aviso(texto) {
    const el = document.createElement("gamma-aviso");
    const sr = el.attachShadow({ mode: "closed" });
    sr.innerHTML = `<style>
      :host { all: initial; }
      div { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647;
        padding: 10px 16px; border-radius: 999px; background: #0a0a0a; color: #fff;
        font: 600 13px/1.4 "Plus Jakarta Sans", -apple-system, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 8px 24px rgba(0,0,0,.2); }
      @media (prefers-color-scheme: dark) { div { background: #fafafa; color: #0a0a0a; } }
    </style><div role="status">${esc(texto)}</div>`;
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
})();
