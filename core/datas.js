// datas.js
// Utilitários de data usados por qualquer módulo.

// Datas são guardadas como "AAAA-MM-DD" (valor do <input type="date">).
export function parseDataLocal(dataStr) {
  const [ano, mes, dia] = dataStr.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

export function formatarDataCurta(dataStr) {
  const [, mes, dia] = dataStr.split("-");
  return `${dia}/${mes}`;
}

export function formatarDataLonga(dataStr) {
  const [ano, mes, dia] = dataStr.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Dias até a data (negativo = já passou).
export function diasAte(dataStr) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((parseDataLocal(dataStr) - hoje) / (1000 * 60 * 60 * 24));
}

export function todayKey(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}
