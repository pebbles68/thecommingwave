'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Engine = require('../public/js/turn-sheet-engine.js');

const root = path.join(__dirname, '..');
const sheet = JSON.parse(fs.readFileSync(path.join(root, 'data/image-hotspots/turn-sheet.json'), 'utf8'));
const template = JSON.parse(fs.readFileSync(path.join(root, 'data/phases/turn-template.json'), 'utf8'));
const byId = (id) => sheet.zones.find((z) => z.id === id);

test('hoja de turnos: la imagen coincide con el hash y las dimensiones declaradas', () => {
  const file = path.join(root, sheet.image.src);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), sheet.image.sha256);
  assert.ok(sheet.image.width > 0 && sheet.image.height > 0);
});

test('hoja de turnos: las zonas son coherentes con el modelo del turno', () => {
  assert.deepEqual(Engine.validateSheetData(sheet, template), []);
  assert.equal(sheet.zones.length, 41);
});

test('hoja de turnos: ninguna zona es verified sin revisión y las inferidas lo declaran', () => {
  sheet.zones.forEach((z) => {
    assert.notEqual(z.reviewStatus, 'verified', z.id);
    assert.ok(['detected', 'inferred-from-grid'].includes(z.source), z.id);
  });
});

test('Tierra solo existe en las fases 1, 3, 4 y 6', () => {
  [1, 2, 3, 4, 5, 6].forEach((n) => {
    assert.equal(Boolean(byId(`phase-${n}:ground`)), [1, 3, 4, 6].includes(n), `fase ${n}`);
  });
});

test('Aire I menciona Refuerzos siempre y Recuperación de Mando en la primera fase de cada día', () => {
  [1, 2, 3, 4, 5, 6].forEach((n) => {
    const box = Engine.buildToolbox(template, byId(`phase-${n}:air-1`));
    assert.ok(box.extras.some((e) => e.hash === `#/turno/fase/${n}/reinforcements`), `refuerzos fase ${n}`);
    const mando = box.extras.filter((e) => e.hash.startsWith('#/turno/mando/'));
    assert.equal(mando.length, [1, 4].includes(n) ? 1 : 0, `mando fase ${n}`);
  });
});

test('el cuadro de un segmento lista sus subfases del modelo y enlaza su página', () => {
  const box = Engine.buildToolbox(template, byId('phase-1:air-1'));
  assert.ok(box.items.length >= 6);
  assert.ok(box.items.some((i) => i.label === 'Planificación de misiones'));
  assert.ok(box.items.some((i) => i.hash === '#/turno/fase/1/air-1/paralisis_red'));
  assert.equal(box.pageHash, '#/turno/fase/1/air-1');
});

test('Estrategia tiene cinco pasos y Logística está incluida', () => {
  const steps = sheet.zones.filter((z) => z.kind === 'strategy-step');
  assert.equal(steps.length, 5);
  assert.ok(byId('strategy:logistica'));
  assert.equal(Engine.buildToolbox(template, byId('strategy:logistica')).pageHash, '#/turno/fase/0/logistica');
});

test('buildHotspot conserva el estado más débil y el origen de la posición', () => {
  const inferred = sheet.zones.find((z) => z.source === 'inferred-from-grid');
  const hs = Engine.buildHotspot(template, inferred);
  assert.equal(hs.status, 'needs_review');
  assert.match(hs.sourceText, /rejilla/);
});
