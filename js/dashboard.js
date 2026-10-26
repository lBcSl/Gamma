// dashboard.js

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("todayLabel").textContent = new Date().toLocaleDateString("pt-BR");
  setupTabs();
  setupModal();
  setupViewToggle();
  await popularFiltros();
  setupFiltros();
  await renderBacklog();
  await renderAdormecidos();
  await renderHistorico();
});

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
    });
  });
}

function isAberto(status) {
  return !isFinalizado(status);
}

// Dias de calendário desde a data: aberto ontem às 18h já conta 1 dia hoje às 9h.
function diasParado(iso) {
  const dia = new Date(iso);
  dia.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((hoje - dia) / (1000 * 60 * 60 * 24));
}

function formatarData(iso) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatarDias(dias) {
  if (dias <= 0) return "Hoje";
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

// Classe visual do status (ex: "Encaminhado" -> "st-encaminhado").
function statusClass(status) {
  const slug = (status || "").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
  return `st-${slug}`;
}

// Por que o chamado precisa de atenção ("" = está em dia). Entra no bloco "Sem atualização":
// - aberto sem nenhuma mudança desde ontem (inclusive Portabilidade sem trocar de etapa);
// - OS/Atualizado sem data marcada desde ontem;
// - OS/Atualizado com a data marcada já vencida.
function motivoAtencao(c) {
  if (!isAberto(c.status)) return "";
  const parado = diasParado(c.updatedAt) >= 1;
  const desde = formatarDataCurta(todayKey(new Date(c.updatedAt)));
  if (!isPortabilidade(c) && STATUS_COM_DATA.includes(c.status)) {
    if (c.dataPrevista) {
      if (diasAte(c.dataPrevista) >= 0) return "";
      const quando = formatarDataCurta(c.dataPrevista);
      return c.status === "OS" ? `OS vencida em ${quando}` : `Novo contato vencido em ${quando}`;
    }
    return parado ? `${c.status} sem data desde ${desde}` : "";
  }
  return parado ? `Sem atualização desde ${desde}` : "";
}

// Coluna "Parado há": finalizado não conta dias, mostra quando foi finalizado.
function paradoHtml(c) {
  if (isFinalizado(c.status)) {
    return `<span class="finalizado-em">Finalizado ${formatarDataCurta(diaFinalizacao(c))}</span>`;
  }
  const texto = formatarDias(diasParado(c.updatedAt));
  return motivoAtencao(c) ? `<span class="badge alerta">${texto}</span>` : texto;
}

// Portabilidade e Reincidência não têm categoria própria: mostra o departamento.
function categoriaExibida(c) {
  if (c.categoria) return c.categoria;
  if (c.tipo === "departamento" && c.categoriaDP) return c.categoriaDP;
  return "-";
}

// Linha embaixo do status: etapa da Portabilidade ou data marcada de OS/Atualizado.
function detalheStatus(c) {
  // Portabilidade encerrada segue o formato padrão, sem etapa nem Janela.
  if (isPortabilidade(c)) {
    if (isFinalizado(c.status)) return "";
    const partes = [c.subtipoPortabilidade || "Externa", c.etapaPortabilidade || "sem etapa"];
    const janela = c.dataJanela ? ` ${formatarDataCurta(c.dataJanela)}` : "";
    return partes.join(" · ") + janela;
  }
  if (c.status === "OS Finalizada") return `Finalizada em ${formatarDataCurta(todayKey(new Date(c.updatedAt)))}`;
  if (!STATUS_COM_DATA.includes(c.status)) return "";
  if (!c.dataPrevista) return "Sem data";
  const rotulo = c.status === "OS" ? "Agendada" : "Data prevista: ";
  const vencida = diasAte(c.dataPrevista) < 0 ? " · vencida" : "";
  return `${rotulo} ${formatarDataCurta(c.dataPrevista)}${vencida}`;
}

// Etiqueta de quanto falta para a data: "Venceu há 2 dias", "Hoje", "Amanhã", "Em 5 dias".
function quandoHtml(dataStr) {
  if (!dataStr) return `<span class="quando sem">Sem data</span>`;
  const n = diasAte(dataStr);
  let texto;
  if (n < 0) texto = n === -1 ? "Venceu ontem" : `Venceu há ${-n} dias`;
  else if (n === 0) texto = "Hoje";
  else if (n === 1) texto = "Amanhã";
  else texto = `Em ${n} dias`;
  return `<span class="quando ${n < 0 ? "vencida" : "futura"}">${texto}</span>`;
}

function dataCellHtml(dataStr) {
  return `<div class="data-cell">${dataStr ? `<strong>${formatarDataLonga(dataStr)}</strong>` : ""}${quandoHtml(dataStr)}</div>`;
}

// Ordena por data (mais próxima/vencida primeiro); sem data vai para o fim.
function compararPorData(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

const ICONE_EDITAR =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
const ICONE_FINALIZAR_OS =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';

// Botões da última coluna: "Finalizar OS" (só em OS) + Editar.
function acoesHtml(c) {
  const finalizar =
    c.status === "OS"
      ? `<button class="btn-icon" data-finalizar-os="${c.numero}" title="Finalizar OS" aria-label="Finalizar OS do chamado ${c.numero}">${ICONE_FINALIZAR_OS}</button>`
      : "";
  return `<div class="acoes">${finalizar}<button class="btn-icon" data-editar="${c.numero}" title="Editar" aria-label="Editar chamado ${c.numero}">${ICONE_EDITAR}</button></div>`;
}

// ---------- filtros ----------
async function popularFiltros() {
  const data = await getData();
  const tipoSelect = document.getElementById("filtroTipo");
  TIPOS.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    tipoSelect.appendChild(opt);
  });
  const statusSelect = document.getElementById("filtroStatus");
  data.statusList.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    statusSelect.appendChild(opt);
  });
}

