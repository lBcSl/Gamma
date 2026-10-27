// backup.js
// Backup geral: junta num .json só as chaves que cada módulo declara em `backup.padroes`
// (chave ainda não gravada entra com o valor padrão, como no backup antigo do Backlog).
// O arquivo é um objeto simples { chave: valor }, o mesmo formato dos backups antigos
// do Backlog - então backups feitos antes da divisão em módulos continuam importando.

import { ler, gravar } from "./storage.js";
import { todayKey } from "./datas.js";
import { MODULOS } from "./modulos.js";

function padroesDoBackup() {
  return Object.assign({}, ...MODULOS.map((m) => (m.backup ? m.backup.padroes : {})));
}

export async function exportBackup() {
  const data = await ler(padroesDoBackup());
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const filename = `backup-gamma-${todayKey()}.json`;
  chrome.downloads.download({ url, filename, saveAs: true });
}

// Só grava chaves conhecidas: lixo no arquivo não vai parar no storage.
export async function importBackup(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Arquivo inválido.");
  }
  const conhecidas = Object.keys(padroesDoBackup());
  const dados = Object.fromEntries(Object.entries(parsed).filter(([k]) => conhecidas.includes(k)));
  if (Object.keys(dados).length === 0) throw new Error("Arquivo inválido.");
  await gravar(dados);
}
