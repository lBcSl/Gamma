// popup.js
let CONFIG = null; // categorias, categoriasDP, statusList (cache local)

document.addEventListener("DOMContentLoaded", async () => {
  CONFIG = await getData();
  setupTabs();
  setupTodayLabel();
  populateSelects();
  setupPortabilidadeNovo();
  setupFormNovo();
  setupBusca();
  setupTurnoInputs();
  setupRelatorio();
  setupConfig();
  await renderDoDia();
});

// ---------- tabs ----------
function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      buttons.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      if (btn.dataset.tab === "dia") await renderDoDia();
    });
  });
}

function setupTodayLabel() {
  const d = new Date();
  document.getElementById("todayLabel").textContent = d.toLocaleDateString("pt-BR");
}

// ---------- selects ----------
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

function populateSelects() {
  fillSelect(document.getElementById("f-tipo"), TIPOS.map((t) => t.label), "Selecione...");
  fillSelect(document.getElementById("f-categoria"), CONFIG.categorias);
  fillSelect(document.getElementById("f-categoriaDP"), CONFIG.categoriasDP);
  // Chamado novo ainda não pode estar em OS (nem OS Finalizada): OS só depois que o chamado já foi aberto.
  fillSelect(
    document.getElementById("f-status"),
    CONFIG.statusList.filter((s) => s !== "OS" && s !== "OS Finalizada")
  );
  fillSelect(document.getElementById("s-novoStatus"), CONFIG.statusList);

  document.getElementById("f-tipo").addEventListener("change", (e) => {
    const tipoLabel = e.target.value;
    const tipoObj = TIPOS.find((t) => t.label === tipoLabel);
    const tipoId = tipoObj ? tipoObj.id : "";
    const isDepartamento = tipoId === "departamento";
    document.getElementById("wrap-categoriaDP").classList.toggle("hidden", !isDepartamento);
    document.getElementById("wrap-vinculado").classList.toggle("hidden", tipoId !== "vinculado");
    // Fora de "Departamento", categoria sempre é obrigatória, visível e usa a lista normal.
    if (!isDepartamento) {
      document.getElementById("wrap-categoria").classList.remove("hidden");
      fillSelect(document.getElementById("f-categoria"), CONFIG.categorias);
      document.getElementById("f-categoria").required = true;
    } else {
      aplicarRegraCategoriaDP();
    }
    aplicarUIPortabilidade();
  });

  document.getElementById("f-categoriaDP").addEventListener("change", () => {
    aplicarRegraCategoriaDP();
    aplicarUIPortabilidade();
  });
}

// ---------- Portabilidade e data marcada (aba Novo) ----------
let subPortNovo = "Externa";

function isPortabilidadeNovo() {
  return (
    tipoIdFromLabel(document.getElementById("f-tipo").value) === "departamento" &&
    document.getElementById("f-categoriaDP").value === "Portabilidade"
  );
}

// Na Portabilidade somem Categoria, Canal e Status: entram Externa/Interna, Etapa e Janela.
function aplicarUIPortabilidade() {
  const port = isPortabilidadeNovo();
  document.getElementById("wrap-portabilidade").classList.toggle("hidden", !port);
  document.getElementById("wrap-categoria").classList.toggle("hidden", port);
  document.getElementById("wrap-canalStatus").classList.toggle("hidden", port);
  document.getElementById("f-status").required = !port;
  if (port) {
    document.getElementById("f-categoria").required = false;
    preencherEtapasNovo();
  }
  aplicarUIDataPrevista();
}

function preencherEtapasNovo() {
  const select = document.getElementById("f-etapa");
  const atual = select.value;
  const etapas = etapasPortabilidade(subPortNovo);
  fillSelect(select, etapas);
  if (etapas.includes(atual)) select.value = atual;
  atualizarStatusAuto();
}

function atualizarStatusAuto() {
  const status = statusDerivadoPortabilidade(document.getElementById("f-etapa").value);
  const el = document.getElementById("f-statusAuto");
  el.textContent = status;
  el.className = `badge ${statusToBadgeClass(status)}`;
}

function labelDataPrevista(status) {
  return status === "OS" ? "Data do agendamento" : "Data do novo contato";
}

function aplicarUIDataPrevista() {
  const status = document.getElementById("f-status").value;
  const mostrar = !isPortabilidadeNovo() && STATUS_COM_DATA.includes(status);
  document.getElementById("wrap-dataPrevista").classList.toggle("hidden", !mostrar);
  document.getElementById("f-dataPrevistaLabel").textContent = labelDataPrevista(status);
}

