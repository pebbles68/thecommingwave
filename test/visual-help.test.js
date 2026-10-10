const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../public/js/visual-help-engine.js');

const root = path.join(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const catalog = read('data/visual-help/entities.json');
const factorMap = read('data/counters/factor-map.json');
const boards = read('data/image-hotspots/boards.json');
const ammoPlans = read('data/image-hotspots/ammo-plans.json');
const turn = read('data/phases/turn-template.json');

const ids = (sel) => sel.templates.map((t) => t.id);

// --- Integridad del catálogo ---

test('catálogo: las plantillas apuntan a fichas, tarjetas y planes que existen y están calibrados', () => {
  const counterIds = new Set(factorMap.counterTemplates.map((t) => t.id));
  const boardTypes = new Set(boards.instances.map((i) => i.type));
  const planUnits = new Set(ammoPlans.instances.map((i) => i.id));
  Object.values(catalog.entities).forEach((e) => {
    assert.ok(e.label && e.summary && e.helpHash.startsWith('#/'), e.id);
    const templateIds = e.templates.map((t) => t.id);
    assert.equal(new Set(templateIds).size, templateIds.length, `${e.id}: ids de plantilla repetidos`);
    e.templates.forEach((t) => {
      if (t.kind === 'counter-template') assert.ok(counterIds.has(t.templateId), `${e.id}/${t.id}: ficha inexistente`);
      else if (t.kind === 'board') assert.ok(boardTypes.has(t.boardType), `${e.id}/${t.id}: sin tarjetas calibradas de tipo ${t.boardType}`);
      else if (t.kind === 'ammo-plan') {
        assert.ok(planUnits.has(t.unitId), `${e.id}/${t.id}: plan sin subzonas calibradas`);
        const file = read(`data/ammunition/${t.dir}/${t.country}.json`);
        assert.ok(['units', 'surfaceShips', 'submarines'].flatMap((k) => file[k] || []).some((u) => u.id === t.unitId), `${e.id}/${t.id}: unidad inexistente en los datos de munición`);
      } else if (t.kind === 'link') assert.ok(t.hash.startsWith('#/'), `${e.id}/${t.id}`);
      else assert.fail(`${e.id}/${t.id}: tipo de plantilla desconocido ${t.kind}`);
    });
    Object.entries(e.subsets || {}).forEach(([sid, subset]) => {
      assert.ok(subset.label && subset.templates.length, `${e.id}/${sid}`);
      subset.templates.forEach((tid) => assert.ok(templateIds.includes(tid), `${e.id}/${sid}: plantilla ${tid} inexistente`));
    });
  });
});

test('catálogo: todas las plantillas de ficha del sistema están en alguna entidad (cobertura completa)', () => {
  const covered = new Set(Object.values(catalog.entities).flatMap((e) => e.templates.filter((t) => t.kind === 'counter-template').map((t) => t.templateId)));
  factorMap.counterTemplates.forEach((t) => assert.ok(covered.has(t.id), `ficha sin entidad en el catálogo: ${t.id}`));
});

test('catálogo: cubre aeródromos, puertos, C4I, unidades aéreas, terrestres, de superficie, submarinos, helicópteros, planes y munición', () => {
  ['airfield-board', 'port-board', 'command-board', 'air-unit', 'ground-unit', 'surface-unit', 'submarine-unit', 'low-altitude-unit', 'attack-plan', 'munition-type']
    .forEach((id) => assert.ok(catalog.entities[id], id));
});

// --- Selección por contexto (TUR-010) ---

test('entidad concreta conocida: solo esa plantilla', () => {
  const sel = Engine.selectTemplates(catalog, { entityType: 'air-unit', templateId: 'aircraft-special-awacs' });
  assert.equal(sel.status, 'concrete');
  assert.deepEqual(ids(sel), ['aircraft-special-awacs']);
  assert.equal(sel.genericExample, false);
});

test('tipo restringido por la regla: solo las plantillas del subconjunto (un combate aéreo de avión de combate no muestra transporte, EW ni otros)', () => {
  const sel = Engine.selectTemplates(catalog, { entityType: 'air-unit', subsetIds: ['combat'] });
  assert.equal(sel.status, 'restricted');
  assert.deepEqual(ids(sel), ['aircraft-combat-tactical']);
  assert.equal(sel.genericExample, false);
  const tactical = Engine.selectTemplates(catalog, { entityType: 'air-unit', subsetIds: ['tactical'] });
  assert.deepEqual(ids(tactical), ['aircraft-combat-tactical', 'aircraft-transport-tactical']);
  const both = Engine.selectTemplates(catalog, { entityType: 'ground-unit', subsetIds: ['main', 'technical'] });
  assert.equal(both.templates.length, catalog.entities['ground-unit'].templates.length);
});

test('referencia genérica («unidades aéreas»): todos los tipos del dominio, marcada como ejemplo genérico', () => {
  const sel = Engine.selectTemplates(catalog, { entityType: 'air-unit', scope: 'generic' });
  assert.equal(sel.status, 'generic');
  assert.equal(sel.genericExample, true);
  assert.deepEqual(ids(sel), catalog.entities['air-unit'].templates.map((t) => t.id));
  assert.equal(sel.templates.length, 5);
  // Las unidades de superficie genéricas incluyen buques, portaaviones y transportes.
  assert.equal(Engine.selectTemplates(catalog, { entityType: 'surface-unit', scope: 'generic' }).templates.length, 4);
});

test('contexto insuficiente: no se elige el primero arbitrariamente; se ofrece el conjunto completo declarándolo', () => {
  const sel = Engine.selectTemplates(catalog, { entityType: 'ground-unit' });
  assert.equal(sel.status, 'missing-context');
  assert.equal(sel.missingContext, true);
  assert.equal(sel.templates.length, catalog.entities['ground-unit'].templates.length);
  assert.ok(sel.templates.length > 1);
});

test('entidad o plantilla desconocida: no se inventa nada', () => {
  assert.equal(Engine.selectTemplates(catalog, { entityType: 'nave-espacial', scope: 'generic' }).status, 'unknown-entity');
  assert.equal(Engine.selectTemplates(catalog, { entityType: 'air-unit', templateId: 'no-existe' }).templates.length, 0);
  assert.equal(Engine.selectTemplates(catalog, { entityType: 'air-unit', subsetIds: ['no-existe'] }).templates.length, 0);
  assert.equal(Engine.selectTemplates(null, { entityType: 'air-unit' }).status, 'unknown-entity');
});

test('un factor pedido por un wizard filtra a las fichas que lo tienen, todas con el mismo factor', () => {
  const withFactor = (factor, entity) => factorMap.counterTemplates
    .filter((t) => catalog.entities[entity].templates.some((c) => c.templateId === t.id) && t.factors.some((f) => f.factor === factor)).map((t) => t.id);
  const sel = Engine.selectTemplates(catalog, { entityType: 'ground-unit', scope: 'generic', factorId: 'protection' }, { factorMap });
  assert.deepEqual(sel.templates.map((t) => t.templateId), withFactor('protection', 'ground-unit'));
  assert.ok(sel.templates.length >= 2, 'varias plantillas compatibles con el factor');
  // Restringido y con factor: solo el subconjunto que además lo tiene.
  const combat = Engine.selectTemplates(catalog, { entityType: 'air-unit', subsetIds: ['combat'], factorId: 'air_combat' }, { factorMap });
  assert.deepEqual(ids(combat), ['aircraft-combat-tactical']);
  // Un factor que ninguna ficha del conjunto tiene: ayuda pendiente, sin zona aproximada.
  const none = Engine.selectTemplates(catalog, { entityType: 'air-unit', subsetIds: ['combat'], factorId: 'torpedoes' }, { factorMap });
  assert.equal(none.status, 'no-compatible');
  assert.equal(none.templates.length, 0);
});

// --- Referencias declarativas en el contenido (TUR-009) ---

test('splitTextWithRefs sustituye cada marcador por su referencia y deja el resto intacto', () => {
  const refs = [{ id: 'a', label: 'fichas de aeródromo', entityType: 'airfield-board' }];
  const parts = Engine.splitTextWithRefs('Planifica en las [[a]] y sigue. [[x]]', refs);
  assert.deepEqual(parts.map((p) => p.type), ['text', 'ref', 'text']);
  assert.equal(parts[1].ref.entityType, 'airfield-board');
  assert.equal(parts.map((p) => (p.type === 'text' ? p.text : '')).join(''), 'Planifica en las  y sigue. [[x]]', 'un marcador sin referencia queda literal');
  assert.deepEqual(Engine.splitTextWithRefs('sin marcadores', refs), [{ type: 'text', text: 'sin marcadores' }]);
});

test('turn-template: toda mención [[id]] tiene su entityRef, todo entityRef se usa y apunta a una entidad del catálogo', () => {
  let total = 0;
  Object.values(turn.subphases).forEach((sub) => {
    const used = [...sub.help.matchAll(/\[\[([a-z0-9-]+)\]\]/g)].map((m) => m[1]);
    const declared = (sub.entityRefs || []).map((r) => r.id);
    assert.deepEqual([...new Set(used)].sort(), [...new Set(declared)].sort(), `${sub.id}: menciones y entityRefs no coinciden`);
    (sub.entityRefs || []).forEach((r) => {
      total += 1;
      assert.ok(catalog.entities[r.entityType], `${sub.id}/${r.id}: entidad ${r.entityType} inexistente`);
      assert.ok(r.label, `${sub.id}/${r.id}: sin etiqueta`);
      // La referencia debe poder resolverse a plantillas concretas.
      assert.ok(Engine.selectTemplates(catalog, r).templates.length > 0, `${sub.id}/${r.id}: sin plantillas`);
    });
  });
  assert.ok(total >= 10, 'cobertura mínima de menciones');
  // El texto visible no contiene marcadores sin resolver.
  assert.equal(JSON.stringify(Object.values(turn.phases)).includes('[['), false);
});

// --- Letra del Nivel de Reacción en las fichas (TUR-004) ---

test('factorIds: un mismo valor impreso con otro nombre según la ficha se resuelve en todas las fichas terrestres que lo tienen', () => {
  const ref = turn.band.groundReactionRef;
  assert.equal(ref.entityType, 'ground-unit');
  assert.deepEqual(ref.factorIds, ['initiative', 'mobile_or_fixed']);
  const sel = Engine.selectTemplates(catalog, ref, { factorMap });
  const expected = factorMap.counterTemplates.filter((t) => t.id.startsWith('ground-') && t.factors.some((f) => ref.factorIds.includes(f.factor))).map((t) => t.id);
  assert.deepEqual(sel.templates.map((t) => t.templateId), expected);
  assert.ok(expected.includes('ground-main') && expected.includes('ground-tech-fire') && expected.includes('ground-tech-heliport'));
  assert.equal(sel.genericExample, true);
  assert.deepEqual(Engine.wantedFactors({ factorId: 'x' }), ['x']);
  assert.deepEqual(Engine.wantedFactors({}), []);
});

test('Nivel de Reacción: la zona de cada ficha está calibrada y es la misma letra (initiative / mobile_or_fixed, abajo a la derecha)', () => {
  const counters = read('data/image-hotspots/counters.json');
  const ids = Engine.selectTemplates(catalog, turn.band.groundReactionRef, { factorMap }).templates.map((t) => t.templateId);
  ids.forEach((id) => {
    const inst = counters.instances.find((i) => i.id === id);
    const tpl = factorMap.counterTemplates.find((t) => t.id === id);
    const factor = tpl.factors.find((f) => turn.band.groundReactionRef.factorIds.includes(f.factor));
    assert.equal(factor.position, 'bottom-right', `${id}: la letra va abajo a la derecha`);
    const h = inst.hotspots.find((x) => x.id === factor.factor);
    assert.ok(h && h.rect, `${id}: zona del Nivel de Reacción sin calibrar`);
  });
});
