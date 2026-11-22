// module.js
// Contrato do módulo Scripts com o núcleo (ver core/modulos.js).

import { DEFAULTS } from "./dados.js";

export default {
  id: "scripts",
  nome: "Scripts",
  // Ícone provisório (balão de mensagem); dá para trocar depois sem mexer em mais nada.
  icone:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 10.5h7M8.5 13.5h4"/></svg>',
  hub: () => import("./hub-view.js"), // sem aba no popup: no dia a dia o acesso é pela paleta
  backup: { padroes: DEFAULTS }
};