function selecionarSubPortNovo(sub) {
  subPortNovo = sub;
  document
    .querySelectorAll("#wrap-portabilidade .seg-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.sub === sub));
}

function setupPortabilidadeNovo() {
  document.querySelectorAll("#wrap-portabilidade .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selecionarSubPortNovo(btn.dataset.sub);
      preencherEtapasNovo();
    });
  });
  document.getElementById("f-etapa").addEventListener("change", atualizarStatusAuto);
  document.getElementById("f-status").addEventListener("change", aplicarUIDataPrevista);
  aplicarUIDataPrevista();
}

// Quando o sub-tipo de Departamento é "Suspensão", a Categoria vira só Bloqueio/Desbloqueio.
// Nos demais sub-tipos (inclusive Reincidência e Portabilidade), a Categoria continua
// visível normalmente aqui no formulário - ela só some do TEXTO do relatório (report.js),
// pra não duplicar informação tipo "Reincidência - Reincidência".
function aplicarRegraCategoriaDP() {
  const subtipo = document.getElementById("f-categoriaDP").value;
  const categoriaSelect = document.getElementById("f-categoria");
  if (subtipo === "Suspensão") {
    fillSelect(categoriaSelect, CONFIG.categoriasSuspensao, "Selecione...");
    categoriaSelect.required = true;
  } else {
    fillSelect(categoriaSelect, CONFIG.categorias, "Nenhuma");
    categoriaSelect.required = false;
  }
}

function tipoIdFromLabel(label) {
  const t = TIPOS.find((t) => t.label === label);
  return t ? t.id : "";
}

// ---------- form novo ----------
function setupFormNovo() {
  const form = document.getElementById("formNovo");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const feedback = document.getElementById("feedbackNovo");
    feedback.textContent = "";
    feedback.className = "feedback";

    const port = isPortabilidadeNovo();
    const statusEscolhido = document.getElementById("f-status").value;
    const etapa = document.getElementById("f-etapa").value;
    const chamado = {
      numero: document.getElementById("f-numero").value.trim(),
      tipo: tipoIdFromLabel(document.getElementById("f-tipo").value),
      categoriaDP: document.getElementById("f-categoriaDP").value,
      categoria: port ? "" : document.getElementById("f-categoria").value,
      canal: port ? "" : document.getElementById("f-canal").value,
      vinculadoNumero: document.getElementById("f-vinculado").value.trim(),
      status: port ? statusDerivadoPortabilidade(etapa) : statusEscolhido
    };
    if (port) {
      chamado.subtipoPortabilidade = subPortNovo;
      chamado.etapaPortabilidade = etapa;
      chamado.dataJanela = document.getElementById("f-dataJanela").value;
    } else if (STATUS_COM_DATA.includes(statusEscolhido)) {
      chamado.dataPrevista = document.getElementById("f-dataPrevista").value;
    }

    const categoriaObrigatoria = document.getElementById("f-categoria").required;
    const faltaCategoria = categoriaObrigatoria && !chamado.categoria;

    if (!chamado.numero || !chamado.tipo || faltaCategoria || !chamado.status) {
      feedback.textContent = "Preencha número, tipo, categoria e status.";
      feedback.classList.add("err");
      return;
    }

    try {
      await addChamado(chamado);
      feedback.textContent = `Chamado ${chamado.numero} cadastrado.`;
      feedback.classList.add("ok");
      abrirChamadoSeNecessario(chamado);
      form.reset();
      document.getElementById("wrap-categoriaDP").classList.add("hidden");
      document.getElementById("wrap-vinculado").classList.add("hidden");
      selecionarSubPortNovo("Externa");
      aplicarUIPortabilidade();
      document.getElementById("f-numero").focus();
    } catch (err) {
      feedback.textContent = err.message;
      feedback.classList.add("err");
    }
  });
}

// Abre o chamado no helpdesk automaticamente quando é N2 ou Acolhimento com status "Aberto".
const HELPDESK_URL_BASE = "https://helpdesk.valenet.local:8443/Chamado";

function abrirChamadoSeNecessario(chamado) {
  const tiposQueAbrem = ["n2", "acolhimento"];
  if (tiposQueAbrem.includes(chamado.tipo) && chamado.status === "Aberto") {
    const url = `${HELPDESK_URL_BASE}/${chamado.numero}/View#/`;
    chrome.tabs.create({ url });
  }
}

