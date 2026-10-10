'use strict';
// Integridad de data/image-hotspots/ (ajuste_imagenes.md §6 y §10): geometría normalizada,
// hash y dimensiones de las imágenes, conceptos existentes y ninguna zona "verified" sin revisión.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const counters = read('data/image-hotspots/counters.json');
const concepts = read('data/image-hotspots/concepts.json');
const factorMap = read('data/counters/factor-map.json');
const STATUSES = new Set(concepts.statuses);

test('catálogo: ids únicos, estados válidos y cobertura de factorVocabulary', () => {
  const ids = concepts.concepts.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), Object.keys(factorMap.factorVocabulary).sort());
  concepts.concepts.forEach((c) => {
    assert.ok(STATUSES.has(c.status), c.id);
    assert.ok(c.label && c.summary, c.id);
    assert.notEqual(c.status, 'verified', `${c.id}: verified solo lo marca el mantenedor tras revisión`);
    if (c.status === 'generated') assert.ok(c.sourceRefs.length > 0, `${c.id}: resumen sin fuente`);
  });
});

test('imágenes: el hash y las dimensiones coinciden con el archivo', () => {
  Object.entries(counters.images).forEach(([id, img]) => {
    const buf = fs.readFileSync(path.join(root, img.src));
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), img.sha256, id);
    const dims = factorMap.sourceImages[id];
    assert.equal(img.width, dims.widthPx);
    assert.equal(img.height, dims.heightPx);
  });
});

test('instancias: una por plantilla, un hotspot por factor, geometría normalizada y conceptos existentes', () => {
  const conceptIds = new Set(concepts.concepts.map((c) => c.id));
  const imageIds = new Set(Object.keys(counters.images));
  const templates = new Map(factorMap.counterTemplates.map((t) => [t.id, t]));
  assert.equal(counters.instances.length, templates.size);
  let total = 0;
  counters.instances.forEach((inst) => {
    const tpl = templates.get(inst.id);
    assert.ok(tpl, `plantilla desconocida ${inst.id}`);
    assert.ok(imageIds.has(inst.imageId));
    assert.deepEqual(inst.hotspots.map((h) => h.id).sort(), tpl.factors.map((f) => f.factor).sort(), inst.id);
    inst.hotspots.forEach((h) => {
      total += 1;
      assert.ok(conceptIds.has(h.conceptId), h.conceptId);
      assert.ok(STATUSES.has(h.reviewStatus));
      if (h.reviewStatus === 'verified') assert.ok(h.reviewedBy && h.reviewedAt && h.rect, `${inst.id}/${h.id}: verified exige reviewedBy, reviewedAt y caja`);
      if (h.rect) {
        const { x, y, width, height } = h.rect;
        assert.ok(width > 0 && height > 0);
        assert.ok(x >= 0 && y >= 0 && x + width <= 1.0001 && y + height <= 1.0001, `${inst.id}/${h.id} fuera de imagen`);
      } else {
        assert.notEqual(h.reviewStatus, 'generated', `${inst.id}/${h.id}: sin caja no puede figurar como generada`);
      }
    });
  });
  assert.equal(total, 175);
});

test('las imágenes de control existen para cada plantilla calibrada', () => {
  counters.instances.forEach((inst) => {
    const calibrated = inst.hotspots.some((h) => h.rect);
    if (calibrated) {
      assert.ok(fs.existsSync(path.join(root, 'docs/image-hotspots/review/counters', `${inst.id}.png`)), inst.id);
    }
  });
});

test('resúmenes de uso: los conceptos con resumen citan documento registrado y páginas; los pendientes lo declaran', () => {
  const sources = read('data/sources/sources.json').sources;
  const filenames = new Set(sources.map((s) => s.filename));
  const generated = concepts.concepts.filter((c) => c.status === 'generated');
  const pending = concepts.concepts.filter((c) => c.status === 'needs_review');
  assert.ok(generated.length >= 30, 'cobertura mínima de resúmenes');
  generated.forEach((c) => {
    assert.ok(c.summary.split(/\s+/).length >= 8 && c.summary.split(/\s+/).length <= 60, `${c.id}: longitud del resumen`);
    c.sourceRefs.forEach((r) => {
      assert.ok(filenames.has(r.document), `${c.id}: documento no registrado`);
      assert.ok(/^\d/.test(r.pages || ''), `${c.id}: falta página`);
    });
  });
  pending.forEach((c) => assert.match(c.summary, /pendiente|Expansiones futuras/i, c.id));
  // Un factor de las expansiones se deja con su nombre y el texto «A completar con las Expansiones futuras».
  concepts.concepts.filter((c) => /Expansiones futuras/.test(c.summary)).forEach((c) => {
    assert.equal(c.basicOrExpansion, 'expansion', c.id);
    assert.equal(c.status, 'needs_review', c.id);
  });
});
