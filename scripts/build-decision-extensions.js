// Genera data/routing/decision-graph-extensions.json (Fase 25, AD-005): ramas nuevas del árbol de decisión para los
// procedimientos que el árbol original no cubre (ataques de reacción terrestres, emboscada de submarino, efectos del
// impacto antibuque, logística de puerto, garantía logística y organización del combate aéreo). No se inventa ninguna
// regla: las respuestas y los textos de los resultados salen de data/rules/*.json (los mismos que usan los wizards),
// con sus fuentes. El árbol original (data/routing/decision-graph.json) no se toca: la extensión añade nodos y
// respuestas, y el asistente la une al cargar (DecisionGraphEngine.mergeExtensions).
//
// Uso: node scripts/build-decision-extensions.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const DB = 'TCW_Decision_Book_v1.0_-_COMPLETO_[v.ESP_-_1.2].pdf';
const ref = (r) => (r && r.document ? `${r.document === DB ? 'Reglas' : r.document} ${r.section || r.sections || ''}`.trim() : null);

const reactions = read('data/rules/ground-reactions.json');
const ambush = read('data/rules/submarine-ambush.json');
const impact = read('data/rules/ship-impact-effects.json');
const port = read('data/rules/port-logistics.json');
const guarantee = read('data/rules/logistics-guarantee.json');

const nodes = {};
const addRoutes = [];

// Ataques de reacción terrestres (§5.16).
addRoutes.push({ node: 'land.kind', route: { answer: 'Ataque de reacción terrestre (CF, AS, KB, BAI)', to: 'ext.reaction.kind' } });
nodes['ext.reaction.kind'] = {
  type: 'decision',
  question: '¿Qué ataque de reacción se quiere ejecutar?',
  source: ['Reglas 5.16'],
  routes: reactions.reactions.map((r) => ({ answer: r.name, to: `ext.reaction.${r.id}`, effects: [`Se activa cuando: ${r.triggerLabel}.`] }))
};
reactions.reactions.forEach((r) => {
  const kindLabel = (id) => (reactions.attackerKinds.find((k) => k.id === id) || {}).label || id;
  const conds = Object.entries(r.attackerConditions || {}).map(([id, c]) => `${kindLabel(id)}: ${c}`);
  const after = Object.entries(r.aftermath || {}).map(([id, t]) => `Después, ${kindLabel(id)}: ${t}`);
  nodes[`ext.reaction.${r.id}`] = {
    type: 'terminal',
    title: r.name,
    instructions: [`Objetivo: ${r.targetDescription}`].concat(conds).concat(r.limits ? [`Límite: ${r.limits}`] : []).concat(after),
    source: [ref(r.sourceRef) || 'Reglas 5.16'].filter(Boolean)
  };
});

// Emboscada de submarino (§9.16).
addRoutes.push({ node: 'surface.kind', route: { answer: 'Emboscada de submarino (reacción)', to: 'ext.ambush.event' } });
nodes['ext.ambush.event'] = {
  type: 'decision',
  question: '¿Qué hace la formación de superficie respecto a la Zona de Emboscada del submarino Oculto?',
  source: ['Reglas 9.16', 'Reglas 9.16.1'],
  routes: ambush.events.map((e) => ({ answer: e.label, to: e.value === 'none' ? 'ext.ambush.none' : 'ext.ambush.steps' }))
};
nodes['ext.ambush.steps'] = {
  type: 'terminal',
  title: 'Resolución de la emboscada',
  instructions: ambush.steps.map((s) => s.text),
  source: ['Reglas 9.16.2']
};
nodes['ext.ambush.none'] = {
  type: 'terminal',
  title: 'No hay emboscada',
  instructions: ['La formación no entra, sale ni se mueve dentro de la Zona de Emboscada: el submarino no puede iniciar la emboscada.'],
  source: ['Reglas 9.16']
};