// ---------- busca / atualizar ----------
function setupBusca() {
  const input = document.getElementById("s-numero");
  const box = document.getElementById("resultadoBusca");

  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const numero = input.value.trim();
    const feedback = document.getElementById("feedbackBusca");
    feedback.textContent = "";
    const chamado = await findChamado(numero);
    if (!chamado) {
      box.classList.add("hidden");
      feedback.textContent = "Nenhum chamado com esse número.";
      feedback.classList.add("err");
      return;
    }
    box.classList.remove("hidden");
    box.dataset.numero = chamado.numero;
    document.getElementById("rb-titulo").textContent = chamado.numero;

    // Portabilidade atualiza etapa (o status vem dela); os demais atualizam status.
    const port = isPortabilidade(chamado);
    document.getElementById("wrap-buscaStatus").classList.toggle("hidden", port);
    document.getElementById("wrap-buscaPortabilidade").classList.toggle("hidden", !port);

    if (port) {
      const sub = chamado.subtipoPortabilidade || "Externa";
      document.getElementById("rb-meta").textContent =
        `Portabilidade ${sub} · etapa: ${chamado.etapaPortabilidade || "-"} · ` +
        `janela: ${chamado.dataJanela ? formatarDataLonga(chamado.dataJanela) : "sem data"}`;
      fillSelect(document.getElementById("s-etapa"), etapasPortabilidade(sub));
      document.getElementById("s-etapa").value = chamado.etapaPortabilidade || "";
      document.getElementById("s-dataJanela").value = chamado.dataJanela || "";
    } else {
      mostrarStatusBusca(chamado);
    }
  });

  document.getElementById("s-novoStatus").addEventListener("change", aplicarUIDataBusca);

  // Finalizar OS também exige dois cliques, igual ao Excluir.
  const btnFinalizarOS = document.getElementById("btnFinalizarOS");
  let confirmandoOS = false;

  function resetConfirmacaoOS() {
    confirmandoOS = false;
    btnFinalizarOS.textContent = "Finalizar OS";
    btnFinalizarOS.classList.remove("confirming");
  }

  btnFinalizarOS.addEventListener("click", async () => {
    const numero = box.dataset.numero;
    const feedback = document.getElementById("feedbackBusca");

    if (!confirmandoOS) {
      confirmandoOS = true;
      btnFinalizarOS.textContent = "Confirmar finalização? Clique de novo";
      btnFinalizarOS.classList.add("confirming");
      return;
    }

    try {
      const chamado = await finalizarOS(numero);
      mostrarStatusBusca(chamado);
      feedback.textContent = `OS de ${numero} finalizada.`;
      feedback.className = "feedback ok";
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = "feedback err";
    } finally {
      resetConfirmacaoOS();
    }
  });

  input.addEventListener("input", resetConfirmacaoOS);

  document.getElementById("btnAtualizarStatus").addEventListener("click", async () => {
    const numero = box.dataset.numero;
    const novoStatus = document.getElementById("s-novoStatus").value;
    const dataPrevista = document.getElementById("s-dataPrevista").value;
    const feedback = document.getElementById("feedbackBusca");
    try {
      const chamado = await updateChamadoStatus(numero, novoStatus, dataPrevista);
      mostrarStatusBusca(chamado);
      feedback.textContent = `Status de ${numero} atualizado para "${novoStatus}".`;
      feedback.className = "feedback ok";
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = "feedback err";
    }
  });

  document.getElementById("btnAtualizarEtapa").addEventListener("click", async () => {
    const numero = box.dataset.numero;
    const etapa = document.getElementById("s-etapa").value;
    const feedback = document.getElementById("feedbackBusca");
    try {
      const chamado = await findChamado(numero);
      await salvarEtapaPortabilidade(numero, {
        subtipoPortabilidade: chamado.subtipoPortabilidade || "Externa",
        etapaPortabilidade: etapa,
        dataJanela: document.getElementById("s-dataJanela").value
      });
      feedback.textContent = `Etapa de ${numero} atualizada para "${etapa}".`;
      feedback.className = "feedback ok";
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = "feedback err";
    }
  });

  // Excluir exige dois cliques: o primeiro pede confirmação, o segundo executa.
  // Evita usar confirm() nativo, que costuma se comportar mal em popup de extensão.
  const btnExcluir = document.getElementById("btnExcluirChamado");
  let confirmando = false;

  function resetConfirmacaoExclusao() {
    confirmando = false;
    btnExcluir.textContent = "Excluir chamado";
    btnExcluir.classList.remove("confirming");
  }

  btnExcluir.addEventListener("click", async () => {
    const numero = box.dataset.numero;
    const feedback = document.getElementById("feedbackBusca");

    if (!confirmando) {
      confirmando = true;
      btnExcluir.textContent = "Confirmar exclusão? Clique de novo";
      btnExcluir.classList.add("confirming");
      return;
    }

    try {
      await deleteChamado(numero);
      feedback.textContent = `Chamado ${numero} excluído.`;
      feedback.className = "feedback ok";
      box.classList.add("hidden");
      input.value = "";
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = "feedback err";
    } finally {
      resetConfirmacaoExclusao();
    }
  });

  // Se o agente digitar outro número sem confirmar, cancela a exclusão pendente.
  input.addEventListener("input", resetConfirmacaoExclusao);
}

