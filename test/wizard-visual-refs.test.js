// AJ-008: todo campo numérico que un wizard pide leer tiene su ayuda visual
// declarada (o una razón explícita de por qué no hay valor físico/recorte), y
// las referencias apuntan a recursos que existen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { findEntry, wizardIdFromHash } = require('../public/js/core-visual-refs.js');

const ROOT = path.join(__dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const refs = readJson('data/rules/wizard-visual-refs.json');
const factorMap = readJson('data/counters/factor-map.json');
const tablesIndex = readJson('data/tables/index.json');
const catalog = readJson('data/visual-help/entities.json');
const VisualHelp = require('../public/js/visual-help-engine.js');

test('wizard-visual-refs: estructura, tipos válidos y razones obligatorias', () => {
  const kinds = Object.keys(refs.kinds);
  const ids = new Set();
  refs.entries.forEach((e) => {
    assert.ok(!ids.has(e.id), `id duplicado ${e.id}`);
    ids.add(e.id);
    assert.ok(kinds.includes(e.kind), `${e.id}: tipo inválido ${e.kind}`);
    assert.ok(Array.isArray(e.wizards) && e.wizards.length, `${e.id}: sin wizards`);
    assert.doesNotThrow(() => new RegExp(e.pattern), `${e.id}: patrón inválido`);
    if (e.kind === 'pending-visual' || e.kind === 'no-physical-source') assert.ok(e.reason, `${e.id}: ${e.kind} sin reason`);
    if (e.kind === 'source-page') assert.ok(e.document && e.description, `${e.id}: source-page sin documento/descripción`);
  });
});

test('wizard-visual-refs: los factores de ficha y las tablas referenciados existen', () => {
  refs.entries.forEach((e) => {
    if (e.kind === 'counter-factor') {
      assert.ok(e.entityRef && e.entityRef.factorId, `${e.id}: counter-factor sin entityRef con factorId`);
      assert.ok(factorMap.factorVocabulary[e.entityRef.factorId], `${e.id}: factor ${e.entityRef.factorId} sin vocabulario`);
    }
    if (e.entityRef) {
      // TUR-012: toda entityRef resuelve a plantillas del catálogo; con factor, a todas las fichas que lo tienen.
      const sel = VisualHelp.selectTemplates(catalog, e.entityRef, { factorMap });
      assert.ok(sel.templates.length > 0, `${e.id}: la entityRef no resuelve a ninguna plantilla (${sel.status})`);
      if (e.entityRef.factorId) assert.equal(sel.status, 'generic', `${e.id}`);
    }
    if (e.kind === 'table') {
      const page = tablesIndex.pages.find((p) => p.file === e.page);
      assert.ok(page, `${e.id}: página ${e.page} inexistente`);
      assert.ok(page.tableIds.includes(e.tableId), `${e.id}: tabla ${e.tableId} no está en ${e.page}`);
    }
  });
});

// Fase 25: los wizards se han retirado; los campos que se leen en una ficha están en los cálculos del asistente.
const calculators = readJson('data/routing/decision-graph-calculators.json').calculators;
const PRINTED = /Valor de (Protección|Defensa Aérea|Combate Aéreo|Artillería)|Valor Electrónico|Protección del|Iniciativa|Tamaño de Fuerza|Firma \(Ruido\)/;
test('asistente: todo campo numérico que se lee en una ficha declara su ayuda visual, y la ayuda existe', () => {
  const ids = new Set(refs.entries.map((e) => e.id));
  const fields = Object.entries(calculators).flatMap(([id, c]) => (c.fields || []).concat(c.sharedFields || []).map((f) => ({ id, f })));
  const printed = fields.filter(({ f }) => (f.kind === 'number' || f.kind === 'text') && PRINTED.test(f.label));
  assert.ok(printed.length > 20, `se esperaban más de 20 campos de ficha, hay ${printed.length}`);
  fields.filter(({ f }) => f.visualRef).forEach(({ id, f }) => assert.ok(ids.has(f.visualRef), `${id}/${f.id}: ayuda ${f.visualRef} inexistente`));
  const missing = printed.filter(({ f }) => !f.visualRef && !/sumado|agrupado|total/i.test(f.label));
  assert.deepEqual(missing.map(({ id, f }) => `${id}/${f.id}: ${f.label}`), [], 'campos de ficha sin ayuda visual');
});

test('wizard-visual-refs: los campos de factor de ficha que piden Protección, Defensa Aérea, Valor Electrónico y Tamaño de fuerza muestran dónde se leen', () => {
  const must = [
    ['antiship-unguided', 'Buque 1: Protección', 'protection'],
    ['air-combat-bvr', 'A: Valor Electrónico', 'electronic'],
    ['air-combat-wvr', 'A · unidad 1: Valor de Combate Aéreo (vacío si no tiene)', 'air_combat'],
    ['ground-close-combat', 'Tamaño de Fuerza antes del combate.', 'size'],
    ['ground-close-combat', 'Valor Electrónico más alto de tu bando.', 'electronic'],
    ['ground-guided', 'Disparo 1: Valor de Defensa Aérea propio', 'aa'],
    ['asw-air-search', 'Unidad 1: X', 'asw']
  ];
  must.forEach(([wizard, label, factor]) => {
    const e = findEntry(refs, wizard, label);
    assert.ok(e, `${wizard}: ${label}`);
    assert.equal(e.kind, 'counter-factor', `${wizard}: ${label}`);
    assert.equal(e.entityRef.factorId, factor, `${wizard}: ${label}`);
  });
});

test('wizardIdFromHash', () => {
  assert.equal(wizardIdFromHash('#/wizard/ground-guided'), 'ground-guided');
  assert.equal(wizardIdFromHash('#/ayuda/tablas'), null);
});

test('resolveEntry: un campo con ID declarado usa esa entrada aunque el texto de su etiqueta cambie; sin ID, el patrón', () => {
  const { resolveEntry } = require('../public/js/core-visual-refs.js');
  assert.equal(resolveEntry(refs, 'ground-attack-result', 'ground-protection', 'Un texto que no encaja con ningún patrón').id, 'ground-protection');
  assert.equal(resolveEntry(refs, 'ground-attack-result', null, 'Valor de Protección de la unidad').id, 'ground-protection');
  assert.equal(resolveEntry(refs, 'ground-attack-result', null, 'Un texto que no encaja con ningún patrón'), null);
  // El ID debe aplicar al wizard: una entrada de otro wizard no se aplica.
  assert.equal(resolveEntry(refs, 'ground-close-combat', 'ground-protection', 'x'), null);
});
