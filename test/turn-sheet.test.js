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
  assert.ok(box.items.some((i) => i.hash === '#/turno-comentado/fase/1/air-1/paralisis_red'));
  assert.equal(box.pageHash, '#/turno-comentado/fase/1/air-1');
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

const help = JSON.parse(fs.readFileSync(path.join(root, 'data/phases/commented-turn-help.json'), 'utf8'));
const boards = JSON.parse(fs.readFileSync(path.join(root, 'data/image-hotspots/boards.json'), 'utf8'));

test('ayuda gráfica del Turno Comentado: subfases y zonas de tarjeta existentes, con fuente', () => {
  assert.ok(help.sourceRefs.length);
  Object.entries(help.subphaseVisuals).forEach(([subId, visual]) => {
    assert.ok(template.subphases[subId], `subfase inexistente: ${subId}`);
    const inst = boards.instances.filter((i) => i.type === visual.boardType);
    assert.ok(inst.length, `sin tarjetas de tipo ${visual.boardType}`);
    visual.hotspots.forEach((decl) => {
      assert.ok(inst.every((i) => i.hotspots.some((h) => h.id === decl.id)), `zona ${decl.id} no está en todas las tarjetas ${visual.boardType}`);
      assert.ok(decl.label, decl.id);
    });
  });
});

test('Planificación, recuperación y preparación declaran las zonas pedidas por el mantenedor', () => {
  const ids = (sub) => help.subphaseVisuals[sub].hotspots.map((h) => h.id);
  ['emergency-scramble', 'mission-air-superiority', 'mission-on-call', 'mission-air-strike', 'mission-special', 'ready-to-launch'].forEach((id) => assert.ok(ids('planificacion_misiones').includes(id), id));
  assert.ok(ids('recuperacion_largas').includes('landing-damaged'));
  assert.ok(ids('recuperacion_cortas').includes('landing-damaged'));
  assert.deepEqual(ids('preparacion_aerodromo'), ['landing-waiting', 'ready-to-launch']);
});

test('buildSegmentPage: Aire I con subfases, recordatorios y ayuda gráfica', () => {
  const page = Engine.buildSegmentPage(template, 1, 'air-1', help);
  assert.ok(page.subphases.length >= 6);
  assert.ok(page.reminders.some((r) => r.hash === '#/turno/mando/day-odd'));
  assert.ok(page.subphases.find((s) => s.id === 'planificacion_misiones').visual);
  assert.equal(Engine.buildSegmentPage(template, 2, 'ground', help), null);
  assert.equal(Engine.buildSegmentPage(template, 2, 'air-1', help).reminders.some((r) => r.hash.startsWith('#/turno/mando/')), false);
});

test('las guías enlazadas desde las subfases existen en data/guides/combat-steps.json', () => {
  const guides = JSON.parse(fs.readFileSync(path.join(root, 'data/guides/combat-steps.json'), 'utf8')).guides.map((g) => g.id);
  Object.entries(help.subphaseGuides).forEach(([subId, list]) => {
    assert.ok(template.subphases[subId], subId);
    list.forEach((g) => assert.ok(guides.includes(g.guideId), g.guideId));
  });
  const page = Engine.buildSegmentPage(template, 1, 'air-1', help);
  assert.deepEqual(page.subphases.find((x) => x.id === 'salidas_combate').guides.map((g) => g.hash), ['#/guia/air-attack']);
});