// Preenche o resultado da busca (chamado que não é Portabilidade).
// "Finalizar OS" só aparece enquanto o chamado está em OS.
function mostrarStatusBusca(chamado) {
  const data = chamado.dataPrevista ? ` (${formatarDataLonga(chamado.dataPrevista)})` : "";
  document.getElementById("rb-meta").textContent =
    `${chamado.categoria} · ${chamado.canal || "-"} · status atual: ${chamado.status}${data}`;
  document.getElementById("s-novoStatus").value = chamado.status;
  document.getElementById("s-dataPrevista").value = chamado.dataPrevista || "";
  document.getElementById("btnFinalizarOS").classList.toggle("hidden", chamado.status !== "OS");
  aplicarUIDataBusca();
}

function aplicarUIDataBusca() {
  const status = document.getElementById("s-novoStatus").value;
  document
    .getElementById("wrap-dataPrevistaBusca")
    .classList.toggle("hidden", !STATUS_COM_DATA.includes(status));
  document.getElementById("s-dataPrevistaLabel").textContent = labelDataPrevista(status);
}

// ---------- do dia ----------
// Classe visual do status (ex: "Encaminhado" -> "st-encaminhado"), igual ao dashboard.
function statusToBadgeClass(status) {
  const slug = (status || "").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
  return `st-${slug}`;
}

async function renderDoDia() {
  document.getElementById("btnAbrirDashboard").onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  };
  const chamados = await getChamadosDoDia();
  const counters = document.getElementById("counters");
  const total = chamados.length;
  const finalizados = chamados.filter((c) => isFinalizado(c.status)).length;
  const abertos = total - finalizados;
  counters.innerHTML = `
    <div class="counter"><div class="n">${total}</div><div class="l">Total hoje</div></div>
    <div class="counter"><div class="n">${abertos}</div><div class="l">Em aberto</div></div>
    <div class="counter"><div class="n">${finalizados}</div><div class="l">Finalizados</div></div>
  `;

  const lista = document.getElementById("listaDia");
  if (chamados.length === 0) {
    lista.innerHTML = `<div class="empty">Nenhum chamado cadastrado hoje ainda.</div>`;
    return;
  }
  lista.innerHTML = chamados
    .map(
      (c) => `
      <div class="item">
        <div>
          <div class="num">${c.numero}</div>
          <div class="cat">${[(TIPOS.find((t) => t.id === c.tipo) || {}).label, c.categoriaDP, c.categoria, c.etapaPortabilidade]
            .filter(Boolean)
            .join(" · ")}</div>
        </div>
        <span class="badge ${statusToBadgeClass(c.status)}">${c.status}</span>
      </div>`
    )
    .join("");
}

// ---------- turno ----------
async function setupTurnoInputs() {
  const dia = todayKey();
  const turno = await getTurno(dia);
  document.getElementById("t-n2i").value = turno.n2Inicio;
  document.getElementById("t-n2f").value = turno.n2Fim;
  document.getElementById("t-asci").value = turno.ascInicio;
  document.getElementById("t-ascf").value = turno.ascFim;

  ["t-n2i", "t-n2f", "t-asci", "t-ascf"].forEach((id) => {
    document.getElementById(id).addEventListener("change", async () => {
      await saveTurno(dia, {
        n2Inicio: document.getElementById("t-n2i").value,
        n2Fim: document.getElementById("t-n2f").value,
        ascInicio: document.getElementById("t-asci").value,
        ascFim: document.getElementById("t-ascf").value
      });
    });
  });
}

// ---------- relatório ----------
function setupRelatorio() {
  document.getElementById("btnGerar").addEventListener("click", async () => {
    const dia = todayKey();
    const chamados = await getChamadosDoRelatorio(dia);
    const turno = await getTurno(dia);
    const texto = gerarRelatorio(chamados, turno, dia);
    document.getElementById("relatorioTexto").value = texto;
    document.getElementById("btnCopiar").classList.remove("hidden");
    const feedback = document.getElementById("feedbackRelatorio");
    feedback.textContent = chamados.length === 0 ? "Nenhum chamado cadastrado ou finalizado hoje ainda." : "";
    feedback.className = "feedback";
  });

  document.getElementById("btnCopiar").addEventListener("click", async () => {
    const texto = document.getElementById("relatorioTexto").value;
    await navigator.clipboard.writeText(texto);
    const feedback = document.getElementById("feedbackRelatorio");
    feedback.textContent = "Copiado! Cole no Doc do relatório.";
    feedback.className = "feedback ok";
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