function setupFiltros() {
  ["filtroTipo", "filtroStatus", "filtroCanal", "filtroBusca"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderBacklog);
  });
}

// ---------- toggle de visão: Somente hoje / Backlog geral ----------
let viewMode = "geral"; // "geral" | "hoje"

function setupViewToggle() {
  const botoes = document.querySelectorAll(".viewmode-btn");
  botoes.forEach((btn) => {
    btn.addEventListener("click", () => {
      botoes.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      viewMode = btn.dataset.viewmode;
      document.getElementById("wrapMostrarTodos").classList.toggle("hidden", viewMode !== "geral");
      renderBacklog();
    });
  });
  document.getElementById("mostrarTodos").addEventListener("change", renderBacklog);
}

// Um chamado finalizado "hoje" (última atualização de status foi hoje) sempre aparece;
// finalizado em outro dia só aparece no Backlog geral se "Mostrar todos" estiver marcado.
function foiFinalizadoHoje(c) {
  return todayKey(new Date(c.updatedAt)) === todayKey();
}

// ---------- backlog geral ----------
async function renderBacklog() {
  const data = await getData();
  const tipo = document.getElementById("filtroTipo").value;
  const status = document.getElementById("filtroStatus").value;
  const canal = document.getElementById("filtroCanal").value;
  const busca = document.getElementById("filtroBusca").value.trim().toLowerCase();
  const mostrarTodos = document.getElementById("mostrarTodos").checked;

  let abertos;
  if (viewMode === "hoje") {
    // Somente hoje: todos os chamados cadastrados hoje, em qualquer status.
    abertos = data.chamados.filter((c) => c.diaKey === todayKey());
  } else if (mostrarTodos || status) {
    // Backlog geral, mas o usuário pediu pra ver tudo (ou já escolheu um status específico).
    abertos = data.chamados;
  } else {
    // Backlog geral (padrão): esconde finalizados de dias anteriores.
    abertos = data.chamados.filter((c) => !(isFinalizado(c.status) && !foiFinalizadoHoje(c)));
  }

  if (tipo) abertos = abertos.filter((c) => c.tipo === tipo);
  if (status) abertos = abertos.filter((c) => c.status === status);
  if (canal) abertos = abertos.filter((c) => c.canal === canal);
  if (busca) {
    abertos = abertos.filter(
      (c) =>
        c.numero.toLowerCase().includes(busca) ||
        (c.categoria || "").toLowerCase().includes(busca) ||
        (c.categoriaDP || "").toLowerCase().includes(busca)
    );
  }

  abertos.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));

  const total = data.chamados.length;
  const totalAbertos = data.chamados.filter((c) => isAberto(c.status)).length;
  const totalFinalizados = total - totalAbertos;
  const totalSemAtualizacao = data.chamados.filter(motivoAtencao).length;

  document.getElementById("backlogCounters").innerHTML = `
    <div class="counter destaque"><div class="n">${totalAbertos}</div><div class="l">Em aberto (total)</div></div>
    <div class="counter"><div class="n">${totalFinalizados}</div><div class="l">Finalizados (total)</div></div>
    <div class="counter"><div class="n">${totalSemAtualizacao}</div><div class="l">Sem atualização</div></div>
    <div class="counter"><div class="n">${abertos.length}</div><div class="l">Resultado do filtro</div></div>
  `;

  const body = document.getElementById("backlogBody");
  const empty = document.getElementById("backlogEmpty");
  if (abertos.length === 0) {
    body.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  body.innerHTML = abertos
    .map((c) => {
      const tipoLabel = (TIPOS.find((t) => t.id === c.tipo) || {}).label || c.tipo;
      const detalhe = detalheStatus(c);
      return `
      <tr>
        <td class="num">${c.numero}</td>
        <td>${tipoLabel}</td>
        <td class="clicavel" data-filtro-categoria="${categoriaExibida(c) === "-" ? "" : categoriaExibida(c)}">${categoriaExibida(c)}</td>
        <td>${c.canal ? `<span class="badge canal">${c.canal}</span>` : "-"}</td>
        <td><div class="status-cell">
          <span class="badge ${statusClass(c.status)} clicavel" data-filtro-status="${c.status}">${c.status}</span>
          ${detalhe ? `<span class="status-detalhe">${detalhe}</span>` : ""}
        </div></td>
        <td>${formatarData(c.createdAt)}</td>
        <td class="dias">${paradoHtml(c)}</td>
        <td>${acoesHtml(c)}</td>
      </tr>`;
    })
    .join("");
  vincularBotoesEditar(body);
  vincularFiltrosClicaveis(body);
}

