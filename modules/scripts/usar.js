// usar.js
// "Usar" um script no HUB ou no popup: monta as perguntas (campos, escolhas, e o que o
// contexto não trouxe), mostra a prévia e copia o texto pronto.

import { perguntasDoScript, renderizar } from "./variaveis.js";
import { nomeDoAgente } from "../../core/perfil.js";
import { escaparHtml } from "../../core/ui.js";

// Contexto que não depende de página: agente e hora. Quem tiver um chamado aberto
// (popup no HelpDesk) completa com numero/cliente.
export async function contextoBase(extra = {}) {
  return { agente: await nomeDoAgente(), agora: new Date(), ...extra };
}

export async function copiarTexto(texto) {
  await navigator.clipboard.writeText(texto);
}

// Desenha as perguntas dentro de `container` e chama `aoMudar(texto)` a cada alteração.
// Devolve { texto() } com o texto final do momento.
export function montarPerguntas(container, script, ctx, aoMudar) {
  const perguntas = perguntasDoScript(script.texto, ctx);
  container.innerHTML = perguntas
    .map((p, i) => {
      const id = `uso-p${i}`;
      const campo =
        p.tipo === "opcao"
          ? `<select id="${id}" data-chave="${escaparHtml(p.chave)}">${p.opcoes
              .map((o) => `<option value="${escaparHtml(o)}">${escaparHtml(o)}</option>`)
              .join("")}</select>`
          : `<input type="text" id="${id}" data-chave="${escaparHtml(p.chave)}" autocomplete="off" />`;
      return `<label>${escaparHtml(p.rotulo)}${campo}</label>`;
    })
    .join("");

  const respostas = () => {
    const r = {};
    container.querySelectorAll("[data-chave]").forEach((el) => (r[el.dataset.chave] = el.value));
    return r;
  };
  const texto = () => renderizar(script.texto, ctx, respostas()).texto;
  container.querySelectorAll("[data-chave]").forEach((el) => {
    el.addEventListener("input", () => aoMudar(texto()));
    el.addEventListener("change", () => aoMudar(texto()));
  });
  aoMudar(texto());
  return { texto, quantidade: perguntas.length, primeiro: container.querySelector("[data-chave]") };
}
