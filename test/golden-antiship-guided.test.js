// Golden test real de Fase 7 (roadmap): carga data/scenarios/golden-antiship-guided.json
// (transcripción de TCW_-_Hoja_de_Ayuda_-_Ataque_Guiado_Superficie.pdf) y reproduce
// sus pasos 1-4 llamando directamente al motor, comprobando que cada valor
// intermedio y el resultado final coinciden con el ejemplo oficial. El paso 5
// (asignación de daño/hundimiento) no está automatizado todavía (ver
// 'automatedInWizard' en el propio escenario) y por eso no se ejercita aquí
// más allá de leer sus valores.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/combat-wizard-engine.js');
const tableEngine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, relPath), 'utf8'));
}

const scenario = readJson('scenarios/golden-antiship-guided.json');
const page04 = readJson('tables/page-04.json');
const page18 = readJson('tables/page-18.json');
const page21 = readJson('tables/page-21.json');
const page22 = readJson('tables/page-22.json');
const diceFormulas = readJson('rules/dice-formulas.json');
const workflow07 = readJson('workflows/07_ataque_antibuque_guiado.json');
// correcciones03.md COR03-002: methodOptions ya no es una constante del
// motor — se lee del propio workflow, igual que hace la aplicación.
const methodOptions = workflow07.stages.find((st) => st.id === 'attack_method').questions.find((q) => q.id === 'method').options;

function step(id) {
  const found = scenario.steps.find((s) => s.id === id);
  assert.ok(found, `step "${id}" no está en el escenario`);
  return found;
}

function table(page, id) {
  const found = tableEngine.findTableInPage(page, id);
  assert.ok(found && found.table, `tabla "${id}" no encontrada`);
  return found.table;
}

test('golden-antiship-guided.json: declara los 6 pasos de la hoja de ayuda con sourceRefs', () => {
  assert.equal(scenario.steps.length, 6);
  scenario.steps.forEach((s) => {
    assert.ok(Array.isArray(s.sourceRefs) && s.sourceRefs.length > 0, `paso "${s.id}" sin sourceRefs`);
  });
});

test('paso 1 (Disparo en Área): engine.resolveAreaAirDefenseShot reproduce los "3 puntos de daño" de la hoja', () => {
  const s = step('step1_area_air_defense_reaction');
  assert.equal(s.matchesWorkflow, false);
  assert.equal(s.automatedInWizard, true);
  const areaAirDefenseTable = table(page18, 'area-air-defense-concentrated-damage');
  const result = engine.resolveAreaAirDefenseShot(areaAirDefenseTable, tableEngine, {
    roll: s.inputs.roll,
    aaValue: s.inputs.groupedAa,
    consumption: s.inputs.ammoConsumption
  });
  assert.equal(Number(result.rawCell), s.expected.damagePoints);
  assert.ok(Number(result.rawCell) < scenario.setup.attacker.protection, 'el avión no debería sufrir daño en el golden test');
});

test('paso 2 (Interceptación de Munición): cada disparo reproduce su reducción exacta', () => {
  const s = step('step2_munition_interception');
  const interceptionTable = table(page04, 'munition-interception-standard');
  const shots = s.shots.map((shotSpec) =>
    engine.resolveInterceptionShot(interceptionTable, tableEngine, {
      roll: shotSpec.roll,
      modifierTotal: s.sharedModifiers.modifierTotal,
      defenderAaValue: shotSpec.aa
    })
  );
  shots.forEach((shot, i) => {
    assert.equal(shot.modifiedRoll, s.shots[i].modifiedRoll);
    assert.equal(Number(shot.result.rawCell), s.shots[i].reduction);
  });
  assert.equal(engine.sumInterceptionReductions(shots), s.expected.totalReduction);
});

test('paso 3 (V.E.F.): modificador de tirada, tirada modificada y multiplicador reproducen la hoja', () => {
  const s = step('step3_fleet_electronic_resistance');
  const vefTable = table(page21, 'antiship-guided-vef-modifier');
  const multTable = table(page21, 'antiship-guided-attack-multiplier');

  const vefResult = engine.resolveVefRollModifier(vefTable, tableEngine, s.inputs.rawVef);
  assert.equal(vefResult.modResult.rawCell, s.vefModifierLookup.cell);
  assert.equal(vefResult.rollModifier, s.vefModifierLookup.rollModifier);

  const modifiedRoll = s.vefRoll.roll + vefResult.rollModifier;
  assert.equal(modifiedRoll, s.vefRoll.modifiedRoll);

  const multiplierResult = engine.resolveAttackMultiplier(multTable, tableEngine, modifiedRoll);
  assert.equal(multiplierResult.multiplierResult.rawCell, s.attackMultiplierLookup.cell);
  assert.equal(multiplierResult.multiplier, s.attackMultiplierLookup.multiplier);
});

