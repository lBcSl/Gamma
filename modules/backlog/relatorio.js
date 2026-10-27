// relatorio.js
// Monta o texto do relatório diário no mesmo formato usado hoje,
// a partir dos chamados cadastrados no dia.

import { STATUS_COM_DATA, SUBTIPOS_DP_SEM_CATEGORIA } from "./dados.js";
import { formatarDataCurta } from "../../core/datas.js";

// OS e Atualizado levam a data marcada no fim: "... - OS 27/10."
function statusComData(c) {
  if (STATUS_COM_DATA.includes(c.status) && c.dataPrevista) {
    return `${c.status} ${formatarDataCurta(c.dataPrevista)}`;
  }
  return c.status;
}

function linhaBacklog(c) {
  const partes = [c.numero, c.categoria];
  if (c.canal) partes.push(c.canal);
  partes.push(statusComData(c));
  return partes.join(" - ") + ".";
}

// Reincidência e Portabilidade não têm categoria própria - a informação já está
// completa só com o sub-tipo. Os demais (Departamento, CSAT/ANATEL, Suspensão,
// Solicitação de contato) continuam usando a categoria normalmente.

function linhaDepartamento(c) {
  const partes = [c.numero, c.categoriaDP];
  if (c.categoria && !SUBTIPOS_DP_SEM_CATEGORIA.includes(c.categoriaDP)) partes.push(c.categoria);
  partes.push(statusComData(c));
  return partes.join(" - ") + ".";
}

function linhaN2Acolhimento(c) {
  const partes = [c.numero, c.categoria];
  if (c.canal) partes.push(c.canal);
  partes.push(statusComData(c));
  return partes.join(" - ") + ".";
}

function linhaVinculado(c) {
  const partes = [c.numero, c.categoria];
  partes.push(c.vinculadoNumero ? `vinculado ${c.vinculadoNumero}` : "adormecido");
  if (c.canal) partes.push(c.canal);
  partes.push(statusComData(c));
  return partes.join(" - ") + ".";
}

function montarSecao(titulo, chamados, montaLinha) {
  if (chamados.length === 0) return "";
  const linhas = chamados.map(montaLinha).join("\n");
  return `- ${titulo}\n${linhas}\n`;
}

export function gerarRelatorio(chamadosDoDia, turno, diaKey) {
  const [ano, mes, dia] = diaKey.split("-");
  const cabecalho =
    `DATA ${dia}/${mes}\n` +
    `Departamento N2 Início: ${turno.n2Inicio || "--"}\n` +
    `Departamento N2 Fim: ${turno.n2Fim || "--"}\n` +
    `ASC Início: ${turno.ascInicio || "--"}\n` +
    `ASC fim: ${turno.ascFim || "--"}\n\n`;

  const backlog = chamadosDoDia.filter((c) => c.tipo === "backlog");
  const departamento = chamadosDoDia.filter((c) => c.tipo === "departamento");
  const n2 = chamadosDoDia.filter((c) => c.tipo === "n2");
  const acolhimento = chamadosDoDia.filter((c) => c.tipo === "acolhimento");
  const vinculado = chamadosDoDia.filter((c) => c.tipo === "vinculado");

  let corpo = "";
  corpo += montarSecao("BACKLOG", backlog, linhaBacklog);
  corpo += montarSecao("DEPARTAMENTO", departamento, linhaDepartamento);
  corpo += montarSecao("CHAMADO N2", n2, linhaN2Acolhimento);
  corpo += montarSecao("CHAMADO ACOLHIMENTO", acolhimento, linhaN2Acolhimento);
  corpo += montarSecao("VINCULADO/ADORMECIDO", vinculado, linhaVinculado);

  return (cabecalho + corpo).trim() + "\n";
}
