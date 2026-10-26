// storage.js
// Camada única de acesso aos dados. Se um dia isso migrar pra um backend
// (Supabase, por ex.), só essas funções precisam mudar - o resto da UI não.

// Sub-tipos de Departamento sem campo de categoria própria - a informação já
// está completa só com o sub-tipo (ex: "12683256 - Reincidência - OS.").
const SUBTIPOS_DP_SEM_CATEGORIA = ["Reincidência", "Portabilidade"];

const DEFAULTS = {
  chamados: [],
  categorias: [
    "Acerto de Cadastro",
    "Acesso Lento",
    "Acesso Parado",
    "AcolhTec OS Mercantil",
    "CFS - Batimento CDA",
    "CFS - Extravio",
    "Configuração Especial",
    "E-mail e Hospedagem",
    "Falha em Aplicativos e/ou Serviços",
    "Falha em Jogos Online",
    "Falha em Sites Específicos",
    "Informações",
    "Migração de rede",
    "Pedido de Portabilidade",
    "Reincidência",
    "SmartCam",
    "Solicitação de Desconto / Crédito",
    "SVA",
    "Telefonia",
    "Telefonia móvel SMP",
    "TV Valenet",
    "WIFI - Rede sem Fio"
  ],
  // "Departamento" é o guarda-chuva. Cada item abaixo é um sub-tipo dentro dele.
  categoriasDP: [
    "Departamento",
    "CSAT/ANATEL",
    "Suspensão",
    "Portabilidade",
    "Reincidência",
    "Solicitação de contato"
  ],
  // Quando categoriaDP = "Suspensão", o campo Categoria fica restrito a estas duas opções.
  categoriasSuspensao: ["Bloqueio", "Desbloqueio"],
  statusList: [
    "Aberto",
    "Pendente",
    "Atualizado",
    "OS",
    "OS Finalizada",
    "Inativo",
    "Encaminhado",
    "Finalizado"
  ],
  turnos: {} // { "2026-08-07": { n2Inicio, n2Fim, ascInicio, ascFim } }
};

// Status que encerram o chamado. "OS Finalizada" tem o mesmo peso de "Finalizado".
const STATUS_FINALIZADOS = ["Finalizado", "OS Finalizada"];

function isFinalizado(status) {
  return STATUS_FINALIZADOS.includes(status);
}

const TIPOS = [
  { id: "backlog", label: "Backlog" },
  { id: "departamento", label: "Departamento" },
  { id: "n2", label: "Chamado N2" },
  { id: "acolhimento", label: "Chamado Acolhimento" },
  { id: "vinculado", label: "Vinculado / Adormecido" }
];

// ---------- Portabilidade ----------
// O status de uma Portabilidade nunca é escolhido à mão: vem da etapa.
// Etapa final -> "Finalizado"; qualquer outra -> "Aberto".
const ETAPAS_PORTABILIDADE_EXTERNA = [
  "NPAC aberto",
  "Enviado ao setor (B2B/Retenção)",
  "Rejeitado",
  "Aceito (BP aceito no NPAC)",
  "Aguardando Janela",
  "Concluído"
];
const ETAPAS_PORTABILIDADE_INTERNA = [
  "Assumido",
  "NPAC aberto",
  "Cancelado",
  "Aceito",
  "Aguardando Janela (TN trocado)",
  "Concluído"
];
const ETAPAS_PORTABILIDADE_FINAIS = ["Rejeitado", "Cancelado", "Concluído"];

function etapasPortabilidade(subtipo) {
  return subtipo === "Interna" ? ETAPAS_PORTABILIDADE_INTERNA : ETAPAS_PORTABILIDADE_EXTERNA;
}

function statusDerivadoPortabilidade(etapa) {
  return ETAPAS_PORTABILIDADE_FINAIS.includes(etapa) ? "Finalizado" : "Aberto";
}

function isPortabilidade(c) {
  return c.tipo === "departamento" && c.categoriaDP === "Portabilidade";
}

// ---------- datas marcadas (OS / Atualizado / Janela) ----------
// Status que aceitam uma data: OS = agendamento, Atualizado = novo contato com o cliente.
const STATUS_COM_DATA = ["OS", "Atualizado"];

// Datas são guardadas como "AAAA-MM-DD" (valor do <input type="date">).
function parseDataLocal(dataStr) {
  const [ano, mes, dia] = dataStr.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

function formatarDataCurta(dataStr) {
  const [, mes, dia] = dataStr.split("-");
  return `${dia}/${mes}`;
}

function formatarDataLonga(dataStr) {
  const [ano, mes, dia] = dataStr.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Dias até a data (negativo = já passou).
function diasAte(dataStr) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((parseDataLocal(dataStr) - hoje) / (1000 * 60 * 60 * 24));
}

function todayKey(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

// Ids de tipo antigos que foram renomeados. Chamados salvos (ou backups importados)
// com o id antigo são convertidos na primeira leitura.
const TIPOS_RENOMEADOS = { reincidencia: "departamento" };

function getData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULTS, (data) => {
      let migrou = false;
      // Lista de status salva (ex: vinda de um backup antigo) pode não ter os status
      // novos: cada um que faltar entra logo depois do status que o precede no padrão.
      DEFAULTS.statusList.forEach((s, i) => {
        if (data.statusList.includes(s)) return;
        const anterior = data.statusList.indexOf(DEFAULTS.statusList[i - 1]);
        data.statusList.splice(anterior + 1, 0, s);
        migrou = true;
      });
      data.chamados.forEach((c) => {
        if (TIPOS_RENOMEADOS[c.tipo]) {
          c.tipo = TIPOS_RENOMEADOS[c.tipo];
          migrou = true;
        }
      });
      if (migrou) {
        chrome.storage.local.set({ chamados: data.chamados, statusList: data.statusList }, () =>
          resolve(data)
        );
      } else {
        resolve(data);
      }
    });
  });
}

