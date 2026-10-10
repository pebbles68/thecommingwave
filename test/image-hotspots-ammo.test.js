'use strict';
// Integridad de data/image-hotspots/ammo-plans.json (ajuste_imagenes.md IMG-006): las subzonas solo
// aportan posición; cada una debe corresponder a un plan que existe en los datos de data/ammunition/
// (fuente del cálculo), con la hoja intacta (hash y dimensiones) y nada verified sin revisión.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const plans = read('data/image-hotspots/ammo-plans.json');
const regions = read('data/ammunition/source-pages/unit-regions.json').units;
const STATUSES = new Set(['generated', 'needs_review', 'verified', 'rejected']);
const KINDS = new Set(['header', 'icons', 'full', 'damaged', 'label']);

const units = {};
['attack-plans', 'naval-plans', 'special-unit-plans'].forEach((dir) => {
  ['ch', 'jp', 'kp', 'kr', 'ru', 'us'].forEach((cc) => {
    const d = read(`data/ammunition/${dir}/${cc}.json`);
    ['units', 'surfaceShips', 'submarines'].forEach((k) => (d[k] || []).forEach((u) => { units[u.id] = u; }));
  });
});

test('hojas: hash y dimensiones coinciden con los archivos', () => {
  Object.entries(plans.images).forEach(([name, img]) => {
    const buf = fs.readFileSync(path.join(root, img.src));
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), img.sha256, name);
  });
});

test('cada fila calibrada existe en unit-regions y en los datos, sin ids repetidos', () => {
  const ids = plans.instances.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 40, 'cobertura mínima de filas');
  plans.instances.forEach((inst) => {
    assert.ok(regions[inst.id], `${inst.id} sin región`);
    assert.equal(regions[inst.id].sourceImage, inst.imageId);
    assert.ok(units[inst.id], `${inst.id} sin datos de munición`);
    assert.ok(plans.images[inst.imageId]);
  });
});

test('subzonas: cada zona corresponde a un plan real de los datos y su caja está dentro de la hoja', () => {
  plans.instances.forEach((inst) => {
    const unit = units[inst.id];
    assert.ok(inst.hotspots.length > 0);
    inst.hotspots.forEach((h) => {
      assert.ok(KINDS.has(h.kind), h.id);
      assert.ok(unit.plans[h.block] && unit.plans[h.block][h.plan], `${inst.id}/${h.id}: plan inexistente en los datos`);
      assert.equal(h.id, `${h.block}-${h.plan}-${h.kind}`);
      assert.ok(STATUSES.has(h.reviewStatus));
      if (h.reviewStatus === 'verified') assert.ok(h.reviewedBy && h.reviewedAt, h.id);
      const { x, y, width, height } = h.rect;
      assert.ok(width > 0 && height > 0 && x >= 0 && y >= 0 && x + width <= 1.001 && y + height <= 1.001, `${inst.id}/${h.id} fuera de la hoja`);
    });
    // Un plan de los datos tiene sus cinco zonas.
    const seen = new Set(inst.hotspots.map((h) => `${h.block}-${h.plan}`));
    seen.forEach((k) => assert.equal(inst.hotspots.filter((h) => `${h.block}-${h.plan}` === k).length, 5, `${inst.id}/${k}`));
  });
});

test('filas sin calibrar: motivo explícito y sin geometría aproximada', () => {
  const calibrated = new Set(plans.instances.map((i) => i.id));
  plans.unmatched.forEach((u) => {
    assert.ok(u.reason && u.reason.length > 5, u.id);
    assert.ok(!calibrated.has(u.id), `${u.id} figura como calibrada y como pendiente`);
  });
  assert.equal(calibrated.size + plans.unmatched.length, Object.keys(regions).length);
});

test('hay imagen de control por hoja con filas calibradas', () => {
  new Set(plans.instances.map((i) => i.imageId)).forEach((name) => {
    assert.ok(fs.existsSync(path.join(root, 'docs/image-hotspots/review/ammo-plans', name)), name);
  });
});
