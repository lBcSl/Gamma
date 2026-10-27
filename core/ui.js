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
export async function montarTemplate(url, container) {
  const html = await (await fetch(url)).text();
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  tpl.content.querySelectorAll("[data-slot]").forEach((el) => {
    const alvo = document.querySelector(`[data-slot="${el.dataset.slot}"]`);
    if (alvo) alvo.replaceWith(el);
    else el.remove();
  });
  container.prepend(tpl.content);
}
