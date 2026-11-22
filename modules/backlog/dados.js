// dados.js
// Camada de dados do módulo Backlog: regras dos chamados e acesso ao storage.
// A UI do módulo nunca fala com o chrome.storage diretamente, só com estas funções.

import { ler, gravar } from "../../core/storage.js";
import { todayKey, parseDataLocal } from "../../core/datas.js";

// Sub-tipos de Departamento sem campo de categoria própria - a informação já
// está completa só com o sub-tipo (ex: "12683256 - Reincidência - OS.").
export const SUBTIPOS_DP_SEM_CATEGORIA = ["Reincidência", "Portabilidade"];

export const DEFAULTS = {
  chamados: [],
  categorias: [
    "Acerto de Cadastro",
    "Acesso Lento",
    "Acesso Parado",
    "AcolhTec OS Mercantil",
    "Avaliação Técnica",
    "Análise de Viabilidade",
    "CFS - Batimento CDA",
    "CFS - Extravio",
    "Configuração Especial",
    "E-mail e Hospedagem",
    "Falha em Aplicativos e/ou Serviços",
    "Falha em Jogos Online",
    "Falha em Sites Específicos",
    "Informações",
    "informação de OS",
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

// Status que encerram o chamado. "OS Finalizada" e "Encaminhado" têm o mesmo peso de "Finalizado".
export const STATUS_FINALIZADOS = ["Finalizado", "OS Finalizada", "Encaminhado"];

// Só pelo nome do status. Para saber se um chamado está encerrado, use chamadoFinalizado(c),
// que também considera o Inativo vencido.
export function isFinalizado(status) {
  return STATUS_FINALIZADOS.includes(status);
}

// ---------- Inativo ----------
// Inativo = cliente do WhatsApp que não respondeu. O chamado continua aberto no dia
// em que ficou Inativo e passa a contar como finalizado a partir do dia seguinte.
// O status continua "Inativo" (é assim que sai no relatório).
function diaQueFicouInativo(c) {
  const entrada = [...(c.historico || [])].reverse().find((h) => h.status === "Inativo");
  return todayKey(new Date(entrada ? entrada.em : c.updatedAt));
}

function diaSeguinte(diaKey) {
  const d = parseDataLocal(diaKey);
  d.setDate(d.getDate() + 1);
  return todayKey(d);
}

// Dia em que o Inativo passa a contar como finalizado ("" se o chamado não está Inativo).
export function diaFinalizacaoInativo(c) {
  return c.status === "Inativo" ? diaSeguinte(diaQueFicouInativo(c)) : "";
}

export function finalizadoPorInatividade(c) {
  return c.status === "Inativo" && diaFinalizacaoInativo(c) <= todayKey();
}

export function chamadoFinalizado(c) {
  return isFinalizado(c.status) || finalizadoPorInatividade(c);
}

export const TIPOS = [
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

export function etapasPortabilidade(subtipo) {
  return subtipo === "Interna" ? ETAPAS_PORTABILIDADE_INTERNA : ETAPAS_PORTABILIDADE_EXTERNA;
}

export function statusDerivadoPortabilidade(etapa) {
  return ETAPAS_PORTABILIDADE_FINAIS.includes(etapa) ? "Finalizado" : "Aberto";
}

export function isPortabilidade(c) {
  return c.tipo === "departamento" && c.categoriaDP === "Portabilidade";
}

// ---------- datas marcadas (OS / Atualizado / Janela) ----------
// Status que aceitam uma data: OS = agendamento, Atualizado = novo contato com o cliente.
export const STATUS_COM_DATA = ["OS", "Atualizado"];

// ---------- número do chamado ----------
// O número é guardado só com dígitos: "13.005.640" e "13005640" são o mesmo chamado.
export function normalizarNumero(numero) {
  return String(numero || "").replace(/\D/g, "");
}

// Ids de tipo antigos que foram renomeados. Chamados salvos (ou backups importados)
// com o id antigo são convertidos na primeira leitura.
const TIPOS_RENOMEADOS = { reincidencia: "departamento" };

export async function getData() {
  const data = await ler(DEFAULTS);
  let migrou = false;
  // Lista de status salva (ex: vinda de um backup antigo) pode não ter os status
  // novos: cada um que faltar entra logo depois do status que o precede no padrão.
  DEFAULTS.statusList.forEach((s, i) => {
    if (data.statusList.includes(s)) return;
    const anterior = data.statusList.indexOf(DEFAULTS.statusList[i - 1]);
    data.statusList.splice(anterior + 1, 0, s);
    migrou = true;
  });
  // Mesma regra para categorias: lista salva antes de uma categoria nova existir.
  if (Array.isArray(data.categorias)) {
    DEFAULTS.categorias.forEach((cat, i) => {
      if (data.categorias.includes(cat)) return;
      const anterior = data.categorias.indexOf(DEFAULTS.categorias[i - 1]);
      data.categorias.splice(anterior + 1, 0, cat);
      migrou = true;
    });
  }
  data.chamados.forEach((c) => {
    if (TIPOS_RENOMEADOS[c.tipo]) {
      c.tipo = TIPOS_RENOMEADOS[c.tipo];
      migrou = true;
    }
    // Números salvos com pontos (digitados à mão antes da padronização) passam a ter só
    // dígitos - a não ser que já exista outro chamado com o mesmo número sem pontos.
    const soDigitos = normalizarNumero(c.numero);
    if (soDigitos && soDigitos !== c.numero && !data.chamados.some((o) => o.numero === soDigitos)) {
      c.numero = soDigitos;
      migrou = true;
    }
    if (c.vinculadoNumero && normalizarNumero(c.vinculadoNumero) !== c.vinculadoNumero) {
      c.vinculadoNumero = normalizarNumero(c.vinculadoNumero);
      migrou = true;
    }
  });
  if (migrou) await gravar({ chamados: data.chamados, statusList: data.statusList, categorias: data.categorias });
  return data;
}

export async function addChamado(dadosChamado) {
  const chamado = { ...dadosChamado, numero: normalizarNumero(dadosChamado.numero) };
  if (chamado.vinculadoNumero) chamado.vinculadoNumero = normalizarNumero(chamado.vinculadoNumero);
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
  await gravar({ chamados: data.chamados });
  return novo;
}

function entradaHistorico(c, em) {
  const entrada = { status: c.status, em };
  if (c.etapaPortabilidade) entrada.etapa = c.etapaPortabilidade;
  return entrada;
}

// dataPrevista só fica salva enquanto o status for OS ou Atualizado;
// encaminhadoPara, enquanto o status for Encaminhado.
export async function updateChamadoStatus(numero, novoStatus, dataPrevista = "", encaminhadoPara = "") {
  return updateChamado(numero, {
    status: novoStatus,
    dataPrevista: STATUS_COM_DATA.includes(novoStatus) ? dataPrevista : "",
    encaminhadoPara: novoStatus === "Encaminhado" ? encaminhadoPara.trim() : ""
  });
}

export async function updateChamado(numero, updates) {
  if (updates.vinculadoNumero) updates = { ...updates, vinculadoNumero: normalizarNumero(updates.vinculadoNumero) };
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
  await gravar({ chamados: data.chamados });
  return data.chamados[idx];
}

// Só um chamado em OS pode ser finalizado por aqui.
export async function finalizarOS(numero) {
  const chamado = await findChamado(numero);
  if (!chamado) throw new Error("Chamado não encontrado.");
  if (chamado.status !== "OS") throw new Error("Só chamados com status OS podem ter a OS finalizada.");
  return updateChamadoStatus(numero, "OS Finalizada");
}

export async function salvarEtapaPortabilidade(numero, { subtipoPortabilidade, etapaPortabilidade, dataJanela }) {
  return updateChamado(numero, {
    subtipoPortabilidade,
    etapaPortabilidade,
    dataJanela,
    status: statusDerivadoPortabilidade(etapaPortabilidade)
  });
}

export async function deleteChamado(numero) {
  const data = await getData();
  const idx = data.chamados.findIndex((c) => c.numero === numero);
  if (idx === -1) throw new Error("Chamado não encontrado.");
  data.chamados.splice(idx, 1);
  await gravar({ chamados: data.chamados });
}

export async function findChamado(numero) {
  const data = await getData();
  const alvo = normalizarNumero(numero);
  return data.chamados.find((c) => c.numero === alvo) || null;
}

export async function getChamadosDoDia(diaKey = todayKey()) {
  const data = await getData();
  return data.chamados.filter((c) => c.diaKey === diaKey);
}

// Dia (AAAA-MM-DD) em que o chamado foi finalizado; "" se ele não está finalizado.
// Usa a última entrada finalizada do histórico (o chamado pode ter sido reaberto antes).
export function diaFinalizacao(c) {
  if (c.status === "Inativo") return finalizadoPorInatividade(c) ? diaFinalizacaoInativo(c) : "";
  if (!isFinalizado(c.status)) return "";
  const entrada = [...(c.historico || [])].reverse().find((h) => isFinalizado(h.status));
  return todayKey(new Date(entrada ? entrada.em : c.updatedAt));
}

// Chamados que entram no relatório de um dia: os cadastrados nesse dia
// e os finalizados nesse dia, mesmo que tenham sido abertos antes.
export function entraNoRelatorio(c, diaKey) {
  return c.diaKey === diaKey || diaFinalizacao(c) === diaKey;
}

export async function getChamadosDoRelatorio(diaKey = todayKey()) {
  const data = await getData();
  return data.chamados.filter((c) => entraNoRelatorio(c, diaKey));
}

export async function saveTurno(diaKey, turno) {
  const data = await getData();
  data.turnos[diaKey] = turno;
  await gravar({ turnos: data.turnos });
}

export async function getTurno(diaKey) {
  const data = await getData();
  return data.turnos[diaKey] || { n2Inicio: "", n2Fim: "", ascInicio: "", ascFim: "" };
}

// Classe visual do status (ex: "Encaminhado" -> "st-encaminhado"), usada no popup e no HUB.
export function statusClass(status) {
  const slug = (status || "").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
  return `st-${slug}`;
}

// ---------- aviso de Inativos finalizados (HUB) ----------
// Os chamados já avisados ficam guardados fora do backup: é só um lembrete de tela.
// A chave inclui o dia, porque o mesmo chamado pode ficar Inativo de novo outro dia.
function chaveAvisoInativo(c) {
  return `${c.numero}|${diaFinalizacaoInativo(c)}`;
}

export async function getInativosParaAvisar() {
  const data = await getData();
  const { inativosAvisados } = await ler({ inativosAvisados: [] });
  return data.chamados.filter((c) => finalizadoPorInatividade(c) && !inativosAvisados.includes(chaveAvisoInativo(c)));
}

// Guarda só os que ainda estão Inativos, para a lista não crescer sem fim.
export async function marcarInativosAvisados() {
  const data = await getData();
  await gravar({ inativosAvisados: data.chamados.filter(finalizadoPorInatividade).map(chaveAvisoInativo) });
}

// ---------- cartão do HelpDesk ----------
// Preferências do cartão que aparece na tela do HelpDesk. Ficam fora do backup:
// são ajustes desta máquina, não dados de chamados.
const LIMITE_IGNORADOS = 300;

export async function cartaoHelpdeskAtivo() {
  const { cartaoHelpdeskAtivo } = await ler({ cartaoHelpdeskAtivo: true });
  return cartaoHelpdeskAtivo !== false;
}

export async function definirCartaoHelpdeskAtivo(ativo) {
  await gravar({ cartaoHelpdeskAtivo: !!ativo });
}

// "Agora não" num chamado: o cartão não aparece mais para ele.
export async function ignorarNoCartao(numero) {
  const { cartaoIgnorados } = await ler({ cartaoIgnorados: [] });
  const alvo = normalizarNumero(numero);
  const lista = [alvo, ...cartaoIgnorados.filter((n) => n !== alvo)].slice(0, LIMITE_IGNORADOS);
  await gravar({ cartaoIgnorados: lista });
}

export async function ignoradoNoCartao(numero) {
  const { cartaoIgnorados } = await ler({ cartaoIgnorados: [] });
  return cartaoIgnorados.includes(normalizarNumero(numero));
}
