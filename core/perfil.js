// perfil.js
// Dados do agente que usa a extensão (por enquanto só o nome), compartilhados por
// todos os módulos. O nome é pedido no primeiro acesso e pode ser trocado depois.

import { ler, gravar } from "./storage.js";

export const PADROES_PERFIL = { perfilAgente: { nome: "" } };

export async function getPerfil() {
  const { perfilAgente } = await ler(PADROES_PERFIL);
  return { nome: "", ...(perfilAgente || {}) };
}

export async function nomeDoAgente() {
  return (await getPerfil()).nome.trim();
}

export async function salvarNomeDoAgente(nome) {
  const perfil = await getPerfil();
  await gravar({ perfilAgente: { ...perfil, nome: String(nome || "").trim().slice(0, 60) } });
}
