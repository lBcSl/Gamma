// servico-cartao.js
// Lado da extensão do cartão do HelpDesk (cartao-helpdesk.js roda na página).
// O cartão só pergunta e pede: quem lê o chamado e grava no backlog é este serviço,
// com as mesmas regras do popup (dados.js e helpdesk.js).

import {
  TIPOS,
  DEFAULTS,
  STATUS_COM_DATA,
  getData,
  addChamado,
  findChamado,
  cartaoHelpdeskAtivo,
  ignorarNoCartao,
  ignoradoNoCartao,
  normalizarNumero
} from "./dados.js";
import { lerChamadoDoFrame, sugerirTipo, categoriaDoGamma } from "./helpdesk.js";

const ACOES = {
  // O cartão viu um chamado na tela: responde se deve aparecer e com quais dados.
  async verificar({ numero }, sender) {
    if (!(await cartaoHelpdeskAtivo())) return { mostrar: false };
    if (await ignoradoNoCartao(numero)) return { mostrar: false };
    if (await findChamado(numero)) return { mostrar: false };

    const dados = await lerChamadoDoFrame(sender.tab.id, sender.frameId);
    if (!dados || dados.numero !== normalizarNumero(numero)) return { mostrar: false };

    const config = await getData();
    return {
      mostrar: true,
      chamado: {
        numero: dados.numero,
        cliente: dados.cliente,
        os: dados.os,
        tipo: sugerirTipo(dados),
        categoria: categoriaDoGamma(dados.categoria, config.categorias),
        categoriaHelpdesk: dados.categoria,
        status: "Aberto"
      },
      opcoes: {
        tipos: TIPOS,
        categorias: config.categorias,
        categoriasDP: config.categoriasDP,
        categoriasSuspensao: config.categoriasSuspensao || DEFAULTS.categoriasSuspensao,
        // Chamado novo não entra em OS (nem OS Finalizada), igual ao popup.
        statusList: config.statusList.filter((s) => s !== "OS" && s !== "OS Finalizada"),
        statusComData: STATUS_COM_DATA
      }
    };
  },

  async adicionar({ chamado }) {
    const tipoValido = TIPOS.some((t) => t.id === chamado.tipo);
    if (!normalizarNumero(chamado.numero) || !tipoValido || !chamado.status) {
      return { erro: "Escolha o tipo e o status." };
    }
    try {
      const novo = await addChamado(chamado);
      return { ok: true, numero: novo.numero };
    } catch (err) {
      return { erro: err.message };
    }
  },

  async ignorar({ numero }) {
    await ignorarNoCartao(numero);
    return { ok: true };
  },

  // Portabilidade tem etapas e fica no popup. Nem toda versão do Chrome deixa a
  // extensão abrir o popup sozinha; nesse caso o cartão explica o caminho.
  async abrirPopup() {
    try {
      await chrome.action.openPopup();
      return { ok: true };
    } catch (err) {
      return { erro: err.message };
    }
  }
};

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  const acao = msg && typeof msg.tipo === "string" && msg.tipo.startsWith("gamma:cartao:")
    ? ACOES[msg.tipo.slice("gamma:cartao:".length)]
    : null;
  // Só aceita mensagens dos scripts da própria extensão (o cartão), nunca da página.
  if (!acao || sender.id !== chrome.runtime.id) return false;
  acao(msg, sender)
    .then(responder)
    .catch((err) => responder({ erro: err.message }));
  return true; // resposta assíncrona
});
