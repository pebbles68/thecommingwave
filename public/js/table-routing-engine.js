// Router de combate genérico (roadmap Fase 6, AGENTS.md §6.2). Interpreta el
// árbol de decisión de data/routing/table-routing.json ({root: {question,
// options[{value,label,next?|leaf?}]}}) y localiza, para una secuencia de
// valores de opción ya elegidos, o la siguiente pregunta a mostrar o el leaf
// alcanzado — sin conocer ningún dominio de combate concreto.
//
// Igual que table-engine.js: sin I/O, funciona en Node (tests) y en el
// navegador (`<script>`, patrón UMD-lite, sin módulos ES).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TableRoutingEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Recorre `routing.root` siguiendo `pathValues` (los `option.value` elegidos
  // en orden). Nunca adivina una opción no elegida explícitamente: si un valor
  // no existe en la pregunta actual, devuelve un error en vez de continuar por
  // una rama arbitraria.
  function walkTableRouting(routing, pathValues) {
    let node = routing.root;
    const trail = [];
    for (const value of pathValues) {
      if (!node || !node.options) {
        return { error: 'Ruta de router inválida (no hay más preguntas en este punto).' };
      }
      const option = node.options.find((o) => o.value === value);
      if (!option) {
        return { error: `La opción "${value}" no existe en la pregunta «${node.question}».` };
      }
      trail.push({ question: node.question, label: option.label, value: option.value });
      if (option.leaf) return { leaf: option.leaf, trail };
      node = option.next;
    }
    return { node, trail };
  }

  // "data/tables/page-32.json#army-logistics-resupply" -> {file, tableId}
  function parseTableFileRef(ref) {
    const [filePath, tableId] = ref.split('#');
    return { file: filePath.replace('data/tables/', ''), tableId };
  }

  // Dado un leaf (workflowId/attackWorkflowId, o un tableFile directo para
  // casos sin workflow como "Logística") y el índice ya cargado de
  // data/tables/index.json, devuelve las tablas transcritas que le
  // corresponden. Une por workflowId en vez de parsear el texto libre de
  // `tableReference`, que no es apto para lógica (AGENTS.md: no aproximar/
  // adivinar a partir de un texto ambiguo).
  function findTablesForLeaf(leaf, tablesIndex) {
    const links = [];
    if (leaf.tableFile) {
      const ref = parseTableFileRef(leaf.tableFile);
      links.push({ file: ref.file, tableId: ref.tableId });
    }
    const workflowIds = [leaf.workflowId, leaf.attackWorkflowId].filter(Boolean);
    if (workflowIds.length && tablesIndex) {
      tablesIndex.pages.forEach((page) => {
        if (page.workflowRefs.some((w) => workflowIds.includes(w))) {
          page.tableIds.forEach((tableId) => {
            links.push({ file: page.file, tableId, pageTitle: page.title, page: page.page });
          });
        }
      });
    }
    return links;
  }

  return { walkTableRouting, parseTableFileRef, findTablesForLeaf };
});
