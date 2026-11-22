// boas-vindas.js
// Primeiro acesso: pede o nome do agente (usado no {agente} dos scripts) e grava no perfil.
// Usado pelo popup e pelo HUB. Depois o nome pode ser trocado nas configurações.
// O estilo vem junto (só usa as variáveis de cor que popup e HUB já definem).

import { nomeDoAgente, salvarNomeDoAgente } from "./perfil.js";
import { escaparHtml } from "./ui.js";

const ESTILO = `
.bv-fundo { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(10, 10, 10, 0.55); }
.bv-caixa { width: 360px; max-width: 100%; display: flex; flex-direction: column; gap: 12px; padding: 22px;
  border-radius: 24px; background: var(--surface); color: var(--ink); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25); }
.bv-caixa h2 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
.bv-caixa p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--text-dim); }
.bv-caixa input { width: 100%; height: 46px; padding: 0 14px; border: none; border-radius: 14px; font: inherit;
  font-size: 15px; font-weight: 600; background: var(--surface-2); color: var(--ink); }
.bv-caixa input:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.bv-caixa button { height: 46px; border: none; border-radius: 999px; font: inherit; font-size: 14px; font-weight: 600;
  cursor: pointer; background: var(--ink); color: var(--on-ink); }
.bv-caixa button:disabled { opacity: 0.4; cursor: not-allowed; }
`;

// Resolve quando já existe nome (na hora) ou quando a pessoa salva.
export async function garantirNomeDoAgente() {
  if (await nomeDoAgente()) return;
  return new Promise((resolve) => {
    const fundo = document.createElement("div");
    fundo.className = "bv-fundo";
    fundo.innerHTML = `
      <style>${ESTILO}</style>
      <form class="bv-caixa" role="dialog" aria-modal="true" aria-labelledby="bvTitulo">
        <h2 id="bvTitulo">Bem-vindo ao Gamma</h2>
        <p>Como você quer ser chamado nos scripts? O nome entra onde estiver <strong>${escaparHtml("{agente}")}</strong>
          e pode ser trocado depois nas configurações.</p>
        <input type="text" id="bvNome" maxlength="60" autocomplete="off" placeholder="Seu nome" aria-label="Seu nome" />
        <button type="submit" disabled>Começar</button>
      </form>`;
    document.body.appendChild(fundo);
    const campo = fundo.querySelector("#bvNome");
    const botao = fundo.querySelector("button");
    campo.addEventListener("input", () => (botao.disabled = !campo.value.trim()));
    fundo.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!campo.value.trim()) return;
      await salvarNomeDoAgente(campo.value);
      fundo.remove();
      resolve();
    });
    campo.focus();
  });
}