// ---------- adormecidos ----------
// Preenche um bloco da aba Adormecidos (tbody + mensagem de vazio).
function renderBloco(bodyId, emptyId, chamados, linhaHtml) {
  const body = document.getElementById(bodyId);
  const empty = document.getElementById(emptyId);
  empty.classList.toggle("hidden", chamados.length > 0);
  body.innerHTML = chamados.map(linhaHtml).join("");
  vincularBotoesEditar(body);
}

async function renderAdormecidos() {
  const data = await getData();
  const abertos = data.chamados.filter((c) => isAberto(c.status));
  const tipoLabel = (c) => (TIPOS.find((t) => t.id === c.tipo) || {}).label || c.tipo;

  // 1) OS e Atualizado, com ou sem data
  const agendados = abertos
    .filter((c) => !isPortabilidade(c) && STATUS_COM_DATA.includes(c.status))
    .sort((a, b) => compararPorData(a.dataPrevista, b.dataPrevista));
  // 2) Portabilidades em andamento
  const portabilidades = abertos
    .filter(isPortabilidade)
    .sort((a, b) => compararPorData(a.dataJanela, b.dataJanela));
  // 3) Precisam de atenção: sem mudança desde ontem, sem data ou com a data vencida
  // (pode repetir chamados dos blocos acima, de propósito: é a lista de cobrança)
  const semAtualizacao = abertos
    .filter(motivoAtencao)
    .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));

  const semData = agendados.filter((c) => !c.dataPrevista).length;
  document.getElementById("adormecidosCounters").innerHTML = `
    <div class="counter destaque"><div class="n">${semAtualizacao.length}</div><div class="l">Sem atualização</div></div>
    <div class="counter"><div class="n">${agendados.length}</div><div class="l">Agendados (OS / Atualizado)</div></div>
    <div class="counter"><div class="n">${semData}</div><div class="l">OS / Atualizado sem data</div></div>
    <div class="counter"><div class="n">${portabilidades.length}</div><div class="l">Portabilidades</div></div>
  `;

  renderBloco("semAtualizacaoBody", "semAtualizacaoEmpty", semAtualizacao, (c) => `
      <tr>
        <td class="num">${c.numero}</td>
        <td>${tipoLabel(c)}</td>
        <td>${categoriaExibida(c)}</td>
        <td><span class="badge ${statusClass(c.status)}">${c.status}</span></td>
        <td class="motivo">${motivoAtencao(c)}</td>
        <td class="dias">${paradoHtml(c)}</td>
        <td>${acoesHtml(c)}</td>
      </tr>`);

  renderBloco("agendadosBody", "agendadosEmpty", agendados, (c) => `
      <tr>
        <td class="num">${c.numero}</td>
        <td>${tipoLabel(c)}</td>
        <td>${c.categoria || "-"}</td>
        <td><span class="badge ${statusClass(c.status)}">${c.status}</span></td>
        <td>${dataCellHtml(c.dataPrevista)}</td>
        <td class="dias">${formatarDias(diasParado(c.updatedAt))}</td>
        <td>${acoesHtml(c)}</td>
      </tr>`);

  renderBloco("portabilidadesBody", "portabilidadesEmpty", portabilidades, (c) => `
      <tr>
        <td class="num">${c.numero}</td>
        <td><span class="badge canal">${c.subtipoPortabilidade || "Externa"}</span></td>
        <td>${c.etapaPortabilidade || "-"}</td>
        <td>${dataCellHtml(c.dataJanela)}</td>
        <td class="dias">${formatarDias(diasParado(c.updatedAt))}</td>
        <td>${acoesHtml(c)}</td>
      </tr>`);
}