// Efectos del impacto antibuque (§5.9).
const ruleText = (id) => (impact.rules.find((r) => r.id === id) || {}).text;
addRoutes.push({ node: 'surface.kind', route: { answer: 'Efectos del impacto en un buque (daño, portaaviones, transportes)', to: 'ext.impact.hull' } });
nodes['ext.impact.hull'] = {
  type: 'decision',
  question: '¿Qué tipo de unidad de superficie sufre el punto de daño?',
  source: ['Reglas 5.9'],
  routes: impact.hullTypes.map((h) => ({ answer: h.label, to: `ext.impact.${h.id}` }))
};
impact.hullTypes.forEach((h) => {
  nodes[`ext.impact.${h.id}`] = {
    type: 'terminal',
    title: `Efecto del impacto: ${h.label}`,
    instructions: [ruleText(h.ruleId)].concat(['already_damaged_eliminated', 'no_damaged_side_eliminated', 'carrier_damaged', 'carrier_sunk', 'carrier_deployed_units', 'transport_capacity_loss'].map(ruleText)).filter(Boolean),
    source: ['Reglas 5.9']
  };
});

// Logística de puerto y munición (§9.9.4, §9.9.5, §11.6) y garantía logística (§11.0-11.5).
addRoutes.push({ node: 'strategic.kind', route: { answer: 'Logística de puerto y munición', to: 'ext.port.operation' } });
nodes['ext.port.operation'] = {
  type: 'decision',
  question: '¿Qué operación de puerto o de munición se resuelve?',
  source: ['Reglas 9.9.4', 'Reglas 9.9.5', 'Reglas 11.6'],
  routes: port.operations.map((o) => ({ answer: o.label, to: `ext.port.${o.value}` }))
};
port.operations.forEach((o) => {
  nodes[`ext.port.${o.value}`] = { type: 'terminal', title: o.label, instructions: [o.summary].filter(Boolean), source: ['Reglas 9.9.4-9.9.5', 'Reglas 11.6'] };
});
addRoutes.push({ node: 'strategic.kind', route: { answer: 'Garantía logística de una unidad', to: 'ext.guarantee.unit' } });
nodes['ext.guarantee.unit'] = {
  type: 'decision',
  question: '¿Qué tipo de unidad comprueba su garantía logística?',
  source: ['Reglas 11.0-11.5'],
  routes: guarantee.unitTypes.map((u) => ({ answer: u.label, to: `ext.guarantee.${u.id}` }))
};
guarantee.unitTypes.forEach((u) => {
  nodes[`ext.guarantee.${u.id}`] = { type: 'terminal', title: `Garantía logística: ${u.label}`, instructions: [guarantee.intro, `Sin garantía logística: ${u.withoutGuarantee}`].filter(Boolean), source: [ref((u.sourceRefs || [])[0]) || 'Reglas 11.5'] };
});

// Organización del combate aéreo: grupo de misión y asignación de objetivos BVR (los resuelven sus cálculos).
addRoutes.push({ node: 'air.kind', route: { answer: 'Organizar el grupo de misión y asignar objetivos BVR', to: 'ext.air.organize' } });
nodes['ext.air.organize'] = {
  type: 'terminal',
  title: 'Grupo de misión y asignación de objetivos BVR',
  instructions: [
    'Anota los dos bandos y sus unidades en el cálculo del grupo de misión: lo comparten la asignación de objetivos y el combate cercano, y recoge retiradas y bajas.',
    'La asignación de objetivos ordena la selección y forma los duelos 1 contra 1 del BVR; después, cada duelo se resuelve en la intercepción (banda de Iniciativa y tabla BVR).'
  ],
  source: ['Reglas 7.16']
};

const out = {
  id: 'decision-graph-extensions',
  reviewStatus: 'needs_review',
  description: 'Ramas añadidas al árbol de decisión para los procedimientos que el árbol original no cubre (roadmap Fase 25, AD-005). Generado por scripts/build-decision-extensions.js a partir de data/rules/ (no editar a mano): las respuestas y los textos de los resultados son los de esos archivos, con sus fuentes. `addRoutes` añade respuestas a preguntas del árbol original; `nodes` son los nodos nuevos (prefijo «ext.»). Pendiente de revisión del mantenedor.',
  sourceRefs: [{ document: DB, description: 'Secciones 5.9, 5.16, 7.16, 9.9.4-9.9.5, 9.16, 11.0-11.6 (vía data/rules/).' }],
  addRoutes,
  nodes
};
fs.writeFileSync(path.join(root, 'data/routing/decision-graph-extensions.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`${Object.keys(nodes).length} nodos nuevos, ${addRoutes.length} respuestas añadidas`);