test('paso 4 (Método de ataque): tirada 2d10-mayor y tabla final reproducen "3 impactos"', () => {
  const s = step('step4_impact_calculation');
  const finalTable = table(page22, 'antiship-guided-final-damage');

  const formula = engine.describeDiceFormula(diceFormulas, s.inputs.diceFormula);
  const finalRoll = engine.resolveRoll(formula, s.inputs.rolls.map(String));
  assert.equal(finalRoll, s.inputs.finalRoll);

  const finalAttackValue = s.inputs.attackValueAfterDefenses * s.inputs.multiplier;
  assert.equal(finalAttackValue, s.inputs.finalAttackValue);

  const rowScheme = engine.finalTableRowScheme(s.inputs.method, methodOptions);
  assert.equal(rowScheme, s.rowScheme);

  const result = tableEngine.resolveCell(finalTable, finalRoll, finalAttackValue, { rowScheme });
  assert.equal(Number(result.rawCell), s.expected.impacts);
  assert.equal(Number(result.rawCell), scenario.expectedFinalResult.impacts);
});

test('paso 5 (Asignación de impactos): tirada 4 sobre la flota transcrita reproduce el hundimiento de BS-20381', () => {
  const s = step('step5_impact_assignment');
  assert.equal(s.automatedInWizard, true);

  const fleet = s.inputs.fleet.map((sh) => ({ id: sh.id, protection: sh.protection }));
  const assignment = engine.assignImpactTarget(s.inputs.assignmentRoll, fleet);
  assert.equal(assignment.ship.id, s.expected.targetShip);
  assert.equal(assignment.index, s.expected.targetIndex);

  const hit = engine.applyImpactsToShip(assignment.ship, s.inputs.impacts);
  assert.equal(hit.damaged, true);
  assert.equal(hit.absorbed, s.expected.protectionAbsorbed);
  assert.equal(hit.remainingImpacts, s.expected.remainingImpacts);

  const targetShipSpec = s.inputs.fleet.find((sh) => sh.id === s.expected.targetShip);
  const sank = engine.checkSinking(s.inputs.sinkingRoll, targetShipSpec.sinkingThreshold);
  assert.equal(sank, true);

  const survivors = fleet.filter((sh) => sh.id !== assignment.ship.id);
  const minProtection = Math.min(...survivors.map((sh) => sh.protection));
  assert.ok(hit.remainingImpacts < minProtection, 'el impacto restante debería ser insuficiente para cualquier superviviente, igual que en la hoja');
});

test('extremo a extremo: encadenando los pasos 2-5 del escenario se llega al resultado final declarado', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const vefTable = table(page21, 'antiship-guided-vef-modifier');
  const multTable = table(page21, 'antiship-guided-attack-multiplier');
  const finalTable = table(page22, 'antiship-guided-final-damage');

  const s2 = step('step2_munition_interception');
  const shots = s2.shots.map((shotSpec) =>
    engine.resolveInterceptionShot(interceptionTable, tableEngine, {
      roll: shotSpec.roll,
      modifierTotal: s2.sharedModifiers.modifierTotal,
      defenderAaValue: shotSpec.aa
    })
  );
  const attackValueAfterDefenses = scenario.setup.attacker.attackValueUsed + engine.sumInterceptionReductions(shots);

  const s3 = step('step3_fleet_electronic_resistance');
  const vefResult = engine.resolveVefRollModifier(vefTable, tableEngine, s3.inputs.rawVef);
  const modifiedVefRoll = s3.vefRoll.roll + vefResult.rollModifier;
  const multiplierResult = engine.resolveAttackMultiplier(multTable, tableEngine, modifiedVefRoll);

  const s4 = step('step4_impact_calculation');
  const formula = engine.describeDiceFormula(diceFormulas, s4.inputs.diceFormula);
  const finalRoll = engine.resolveRoll(formula, s4.inputs.rolls.map(String));
  const finalAttackValue = attackValueAfterDefenses * multiplierResult.multiplier;
  const rowScheme = engine.finalTableRowScheme(s4.inputs.method, methodOptions);

  const result = tableEngine.resolveCell(finalTable, finalRoll, finalAttackValue, { rowScheme });
  assert.equal(Number(result.rawCell), scenario.expectedFinalResult.impacts);

  const s5 = step('step5_impact_assignment');
  const fleet = s5.inputs.fleet.map((sh) => ({ id: sh.id, protection: sh.protection }));
  const assignment = engine.assignImpactTarget(s5.inputs.assignmentRoll, fleet);
  const hit = engine.applyImpactsToShip(assignment.ship, Number(result.rawCell));
  const targetShipSpec = s5.inputs.fleet.find((sh) => sh.id === assignment.ship.id);
  const sank = engine.checkSinking(s5.inputs.sinkingRoll, targetShipSpec.sinkingThreshold);

  assert.equal(assignment.ship.id, scenario.expectedFinalResult.shipSunk);
  assert.equal(sank, true);
});