// ---------- histórico ----------
async function renderHistorico() {
  const data = await getData();
  // Um dia aparece se teve chamado cadastrado ou finalizado nele.
  const dias = [
    ...new Set(data.chamados.flatMap((c) => [c.diaKey, diaFinalizacao(c)]).filter(Boolean))
  ]
    .sort()
    .reverse();

  const lista = document.getElementById("diasLista");
  if (dias.length === 0) {
    lista.innerHTML = `<p class="hint" style="padding:8px;">Nenhum dia registrado ainda.</p>`;
    return;
  }

  lista.innerHTML = dias
    .map((d) => {
      const qtd = data.chamados.filter((c) => entraNoRelatorio(c, d)).length;
      return `<button class="dia-item" data-dia="${d}">
        <span>${formatarDiaKey(d)}${d === todayKey() ? " · hoje" : ""}</span>
        <span class="qtd">${qtd} ${qtd === 1 ? "chamado" : "chamados"}</span>
      </button>`;
    })
    .join("");

  lista.querySelectorAll(".dia-item").forEach((btn) => {
    btn.addEventListener("click", async () => {
      lista.querySelectorAll(".dia-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      await mostrarRelatorioDoDia(btn.dataset.dia);
    });
  });
}

function formatarDiaKey(diaKey) {
  const [ano, mes, dia] = diaKey.split("-");
  return `${dia}/${mes}/${ano}`;
}

async function mostrarRelatorioDoDia(diaKey) {
  const chamados = await getChamadosDoRelatorio(diaKey);
  const turno = await getTurno(diaKey);
  const texto = gerarRelatorio(chamados, turno, diaKey);
  document.getElementById("relatorioHistorico").value = texto;
  document.getElementById("diaSelecionadoLabel").textContent = `Relatório de ${formatarDiaKey(diaKey)}`;
  const btnCopiar = document.getElementById("btnCopiarHistorico");
  btnCopiar.classList.remove("hidden");
  btnCopiar.onclick = async () => {
    await navigator.clipboard.writeText(texto);
    btnCopiar.textContent = "Copiado!";
    setTimeout(() => (btnCopiar.textContent = "Copiar texto"), 1500);
  };
}

// ---------- modal de edição ----------
function vincularBotoesEditar(container) {
  container.querySelectorAll("[data-editar]").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalEdicao(btn.dataset.editar));
  });
  // Finalizar OS exige dois cliques: o primeiro troca o ícone por "Confirmar?",
  // o segundo executa. Clicar em outro lugar (o botão perde o foco) cancela.
  container.querySelectorAll("[data-finalizar-os]").forEach((btn) => {
    let confirmando = false;
    const reset = () => {
      confirmando = false;
      btn.innerHTML = ICONE_FINALIZAR_OS;
      btn.classList.remove("confirming");
    };
    btn.addEventListener("blur", reset);
    btn.addEventListener("click", async () => {
      if (!confirmando) {
        confirmando = true;
        btn.textContent = "Confirmar?";
        btn.classList.add("confirming");
        return;
      }
      try {
        await finalizarOS(btn.dataset.finalizarOs);
        await renderBacklog();
        await renderAdormecidos();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function vincularFiltrosClicaveis(container) {
  container.querySelectorAll("[data-filtro-status]").forEach((el) => {
    el.addEventListener("click", () => {
      const select = document.getElementById("filtroStatus");
      const valor = el.dataset.filtroStatus;
      select.value = select.value === valor ? "" : valor;
      renderBacklog();
    });
  });
  container.querySelectorAll("[data-filtro-categoria]").forEach((el) => {
    el.addEventListener("click", () => {
      const input = document.getElementById("filtroBusca");
      const valor = el.dataset.filtroCategoria;
      input.value = input.value === valor ? "" : valor;
      renderBacklog();
    });
  });
}

function fillSelect(select, options, placeholder) {
  select.innerHTML = "";
  if (placeholder) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder;
    select.appendChild(opt);
  }
  options.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o;
    opt.textContent = o;
    select.appendChild(opt);
  });
}

function tipoIdParaLabel(id) {
  const t = TIPOS.find((t) => t.id === id);
  return t ? t.label : "";
}

async function abrirModalEdicao(numero) {
  const chamado = await findChamado(numero);
  if (!chamado) return;
  const config = await getData();

  document.getElementById("modalNumero").textContent = numero;
  fillSelect(document.getElementById("m-tipo"), TIPOS.map((t) => t.label));
  fillSelect(document.getElementById("m-categoriaDP"), config.categoriasDP);
  fillSelect(document.getElementById("m-status"), config.statusList);

  document.getElementById("m-tipo").value = tipoIdParaLabel(chamado.tipo);
  document.getElementById("m-categoriaDP").value = chamado.categoriaDP || "";
  document.getElementById("m-canal").value = chamado.canal || "";
  document.getElementById("m-vinculado").value = chamado.vinculadoNumero || "";
  document.getElementById("m-status").value = chamado.status;
  document.getElementById("m-dataPrevista").value = chamado.dataPrevista || "";
  document.getElementById("m-dataJanela").value = chamado.dataJanela || "";
  selecionarSubPortModal(chamado.subtipoPortabilidade || "Externa");
  preencherEtapasModal(chamado.etapaPortabilidade);

  aplicarRegraCategoriaModal(chamado.categoriaDP, config);
  document.getElementById("m-categoria").value = chamado.categoria || "";
  aplicarUIModal();

  document.getElementById("modalFeedback").textContent = "";
  resetConfirmacaoExclusaoModal();
  document.getElementById("modalOverlay").dataset.numero = numero;
  document.getElementById("modalOverlay").classList.remove("hidden");
}

let subPortModal = "Externa";

function tipoIdModal() {
  return (TIPOS.find((t) => t.label === document.getElementById("m-tipo").value) || {}).id || "";
}

function isPortabilidadeModal() {
  return tipoIdModal() === "departamento" && document.getElementById("m-categoriaDP").value === "Portabilidade";
}

// Mostra/esconde os campos conforme Tipo, Departamento e Status.
// Na Portabilidade somem Categoria, Canal e Status: entram Externa/Interna, Etapa e Janela.
function aplicarUIModal() {
  const tipoId = tipoIdModal();
  const port = isPortabilidadeModal();
  document.getElementById("m-wrap-categoriaDP").classList.toggle("hidden", tipoId !== "departamento");
  document.getElementById("m-wrap-vinculado").classList.toggle("hidden", tipoId !== "vinculado");
  document.getElementById("m-wrap-portabilidade").classList.toggle("hidden", !port);
  document.getElementById("m-wrap-categoria").classList.toggle("hidden", port);
  document.getElementById("m-wrap-canalStatus").classList.toggle("hidden", port);
  document.getElementById("m-status").required = !port;
  aplicarUIDataModal();
}

function aplicarUIDataModal() {
  const status = document.getElementById("m-status").value;
  const mostrar = !isPortabilidadeModal() && STATUS_COM_DATA.includes(status);
  document.getElementById("m-wrap-dataPrevista").classList.toggle("hidden", !mostrar);
  document.getElementById("m-dataPrevistaLabel").textContent =
    status === "OS" ? "Data do agendamento" : "Data do novo contato";
}

function selecionarSubPortModal(sub) {
  subPortModal = sub;
  document
    .querySelectorAll("#m-wrap-portabilidade .seg-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.sub === sub));
}

function preencherEtapasModal(etapaDesejada) {
  const select = document.getElementById("m-etapa");
  const desejada = etapaDesejada || select.value;
  const etapas = etapasPortabilidade(subPortModal);
  fillSelect(select, etapas);
  if (etapas.includes(desejada)) select.value = desejada;
  atualizarStatusAutoModal();
}

function atualizarStatusAutoModal() {
  const status = statusDerivadoPortabilidade(document.getElementById("m-etapa").value);
  const el = document.getElementById("m-statusAuto");
  el.textContent = status;
  el.className = `badge ${statusClass(status)}`;
}

function aplicarRegraCategoriaModal(subtipo, config) {
  const categoriaSelect = document.getElementById("m-categoria");
  if (subtipo === "Suspensão") {
    fillSelect(categoriaSelect, config.categoriasSuspensao, "Selecione...");
  } else {
    fillSelect(categoriaSelect, config.categorias, "Nenhuma");
  }
}

function fecharModal() {
  document.getElementById("modalOverlay").classList.add("hidden");
}

// Excluir exige dois cliques, igual ao popup: o primeiro pede confirmação, o segundo executa.
let confirmandoExclusaoModal = false;

function resetConfirmacaoExclusaoModal() {
  confirmandoExclusaoModal = false;
  const btn = document.getElementById("m-btnExcluir");
  btn.textContent = "Excluir chamado";
  btn.classList.remove("confirming");
}

function setupModal() {
  document.getElementById("modalFechar").addEventListener("click", fecharModal);
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") fecharModal();
  });

  document.getElementById("m-tipo").addEventListener("change", async () => {
    aplicarUIModal();
    if (tipoIdModal() !== "departamento") {
      const config = await getData();
      fillSelect(document.getElementById("m-categoria"), config.categorias, "Nenhuma");
    }
  });

  document.getElementById("m-categoriaDP").addEventListener("change", async (e) => {
    const config = await getData();
    aplicarRegraCategoriaModal(e.target.value, config);
    aplicarUIModal();
  });

  document.getElementById("m-btnExcluir").addEventListener("click", async () => {
    const btn = document.getElementById("m-btnExcluir");
    if (!confirmandoExclusaoModal) {
      confirmandoExclusaoModal = true;
      btn.textContent = "Confirmar exclusão? Clique de novo";
      btn.classList.add("confirming");
      return;
    }
    const numero = document.getElementById("modalOverlay").dataset.numero;
    try {
      await deleteChamado(numero);
      fecharModal();
      await renderBacklog();
      await renderAdormecidos();
      await renderHistorico();
    } catch (err) {
      document.getElementById("modalFeedback").textContent = err.message;
    } finally {
      resetConfirmacaoExclusaoModal();
    }
  });

  document.getElementById("m-status").addEventListener("change", aplicarUIDataModal);
  document.getElementById("m-etapa").addEventListener("change", atualizarStatusAutoModal);
  document.querySelectorAll("#m-wrap-portabilidade .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selecionarSubPortModal(btn.dataset.sub);
      preencherEtapasModal();
    });
  });

  document.getElementById("formEditar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const numero = document.getElementById("modalOverlay").dataset.numero;
    const port = isPortabilidadeModal();
    const statusEscolhido = document.getElementById("m-status").value;
    const etapa = document.getElementById("m-etapa").value;
    const updates = {
      tipo: tipoIdModal(),
      categoriaDP: document.getElementById("m-categoriaDP").value,
      categoria: port ? "" : document.getElementById("m-categoria").value,
      canal: port ? "" : document.getElementById("m-canal").value,
      vinculadoNumero: document.getElementById("m-vinculado").value.trim(),
      status: port ? statusDerivadoPortabilidade(etapa) : statusEscolhido,
      dataPrevista:
        !port && STATUS_COM_DATA.includes(statusEscolhido)
          ? document.getElementById("m-dataPrevista").value
          : ""
    };
    if (port) {
      updates.subtipoPortabilidade = subPortModal;
      updates.etapaPortabilidade = etapa;
      updates.dataJanela = document.getElementById("m-dataJanela").value;
    }
    try {
      await updateChamado(numero, updates);
      fecharModal();
      await renderBacklog();
      await renderAdormecidos();
    } catch (err) {
      document.getElementById("modalFeedback").textContent = err.message;
    }
  });
}
