// dados.js
// Camada de dados do módulo Scripts. Ninguém fora daqui fala com o storage dos scripts.
//
// Chaves no storage (todas entram no backup geral):
//   scriptsPastas         [{ id, nome }]                       pastas, na ordem de exibição
//   scriptsPessoais       [{ id, atalho, titulo, pastaId, texto, criadoEm, atualizadoEm }]
//   scriptsAjustesPadrao  { [idPadrao]: { atalho?, titulo?, pastaId?, texto?, oculto?, atualizadoEm } }
//
// A biblioteca que a pessoa vê = padrões (com os ajustes por cima) + pessoais.
// O atalho é guardado sem a barra: "bd" é digitado como "/bd".

import { ler, gravar } from "../../core/storage.js";
import { PASTAS_PADRAO, SCRIPTS_PADRAO } from "./padroes.js";

export const PREFIXO = "/";
const CAMPOS_EDITAVEIS = ["atalho", "titulo", "pastaId", "texto"];
const TAM_ATALHO = 24;
const TAM_TITULO = 80;
const TAM_TEXTO = 5000;
const TAM_PASTA = 40;

export const DEFAULTS = {
  scriptsPastas: PASTAS_PADRAO,
  scriptsPessoais: [],
  scriptsAjustesPadrao: {}
};

async function lerTudo() {
  const d = await ler(DEFAULTS);
  return {
    pastas: Array.isArray(d.scriptsPastas) ? d.scriptsPastas : PASTAS_PADRAO,
    pessoais: Array.isArray(d.scriptsPessoais) ? d.scriptsPessoais : [],
    ajustes: d.scriptsAjustesPadrao && typeof d.scriptsAjustesPadrao === "object" ? d.scriptsAjustesPadrao : {}
  };
}