function setData(partial) {
  return new Promise((resolve) => {
    chrome.storage.local.set(partial, () => resolve());
  });
}

async function addChamado(chamado) {
  const data = await getData();
  const now = new Date().toISOString();
  const existing = data.chamados.find((c) => c.numero === chamado.numero);
  if (existing) {
    throw new Error("Já existe um chamado cadastrado com esse número.");
  }
  const novo = {
    ...chamado,
    diaKey: todayKey(),
    createdAt: now,
    updatedAt: now,
    historico: [entradaHistorico(chamado, now)]
  };
  data.chamados.unshift(novo);
  await setData({ chamados: data.chamados });
  return novo;
}

function entradaHistorico(c, em) {
  const entrada = { status: c.status, em };
  if (c.etapaPortabilidade) entrada.etapa = c.etapaPortabilidade;
  return entrada;
}

// dataPrevista só fica salva enquanto o status for OS ou Atualizado.
async function updateChamadoStatus(numero, novoStatus, dataPrevista = "") {
  return updateChamado(numero, {
    status: novoStatus,
    dataPrevista: STATUS_COM_DATA.includes(novoStatus) ? dataPrevista : ""
  });
}

async function updateChamado(numero, updates) {
  const data = await getData();
  const idx = data.chamados.findIndex((c) => c.numero === numero);
  if (idx === -1) throw new Error("Chamado não encontrado.");
  const now = new Date().toISOString();
  const atual = data.chamados[idx];
  const statusMudou = updates.status && updates.status !== atual.status;
  // Etapas intermediárias da Portabilidade mantêm o status "Aberto",
  // então a troca de etapa também precisa entrar no histórico.
  const etapaMudou =
    updates.etapaPortabilidade !== undefined &&
    updates.etapaPortabilidade !== atual.etapaPortabilidade;

  data.chamados[idx] = { ...atual, ...updates, updatedAt: now };
  if (statusMudou || etapaMudou) {
    data.chamados[idx].historico.push(entradaHistorico(data.chamados[idx], now));
  }
  await setData({ chamados: data.chamados });
  return data.chamados[idx];
}

// Só um chamado em OS pode ser finalizado por aqui.
async function finalizarOS(numero) {
  const chamado = await findChamado(numero);
  if (!chamado) throw new Error("Chamado não encontrado.");
  if (chamado.status !== "OS") throw new Error("Só chamados com status OS podem ter a OS finalizada.");
  return updateChamadoStatus(numero, "OS Finalizada");
}

async function salvarEtapaPortabilidade(numero, { subtipoPortabilidade, etapaPortabilidade, dataJanela }) {
  return updateChamado(numero, {
    subtipoPortabilidade,
    etapaPortabilidade,
    dataJanela,
    status: statusDerivadoPortabilidade(etapaPortabilidade)
  });
}

async function deleteChamado(numero) {
  const data = await getData();
  const idx = data.chamados.findIndex((c) => c.numero === numero);
  if (idx === -1) throw new Error("Chamado não encontrado.");
  data.chamados.splice(idx, 1);
  await setData({ chamados: data.chamados });
}

async function findChamado(numero) {
  const data = await getData();
  return data.chamados.find((c) => c.numero === numero) || null;
}

async function getChamadosDoDia(diaKey = todayKey()) {
  const data = await getData();
  return data.chamados.filter((c) => c.diaKey === diaKey);
}

// Dia (AAAA-MM-DD) em que o chamado foi finalizado; "" se ele não está finalizado.
// Usa a última entrada finalizada do histórico (o chamado pode ter sido reaberto antes).
function diaFinalizacao(c) {
  if (!isFinalizado(c.status)) return "";
  const entrada = [...(c.historico || [])].reverse().find((h) => isFinalizado(h.status));
  return todayKey(new Date(entrada ? entrada.em : c.updatedAt));
}

// Chamados que entram no relatório de um dia: os cadastrados nesse dia
// e os finalizados nesse dia, mesmo que tenham sido abertos antes.
function entraNoRelatorio(c, diaKey) {
  return c.diaKey === diaKey || diaFinalizacao(c) === diaKey;
}

async function getChamadosDoRelatorio(diaKey = todayKey()) {
  const data = await getData();
  return data.chamados.filter((c) => entraNoRelatorio(c, diaKey));
}

async function saveTurno(diaKey, turno) {
  const data = await getData();
  data.turnos[diaKey] = turno;
  await setData({ turnos: data.turnos });
}

async function getTurno(diaKey) {
  const data = await getData();
  return data.turnos[diaKey] || { n2Inicio: "", n2Fim: "", ascInicio: "", ascFim: "" };
}

async function exportBackup() {
  const data = await getData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const filename = `backup-backlog-${todayKey()}.json`;
  chrome.downloads.download({ url, filename, saveAs: true });
}

async function importBackup(jsonText) {
  const parsed = JSON.parse(jsonText);
  await setData(parsed);
}
