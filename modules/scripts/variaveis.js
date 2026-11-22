// variaveis.js
// Motor das variáveis dos scripts. Não fala com o storage nem com a página: recebe o texto
// e o contexto e devolve o texto pronto. É usado pelo HUB, pelo popup e pelo background
// (que atende a paleta e o expansor dentro dos sites).
//
// Variáveis:
//   {saudacao}            Bom dia / Boa tarde / Boa noite, pela hora
//   {data} {hora}         data (DD/MM/AAAA) e hora (HH:MM) de agora
//   {agente}              nome do agente (perfil)
//   {numero} {cliente}    do chamado aberto no HelpDesk; sem chamado, são perguntados
//   {campo:Rótulo}        pergunta um texto (o mesmo rótulo usado duas vezes = mesmo valor)
//   {opcao:A|B|C}         pergunta uma escolha; com nome: {opcao:Período=manhã|tarde}
//   {cursor}              onde o cursor fica depois de inserir (some do texto)
// Qualquer outra coisa entre chaves fica como está.

const RE_VARIAVEL = /\{(saudacao|data|hora|agente|numero|cliente|cursor|campo|opcao)(?::([^{}]*))?\}/g;

export const VARIAVEIS = [
  { exemplo: "{saudacao}", descricao: "Bom dia, Boa tarde ou Boa noite" },
  { exemplo: "{agente}", descricao: "Seu nome" },
  { exemplo: "{data}", descricao: "Data de hoje" },
  { exemplo: "{hora}", descricao: "Hora atual" },
  { exemplo: "{numero}", descricao: "N° do chamado aberto" },
  { exemplo: "{cliente}", descricao: "Nome do cliente do chamado" },
  { exemplo: "{campo:Rótulo}", descricao: "Pergunta um texto na hora" },
  { exemplo: "{opcao:A|B}", descricao: "Pergunta uma escolha na hora" },
  { exemplo: "{cursor}", descricao: "Onde o cursor fica" }
];

const ROTULOS = { numero: "N° do chamado", cliente: "Nome do cliente", agente: "Seu nome" };

export function saudacao(agora = new Date()) {
  const h = agora.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

function dois(n) {
  return String(n).padStart(2, "0");
}

// {opcao:...} -> { rotulo, opcoes }
function lerOpcao(arg, indice) {
  let rotulo = "";
  let lista = String(arg || "");
  const igual = lista.indexOf("=");
  if (igual !== -1) {
    rotulo = lista.slice(0, igual).trim();
    lista = lista.slice(igual + 1);
  }
  const opcoes = lista.split("|").map((o) => o.trim()).filter(Boolean);
  return { rotulo: rotulo || `Escolha ${indice}`, opcoes, chave: rotulo ? `opcao:${rotulo}` : `opcao#${indice}` };
}

// Percorre as variáveis do texto, na ordem, com a chave de cada pergunta.
function* variaveis(texto) {
  let indiceOpcao = 0;
  RE_VARIAVEL.lastIndex = 0;
  let m;
  while ((m = RE_VARIAVEL.exec(texto))) {
    const [bruto, nome, arg] = m;
    const v = { bruto, nome, arg, inicio: m.index, fim: m.index + bruto.length };
    if (nome === "campo") {
      const rotulo = String(arg || "").trim();
      if (!rotulo) continue; // {campo} sem rótulo fica como texto
      v.chave = `campo:${rotulo}`;
      v.rotulo = rotulo;
    } else if (nome === "opcao") {
      indiceOpcao++;
      const o = lerOpcao(arg, indiceOpcao);
      if (!o.opcoes.length) continue;
      Object.assign(v, o);
    } else if (arg !== undefined) {
      continue; // {data:xyz} não é variável conhecida
    }
    yield v;
  }
}

function valorAutomatico(nome, ctx) {
  const agora = ctx.agora || new Date();
  switch (nome) {
    case "saudacao":
      return saudacao(agora);
    case "data":
      return `${dois(agora.getDate())}/${dois(agora.getMonth() + 1)}/${agora.getFullYear()}`;
    case "hora":
      return `${dois(agora.getHours())}:${dois(agora.getMinutes())}`;
    case "agente":
    case "numero":
    case "cliente":
      return String(ctx[nome] || "").trim() || null; // null = precisa perguntar
    default:
      return null;
  }
}

// O que precisa ser perguntado antes de usar o script: campos, escolhas e o que
// o contexto não trouxe (ex: {numero} sem chamado aberto). Sem repetição.
export function perguntasDoScript(texto, ctx = {}) {
  const perguntas = [];
  const vistas = new Set();
  for (const v of variaveis(texto)) {
    let p = null;
    if (v.nome === "campo") p = { chave: v.chave, rotulo: v.rotulo, tipo: "texto" };
    else if (v.nome === "opcao") p = { chave: v.chave, rotulo: v.rotulo, tipo: "opcao", opcoes: v.opcoes };
    else if (ROTULOS[v.nome] && valorAutomatico(v.nome, ctx) === null) p = { chave: v.nome, rotulo: ROTULOS[v.nome], tipo: "texto" };
    if (p && !vistas.has(p.chave)) {
      vistas.add(p.chave);
      perguntas.push(p);
    }
  }
  return perguntas;
}

// Texto final. `respostas` = { chave: valor } das perguntas.
// Devolve { texto, cursor } (cursor = posição do {cursor} no texto final, ou -1).
export function renderizar(texto, ctx = {}, respostas = {}) {
  let saida = "";
  let ultimo = 0;
  let cursor = -1;
  for (const v of variaveis(texto)) {
    saida += texto.slice(ultimo, v.inicio);
    ultimo = v.fim;
    if (v.nome === "cursor") {
      if (cursor === -1) cursor = saida.length;
      continue;
    }
    let valor;
    if (v.nome === "campo") valor = respostas[v.chave];
    else if (v.nome === "opcao") valor = respostas[v.chave] ?? v.opcoes[0];
    else valor = valorAutomatico(v.nome, ctx) ?? respostas[v.nome];
    saida += valor ?? "";
  }
  saida += texto.slice(ultimo);
  return { texto: saida, cursor };
}

// Prévia para o editor: perguntas sem resposta aparecem como [Rótulo].
export function previa(texto, ctx = {}) {
  const respostas = {};
  perguntasDoScript(texto, ctx).forEach((p) => {
    respostas[p.chave] = p.tipo === "opcao" ? p.opcoes[0] : `[${p.rotulo}]`;
  });
  return renderizar(texto, ctx, respostas).texto;
}
