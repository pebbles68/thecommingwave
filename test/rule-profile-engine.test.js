// AJ-010: perfiles básico/expansión antes de activar un selector en la interfaz.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../public/js/rule-profile-engine.js');

const DATA = path.join(__dirname, '..', 'data');

function collectFlagged(node, found, trail) {
  if (Array.isArray(node)) { node.forEach((n, i) => collectFlagged(n, found, `${trail}[${i}]`)); return; }
  if (node && typeof node === 'object') {
    if (node.expansionOnly === true || node.optionalRule === true) found.push({ trail, node });
    Object.keys(node).forEach((k) => collectFlagged(node[k], found, `${trail}.${k}`));
  }
}

test('el perfil básico oculta lo que solo existe con la expansión y las reglas opcionales; la expansión muestra lo primero', () => {
  const exp = { id: 'a', expansionOnly: true };
  const opt = { id: 'b', optionalRule: true };
  const plain = { id: 'c' };
  assert.deepEqual(P.filterAvailable([exp, opt, plain], P.BASIC).map((i) => i.id), ['c']);
  assert.deepEqual(P.filterAvailable([exp, opt, plain], P.EXPANSION).map((i) => i.id), ['a', 'c']);
  assert.deepEqual(P.filterAvailable([exp, opt, plain], { expansion: true, optionalRules: true }).map((i) => i.id), ['a', 'b', 'c']);
  assert.equal(P.isAvailable(exp), false, 'sin perfil se asume el básico');
});

test('los datos marcados como expansión u opcionales son localizables, y el perfil básico los excluye todos', () => {
  const files = ['counters/factor-map.json', 'rules/decision-book-excerpts.json'];
  const flagged = [];
  files.forEach((f) => collectFlagged(JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')), flagged, f));
  assert.ok(flagged.length >= 20, `solo ${flagged.length} elementos marcados`);
  flagged.forEach(({ trail, node }) => {
    assert.equal(P.isAvailable(node, P.BASIC), false, `${trail}: debería excluirse del perfil básico`);
    assert.equal(P.isAvailable(node, { expansion: true, optionalRules: true }), true, `${trail}: debería estar con todo activado`);
    assert.ok(node.factor || node.id || node.title || node.label || node.topic, `${trail}: elemento marcado sin identificador legible`);
  });
});

test('las marcas de expansión de las fichas son booleanos verdaderos (nunca cadenas ni 0/1)', () => {
  const raw = fs.readFileSync(path.join(DATA, 'counters', 'factor-map.json'), 'utf8');
  const bad = raw.match(/"expansionOnly":\s*(?!true\b)[^,\s}]+/g);
  assert.equal(bad, null, `valores no booleanos: ${bad}`);
});

test('normalize: cualquier valor raro vuelve al perfil básico; solo true activa', () => {
  assert.deepEqual(P.normalize(null), { id: 'basic', expansion: false, optionalRules: false });
  assert.deepEqual(P.normalize('x'), { id: 'basic', expansion: false, optionalRules: false });
  assert.deepEqual(P.normalize({ expansion: 1, optionalRules: 'true' }), { id: 'basic', expansion: false, optionalRules: false });
  assert.deepEqual(P.normalize({ expansion: true, optionalRules: true }), { id: 'expansion', expansion: true, optionalRules: true });
});

test('port-logistics.json: la reparación de buques (9.9.4) está marcada como regla opcional y es la única', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(DATA, 'rules', 'port-logistics.json'), 'utf8'));
  assert.deepEqual(rules.operations.filter((o) => o.optionalRule).map((o) => o.value), ['ship_repair']);
  assert.deepEqual(P.filterAvailable(rules.operations, P.BASIC).map((o) => o.value), ['ammo_resupply', 'emergency_repair', 'ammo_depletion', 'supply_node_decay']);
});

test('rule-profile.json: un interruptor por cada marca que entiende el motor, con texto y fuente', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(DATA, 'rules', 'rule-profile.json'), 'utf8'));
  assert.deepEqual(doc.toggles.map((t) => t.key), ['expansion', 'optionalRules']);
  doc.toggles.forEach((t) => assert.ok(t.label && t.question && t.yes && t.no));
  assert.ok(doc.sourceRefs.length >= 1);
});

test('las marcas de perfil solo aparecen en archivos de datos conocidos y siempre como booleano verdadero', () => {
  const known = new Set(['counters/factor-map.json', 'rules/decision-book-excerpts.json', 'rules/port-logistics.json', 'rules/cyber-attack.json', 'rules/space-war.json', 'phases/turn-template.json']);
  const found = new Set();
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) { walk(full); return; }
    if (!d.name.endsWith('.json')) return;
    const flagged = [];
    collectFlagged(JSON.parse(fs.readFileSync(full, 'utf8')), flagged, d.name);
    if (flagged.length) found.add(path.relative(DATA, full).split(path.sep).join('/'));
  });
  walk(DATA);
  assert.deepEqual([...found].sort(), [...known].sort(), 'un archivo nuevo con marcas de perfil debe añadirse aquí y tener su prueba de separación');
});
