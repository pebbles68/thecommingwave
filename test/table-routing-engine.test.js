const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/table-routing-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, relPath), 'utf8'));
}

const routing = readJson('routing/table-routing.json');
const tablesIndex = readJson('tables/index.json');

test('walkTableRouting: pregunta raíz cuando no se ha elegido ninguna opción', () => {
  const walk = engine.walkTableRouting(routing, []);
  assert.equal(walk.node.question, '¿A qué atacamos?');
  assert.equal(walk.trail.length, 0);
});

test('walkTableRouting: desciende a la siguiente pregunta y acumula el trail', () => {
  const walk = engine.walkTableRouting(routing, ['mar', 'lejano']);
  assert.equal(walk.node.question, 'Guiado / No Guiado');
  assert.deepEqual(walk.trail.map((t) => t.value), ['mar', 'lejano']);
  assert.equal(walk.trail[0].label, 'Mar');
});

test('walkTableRouting: llega al leaf del golden test (Mar > Lejano > Guiado)', () => {
  const walk = engine.walkTableRouting(routing, ['mar', 'lejano', 'guiado']);
  assert.ok(walk.leaf, 'debería haber alcanzado un leaf');
  assert.equal(walk.leaf.workflowId, 'antiship_guided');
  assert.equal(walk.trail.length, 3);
});

test('walkTableRouting: leaf sin workflow (Estratégico > Logística) con tableFile directo', () => {
  const walk = engine.walkTableRouting(routing, ['estrategico', 'logistica']);
  assert.equal(walk.leaf.workflowId, null);
  assert.equal(walk.leaf.tableFile, 'data/tables/page-32.json#army-logistics-resupply');
});

test('walkTableRouting: valor de opción inexistente devuelve error explícito, no una rama arbitraria', () => {
  const walk = engine.walkTableRouting(routing, ['tierra', 'no-existe']);
  assert.ok(walk.error);
  assert.match(walk.error, /no existe/);
});

test('walkTableRouting: segmentos sobrantes tras alcanzar un leaf se ignoran (el leaf ya resuelve la ruta)', () => {
  const walk = engine.walkTableRouting(routing, ['tierra', 'cercano', 'valor-extra']);
  assert.ok(walk.leaf, 'debería devolver el leaf de "cercano" sin lanzar por el segmento sobrante');
  assert.equal(walk.leaf.workflowId, 'ground_close_combat');
  assert.equal(walk.trail.length, 2);
});

test('parseTableFileRef: separa archivo (sin prefijo data/tables/) e id de tabla', () => {
  const ref = engine.parseTableFileRef('data/tables/page-32.json#army-logistics-resupply');
  assert.deepEqual(ref, { file: 'page-32.json', tableId: 'army-logistics-resupply' });
});

test('findTablesForLeaf: leaf con tableFile directo devuelve exactamente esa tabla', () => {
  const walk = engine.walkTableRouting(routing, ['estrategico', 'logistica']);
  const links = engine.findTablesForLeaf(walk.leaf, tablesIndex);
  assert.deepEqual(links, [{ file: 'page-32.json', tableId: 'army-logistics-resupply' }]);
});

test('findTablesForLeaf: leaf con workflowId único (golden test) localiza sus 4 tablas en páginas 21-22', () => {
  const walk = engine.walkTableRouting(routing, ['mar', 'lejano', 'guiado']);
  const links = engine.findTablesForLeaf(walk.leaf, tablesIndex);
  assert.ok(links.some((l) => l.tableId === 'antiship-guided-final-damage' && l.file === 'page-22.json'));
  assert.ok(links.every((l) => l.file === 'page-21.json' || l.file === 'page-22.json'));
  assert.equal(links.length, 4);
});

test('findTablesForLeaf: leaf con workflowId + attackWorkflowId (ASW) une tablas de ambos workflows', () => {
  const walk = engine.walkTableRouting(routing, ['submarino', 'submarino']);
  const links = engine.findTablesForLeaf(walk.leaf, tablesIndex);
  // asw_submarine (ataque, página 30) + asw_search_support (búsqueda, páginas 33-34)
  assert.ok(links.some((l) => l.tableId === 'asw-submarine-vs-submarine-damage'));
  assert.ok(links.some((l) => l.tableId === 'asw-signature-difference-search'));
  assert.ok(links.some((l) => l.tableId === 'asw-air-search-routine'));
});

test('findTablesForLeaf: leaf sin tablas conectadas (o índice ausente) devuelve lista vacía, no lanza', () => {
  const links = engine.findTablesForLeaf({ workflowId: 'workflow-inexistente' }, tablesIndex);
  assert.deepEqual(links, []);
});

test('cada leaf del árbol referencia un workflowId/attackWorkflowId con al menos una tabla, o un tableFile directo', () => {
  // Recorre todo el árbol y verifica que cada leaf tiene al menos una forma
  // válida de llegar a una tabla ya transcrita (evita que el router prometa
  // un resultado que no existe en data/tables/).
  function collectLeaves(node) {
    if (!node || !node.options) return [];
    return node.options.flatMap((opt) => (opt.leaf ? [opt.leaf] : collectLeaves(opt.next)));
  }
  const leaves = collectLeaves(routing.root);
  assert.ok(leaves.length > 0);
  leaves.forEach((leaf) => {
    const links = engine.findTablesForLeaf(leaf, tablesIndex);
    assert.ok(links.length > 0, `leaf sin tablas conectadas: ${JSON.stringify(leaf)}`);
  });
});
