'use strict';
// Integridad de data/image-hotspots/boards.json y board-concepts.json (ajuste_imagenes.md IMG-003/004/005):
// hash y dimensiones de las 32 páginas, geometría normalizada, conceptos existentes y ninguna
// zona verified sin revisión humana registrada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const boards = read('data/image-hotspots/boards.json');
const concepts = read('data/image-hotspots/board-concepts.json');
const profiles = read('scripts/image-hotspots/profiles/boards-profiles.json');
const pagesIndex = read('data/phases/source-images/index.json');
const STATUSES = new Set(concepts.statuses);

const inUnit = (v) => typeof v === 'number' && v >= -0.02 && v <= 1.02;

test('catálogo de zonas de tarjetas: ids únicos, estados válidos y sin verified sin revisión', () => {
  const ids = concepts.concepts.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  concepts.concepts.forEach((c) => {
    assert.ok(c.label && c.summary, c.id);
    assert.ok(STATUSES.has(c.status), c.id);
    assert.notEqual(c.status, 'verified', `${c.id}: verified solo tras revisión del mantenedor`);
    assert.ok(c.sourceRefs.length > 0, `${c.id} sin fuente`);
  });
});

test('las 32 páginas de aeródromos y puertos están en el esquema con su hash y dimensiones', () => {
  const expected = [...pagesIndex.aerodromos, ...pagesIndex.puertos].map((p) => p.image).sort();
  assert.deepEqual(Object.keys(boards.images).sort(), expected);
  assert.equal(expected.length, 32);
  Object.entries(boards.images).forEach(([id, img]) => {
    const buf = fs.readFileSync(path.join(root, img.src));
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), img.sha256, id);
    assert.ok(img.width > 0 && img.height > 0);
  });
});

test('instancias: tipo con perfil, zonas del perfil, geometría dentro de la página y conceptos existentes', () => {
  const conceptIds = new Set(concepts.concepts.map((c) => c.id));
  const ids = boards.instances.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  boards.instances.forEach((inst) => {
    const type = profiles.types[inst.type];
    assert.ok(type, `tipo sin perfil: ${inst.type}`);
    assert.ok(boards.images[inst.imageId], inst.imageId);
    assert.deepEqual(inst.hotspots.map((h) => h.id), type.zones.map((z) => z.id), inst.id);
    assert.ok(STATUSES.has(inst.reviewStatus));
    assert.equal(inst.polygon.length, 4);
    [inst, ...inst.hotspots].forEach((g) => {
      const { x, y, width, height } = g.rect;
      assert.ok(width > 0 && height > 0 && inUnit(x) && inUnit(y) && inUnit(x + width) && inUnit(y + height), `${inst.id}/${g.id || ''} fuera de página`);
      g.polygon.forEach(([px, py]) => assert.ok(inUnit(px) && inUnit(py)));
    });
    inst.hotspots.forEach((h) => {
      assert.ok(conceptIds.has(h.conceptId), h.conceptId);
      assert.ok(STATUSES.has(h.reviewStatus));
      if (h.reviewStatus === 'verified') assert.ok(h.reviewedBy && h.reviewedAt, `${inst.id}/${h.id}`);
    });
  });
});

test('cobertura: tarjetas localizadas por tipo y por página', () => {
  const byType = {};
  boards.instances.forEach((i) => { byType[i.type] = (byType[i.type] || 0) + 1; });
  assert.ok(byType.airfield >= 30, 'aeródromos');
  assert.ok(byType.port >= 20, 'puertos');
  assert.ok(byType.heliport >= 8, 'helipuertos');
  assert.ok(byType.command >= 2, 'mandos');
  assert.ok(byType.strategy >= 1, 'estratégica');
  const pagesWithCards = new Set(boards.instances.map((i) => i.imageId));
  assert.equal(pagesWithCards.size, 32, 'toda página tiene al menos una tarjeta localizada');
});

test('las imágenes de control existen para cada página con tarjetas', () => {
  Object.keys(boards.images).forEach((id) => {
    const qa = `docs/image-hotspots/review/boards/${id.replace('/', '-')}`;
    assert.ok(fs.existsSync(path.join(root, qa)), qa);
  });
});

test('wizard-visual-refs: cada entityRef de tarjeta apunta a un tipo de tarjeta calibrado y a una zona que existe', () => {
  const catalog = read('data/visual-help/entities.json');
  const refs = read('data/rules/wizard-visual-refs.json').entries.filter((e) => e.entityRef && /-board$/.test(e.entityRef.entityType));
  assert.ok(refs.length >= 4);
  refs.forEach((e) => {
    const entity = catalog.entities[e.entityRef.entityType];
    const type = entity.templates[0].boardType;
    const inst = boards.instances.find((i) => i.type === type);
    assert.ok(inst, `${e.id}: sin tarjetas de tipo ${type}`);
    if (e.entityRef.hotspotId) assert.ok(inst.hotspots.some((h) => h.id === e.entityRef.hotspotId), `${e.id}: zona ${e.entityRef.hotspotId} inexistente`);
  });
});

test('conceptos de tarjeta con resumen de uso (generated): citan el Decision Book con sección y páginas y no dicen «aún no está transcrito»', () => {
  const generated = concepts.concepts.filter((c) => c.status === 'generated');
  assert.ok(generated.length >= 25, `solo ${generated.length} conceptos con resumen`);
  generated.forEach((c) => {
    const db = c.sourceRefs.find((r) => /Decision_Book/.test(r.document));
    assert.ok(db && db.section && db.pages, `${c.id}: falta la cita del Decision Book con sección y páginas`);
    assert.doesNotMatch(c.summary, /aún no está transcrito/, c.id);
    const words = c.summary.split(/\s+/).length;
    assert.ok(words >= 10 && words <= 45, `${c.id}: resumen de ${words} palabras`);
  });
});
