// ui.js
// Peças de tela compartilhadas entre HUB, popup e módulos.

export function fillSelect(select, options, placeholder) {
  select.innerHTML = "";
  if (placeholder) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder;
    select.appendChild(opt);
  }
  options.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o;
    opt.textContent = o;
    select.appendChild(opt);
  });
}

// Carrega o HTML de uma view e coloca dentro de `container`.
// Elementos do template marcados com data-slot="x" não ficam no container:
// substituem o elemento da página com o mesmo data-slot (ex: as abas, que moram
// na barra do topo e não no conteúdo).
// Com { acumular: true } os filhos do slot entram no fim do slot da página em vez de
// substituí-lo (o popup junta as abas de vários módulos na mesma linha).
// Devolve os elementos que foram para os slots.
export async function montarTemplate(url, container, { acumular = false } = {}) {
  const html = await (await fetch(url)).text();
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const noSlot = [];
  tpl.content.querySelectorAll("[data-slot]").forEach((el) => {
    const alvo = document.querySelector(`[data-slot="${el.dataset.slot}"]`);
    if (!alvo) return el.remove();
    if (acumular) {
      const filhos = [...el.children];
      alvo.append(...filhos);
      noSlot.push(...filhos);
      el.remove();
    } else {
      alvo.replaceWith(el);
      noSlot.push(el);
    }
  });
  container.append(tpl.content);
  return noSlot;
}

// Texto vindo de fora (ex: nome do cliente lido do HelpDesk) antes de ir para innerHTML.
export function escaparHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
