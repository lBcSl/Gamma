// cartao-helpdesk.js
// Cartão do Gamma na tela do HelpDesk: quando aparece um chamado que não está no
// backlog, oferece adicionar com um clique (ou editar antes, pelo lápis).
//
// Só lê a página. O cartão fica numa caixa isolada (Shadow DOM) presa no canto da
// tela: não altera nenhum campo nem formulário do HelpDesk, e o CSS de um não
// afeta o outro. Ler o chamado e gravar no backlog é com servico-cartao.js.
//
// Roda como script comum (não módulo), por isso não importa nada de helpdesk.js.

(() => {
  if (window.__gammaCartao) return;
  window.__gammaCartao = true;

  // Mesmo título que helpdesk.js usa para achar o chamado: "Dados do Chamado 13.002.258".
  const TITULO = ".widget-header h5";
  const TEXTO_TITULO = "Dados do Chamado";

  let numeroAtual = ""; // chamado visível na tela agora
  let host = null; // elemento do cartão
  let adicionando = false;
  let desligado = false; // extensão recarregada: este script antigo para de agir

  function numeroNaTela() {
    const titulos = [...document.querySelectorAll(TITULO)].filter(
      (h) => h.textContent.includes(TEXTO_TITULO) && h.getClientRects().length > 0
    );
    const titulo = titulos.pop();
    if (!titulo) return "";
    const m = titulo.textContent.replace(/\s+/g, " ").trim().match(/(\d[\d.]*\d)\s*$/);
    return m ? m[1].replace(/\D/g, "") : "";
  }

  async function pedir(tipo, dados = {}) {
    if (desligado) return null;
    try {
      return await chrome.runtime.sendMessage({ tipo: `gamma:cartao:${tipo}`, ...dados });
    } catch (err) {
      // "Extension context invalidated": a extensão foi recarregada. A página precisa
      // ser recarregada para o cartão voltar.
      desligado = true;
      observador.disconnect();
      removerCartao();
      return null;
    }
  }

  async function verificar(forcar = false) {
    const numero = numeroNaTela();
    if (numero === numeroAtual && !forcar) return;
    numeroAtual = numero;
    removerCartao();
    if (!numero) return;
    const resp = await pedir("verificar", { numero });
    // Enquanto esperava, o agente pode ter trocado de chamado.
    if (numeroNaTela() !== numero || !resp || !resp.mostrar) return;
    mostrarCartao(resp.chamado, resp.opcoes);
  }

  function removerCartao() {
    if (host) host.remove();
    host = null;
  }

  // ---------- cartão ----------
  const CSS = `
    :host { all: initial; }
    .card { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 300px;
      box-sizing: border-box; padding: 12px 14px; border-radius: 14px;
      background: #fff; color: #0a0a0a; border: 1px solid #d4d4d4;
      box-shadow: 0 8px 24px rgba(0,0,0,.14), 0 2px 6px rgba(0,0,0,.08);
      font: 13px/1.45 "Plus Jakarta Sans", -apple-system, "Segoe UI", Roboto, sans-serif; }
    .topo { display: flex; align-items: center; gap: 6px; }
    .logo { width: 22px; height: 22px; border-radius: 6px; background: #0a0a0a; color: #fff;
      display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; }
    .titulo { flex: 1; font-weight: 600; }
    .ib { border: 0; background: transparent; cursor: pointer; padding: 4px; border-radius: 6px;
      color: #525252; display: flex; }
    .ib:hover { background: #f0f0f0; }
    .ib.on { color: #0a0a0a; background: #eaeaea; }
    .ib svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2;
      stroke-linecap: round; stroke-linejoin: round; }
    .num { margin: 8px 0 0; font-weight: 600; }
    .num span { font-weight: 400; color: #525252; }
    .res { display: grid; grid-template-columns: 72px 1fr; gap: 3px 8px; margin: 8px 0 0; font-size: 12px; }
    .res dt { color: #525252; } .res dd { margin: 0; }
    .vazio { color: #a3a3a3; }
    .dica { font-size: 11px; color: #525252; margin: 6px 0 0; }
    .erro { color: #b42318; }
    .ok { color: #157f3b; margin: 8px 0 0; }
    label { display: block; font-size: 12px; color: #525252; margin: 8px 0 3px; }
    select, input { width: 100%; box-sizing: border-box; height: 30px; padding: 0 8px; font: inherit;
      font-size: 12px; color: inherit; background: #fff; border: 1px solid #d4d4d4; border-radius: 8px; }
    .botoes { display: flex; gap: 8px; margin-top: 12px; }
    .botoes button { flex: 1; height: 32px; border-radius: 10px; font: inherit; font-weight: 600;
      cursor: pointer; border: 1px solid #d4d4d4; background: #fff; color: inherit; }
    .botoes .prim { background: #0a0a0a; color: #fff; border-color: #0a0a0a; }
    .hidden { display: none !important; }
    @media (prefers-color-scheme: dark) {
      .card { background: #171717; color: #f5f5f5; border-color: #404040; }
      .logo, .botoes .prim { background: #f5f5f5; color: #0a0a0a; border-color: #f5f5f5; }
      .ib, .num span, .res dt, .dica, label { color: #a3a3a3; }
      .ib:hover { background: #262626; } .ib.on { background: #262626; color: #f5f5f5; }
      select, input, .botoes button { background: #262626; border-color: #404040; }
      .erro { color: #f97066; } .ok { color: #4ade80; }
    }`;

  const ICONE_LAPIS = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>';
  const ICONE_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  const HTML = `
    <div class="card" role="dialog" aria-label="Gamma: chamado fora do backlog">
      <div class="topo">
        <span class="logo" aria-hidden="true">G</span>
        <span class="titulo" data-el="titulo">Fora do seu backlog</span>
        <button class="ib" data-el="lapis" title="Editar antes de adicionar" aria-label="Editar antes de adicionar">${ICONE_LAPIS}</button>
        <button class="ib" data-el="fechar" title="Agora não" aria-label="Fechar">${ICONE_X}</button>
      </div>
      <div data-el="corpo">
        <p class="num"><strong data-el="numero"></strong></p>

        <div data-el="resumo">
          <dl class="res">
            <dt>Tipo</dt><dd data-el="rTipo"></dd>
            <dt data-el="rCatRotulo">Categoria</dt><dd data-el="rCat"></dd>
            <dt>Status</dt><dd data-el="rStatus"></dd>
          </dl>
          <p class="dica">Puxado do HelpDesk. Use o lápis para mudar.</p>
        </div>

        <div data-el="edicao" class="hidden">
          <label>Tipo <select data-el="tipo"></select></label>
          <label data-el="wrapDP" class="hidden">Sub-tipo <select data-el="categoriaDP"></select></label>
          <label data-el="wrapVinculado" class="hidden">N° do chamado vinculado
            <input data-el="vinculado" autocomplete="off" placeholder="Vazio se for adormecido" /></label>
          <label data-el="wrapCategoria">Categoria <select data-el="categoria"></select></label>
          <label data-el="wrapStatus">Status <select data-el="status"></select></label>
          <label data-el="wrapData" class="hidden"><span data-el="dataRotulo">Data do novo contato</span>
            <input type="date" data-el="dataPrevista" /></label>
          <label data-el="wrapEncaminhado" class="hidden">Encaminhado para
            <input data-el="encaminhadoPara" autocomplete="off" placeholder="Setor ou pessoa (opcional)" /></label>
        </div>

        <p class="dica" data-el="msg"></p>
        <div class="botoes">
          <button class="prim" data-el="principal">Adicionar</button>
          <button data-el="secundario">Agora não</button>
        </div>
      </div>
    </div>`;

  function preencher(select, itens, vazio) {
    select.textContent = "";
    if (vazio !== undefined) select.append(new Option(vazio, ""));
    itens.forEach((it) => select.append(typeof it === "string" ? new Option(it, it) : new Option(it.label, it.id)));
  }

  function mostrarCartao(chamado, opcoes) {
    host = document.createElement("gamma-cartao");
    const raiz = host.attachShadow({ mode: "closed" });
    raiz.innerHTML = `<style>${CSS}</style>${HTML}`;
    const el = {};
    raiz.querySelectorAll("[data-el]").forEach((n) => (el[n.dataset.el] = n));

    // Texto vindo da página entra sempre como texto, nunca como HTML.
    el.numero.textContent = chamado.numero;
    if (chamado.cliente) {
      const cli = document.createElement("span");
      cli.textContent = ` · ${chamado.cliente}`;
      el.numero.after(cli);
    }

    preencher(el.tipo, opcoes.tipos, "Selecione...");
    preencher(el.categoriaDP, opcoes.categoriasDP);
    preencher(el.status, opcoes.statusList);
    el.tipo.value = chamado.tipo || "";
    el.status.value = chamado.status;

    let editando = false;
    let categoriaEscolhida = chamado.categoria || "";

    const tipoId = () => el.tipo.value;
    const isDepartamento = () => tipoId() === "departamento";
    const isPortabilidade = () => isDepartamento() && el.categoriaDP.value === "Portabilidade";
    const isSuspensao = () => isDepartamento() && el.categoriaDP.value === "Suspensão";
    // Mesma regra do popup: fora de Departamento a categoria é obrigatória;
    // em Departamento só na Suspensão (Bloqueio/Desbloqueio).
    const categoriaObrigatoria = () => !isDepartamento() || isSuspensao();

    function aplicarRegras() {
      const port = isPortabilidade();
      el.wrapDP.classList.toggle("hidden", !isDepartamento());
      el.wrapVinculado.classList.toggle("hidden", tipoId() !== "vinculado");
      el.wrapCategoria.classList.toggle("hidden", port);
      el.wrapStatus.classList.toggle("hidden", port);

      if (isSuspensao()) preencher(el.categoria, opcoes.categoriasSuspensao, "Selecione...");
      else if (isDepartamento()) preencher(el.categoria, opcoes.categorias, "Nenhuma");
      else preencher(el.categoria, opcoes.categorias, "Selecione...");
      // Mantém a categoria escolhida se ela existir na lista nova.
      el.categoria.value = [...el.categoria.options].some((o) => o.value === categoriaEscolhida) ? categoriaEscolhida : "";

      const status = el.status.value;
      const comData = !port && opcoes.statusComData.includes(status);
      el.wrapData.classList.toggle("hidden", !comData);
      el.dataRotulo.textContent = status === "OS" ? "Data do agendamento" : "Data do novo contato";
      el.wrapEncaminhado.classList.toggle("hidden", port || status !== "Encaminhado");

      el.principal.textContent = port ? "Abrir no popup" : editando ? "Salvar e adicionar" : "Adicionar";
      atualizarResumo();
    }

    function atualizarResumo() {
      const tipo = opcoes.tipos.find((t) => t.id === tipoId());
      const vazio = (dd, texto) => {
        dd.textContent = texto;
        dd.classList.add("vazio");
      };
      el.rTipo.classList.remove("vazio");
      el.rCat.classList.remove("vazio");
      if (tipo) el.rTipo.textContent = isDepartamento() ? `${tipo.label} · ${el.categoriaDP.value}` : tipo.label;
      else vazio(el.rTipo, "escolha no lápis");
      if (el.categoria.value) el.rCat.textContent = el.categoria.value;
      else if (chamado.categoriaHelpdesk && !categoriaEscolhida) vazio(el.rCat, `"${chamado.categoriaHelpdesk}" não está no Gamma`);
      else vazio(el.rCat, categoriaObrigatoria() ? "escolha no lápis" : "nenhuma");
      el.rStatus.textContent = el.status.value;
    }

    function mensagem(texto, erro = false) {
      el.msg.textContent = texto;
      el.msg.classList.toggle("erro", erro);
    }

    function alternarEdicao(abrir) {
      editando = abrir;
      el.resumo.classList.toggle("hidden", abrir);
      el.edicao.classList.toggle("hidden", !abrir);
      el.lapis.classList.toggle("on", abrir);
      el.titulo.textContent = abrir ? "Editar antes de adicionar" : "Fora do seu backlog";
      el.secundario.textContent = abrir ? "Voltar" : "Agora não";
      mensagem("");
      aplicarRegras();
    }

    function faltando() {
      if (!tipoId()) return "Escolha o tipo.";
      if (!isPortabilidade() && categoriaObrigatoria() && !el.categoria.value) return "Escolha a categoria.";
      return "";
    }

    async function adicionar() {
      if (isPortabilidade()) {
        const r = await pedir("abrirPopup");
        if (!r || r.erro) mensagem('Portabilidade tem etapas: clique no ícone do Gamma e use "Puxar do chamado aberto".');
        return;
      }
      const falta = faltando();
      if (falta) {
        // Sem dado suficiente o chamado não entra: abre a edição para completar.
        if (!editando) alternarEdicao(true);
        mensagem(falta, true);
        return;
      }
      const status = el.status.value;
      const novo = {
        numero: chamado.numero,
        tipo: tipoId(),
        categoriaDP: isDepartamento() ? el.categoriaDP.value : "",
        categoria: el.categoria.value,
        canal: "",
        vinculadoNumero: tipoId() === "vinculado" ? el.vinculado.value.trim() : "",
        status
      };
      if (chamado.cliente) novo.cliente = chamado.cliente;
      if (opcoes.statusComData.includes(status)) novo.dataPrevista = el.dataPrevista.value;
      if (status === "Encaminhado") novo.encaminhadoPara = el.encaminhadoPara.value.trim();

      adicionando = true;
      el.principal.disabled = true;
      const r = await pedir("adicionar", { chamado: novo });
      if (!r || r.erro) {
        adicionando = false;
        el.principal.disabled = false;
        mensagem((r && r.erro) || "Não consegui salvar. Recarregue a página e tente de novo.", true);
        return;
      }
      el.corpo.textContent = "";
      const ok = document.createElement("p");
      ok.className = "ok";
      ok.textContent = `${r.numero} adicionado ao backlog.`;
      el.corpo.append(ok);
      el.lapis.classList.add("hidden");
      setTimeout(() => {
        adicionando = false;
        removerCartao();
      }, 2500);
    }

    async function agoraNao() {
      removerCartao();
      await pedir("ignorar", { numero: chamado.numero });
    }

    el.tipo.addEventListener("change", aplicarRegras);
    el.categoriaDP.addEventListener("change", aplicarRegras);
    el.status.addEventListener("change", aplicarRegras);
    el.categoria.addEventListener("change", () => {
      categoriaEscolhida = el.categoria.value;
      atualizarResumo();
    });
    el.vinculado.addEventListener("input", () => (el.vinculado.value = el.vinculado.value.replace(/\D/g, "")));
    el.lapis.addEventListener("click", () => alternarEdicao(!editando));
    el.fechar.addEventListener("click", agoraNao);
    el.principal.addEventListener("click", adicionar);
    el.secundario.addEventListener("click", () => (editando ? alternarEdicao(false) : agoraNao()));

    aplicarRegras();
    document.documentElement.append(host);
  }

  // ---------- vigia a tela ----------
  // A janela rápida da lista abre o chamado sem trocar o endereço, então o jeito de
  // perceber é olhar a página mudar.
  let espera = null;
  const observador = new MutationObserver(() => {
    clearTimeout(espera);
    espera = setTimeout(() => verificar(), 400);
  });
  observador.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"]
  });

  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area !== "local" || desligado) return;
    // Ligou ou desligou nas Configurações.
    if (mudancas.cartaoHelpdeskAtivo) {
      if (mudancas.cartaoHelpdeskAtivo.newValue === false) removerCartao();
      else verificar(true);
    }
    // Chamado cadastrado por outro caminho (popup, HUB): o cartão sai. Se a mudança
    // foi em outro chamado, o cartão fica como está (sem perder o que foi editado).
    if (mudancas.chamados && host && !adicionando) conferirSeAindaVale();
  });

  async function conferirSeAindaVale() {
    const numero = numeroAtual;
    const resp = await pedir("verificar", { numero });
    if (numero === numeroAtual && host && !adicionando && (!resp || !resp.mostrar)) removerCartao();
  }

  verificar();
})();
