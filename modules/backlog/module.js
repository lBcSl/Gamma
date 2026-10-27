// module.js
// Contrato do módulo Backlog com o núcleo (ver core/modulos.js).

import { DEFAULTS } from "./dados.js";

export default {
  id: "backlog",
  nome: "Backlog",
  icone:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
  hub: () => import("./hub-view.js"),
  popup: () => import("./popup-view.js"),
  backup: { padroes: DEFAULTS }
};