function novoId(prefixo) {
  return `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---------- atalho ----------
// Letras (com acento), números, "-" e "_". Sem barra, sem espaço, minúsculo.
export function normalizarAtalho(s) {
  return String(s || "")
    .trim()
    .replace(/^\/+/, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .slice(0, TAM_ATALHO);
}

// ---------- leitura ----------
function aplicarAjuste(padrao, ajuste) {
  const s = { ...padrao, origem: "padrao", modificado: false, oculto: false };
  if (!ajuste) return s;
  CAMPOS_EDITAVEIS.forEach((c) => {
    if (ajuste[c] !== undefined) s[c] = ajuste[c];
  });
  s.modificado = CAMPOS_EDITAVEIS.some((c) => ajuste[c] !== undefined && ajuste[c] !== padrao[c]);
  s.oculto = !!ajuste.oculto;
  s.atualizadoEm = ajuste.atualizadoEm || null;
  return s;
}

// Lista a biblioteca. Por padrão, sem os padrões ocultos.
export async function listarScripts({ incluirOcultos = false } = {}) {
  const { pessoais, ajustes } = await lerTudo();
  const padroes = SCRIPTS_PADRAO.map((p) => aplicarAjuste(p, ajustes[p.id]));
  const meus = pessoais.map((s) => ({ ...s, origem: "pessoal", modificado: false, oculto: false }));
  return [...padroes, ...meus].filter((s) => incluirOcultos || !s.oculto);
}

export async function scriptPorId(id) {
  return (await listarScripts({ incluirOcultos: true })).find((s) => s.id === id) || null;
}

export async function scriptPorAtalho(atalho) {
  const a = normalizarAtalho(atalho);
  return (await listarScripts()).find((s) => s.atalho === a) || null;
}

export function originalDoPadrao(id) {
  return SCRIPTS_PADRAO.find((p) => p.id === id) || null;
}

export async function listarPastas() {
  return (await lerTudo()).pastas;
}

// ---------- validação ----------
// Devolve a mensagem de erro, ou "" se estiver tudo certo.
async function validar(dados, idAtual) {
  if (!dados.titulo) return "Dê um nome para o script.";
  if (!dados.texto.trim()) return "O texto do script está vazio.";
  if (!dados.atalho) return "Escolha um atalho (letras e números, sem espaço).";
  const outro = (await listarScripts()).find((s) => s.atalho === dados.atalho && s.id !== idAtual);
  if (outro) return `O atalho ${PREFIXO}${dados.atalho} já é usado por "${outro.titulo}".`;
  return "";
}

function limpar(dados) {
  return {
    atalho: normalizarAtalho(dados.atalho),
    titulo: String(dados.titulo || "").trim().slice(0, TAM_TITULO),
    pastaId: String(dados.pastaId || ""),
    texto: String(dados.texto || "").replace(/\r\n/g, "\n").slice(0, TAM_TEXTO)
  };
}

// ---------- escrita ----------
// Cria (sem id) ou atualiza um script. Em um padrão, só guarda o que difere do original
// (se ficar igual ao original, o ajuste some e ele deixa de ser "modificado").
// Devolve { ok, erro, id }.
export async function salvarScript(entrada) {
  const dados = limpar(entrada);
  const erro = await validar(dados, entrada.id);
  if (erro) return { ok: false, erro };

  const { pessoais, ajustes } = await lerTudo();
  const agora = new Date().toISOString();
  const original = entrada.id ? originalDoPadrao(entrada.id) : null;

  if (original) {
    const ajuste = { ...(ajustes[original.id] || {}) };
    CAMPOS_EDITAVEIS.forEach((c) => {
      if (dados[c] === original[c]) delete ajuste[c];
      else ajuste[c] = dados[c];
    });
    const sobrou = Object.keys(ajuste).some((k) => k !== "atualizadoEm");
    const novos = { ...ajustes };
    if (sobrou) novos[original.id] = { ...ajuste, atualizadoEm: agora };
    else delete novos[original.id];
    await gravar({ scriptsAjustesPadrao: novos });
    return { ok: true, id: original.id };
  }

  if (entrada.id) {
    const i = pessoais.findIndex((s) => s.id === entrada.id);
    if (i === -1) return { ok: false, erro: "Script não encontrado." };
    pessoais[i] = { ...pessoais[i], ...dados, atualizadoEm: agora };
    await gravar({ scriptsPessoais: pessoais });
    return { ok: true, id: entrada.id };
  }

  const id = novoId("p");
  pessoais.push({ id, ...dados, criadoEm: agora, atualizadoEm: agora });
  await gravar({ scriptsPessoais: pessoais });
  return { ok: true, id };
}

// Pessoal: apaga. Padrão: só oculta (dá para reexibir depois).
export async function excluirScript(id) {
  const { pessoais, ajustes } = await lerTudo();
  if (originalDoPadrao(id)) {
    await gravar({ scriptsAjustesPadrao: { ...ajustes, [id]: { ...(ajustes[id] || {}), oculto: true } } });
    return;
  }
  await gravar({ scriptsPessoais: pessoais.filter((s) => s.id !== id) });
}

// Volta o padrão ao texto original (mantém oculto, se estava).
export async function restaurarPadrao(id) {
  const { ajustes } = await lerTudo();
  const original = originalDoPadrao(id);
  const conflito = (await listarScripts()).find((s) => s.atalho === original.atalho && s.id !== id);
  if (conflito) return { ok: false, erro: `O atalho original ${PREFIXO}${original.atalho} já é usado por "${conflito.titulo}".` };
  const novos = { ...ajustes };
  if (novos[id]?.oculto) novos[id] = { oculto: true };
  else delete novos[id];
  await gravar({ scriptsAjustesPadrao: novos });
  return { ok: true };
}

export async function reexibirPadrao(id) {
  const { ajustes } = await lerTudo();
  const ajuste = { ...(ajustes[id] || {}) };
  delete ajuste.oculto;
  const atual = aplicarAjuste(originalDoPadrao(id), ajuste);
  const conflito = (await listarScripts()).find((s) => s.atalho === atual.atalho && s.id !== id);
  if (conflito) return { ok: false, erro: `O atalho ${PREFIXO}${atual.atalho} já é usado por "${conflito.titulo}".` };
  const novos = { ...ajustes };
  if (Object.keys(ajuste).length) novos[id] = ajuste;
  else delete novos[id];
  await gravar({ scriptsAjustesPadrao: novos });
  return { ok: true };
}

// ---------- pastas ----------
// Script de uma pasta excluída continua existindo e aparece em "Sem pasta".
export async function criarPasta(nome) {
  const n = String(nome || "").trim().slice(0, TAM_PASTA);
  if (!n) return { ok: false, erro: "Dê um nome para a pasta." };
  const { pastas } = await lerTudo();
  if (pastas.some((p) => p.nome.toLowerCase() === n.toLowerCase())) return { ok: false, erro: "Já existe uma pasta com esse nome." };
  const id = novoId("pasta");
  await gravar({ scriptsPastas: [...pastas, { id, nome: n }] });
  return { ok: true, id };
}

export async function renomearPasta(id, nome) {
  const n = String(nome || "").trim().slice(0, TAM_PASTA);
  if (!n) return { ok: false, erro: "Dê um nome para a pasta." };
  const { pastas } = await lerTudo();
  if (pastas.some((p) => p.id !== id && p.nome.toLowerCase() === n.toLowerCase())) return { ok: false, erro: "Já existe uma pasta com esse nome." };
  await gravar({ scriptsPastas: pastas.map((p) => (p.id === id ? { ...p, nome: n } : p)) });
  return { ok: true };
}

export async function excluirPasta(id) {
  const { pastas } = await lerTudo();
  await gravar({ scriptsPastas: pastas.filter((p) => p.id !== id) });
}

export async function moverPasta(id, direcao) {
  const { pastas } = await lerTudo();
  const i = pastas.findIndex((p) => p.id === id);
  const j = i + direcao;
  if (i === -1 || j < 0 || j >= pastas.length) return;
  [pastas[i], pastas[j]] = [pastas[j], pastas[i]];
  await gravar({ scriptsPastas: pastas });
}

// ---------- pacotes (.json) ----------
// Formato: { gamma: "scripts", versao: 1, scripts: [{ atalho, titulo, pasta, texto }] }
// A pasta vai pelo nome (os ids são de cada instalação).
export async function montarPacote() {
  const pastas = await listarPastas();
  const nomePasta = (id) => pastas.find((p) => p.id === id)?.nome || "";
  const scripts = (await listarScripts()).map((s) => ({
    atalho: s.atalho,
    titulo: s.titulo,
    pasta: nomePasta(s.pastaId),
    texto: s.texto
  }));
  return { gamma: "scripts", versao: 1, exportadoEm: new Date().toISOString(), scripts };
}

function lerPacote(jsonText) {
  let p;
  try {
    p = JSON.parse(jsonText);
  } catch (e) {
    throw new Error("O arquivo não é um JSON válido.");
  }
  const lista = Array.isArray(p) ? p : p && Array.isArray(p.scripts) ? p.scripts : null;
  if (!lista) throw new Error("O arquivo não tem uma lista de scripts.");
  const itens = lista
    .filter((s) => s && typeof s === "object")
    .map((s) => ({ ...limpar(s), pasta: String(s.pasta || "").trim().slice(0, TAM_PASTA) }))
    .filter((s) => s.atalho && s.titulo && s.texto.trim());
  if (!itens.length) throw new Error("Nenhum script válido no arquivo.");
  // Atalho repetido dentro do próprio arquivo: fica o primeiro.
  const vistos = new Set();
  return itens.filter((s) => !vistos.has(s.atalho) && vistos.add(s.atalho));
}

// Mostra o que vai acontecer antes de importar.
export async function analisarPacote(jsonText) {
  const itens = lerPacote(jsonText);
  const atuais = await listarScripts();
  const conflitos = itens.filter((s) => atuais.some((a) => a.atalho === s.atalho));
  return { total: itens.length, novos: itens.length - conflitos.length, conflitos: conflitos.length };
}

// substituir = true: atalho já usado recebe o texto do arquivo; false: fica o atual.
export async function importarPacote(jsonText, { substituir = false } = {}) {
  const itens = lerPacote(jsonText);
  let criados = 0;
  let substituidos = 0;
  let pulados = 0;

  for (const item of itens) {
    let pastaId = "";
    if (item.pasta) {
      const pastas = await listarPastas();
      const existente = pastas.find((p) => p.nome.toLowerCase() === item.pasta.toLowerCase());
      pastaId = existente ? existente.id : (await criarPasta(item.pasta)).id || "";
    }
    const atual = (await listarScripts()).find((s) => s.atalho === item.atalho);
    if (atual && !substituir) {
      pulados++;
      continue;
    }
    const r = await salvarScript({ id: atual ? atual.id : undefined, atalho: item.atalho, titulo: item.titulo, pastaId, texto: item.texto });
    if (!r.ok) pulados++;
    else if (atual) substituidos++;
    else criados++;
  }
  return { criados, substituidos, pulados };
}
