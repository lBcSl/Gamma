// storage.js
// Único ponto que fala com o chrome.storage. Os módulos guardam seus dados por aqui;
// se um dia isso migrar pra um backend (Supabase, por ex.), só este arquivo
// e a camada de dados de cada módulo precisam mudar - o resto da UI não.

// Lê as chaves de `padroes`; as que não existirem voltam com o valor padrão.
// Passando uma lista de chaves, só as que existem voltam.
export function ler(padroes) {
  return new Promise((resolve) => {
    chrome.storage.local.get(padroes, (data) => resolve(data));
  });
}

export function gravar(parcial) {
  return new Promise((resolve) => {
    chrome.storage.local.set(parcial, () => resolve());
  });
}
