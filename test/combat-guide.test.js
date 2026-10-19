'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../public/js/combat-guide-engine.js');

const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/guides/combat-steps.json'), 'utf8'));
const missions = JSON.parse(fs.readFileSync(path.join(root, 'data/missions/air-missions.json'), 'utf8'));
const appJs = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
const coreJs = fs.readFileSync(path.join(root, 'public/js/core.js'), 'utf8');

// Un enlace es válido si apunta a un wizard registrado, a una ayuda o a una página de turno/guía conocidas.
const isKnownHash = (hash) => {
  const wizard = hash.match(/^#\/wizard\/([a-z-]+)$/);
  if (wizard) return coreJs.includes(`'#/wizard/${wizard[1]}'`) || appJs.includes(wizard[1]);
  return /^#\/(ayuda|turno|turno-comentado|guia)(\/|$)/.test(hash);
};

test('guías de combate: estructura, fuentes, misiones y enlaces válidos', () => {
  assert.deepEqual(Engine.validateGuides(data, missions, isKnownHash), []);
});

test('guía del ataque aéreo: los cuatro pasos del mantenedor en orden', () => {
  const guide = Engine.getGuide(data, 'air-attack');
  const steps = Engine.buildSteps(guide, missions);
  assert.deepEqual(steps.map((s) => s.id), ['attacker-mission', 'defense-detection', 'bvr', 'wvr']);
  assert.deepEqual(steps[0].missions.map((m) => m.id).sort(), ['air-strike', 'caps', 'ink']);
});

test('el paso del BVR explica la tirada de penetración e interceptación y enlaza con los wizards', () => {
  const bvr = Engine.buildSteps(Engine.getGuide(data, 'air-attack'), missions).find((s) => s.id === 'bvr');
  assert.equal(bvr.status, 'verified');
  assert.equal(bvr.pending, undefined);
  assert.match(bvr.explanation, /misma tirada que la de penetración/);
  assert.match(bvr.explanation, /Diferencia de Iniciativa/);
  assert.ok(bvr.links.some((l) => l.hash === '#/wizard/air-combat-bvr'));
});

test('validateGuides detecta pasos sin fuente y misiones inexistentes', () => {
  const bad = { guides: [{ id: 'x', intro: 'i', steps: [{ id: 'a', order: 1, question: 'q', explanation: 'e', sourceRefs: [], status: 'verified', missionRefs: ['no-existe'], links: [] }] }] };
  const errors = Engine.validateGuides(bad, missions, isKnownHash);
  assert.ok(errors.some((e) => /sin fuente/.test(e)));
  assert.ok(errors.some((e) => /misión inexistente/.test(e)));
});

test('la detección del ataque aéreo recoge las aclaraciones del mantenedor', () => {
  const steps = Engine.buildSteps(Engine.getGuide(data, 'air-attack'), missions);
  assert.equal(steps.some((s) => s.id === 'awacs-target'), false);
  const text = steps.find((s) => s.id === 'defense-detection').clarifications.join(' ');
  assert.match(text, /Air Strike.*CAPs o BARCAPs/);
  assert.match(text, /mismo hexágono que el objetivo/);
  assert.match(text, /AWACS es solo un ejemplo/);
  assert.match(text, /no se aplica a la salida de emergencia/);
  assert.match(text, /MPA/);
});

test('guía de reacción terrestre: el orden acordado y los textos de los datos de reacciones', () => {
  const steps = Engine.buildSteps(Engine.getGuide(data, 'ground-reaction'), missions);
  assert.deepEqual(steps.map((s) => s.id), ['brief-action', 'detected', 'who-reacts', 'which-reaction']);
  const reactions = JSON.parse(fs.readFileSync(path.join(root, 'data/rules/ground-reactions.json'), 'utf8'));
  ['cf', 'as', 'kb', 'bai'].forEach((id) => assert.ok(reactions.reactions.some((r) => r.id === id), id));
  assert.ok(steps[3].links.some((l) => l.hash === '#/wizard/ground-reaction'));
});
