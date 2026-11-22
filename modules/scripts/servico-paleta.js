// servico-paleta.js
// Lado da extensão da paleta de scripts (paleta.js roda dentro dos sites).
// A paleta só desenha e insere: a lista de scripts, o contexto ({agente}, {numero}...)
// e o texto final saem daqui, com as mesmas regras do HUB (dados.js e variaveis.js).

import { listarScripts, listarPastas, scriptPorId } from "./dados.js";
import { perguntasDoScript, renderizar } from "./variaveis.js";
import { nomeDoAgente } from "../../core/perfil.js";
import { lerChamadoDaAba } from "../backlog/helpdesk.js";

const PALETA_JS = "modules/scripts/paleta.js";

// ---------- atalho de teclado ----------
// O atalho (padrão Ctrl+Shift+Espaço) muda em chrome://extensions/shortcuts.
chrome.commands.onCommand.addListener(async (comando, aba) => {
  if (comando !== "abrir-paleta" || !aba || aba.id === undefined) return;
  try {
    await chrome.tabs.sendMessage(aba.id, { tipo: "gamma:paleta:abrir" });
  } catch (err) {
    // Aba aberta antes de instalar/recarregar a extensão: a paleta ainda não está lá.
    // O atalho dá acesso temporário à aba (activeTab), então dá para injetar agora.
    try {
      await chrome.scripting.executeScript({ target: { tabId: aba.id, allFrames: true }, files: [PALETA_JS] });
      await chrome.tabs.sendMessage(aba.id, { tipo: "gamma:paleta:abrir" });
    } catch (e) {
      // Página onde extensões não entram (chrome://, Web Store...). Nada a fazer.
    }
  }
});

// ---------- mensagens da paleta ----------
function ctxParaEnvio(ctx) {
  return { ...ctx, agora: ctx.agora.toISOString() };
}
function ctxRecebido(ctx) {
  const c = { ...(ctx || {}) };
  c.agora = c.agora ? new Date(c.agora) : new Date();
  return c;
}

const ACOES = {
  async listar() {
    const [scripts, pastas] = await Promise.all([listarScripts(), listarPastas()]);
    return {
      scripts: scripts.map(({ id, atalho, titulo, pastaId, texto }) => ({ id, atalho, titulo, pastaId, texto })),
      pastas
    };
  },

  // Monta o contexto e devolve o que precisa ser perguntado.
  async preparar({ id }, sender) {
    const script = await scriptPorId(id);
    if (!script) return { erro: "Script não encontrado." };
    const ctx = { agente: await nomeDoAgente(), agora: new Date() };
    // {numero}/{cliente}: só lê o HelpDesk se o script usa e a aba é do HelpDesk.
    if (/\{(numero|cliente)\}/.test(script.texto) && sender.tab) {
      const r = await lerChamadoDaAba(sender.tab);
      if (r.dados) Object.assign(ctx, { numero: r.dados.numero, cliente: r.dados.cliente });
    }
    return { perguntas: perguntasDoScript(script.texto, ctx), ctx: ctxParaEnvio(ctx) };
  },

  async renderizar({ id, ctx, respostas }) {
    const script = await scriptPorId(id);
    if (!script) return { erro: "Script não encontrado." };
    return renderizar(script.texto, ctxRecebido(ctx), respostas || {});
  }
};

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  const acao = msg && typeof msg.tipo === "string" && msg.tipo.startsWith("gamma:scripts:")
    ? ACOES[msg.tipo.slice("gamma:scripts:".length)]
    : null;
  // Só aceita mensagens dos scripts da própria extensão, nunca da página.
  if (!acao || sender.id !== chrome.runtime.id) return false;
  acao(msg, sender)
    .then(responder)
    .catch((err) => responder({ erro: err.message }));
  return true;
});
