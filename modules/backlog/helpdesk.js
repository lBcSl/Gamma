// helpdesk.js
// Adaptador do HelpDesk: lê os dados de um chamado direto da tela aberta.
// Só leitura - nada na página é alterado. Do cliente só sai o nome; CPF, endereço,
// telefone, situação de crédito, contrato e campos de sessão nunca são lidos.
//
// Se o HelpDesk mudar o layout, os ajustes ficam em SELETORES.

export const HELPDESK_URL_BASE = "https://helpdesk.valenet.local:8443/Chamado";

// Tela de um chamado: .../Chamado/13002258/View (com ou sem a porta :8443)
const URL_CHAMADO = /^https?:\/\/helpdesk\.valenet\.local(:\d+)?\/Chamado\/\d+\//i;

const SELETORES = {
  departamento: "#departamentoid",
  categoria: "#codcat",
  diagnostico: "#DIAGNOSTICOID_SAVECHAMADO",
  statusHelpdesk: "#col1 .widget-header .label",
  // link do cliente: "1021711 - NOME DO CLIENTE"
  cliente: "#col1 a.viewcliente",
  // lista <dt>/<dd> de "Dados do Chamado"; os campos sem id são achados pelo texto do <dt>
  dadosChamado: "#col1 dl.dl-horizontal",
  dtSolicitacao: "Solicitação"
};

export function urlDeChamado(numero) {
  return `${HELPDESK_URL_BASE}/${numero}/View#/`;
}

export function isTelaDeChamado(url) {
  return URL_CHAMADO.test(url || "");
}

// Roda dentro da página do HelpDesk (chrome.scripting): precisa ser autocontida,
// sem usar nada de fora além dos `sel` recebidos.
function lerDaPagina(sel) {
  const texto = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const opcao = (id) => {
    const op = document.querySelector(`${id} option:checked`);
    return op && op.value ? texto(op) : "";
  };
  const dd = (rotulo) => {
    const dl = document.querySelector(sel.dadosChamado);
    if (!dl) return null;
    const dt = [...dl.querySelectorAll("dt")].find((d) => texto(d) === rotulo);
    return dt ? dt.nextElementSibling : null;
  };

  const numero = (location.pathname.match(/\/Chamado\/(\d+)/) || [])[1] || "";
  const solicitacao = texto(dd(sel.dtSolicitacao));
  // Só o nome do cliente, sem o código na frente.
  const cliente = texto(document.querySelector(sel.cliente)).replace(/^\d+\s*-\s*/, "");
  // OS citada na solicitação ("OS 2517260 INSTALAÇÃO ..."): só o número.
  const os = (solicitacao.match(/\bOS\s*(\d{5,})/i) || [])[1] || "";

  return {
    numero,
    departamento: opcao(sel.departamento),
    categoria: opcao(sel.categoria),
    diagnostico: opcao(sel.diagnostico),
    statusHelpdesk: texto(document.querySelector(sel.statusHelpdesk)),
    cliente,
    os
  };
}

// Lê o chamado da aba ativa. Retorna null se a aba não é a tela de um chamado.
export async function lerChamadoDaAbaAtiva() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!aba || !isTelaDeChamado(aba.url)) return null;
  const [resultado] = await chrome.scripting.executeScript({
    target: { tabId: aba.id },
    func: lerDaPagina,
    args: [SELETORES]
  });
  return resultado ? resultado.result : null;
}

// Suporte 2º Nível atende N2 e Acolhimento técnico no mesmo departamento.
// O técnico sempre passa uma OS, que vem na solicitação: com OS sugere Acolhimento.
// A sugestão é só um ponto de partida - quem confirma é o agente.
export function sugerirTipo(dados) {
  if (!/suporte 2/i.test(dados.departamento)) return "";
  return dados.os ? "acolhimento" : "n2";
}

// Compara categorias ignorando maiúsculas e acentos ("Telefonia Móvel SMP" = "Telefonia móvel SMP").
function normalizar(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

export function categoriaDoGamma(categoriaHelpdesk, categorias) {
  const alvo = normalizar(categoriaHelpdesk);
  return categorias.find((c) => normalizar(c) === alvo) || "";
}
