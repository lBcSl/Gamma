// helpdesk.js
// Adaptador do HelpDesk: lê os dados de um chamado direto da tela aberta.
// Só leitura - nada na página é alterado. Do cliente só sai o nome; CPF, endereço,
// telefone, situação de crédito, contrato e campos de sessão nunca são lidos.
//
// Se o HelpDesk mudar o layout, os ajustes ficam em SELETORES.

export const HELPDESK_URL_BASE = "https://helpdesk.valenet.local:8443/Chamado";

// Qualquer página do HelpDesk (com ou sem a porta :8443). Se ela mostra um chamado
// quem decide é a própria página: o chamado pode estar numa aba própria
// (.../Chamado/13002258/View) ou na janela rápida aberta por cima da lista,
// em que o endereço continua sendo o da lista.
const URL_HELPDESK = /^https?:\/\/helpdesk\.valenet\.local(:\d+)?\//i;

// Os campos são procurados dentro do bloco do chamado (`raiz`), achado pelo título.
const SELETORES = {
  titulo: ".widget-header h5", // "Dados do Chamado 13.002.258"
  textoTitulo: "Dados do Chamado",
  raiz: "#col1",
  departamento: "#departamentoid",
  categoria: "#codcat",
  diagnostico: "#DIAGNOSTICOID_SAVECHAMADO",
  statusHelpdesk: ".widget-header .label",
  // link do cliente: "1021711 - NOME DO CLIENTE"
  cliente: "a.viewcliente",
  // lista <dt>/<dd> de "Dados do Chamado"; os campos sem id são achados pelo texto do <dt>
  dadosChamado: "dl.dl-horizontal",
  dtSolicitacao: "Solicitação"
};

export function urlDeChamado(numero) {
  return `${HELPDESK_URL_BASE}/${numero}/View#/`;
}

// Roda dentro da página do HelpDesk (chrome.scripting), em cada frame: precisa ser
// autocontida, sem usar nada de fora além dos `sel` recebidos. Retorna null quando
// não há chamado na tela.
function lerDaPagina(sel) {
  const texto = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

  // Título do chamado. Se houver mais de um (ex: uma janela rápida antiga escondida),
  // vale o último visível.
  const titulos = [...document.querySelectorAll(sel.titulo)].filter((h) => texto(h).includes(sel.textoTitulo));
  const visiveis = titulos.filter((h) => h.getClientRects().length > 0);
  const titulo = (visiveis.length ? visiveis : titulos).pop();
  if (!titulo) return null;
  const raiz = titulo.closest(sel.raiz) || titulo.closest(".widget-box") || document;

  const opcao = (id) => {
    const op = raiz.querySelector(`${id} option:checked`);
    return op && op.value ? texto(op) : "";
  };
  const dd = (rotulo) => {
    const dl = raiz.querySelector(sel.dadosChamado);
    if (!dl) return null;
    const dt = [...dl.querySelectorAll("dt")].find((d) => texto(d) === rotulo);
    return dt ? dt.nextElementSibling : null;
  };

  // Número pelo título ("13.002.258" -> "13002258"); o endereço é só um reforço.
  const doTitulo = (texto(titulo).match(/(\d[\d.]*\d)\s*$/) || [])[1] || "";
  const numero = doTitulo.replace(/\D/g, "") || (location.pathname.match(/\/Chamado\/(\d+)/) || [])[1] || "";
  if (!numero) return null;

  const solicitacao = texto(dd(sel.dtSolicitacao));
  // Só o nome do cliente, sem o código na frente.
  const cliente = texto(raiz.querySelector(sel.cliente)).replace(/^\d+\s*-\s*/, "");
  // OS citada na solicitação ("OS 2517260 INSTALAÇÃO ..."): só o número.
  const os = (solicitacao.match(/\bOS\s*(\d{5,})/i) || [])[1] || "";

  return {
    numero,
    departamento: opcao(sel.departamento),
    categoria: opcao(sel.categoria),
    diagnostico: opcao(sel.diagnostico),
    statusHelpdesk: texto(raiz.querySelector(sel.statusHelpdesk)),
    cliente,
    os
  };
}

// Lê o chamado da aba ativa, procurando também dentro de frames.
// Retorna { dados } ou { erro } com o motivo da falha:
//   "aba"      a aba ativa não é do HelpDesk
//   "chamado"  é do HelpDesk, mas não há um chamado na tela
//   "leitura"  o navegador não deixou ler a página (detalhe em `mensagem`)
export async function lerChamadoDaAbaAtiva() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  return lerChamadoDaAba(aba);
}

// Mesma leitura para uma aba conhecida ({ id, url }), em todos os frames dela.
// Usado pela paleta de scripts: o chat e o chamado podem estar em frames diferentes.
export async function lerChamadoDaAba(aba) {
  if (!aba || !URL_HELPDESK.test(aba.url || "")) return { erro: "aba" };
  let resultados;
  try {
    resultados = await chrome.scripting.executeScript({
      target: { tabId: aba.id, allFrames: true },
      func: lerDaPagina,
      args: [SELETORES]
    });
  } catch (err) {
    return { erro: "leitura", mensagem: err.message };
  }
  const achado = (resultados || []).map((r) => r && r.result).find((d) => d && d.numero);
  return achado ? { dados: achado } : { erro: "chamado" };
}

// Lê o chamado de um frame específico (usado pelo cartão do HelpDesk, que já sabe
// em qual aba e frame o chamado apareceu). Retorna os dados ou null.
export async function lerChamadoDoFrame(tabId, frameId) {
  const [resultado] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId || 0] },
    func: lerDaPagina,
    args: [SELETORES]
  });
  return (resultado && resultado.result) || null;
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
