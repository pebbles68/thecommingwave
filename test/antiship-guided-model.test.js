// Tests del modelo de dominio del wizard de Ataque Guiado
// (public/js/antiship-guided-model.js, correcciones03.md COR03-006): el estado
// y los cálculos extraídos de views/antiship-guided-wizard.js, ahora
// ejecutables en Node sin DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const model = require('../public/js/antiship-guided-model.js');
const tableEngine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));

const workflow = readJson('workflows/07_ataque_antibuque_guiado.json');
const page03 = readJson('tables/page-03.json');
const page04 = readJson('tables/page-04.json');
const page21 = readJson('tables/page-21.json');
const interceptionTable = tableEngine.findTableInPage(page04, 'munition-interception-standard').table;
const areaAirDefenseAttackTable = tableEngine.findTableInPage(page03, 'ground-guided-area-air-defense').table;
const vefTable = tableEngine.findTableInPage(page21, 'antiship-guided-vef-modifier').table;
const multTable = tableEngine.findTableInPage(page21, 'antiship-guided-attack-multiplier').table;

test('freshAntishipWizardState: empieza en el paso 0 con una entrada por etapa y un estado nuevo cada vez', () => {
  const a = model.freshAntishipWizardState();
  const b = model.freshAntishipWizardState();
  assert.equal(a.step, 0);
  assert.equal(model.WIZARD_STEPS.length, 6);
  assert.deepEqual(Object.keys(a.stageAnswers), ['area_defense', 'area_air_defense', 'munition_interception', 'fleet_electronic_resistance', 'attack_method']);
  a.interceptionShips.push({ aa: '2', roll: '4' });
  assert.equal(b.interceptionShips.length, 1, 'los estados no comparten referencias mutables');
});

test('methodLabel: lee la etiqueta de la opción y, si no existe, devuelve el propio valor', () => {
  const opts = [{ value: 'subsonic', label: 'Subsónico' }];
  assert.equal(model.methodLabel(opts, 'subsonic'), 'Subsónico');
  assert.equal(model.methodLabel(opts, 'otro'), 'otro');
});

test('getWizardStage: localiza una etapa del workflow por id', () => {
  assert.equal(model.getWizardStage(workflow, 'attack_method').id, 'attack_method');
  assert.equal(model.getWizardStage(workflow, 'no-existe'), undefined);
});

test('computeAttackValueAfterDefenses: interceptación del golden test (A.A.=2 y A.A.=4, tirada 4 mod. -2) -> 6 + 0 + (-3) = 3', () => {
  const s = model.freshAntishipWizardState();
  s.baseAttackValue = 6;
  s.stageAnswers.munition_interception = { interception_performance: 'low', detection_state: 'attacker' };
  s.interceptionShips = [{ aa: '2', roll: '4' }, { aa: '4', roll: '4' }];
  const r = model.computeAttackValueAfterDefenses(workflow, s, interceptionTable, areaAirDefenseAttackTable);
  assert.equal(r.stage1Reduction, 0, 'munición no marcada CM/BM: la etapa de Defensa Aérea de Área no aplica');
  assert.equal(r.interceptionReduction, -3);
  assert.equal(r.total, 3);
});

test('computeStage1Reduction: CM/BM sin tirada todavía devuelve "aplica pero sin valor" (no inventa 0)', () => {
  const s = model.freshAntishipWizardState();
  s.stageAnswers.area_air_defense = { munition_marked_cm_or_bm: 'yes' };
  const r = model.computeStage1Reduction(workflow, s, areaAirDefenseAttackTable);
  assert.deepEqual({ applies: r.applies, value: r.value }, { applies: true, value: null });
});

test('computeVefAndMultiplier: sin Valor Electrónico más alto no resuelve nada (todo null, sin lanzar)', () => {
  const s = model.freshAntishipWizardState();
  const r = model.computeVefAndMultiplier(workflow, s, vefTable, multTable);
  assert.equal(r.highest, null);
  assert.equal(r.multiplierResult, null);
});

test('computeImpactAssignmentSummary: golden test — 2 impactos, buque de Protección 2 y otro de 3', () => {
  const s = model.freshAntishipWizardState();
  s.impactAssignment.fleetShips = [
    { id: 'BS-20381', protection: '2', sinkingThreshold: '' },
    { id: 'BS-1164', protection: '3', sinkingThreshold: '' }
  ];
  let sum = model.computeImpactAssignmentSummary(s, 2, 1);
  assert.equal(sum.complete, false);
  assert.equal(sum.survivors.length, 2);
  assert.equal(sum.impactsRemaining, 2);

  s.impactAssignment.rounds.push({ targetId: 'BS-20381', absorbed: 2, damaged: true, sank: true });
  sum = model.computeImpactAssignmentSummary(s, 2, 1);
  assert.equal(sum.impactsRemaining, 0);
  assert.equal(sum.complete, true);
  assert.deepEqual(sum.survivors.map((x) => x.id), ['BS-1164']);
});

test('computeImpactAssignmentSummary: un impacto que no daña a su objetivo termina la resolución (la fuente no describe reintentar)', () => {
  const s = model.freshAntishipWizardState();
  s.impactAssignment.fleetShips = [{ id: 'A', protection: '5', sinkingThreshold: '' }, { id: 'B', protection: '5', sinkingThreshold: '' }];
  s.impactAssignment.rounds.push({ targetId: 'A', absorbed: 0, damaged: false, sank: false });
  const sum = model.computeImpactAssignmentSummary(s, 3, 1);
  assert.equal(sum.haltedByMissedTarget, true);
  assert.equal(sum.complete, true);
});

test('computeInterceptionResult: consumo Bajo por disparo (A.A.=3 -> "2~3") y A.A.=1 no elegible no suma reducción', () => {
  const s = model.freshAntishipWizardState();
  s.stageAnswers.munition_interception = { interception_performance: 'high', detection_state: 'attacker' };
  s.interceptionShips = [
    { aa: '3', roll: '9', consumption: 'low' },
    { aa: '1', roll: '9', consumption: 'low' },
    { aa: '4', roll: '9' } // sin campo consumption (estado guardado antes de existir) = Alto
  ];
  const r = model.computeInterceptionResult(workflow, s, interceptionTable);
  assert.equal(r.shots[0].shot.result.columnLabel, '2~3');
  assert.equal(r.shots[1].shot.notEligible, true);
  assert.equal(r.shots[2].shot.result.columnLabel, '4');
  assert.equal(r.reduction, -1 + -3); // fila 9: Bajo 2~3 = -1; Alto 4 = -3 (el no elegible no suma)
});
