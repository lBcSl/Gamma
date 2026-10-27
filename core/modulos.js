// modulos.js
// Registro dos módulos do Gamma. Módulo novo = criar a pasta em modules/ e listar aqui.
// HUB, popup e backup montam menus, abas e o arquivo de backup a partir desta lista.
//
// Contrato de um módulo (modules/<id>/module.js):
//   id      identificador (usado na URL do HUB: hub.html#/<id>)
//   nome    nome exibido
//   icone   SVG do item no menu lateral do HUB
//   hub     () => import(view do HUB)    - opcional
//   popup   () => import(view do popup)  - opcional
//   backup  { padroes: {...} } chaves do storage que entram no backup geral, com o valor padrão

import backlog from "../modules/backlog/module.js";

export const MODULOS = [backlog];

export function moduloPorId(id) {
  return MODULOS.find((m) => m.id === id) || null;
}
