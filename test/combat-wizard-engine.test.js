const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/combat-wizard-engine.js');
const tableEngine = require('../public/js/table-engine.js');
const modifierEngine = require('../public/js/combat-modifier-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, relPath), 'utf8'));
}

const workflow = readJson('workflows/07_ataque_antibuque_guiado.json');
const areaAirDefenseWorkflow = readJson('workflows/06_defensa_aerea_area.json');
const diceFormulas = readJson('rules/dice-formulas.json');
const page03 = readJson('tables/page-03.json');
const page04 = readJson('tables/page-04.json');
const page06 = readJson('tables/page-06.json');
const page07 = readJson('tables/page-07.json');
const page08 = readJson('tables/page-08.json');
const page25 = readJson('tables/page-25.json');
const page18 = readJson('tables/page-18.json');
const page21 = readJson('tables/page-21.json');
const page22 = readJson('tables/page-22.json');

function stage(id) {
  const found = workflow.stages.find((s) => s.id === id);
  assert.ok(found, `stage "${id}" no existe en el workflow`);
  return found;
}

function table(page, id) {
  const found = tableEngine.findTableInPage(page, id);
  assert.ok(found && found.table, `tabla "${id}" no encontrada`);
  return found.table;
}

// correcciones.02.md COR02-006: methodOptions/attackDistanceBucketOptions ya
// no son constantes del motor — se leen de las opciones reales del propio
// workflow, igual que hace la aplicación (core.js#loadCountryUnitsWithAntishipPlans,
// views/antiship-guided-wizard.js).
const methodOptions = stage('attack_method').questions.find((q) => q.id === 'method').options;
const attackDistanceBucketOptions = stage('fleet_electronic_resistance').questions.find((q) => q.id === 'attack_distance').options;
// correcciones03.md COR03-002: cmBmMarkerIcons tampoco es ya una constante
// del motor — se lee del propio workflow (workflow.cmBmMarkerIcons).
const cmBmMarkerIcons = workflow.cmBmMarkerIcons;

// --- sumModifiers / collectRuleEffects contra el workflow real ---

test('sumModifiers: etapa area_air_defense, ambas respuestas negativas se suman', () => {
  const { total, trace } = engine.sumModifiers(
    stage('area_air_defense').questions,
    { attacker_detected: 'no', near_space_trajectory: 'yes' },
    'area_air_defense_roll'
  );
  assert.equal(total, -5);
  assert.equal(trace.length, 2);
});

test('sumModifiers: respuesta "sí, detectado" no penaliza', () => {
  const { total } = engine.sumModifiers(
    stage('area_air_defense').questions,
    { attacker_detected: 'yes', near_space_trajectory: 'no' },
    'area_air_defense_roll'
  );
  assert.equal(total, 0);
});

test('sumModifiers: pregunta sin responder no aporta al total', () => {
  const { total, trace } = engine.sumModifiers(stage('area_air_defense').questions, {}, 'area_air_defense_roll');
  assert.equal(total, 0);
  assert.equal(trace.length, 0);
});

test('sumModifiers: etapa fleet_electronic_resistance, distancia + detección', () => {
  const { total } = engine.sumModifiers(
    stage('fleet_electronic_resistance').questions,
    { attack_distance: '6plus', detection_state: 'designator_only' },
    'vef_modifier'
  );
  assert.equal(total, 3 + -1);
});

test('sumModifiers: munition_interception, rendimiento bajo + atacante detectado (golden test)', () => {
  const { total } = engine.sumModifiers(
    stage('munition_interception').questions,
    { interception_performance: 'low', detection_state: 'attacker' },
    'munition_interception_roll'
  );
  assert.equal(total, -2);
});

test('collectRuleEffects: "mismo hex o Zona Central" trae la regla no_interception con cutsStage', () => {
  const rules = engine.collectRuleEffects(stage('munition_interception').questions, { same_hex_or_central_zone: 'yes' });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].ruleValue, 'no_interception');
  assert.equal(rules[0].cutsStage, true);
});

test('collectRuleEffects: respuesta "no" de esa misma pregunta no trae ninguna regla', () => {
  const rules = engine.collectRuleEffects(stage('munition_interception').questions, { same_hex_or_central_zone: 'no' });
  assert.equal(rules.length, 0);
});

test('findFirstEffect: localiza el efecto "dice" de la opción "subsonic" en attack_method', () => {
  const found = engine.findFirstEffect(stage('attack_method').questions, { method: 'subsonic' }, 'dice', 'attack_resolution');
  assert.equal(found.effect.value, 'roll_2d10_take_highest');
  assert.equal(found.optionLabel, 'Subsónico');
});

test('findFirstEffect: sin respuesta para esa pregunta devuelve null', () => {
  assert.equal(engine.findFirstEffect(stage('attack_method').questions, {}, 'dice', 'attack_resolution'), null);
});

// --- Disparo en Área (page-18.json): reacción contra el propio avión atacante, no reduce el Valor de Ataque ---

test('resolveAreaAirDefenseShot: tirada 4 x A.A. agrupado 6 (consumo Alto) -> "3" puntos de daño (golden test)', () => {
  const areaAirDefenseTable = table(page18, 'area-air-defense-concentrated-damage');
  const result = engine.resolveAreaAirDefenseShot(areaAirDefenseTable, tableEngine, { roll: 4, aaValue: 6, consumption: 'high' });
  assert.equal(result.rawCell, '3');
});

test('resolveAreaAirDefenseShot: 3 puntos de daño son insuficientes contra una Protección de 4 (golden test)', () => {
  const areaAirDefenseTable = table(page18, 'area-air-defense-concentrated-damage');
  const result = engine.resolveAreaAirDefenseShot(areaAirDefenseTable, tableEngine, { roll: 4, aaValue: 6, consumption: 'high' });
  const damage = Number(result.rawCell);
  const attackerProtection = 4;
  assert.ok(damage < attackerProtection, 'el avión no debería sufrir daño en el golden test');
});

test('resolveAreaAirDefenseShot: consumo "low" usa el esquema alternateLabelSets.low (rangos agrupados) en vez del canónico', () => {
  const areaAirDefenseTable = table(page18, 'area-air-defense-concentrated-damage');
  // Con consumo "low" los valores de A.A. se agrupan en rangos ("2~3" en vez de "2"/"3"
  // por separado); aaValue=3 debe caer en la columna "2~3" (índice 1).
  const result = engine.resolveAreaAirDefenseShot(areaAirDefenseTable, tableEngine, { roll: 4, aaValue: 3, consumption: 'low' });
  assert.equal(result.columnLabel, '2~3');
  assert.equal(result.columnIndex, 1);
});

// --- Reducción de Valor de Ataque por CM/BM (page-03.json): etapa area_air_defense del workflow 07 ---

test('resolveAreaAirDefenseAttackReduction: tirada 4 sin modificador, A.A. agrupado 6~7 -> "-2"', () => {
  const areaAirDefenseTable = table(page03, 'ground-guided-area-air-defense');
  const result = engine.resolveAreaAirDefenseAttackReduction(areaAirDefenseTable, tableEngine, { roll: 4, modifierTotal: 0, groupedAaValue: 6 });
  assert.equal(result.modifiedRoll, 4);
  assert.equal(result.rowValue, '4');
  assert.equal(result.result.rawCell, '-2');
});

test('resolveAreaAirDefenseAttackReduction: atacante no detectado (-2) desplaza la tirada modificada a "2"', () => {
  const areaAirDefenseTable = table(page03, 'ground-guided-area-air-defense');
  const result = engine.resolveAreaAirDefenseAttackReduction(areaAirDefenseTable, tableEngine, { roll: 4, modifierTotal: -2, groupedAaValue: 6 });
  assert.equal(result.modifiedRoll, 2);
  assert.equal(result.result.rawCell, '-1');
});

test('resolveAreaAirDefenseAttackReduction: trayectoria de espacio cercano usa 2d10 y el resultado MENOR, más el modificador -3', () => {
  const areaAirDefenseTable = table(page03, 'ground-guided-area-air-defense');
  // roll=7, roll2=3 -> menor=3; modificador -3 (espacio cercano) -> tirada final 0.
  const result = engine.resolveAreaAirDefenseAttackReduction(areaAirDefenseTable, tableEngine, { roll: 7, roll2: 3, modifierTotal: -3, groupedAaValue: 1 });
  assert.equal(result.baseRoll, 3);
  assert.equal(result.modifiedRoll, 0);
  assert.equal(result.result.rawCell, '.');
});

test('resolveAreaAirDefenseAttackReduction: tirada modificada negativa usa la fila "<=-1" (posible NO_DISPARAR)', () => {
  const areaAirDefenseTable = table(page03, 'ground-guided-area-air-defense');
  const result = engine.resolveAreaAirDefenseAttackReduction(areaAirDefenseTable, tableEngine, { roll: 0, modifierTotal: -5, groupedAaValue: 6 });
  assert.equal(result.rowValue, '<=-1');
  assert.equal(result.result.rawCell, 'NO_DISPARAR');
});

test('workflows/02,04,07: la etapa area_air_defense exige confirmar el marcador CM/BM antes de aplicarse (cutsStage en "no")', () => {
  for (const file of ['02_ataque_terrestre_guiado.json', '04_ataque_antirradiacion.json', '07_ataque_antibuque_guiado.json']) {
    const wf = readJson(`workflows/${file}`);
    const st = wf.stages.find((s) => s.id === 'area_air_defense');
    const q = st.questions.find((qq) => qq.id === 'munition_marked_cm_or_bm');
    assert.ok(q, `${file}: falta la pregunta munition_marked_cm_or_bm`);
    const noOption = q.options.find((o) => o.value === 'no');
    assert.ok(noOption.effects.some((e) => e.cutsStage), `${file}: la opción "no" debería cortar la etapa`);
  }
});

test('workflows/06_defensa_aerea_area.json: la etapa area_defense existe con sus preguntas declaradas', () => {
  const stage06 = areaAirDefenseWorkflow.stages.find((s) => s.id === 'area_defense');
  assert.ok(stage06);
  const questionIds = stage06.questions.map((q) => q.id);
  assert.deepEqual(questionIds, ['target_type', 'self_detected_low_altitude', 'high_altitude_only_system', 'ballistic_missile_interception', 'missile_defense_symbol', 'missile_alert_network', 'ammo_consumption', 'aa_value', 'ew_escort']);
});

// --- Interceptación de Misiles Balísticos (Decision Book §6.9-§6.9.2, correcciones03.md COR03-005) ---
// La elegibilidad (símbolo especial + red de alerta de misiles) se modela
// como preguntas nuevas de la etapa area_defense, gateadas por
// ballistic_missile_interception — Fase Media reutiliza resolveAreaAirDefenseShot
// sin cambios (misma tabla/mecánica), y Alta Velocidad reutiliza
// checkHighSpeedInterceptionFailure (probada desde antes, sin consumidor).

test('workflows/06_defensa_aerea_area.json#missile_defense_symbol/missile_alert_network: showIf ballistic_missile_interception=yes, y "No" corta el flujo con haltsWorkflow', () => {
  const stage06 = areaAirDefenseWorkflow.stages.find((s) => s.id === 'area_defense');
  ['missile_defense_symbol', 'missile_alert_network'].forEach((id) => {
    const q = stage06.questions.find((qq) => qq.id === id);
    assert.ok(q, `falta la pregunta ${id}`);
    assert.deepEqual(q.showIf, { questionId: 'ballistic_missile_interception', equals: 'yes' });
    const noOption = q.options.find((o) => o.value === 'no');
    assert.ok(noOption.effects.some((e) => e.haltsWorkflow), `${id}: la opción "no" debería marcar haltsWorkflow`);
  });
});

// --- Asignación de impactos, daño y hundimiento (sin tabla, pura aritmética de la hoja de flota) ---

const goldenFleet = [
  { id: 'BS-1155', protection: 5 }, // protección real desconocida (no participa en el golden test); valor alto arbitrario para no interferir con los asserts de "impactos insuficientes"
  { id: 'BS-20381', protection: 2 },
  { id: 'BS-1164', protection: 3 }
];

test('assignImpactTarget: tirada 4 sobre 3 buques -> índice 1 (BS-20381), "0-9 izq-dcha reiniciando" (golden test)', () => {
  const assignment = engine.assignImpactTarget(4, goldenFleet);
  assert.equal(assignment.index, 1);
  assert.equal(assignment.ship.id, 'BS-20381');
});

test('assignImpactTarget: la tirada da la vuelta cuando supera el número de buques', () => {
  assert.equal(engine.assignImpactTarget(0, goldenFleet).ship.id, 'BS-1155');
  assert.equal(engine.assignImpactTarget(3, goldenFleet).ship.id, 'BS-1155'); // 3 % 3 = 0, vuelve a empezar
  assert.equal(engine.assignImpactTarget(5, goldenFleet).ship.id, 'BS-1164'); // 5 % 3 = 2
});

test('assignImpactTarget: sin supervivientes devuelve null en vez de lanzar', () => {
  assert.equal(engine.assignImpactTarget(4, []), null);
});

test('applyImpactsToShip: 3 impactos contra Protección 2 -> dañada, absorbe 2, quedan 1 (golden test)', () => {
  const result = engine.applyImpactsToShip({ id: 'BS-20381', protection: 2 }, 3);
  assert.deepEqual(result, { damaged: true, absorbed: 2, remainingImpacts: 1 });
});

test('applyImpactsToShip: impactos por debajo de la Protección no dañan y no se consumen', () => {
  const result = engine.applyImpactsToShip({ id: 'BS-1164', protection: 3 }, 1);
  assert.deepEqual(result, { damaged: false, absorbed: 0, remainingImpacts: 1 });
});

// --- Daño por impacto según método (Decision Book §5.6.5) ---

test('damagePerImpactForMethod: subsónico=1, supersónico=2, balístico/espacio cercano=null (no modelado, requiere dato de escudo)', () => {
  assert.equal(engine.damagePerImpactForMethod('subsonic', methodOptions), 1);
  assert.equal(engine.damagePerImpactForMethod('supersonic', methodOptions), 2);
  assert.equal(engine.damagePerImpactForMethod('ballistic', methodOptions), null);
  assert.equal(engine.damagePerImpactForMethod('near_space', methodOptions), null);
});

test('applyImpactsToShip: reproduce el ejemplo exacto del Decision Book §5.6.5 (supersónico, Protección 3, 8 impactos -> absorbe 2, quedan 6)', () => {
  const perImpact = engine.damagePerImpactForMethod('supersonic', methodOptions);
  const result = engine.applyImpactsToShip({ id: 'unidad-2', protection: 3 }, 8, perImpact);
  assert.deepEqual(result, { damaged: true, absorbed: 2, remainingImpacts: 6 });
});

test('applyImpactsToShip: supersónico con Protección par consume exactamente protección/2 impactos', () => {
  const perImpact = engine.damagePerImpactForMethod('supersonic', methodOptions);
  const result = engine.applyImpactsToShip({ id: 'x', protection: 4 }, 2, perImpact);
  assert.deepEqual(result, { damaged: true, absorbed: 2, remainingImpacts: 0 });
});

test('applyImpactsToShip: supersónico con impactos insuficientes no daña ni consume', () => {
  const perImpact = engine.damagePerImpactForMethod('supersonic', methodOptions);
  const result = engine.applyImpactsToShip({ id: 'x', protection: 3 }, 1, perImpact);
  assert.deepEqual(result, { damaged: false, absorbed: 0, remainingImpacts: 1 });
});

test('applyImpactsToShip: sin damagePerImpact explícito, se comporta igual que subsónico (retrocompatible)', () => {
  const withDefault = engine.applyImpactsToShip({ id: 'x', protection: 2 }, 3);
  const withExplicitSubsonic = engine.applyImpactsToShip({ id: 'x', protection: 2 }, 3, engine.damagePerImpactForMethod('subsonic', methodOptions));
  assert.deepEqual(withDefault, withExplicitSubsonic);
});

test('checkSinking: tirada 4 con umbral "<=4" se hunde (golden test)', () => {
  assert.equal(engine.checkSinking(4, 4), true);
});

test('checkSinking: tirada por encima del umbral sobrevive', () => {
  assert.equal(engine.checkSinking(5, 4), false);
});

test('extremo a extremo: pasos 5 completos del golden test (asignación, daño y hundimiento de BS-20381)', () => {
  const impacts = 3;
  const assignment = engine.assignImpactTarget(4, goldenFleet);
  assert.equal(assignment.ship.id, 'BS-20381');

  const hit = engine.applyImpactsToShip(assignment.ship, impacts);
  assert.equal(hit.damaged, true);
  assert.equal(hit.remainingImpacts, 1);

  const sank = engine.checkSinking(4, 4);
  assert.equal(sank, true);

  // Buques supervivientes tras el hundimiento; el impacto restante (1) es
  // insuficiente para la protección mínima entre ellos (BS-1164, 3).
  const survivors = goldenFleet.filter((s) => s.id !== assignment.ship.id);
  const minProtection = Math.min(...survivors.map((s) => s.protection));
  assert.ok(hit.remainingImpacts < minProtection, 'el impacto restante debería ser insuficiente para cualquier superviviente');
});

// --- Interceptación de munición (page-04.json): fila = tirada modificada, columna = A.A. propio ---

test('resolveInterceptionShot: BS-20381 (A.A.=2), tirada 4 modificada -2 -> -1 (golden test)', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const shot = engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 4, modifierTotal: -2, defenderAaValue: 2 });
  assert.equal(shot.modifiedRoll, 2);
  assert.equal(shot.result.rawCell, '-1');
});

test('resolveInterceptionShot: BS-1164 (A.A.=4), misma tirada modificada -> -2 (golden test)', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const shot = engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 4, modifierTotal: -2, defenderAaValue: 4 });
  assert.equal(shot.modifiedRoll, 2);
  assert.equal(shot.result.rawCell, '-2');
});

test('sumInterceptionReductions: los dos disparos del golden test suman -3', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const shots = [
    engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 4, modifierTotal: -2, defenderAaValue: 2 }),
    engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 4, modifierTotal: -2, defenderAaValue: 4 })
  ];
  assert.equal(engine.sumInterceptionReductions(shots), -3);
});

test('sumInterceptionReductions: celdas "." o "NO_DISPARAR" no cuentan como 0 falso ni rompen la suma', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const shots = [
    engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 1, modifierTotal: 0, defenderAaValue: 1 }), // "."
    engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 4, modifierTotal: -2, defenderAaValue: 2 }) // "-1"
  ];
  assert.equal(shots[0].result.rawCell, '.');
  assert.equal(engine.sumInterceptionReductions(shots), -1);
});

// --- resolveInterceptionShot reutilizada contra una SEGUNDA tabla real
// (correcciones.02.md COR02-010): munition-interception-unguided
// (page-08.json), consumida por el wizard de ataque antibuque no guiado —
// misma función, sin cambios, alimentada con datos de otro workflow. Este
// es exactamente el "segundo consumidor real de un módulo defensivo
// compartido" que pide la incidencia. Valores verificados manualmente en
// el navegador con el wizard real (2026-09-28).
test('resolveInterceptionShot: reutilizada contra munition-interception-unguided (page-08.json), un workflow distinto de antiship_guided', () => {
  const interceptionTable = table(page08, 'munition-interception-unguided');
  const shot = engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 4, modifierTotal: 0, defenderAaValue: 4, earlyWarning: false });
  assert.equal(shot.modifiedRoll, 4);
  assert.equal(shot.result.rawCell, '-2');
});

// --- Tope "Interceptación Más Allá del Horizonte" (Decision Book §6.5.2) ---

test('applyBeyondHorizonCap: A.A.=5 (no está en beyondHorizonColumns) nunca se topa', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const cap = engine.applyBeyondHorizonCap(interceptionTable, { defenderAaValue: 5, earlyWarning: false });
  assert.equal(cap.capped, false);
  assert.equal(cap.effectiveValue, 5);
});

test('applyBeyondHorizonCap: A.A.=6 sin alerta temprana se topa a 5 (ejemplo exacto del Decision Book §6.5.2)', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const cap = engine.applyBeyondHorizonCap(interceptionTable, { defenderAaValue: 6, earlyWarning: false });
  assert.equal(cap.capped, true);
  assert.equal(cap.originalValue, 6);
  assert.equal(cap.effectiveValue, 5);
});

test('applyBeyondHorizonCap: A.A.=9 sin alerta temprana también se topa a 5 (el máximo no-beyond-horizon)', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const cap = engine.applyBeyondHorizonCap(interceptionTable, { defenderAaValue: 9, earlyWarning: false });
  assert.equal(cap.capped, true);
  assert.equal(cap.effectiveValue, 5);
});

test('applyBeyondHorizonCap: A.A.=6 CON alerta temprana no se topa (puede usar la Zona Azul)', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const cap = engine.applyBeyondHorizonCap(interceptionTable, { defenderAaValue: 6, earlyWarning: true });
  assert.equal(cap.capped, false);
  assert.equal(cap.effectiveValue, 6);
});

test('resolveInterceptionShot: A.A.=6 sin alerta temprana resuelve la celda como si A.A. fuera 5, no 6', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const withoutWarning = engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 4, modifierTotal: 0, defenderAaValue: 6, earlyWarning: false });
  const asIfFive = engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 4, modifierTotal: 0, defenderAaValue: 5 });
  assert.equal(withoutWarning.horizonCap.capped, true);
  assert.equal(withoutWarning.result.rawCell, asIfFive.result.rawCell);
});

test('resolveInterceptionShot: sin earlyWarning explícito (undefined), el golden test (A.A.=2/4) no se ve afectado', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const shot = engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 4, modifierTotal: -2, defenderAaValue: 2 });
  assert.equal(shot.horizonCap.capped, false);
  assert.equal(shot.result.rawCell, '-1');
});

// --- Mod. V.E.F. modifica la TIRADA, no el V.E.F. (corregido tras el golden test) ---

test('parseVefModifierCell: deltas numéricos y el caso especial "-V.E.F." (delta = -rawVef)', () => {
  assert.deepEqual(engine.parseVefModifierCell('+7', 5), { kind: 'delta', delta: 7, raw: '+7' });
  assert.deepEqual(engine.parseVefModifierCell('-9', 20), { kind: 'delta', delta: -9, raw: '-9' });
  assert.deepEqual(engine.parseVefModifierCell('-V.E.F.', 3), { kind: 'self', delta: -3, raw: '-V.E.F.' });
});

test('resolveVefRollModifier: V.E.F. bruto "3" (bucket "1~8") da un modificador -3 a la tirada (golden test)', () => {
  const vefTable = table(page21, 'antiship-guided-vef-modifier');
  const result = engine.resolveVefRollModifier(vefTable, tableEngine, 3);
  assert.equal(result.modResult.rawCell, '-V.E.F.');
  assert.equal(result.rollModifier, -3);
});

test('resolveVefRollModifier: V.E.F. bruto "9" da un modificador -8 a la tirada', () => {
  const vefTable = table(page21, 'antiship-guided-vef-modifier');
  const result = engine.resolveVefRollModifier(vefTable, tableEngine, 9);
  assert.equal(result.modResult.rawCell, '-8');
  assert.equal(result.rollModifier, -8);
});

test('resolveVefRollModifier: V.E.F. bruto negativo ("<=-1") da +7', () => {
  const vefTable = table(page21, 'antiship-guided-vef-modifier');
  const result = engine.resolveVefRollModifier(vefTable, tableEngine, -2);
  assert.equal(result.modResult.rawCell, '+7');
  assert.equal(result.rollModifier, 7);
});

test('resolveAttackMultiplier: tirada modificada "1" (golden test: 4 - 3) -> multiplicador x2', () => {
  const multTable = table(page21, 'antiship-guided-attack-multiplier');
  const result = engine.resolveAttackMultiplier(multTable, tableEngine, 1);
  assert.equal(result.multiplierResult.rawCell, 'x2');
  assert.equal(result.multiplier, 2);
});

// --- Esquema de fila de la tabla final según método de ataque ---

test('finalTableRowScheme: subsónico/supersónico usan "sub_sup"; balístico/espacio cercano usan "par_ec" (leído de methodOptions[].finalTableRowScheme, correcciones03.md COR03-002)', () => {
  assert.equal(engine.finalTableRowScheme('subsonic', methodOptions), 'sub_sup');
  assert.equal(engine.finalTableRowScheme('supersonic', methodOptions), 'sub_sup');
  assert.equal(engine.finalTableRowScheme('ballistic', methodOptions), 'par_ec');
  assert.equal(engine.finalTableRowScheme('near_space', methodOptions), 'par_ec');
  assert.equal(engine.finalTableRowScheme('unknown-method', methodOptions), null);
});

// --- Fórmulas de dados (etapa attack_method), data/rules/dice-formulas.json (correcciones03.md COR03-002) ---

test('describeDiceFormula: reconoce las 3 fórmulas declaradas en data/rules/dice-formulas.json', () => {
  assert.deepEqual(engine.describeDiceFormula(diceFormulas, 'roll_2d10_take_highest'), { label: '2d10 (elegir el mayor)', rollCount: 2, pick: 'highest', sourceRefs: diceFormulas.formulas.roll_2d10_take_highest.sourceRefs, note: diceFormulas.formulas.roll_2d10_take_highest.note });
  assert.deepEqual(engine.describeDiceFormula(diceFormulas, 'roll_1d10'), { label: '1d10', rollCount: 1, pick: 'single', sourceRefs: diceFormulas.formulas.roll_1d10.sourceRefs });
  assert.equal(engine.describeDiceFormula(diceFormulas, 'formula-inexistente'), null);
});

test('resolveRoll: subsónico toma el mayor de los dos valores elegidos por el usuario (golden test: 4 y 6 -> 6)', () => {
  const formula = engine.describeDiceFormula(diceFormulas, 'roll_2d10_take_highest');
  assert.equal(engine.resolveRoll(formula, ['4', '6']), 6);
});

test('resolveRoll: supersónico/balístico/espacio cercano usan un único valor', () => {
  const formula = engine.describeDiceFormula(diceFormulas, 'roll_1d10');
  assert.equal(engine.resolveRoll(formula, ['6']), 6);
});

// --- Resolución de extremo a extremo contra el golden test real (antiship-guided-final-damage) ---

test('extremo a extremo: reproduce exactamente el resultado de la hoja de ayuda (3 impactos)', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const vefTable = table(page21, 'antiship-guided-vef-modifier');
  const multTable = table(page21, 'antiship-guided-attack-multiplier');
  const finalTable = table(page22, 'antiship-guided-final-damage');

  // Valor de Ataque base (carga pesada del plan B, Tipo 93): 6.
  // Paso 1 (Disparo en Área, fuera de este workflow): no daña al atacante, valor sin cambios.
  const baseAttackValue = 6;

  // Paso 2 (Interceptación de Munición): BS-20381 (A.A.=2) y BS-1164 (A.A.=4),
  // ambos con rendimiento bajo (-2) y atacante detectado (0), tirada 4.
  const shots = [
    engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 4, modifierTotal: -2, defenderAaValue: 2 }),
    engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 4, modifierTotal: -2, defenderAaValue: 4 })
  ];
  const interceptionReduction = engine.sumInterceptionReductions(shots);
  assert.equal(interceptionReduction, -3);
  const attackValueAfterDefenses = baseAttackValue + interceptionReduction;
  assert.equal(attackValueAfterDefenses, 3);

  // Paso 3 (Resistencia Electrónica de la Flota): V.E.F. bruto = 3 (Valor Electrónico
  // más alto) + 0 (distancia 0-2) + 0 (atacante detectado) = 3.
  const rawVef = 3 + 0 + 0;
  const vefRoll = engine.resolveVefRollModifier(vefTable, tableEngine, rawVef);
  assert.equal(vefRoll.rollModifier, -3);
  const vefDieRoll = 4; // siempre 1d10 en esta etapa, según la hoja.
  const modifiedVefRoll = vefDieRoll + vefRoll.rollModifier;
  assert.equal(modifiedVefRoll, 1);
  const multiplierResult = engine.resolveAttackMultiplier(multTable, tableEngine, modifiedVefRoll);
  assert.equal(multiplierResult.multiplier, 2);

  // Paso 4 (Método de ataque y tirada): subsónico -> 2d10 tomar el mayor (4 y 6 -> 6).
  const formula = engine.describeDiceFormula(diceFormulas, 'roll_2d10_take_highest');
  const finalRoll = engine.resolveRoll(formula, ['4', '6']);
  assert.equal(finalRoll, 6);

  const finalAttackValue = attackValueAfterDefenses * multiplierResult.multiplier;
  assert.equal(finalAttackValue, 6);

  const rowScheme = engine.finalTableRowScheme('subsonic', methodOptions);
  const result = tableEngine.resolveCell(finalTable, finalRoll, finalAttackValue, { rowScheme });
  assert.equal(result.rawCell, '3');
});

// --- Interceptación Final (Decision Book §6.4.1-§6.4.2, page-07.json/page-23.json) ---
// Sin golden test oficial (ninguna hoja de ayuda ejemplifica esta mecánica con un
// caso numérico completo): verificado contra la cita y los datos ya transcritos.

test('resolveFinalInterceptionShot: solo consumo Bajo (A.A.=5, tirada 4) -> 1 impacto', () => {
  const finalTable = table(page07, 'ground-unguided-final-interception');
  const shot = engine.resolveFinalInterceptionShot(finalTable, tableEngine, { roll: 4, aaTotalLow: 5 });
  assert.equal(shot.shots.low.rawCell, '1');
  assert.equal(shot.shots.high, undefined);
  assert.equal(shot.totalImpacts, 1);
});

test('resolveFinalInterceptionShot: consumo Bajo Y Alto simultáneos suman sus impactos por separado (misma tirada)', () => {
  const finalTable = table(page07, 'ground-unguided-final-interception');
  const shot = engine.resolveFinalInterceptionShot(finalTable, tableEngine, { roll: 4, aaTotalLow: 5, aaTotalHigh: 12 });
  assert.equal(shot.shots.low.rawCell, '1');
  assert.equal(shot.shots.high.rawCell, '3');
  assert.equal(shot.totalImpacts, 4);
});

test('resolveFinalInterceptionShot: aaTotalLow=0/ausente no se resuelve (se omite, no se consulta columna "1")', () => {
  const finalTable = table(page07, 'ground-unguided-final-interception');
  const shot = engine.resolveFinalInterceptionShot(finalTable, tableEngine, { roll: 4, aaTotalHigh: 12 });
  assert.equal(shot.shots.low, undefined);
  assert.equal(shot.shots.high.rawCell, '3');
  assert.equal(shot.totalImpacts, 3);
});

test('resolveFinalInterceptionShot: celda "." cuenta como 0 impactos, no rompe la suma', () => {
  const finalTable = table(page07, 'ground-unguided-final-interception');
  const shot = engine.resolveFinalInterceptionShot(finalTable, tableEngine, { roll: 4, aaTotalLow: 1 });
  assert.equal(shot.shots.low.rawCell, '.');
  assert.equal(shot.totalImpacts, 0);
});

test('resolveFinalInterceptionShot: A.A. total por encima del límite (25) se resuelve en el bucket abierto "18+" sin tope adicional', () => {
  const finalTable = table(page07, 'ground-unguided-final-interception');
  const shot = engine.resolveFinalInterceptionShot(finalTable, tableEngine, { roll: 9, aaTotalHigh: 25 });
  assert.equal(shot.shots.high.columnLabel, '18+');
  assert.equal(shot.shots.high.rawCell, '7');
  assert.equal(shot.totalImpacts, 7);
});

// --- Escenario de extremo a extremo: wizard de Ataque Antibuque No Guiado
// (correcciones.02.md COR02-010, roadmap Fase 8). Sin "hoja de ayuda" con
// ejemplo oficial resuelto para este dominio (a diferencia del ataque
// guiado, Fase 7): encadena las mismas funciones puras que usa
// public/js/views/antiship-unguided-wizard.js (Interceptación de Munición →
// CombatModifierEngine.resolveAttackValueColumnShift, sin consumidor hasta
// esta incidencia → tabla final page-25.json), con los valores ya
// verificados manualmente en el navegador con el wizard real (2026-09-28):
// Valor de Ataque 20, un disparo de interceptación (A.A.=4, tirada 4,
// modificador +0) reduce -2 -> 18; distancia 2 hex. -> bucket "2plus"
// (modificador -8); tirada final 8 -> "1 impacto(s)".
test('Escenario Ataque Antibuque No Guiado: Valor de Ataque 20, interceptación -2, distancia 2 hex (bucket "2plus", mod. -8), tirada final 8 -> 1 impacto', () => {
  const workflow = readJson('workflows/08_ataque_antibuque_no_guiado.json');
  const munitionInterceptionTable = table(page08, 'munition-interception-unguided');
  const finalTable = table(page25, 'antiship-unguided-damage-and-naval-artillery');
  const distanceOptions = workflow.stages.find((st) => st.id === 'attack_intensity').questions.find((q) => q.id === 'distance').options;

  const shot = engine.resolveInterceptionShot(munitionInterceptionTable, tableEngine, { roll: 4, modifierTotal: 0, defenderAaValue: 4, earlyWarning: false });
  const reduction = engine.sumInterceptionReductions([shot]);
  assert.equal(reduction, -2);
  const attackAfterInterception = 20 + reduction;
  assert.equal(attackAfterInterception, 18);

  const bucket = engine.attackDistanceBucket(2, distanceOptions);
  assert.equal(bucket, '2plus');
  const bucketOption = distanceOptions.find((o) => o.value === bucket);
  const distanceModifier = bucketOption.effects.find((e) => e.target === 'attack_intensity').value;
  assert.equal(distanceModifier, -8);

  const columnResult = modifierEngine.resolveAttackValueColumnShift(tableEngine, {
    rawAttackValue: attackAfterInterception,
    modifierTotal: distanceModifier,
    valueCap: Infinity,
    columnLabels: finalTable.columnAxis.values
  });
  assert.equal(columnResult.columnLabel, '1~2');

  const result = tableEngine.resolveCell(finalTable, 8, columnResult.columnLabel);
  assert.equal(result.rawCell, '1');
});

// --- COR03-005 (correcciones03.md): Contraataque a Baja Altura gana su
// primer consumidor real en el propio workflow 08 (antiship_unguided) ---
// data/tables/page-26.json ya declaraba `workflowRefs: ["antiship_unguided"]`
// y `reusesTable` apuntando a esta misma tabla de page-22.json desde antes
// de esta incidencia; solo faltaba declarar la etapa en el workflow y
// conectarla al wizard (public/js/views/antiship-unguided-wizard.js).
test('workflows/08_ataque_antibuque_no_guiado.json: declara la etapa low_altitude_counterattack (página 26), reutilizando surface-artillery-low-altitude-counterattack', () => {
  const workflow = readJson('workflows/08_ataque_antibuque_no_guiado.json');
  const stage = workflow.stages.find((st) => st.id === 'low_altitude_counterattack');
  assert.ok(stage, 'workflow 08 debería declarar la etapa low_altitude_counterattack');
  assert.equal(stage.order, 4, 'debería ser la última etapa (después de attack_intensity)');

  const page26 = readJson('tables/page-26.json');
  assert.ok(page26.workflowRefs.includes('antiship_unguided'), 'page-26.json debería seguir citando a antiship_unguided como consumidor');
  assert.equal(page26.reusesTable.id, 'surface-artillery-low-altitude-counterattack');
  assert.equal(page26.reusesTable.definedIn, 'data/tables/page-22.json');

  // La tabla que reusesTable referencia existe y es exactamente la misma
  // que ya consumen los tests de resolveLowAltitudeCounterattackShot.
  const t = table(page22, page26.reusesTable.id);
  assert.ok(t, 'la tabla referenciada por page-26.json#reusesTable debería existir en page-22.json');
});

// --- Contraataque a Baja Altura (Decision Book §6.6.1-§6.6.2, page-06.json/page-22.json) ---

test('resolveLowAltitudeCounterattackShot: A.A.=6 (esquema "Unidad principal"), tirada 1 -> 1 impacto, no destruye (Protección 3)', () => {
  const t = table(page06, 'low-altitude-counterattack');
  const shot = engine.resolveLowAltitudeCounterattackShot(t, tableEngine, { roll: 1, defenderAaTotal: 6, attackerProtection: 3 });
  assert.equal(shot.impacts, 1);
  assert.equal(shot.destroyed, false);
});

test('resolveLowAltitudeCounterattackShot: A.A.=6 (esquema "Unidad principal"), tirada 6 -> 3 impactos, destruye (Protección 3)', () => {
  const t = table(page06, 'low-altitude-counterattack');
  const shot = engine.resolveLowAltitudeCounterattackShot(t, tableEngine, { roll: 6, defenderAaTotal: 6, attackerProtection: 3 });
  assert.equal(shot.impacts, 3);
  assert.equal(shot.destroyed, true);
});

test('resolveLowAltitudeCounterattackShot: celda "." (A.A.=1, tirada 0) da 0 impactos, no destruye nunca', () => {
  const t = table(page06, 'low-altitude-counterattack');
  const shot = engine.resolveLowAltitudeCounterattackShot(t, tableEngine, { roll: 0, defenderAaTotal: 1, attackerProtection: 1 });
  assert.equal(shot.result.rawCell, '.');
  assert.equal(shot.impacts, 0);
  assert.equal(shot.destroyed, false);
});

// Reconstrucción razonada del ejemplo de la Decision Book (§6.4, nota 18): 4
// aviones de baja altura (A, B, C, D), Protección 3 cada uno, atacan una
// formación de superficie. El texto da tiradas y resultados finales exactos
// ("2,3,3,6" -> "1,2,2,3", orden B,C,D,A; solo A resulta destruida) pero
// afirma un A.A. total de 8 (4 buques x 2) SIN restablecer cuántos buques
// sobrevivieron al ataque previo de los aviones. Contra la tabla de página 22
// ya verificada a 600 DPI, A.A.=8 (columna "5+") NO reproduce ninguno de los
// 4 resultados; A.A.=4 (columna "4") los reproduce los 4 exactamente — la
// única lectura consistente con el ejemplo completo. Ver el comentario de
// `resolveLowAltitudeCounterattackShot` para el razonamiento completo.
test('resolveLowAltitudeCounterattackShot: reproduce el ejemplo del Decision Book §6.4 nota 18 con A.A.=4 (no 8; ver comentario del motor)', () => {
  const t = table(page22, 'surface-artillery-low-altitude-counterattack');
  const rolls = { B: 2, C: 3, D: 3, A: 6 };
  const expectedImpacts = { B: 1, C: 2, D: 2, A: 3 };
  const expectedDestroyed = { B: false, C: false, D: false, A: true };
  Object.keys(rolls).forEach((unit) => {
    const shot = engine.resolveLowAltitudeCounterattackShot(t, tableEngine, { roll: rolls[unit], defenderAaTotal: 4, attackerProtection: 3 });
    assert.equal(shot.impacts, expectedImpacts[unit], `unidad ${unit}: impactos`);
    assert.equal(shot.destroyed, expectedDestroyed[unit], `unidad ${unit}: destruida`);
  });
});

// --- Interceptación de Misiles Balísticos: "Interceptación de Alta Velocidad" (Decision Book §6.9.2) ---

test('checkHighSpeedInterceptionFailure: tirada natural 0 falla siempre', () => {
  assert.equal(engine.checkHighSpeedInterceptionFailure(0), true);
});

test('checkHighSpeedInterceptionFailure: cualquier tirada natural distinta de 0 no falla por esta regla', () => {
  for (let roll = 1; roll <= 9; roll += 1) {
    assert.equal(engine.checkHighSpeedInterceptionFailure(roll), false, `tirada ${roll}`);
  }
});

// ---------- Selección de unidad/plan (correcciones.md COR-007) ----------
// Datos reales ya transcritos, no inventados: F-2A/B japonés (el propio
// golden test), F-5E surcoreano (plan sin variante de carga pesada) y
// BS-MG japonés (buque, loadFormat "single").

const jpAttackPlans = readJson('ammunition/attack-plans/jp.json');
const krAttackPlans = readJson('ammunition/attack-plans/kr.json');
const jpNavalPlans = readJson('ammunition/naval-plans/jp.json');
const chNavalPlans = readJson('ammunition/naval-plans/ch.json');

const f2ab = jpAttackPlans.units.find((u) => u.id === 'jp-f-2ab');
const f5e = krAttackPlans.units.find((u) => u.id === 'kr-f-5e');
const bsMg = jpNavalPlans.surfaceShips.find((u) => u.id === 'jp-bs-mg');
const bs055 = chNavalPlans.surfaceShips.find((u) => u.id === 'ch-bs-055');

test('derivePlanMethod: deriva el método a partir del icono de munición (4 iconos guiados reconocidos, vía methodOptions del workflow real)', () => {
  assert.equal(engine.derivePlanMethod({ icons: ['munition_subsonic'] }, methodOptions), 'subsonic');
  assert.equal(engine.derivePlanMethod({ icons: ['munition_supersonic'] }, methodOptions), 'supersonic');
  assert.equal(engine.derivePlanMethod({ icons: ['munition_parabolic'] }, methodOptions), 'ballistic');
  assert.equal(engine.derivePlanMethod({ icons: ['munition_near_space'] }, methodOptions), 'near_space');
});

test('derivePlanMethod: munición no guiada (o sin icono reconocido) no tiene método guiado — devuelve null, no inventa uno', () => {
  assert.equal(engine.derivePlanMethod({ icons: ['munition_unguided'] }, methodOptions), null);
  assert.equal(engine.derivePlanMethod({ icons: [] }, methodOptions), null);
  assert.equal(engine.derivePlanMethod({}, methodOptions), null);
});

test('buildAntishipPlanOptions: F-2A/B (Japón) — solo ofrece los planes antibuque con método guiado reconocido', () => {
  const options = engine.buildAntishipPlanOptions(f2ab, methodOptions);
  // El plan A (GPB, munition_unguided) se excluye: no tiene método guiado.
  assert.deepEqual(options.map((o) => o.letter).sort(), ['B', 'C', 'D']);
  const planB = options.find((o) => o.letter === 'B');
  assert.equal(planB.method, 'subsonic');
  assert.equal(planB.plan.munition, 'Type 93');
});

test('buildAntishipPlanOptions: unidad con domainSplit:false (special-unit-plans) usa el mapa de planes plano', () => {
  const helicopter = { domainSplit: false, plans: { A: { munition: 'ROCKET', icons: ['munition_unguided'], full: { damage: 12 } }, B: { munition: 'HELLFIRE', icons: ['munition_subsonic'], full: { damage: 8 } } } };
  const options = engine.buildAntishipPlanOptions(helicopter, methodOptions);
  assert.deepEqual(options.map((o) => o.letter), ['B']);
});

// --- resoluble (correcciones.02.md COR02-005) ---
// Balístico/Espacio Cercano siguen siendo métodos guiados válidos (se
// incluyen en las opciones, con su munición e icono ya transcritos), pero
// `resoluble: false` porque su daño final depende de la marca de Escudo del
// buque objetivo — un dato real (Decision Book §9.x) que este proyecto no
// tiene transcrito para ninguna unidad. El BS-055 chino (plan C, YJ-21,
// icono munition_parabolic) es un caso real, no inventado.
test('buildAntishipPlanOptions: un plan Subsónico/Supersónico es resoluble', () => {
  const options = engine.buildAntishipPlanOptions(f2ab, methodOptions);
  const planB = options.find((o) => o.letter === 'B'); // Type 93, subsónico
  assert.equal(planB.method, 'subsonic');
  assert.equal(planB.resoluble, true);
});

test('buildAntishipPlanOptions: un plan Balístico (BS-055 chino, YJ-21) NO es resoluble — falta el dato de Escudo', () => {
  assert.ok(bs055, 'debería existir la unidad ch-bs-055 en naval-plans/ch.json');
  const options = engine.buildAntishipPlanOptions(bs055, methodOptions);
  const planC = options.find((o) => o.letter === 'C');
  assert.ok(planC, 'el plan C (YJ-21) debería seguir apareciendo en las opciones, solo que no resoluble');
  assert.equal(planC.method, 'ballistic');
  assert.equal(planC.resoluble, false);
});

test('buildAntishipPlanOptions: resoluble coincide exactamente con damagePerImpactForMethod !== null', () => {
  ['subsonic', 'supersonic', 'ballistic', 'near_space'].forEach((method) => {
    const plan = { munition: 'X', icons: [{ subsonic: 'munition_subsonic', supersonic: 'munition_supersonic', ballistic: 'munition_parabolic', near_space: 'munition_near_space' }[method]], loadFormat: 'single', full: { damage: 1 } };
    const [option] = engine.buildAntishipPlanOptions({ domainSplit: false, plans: { A: plan } }, methodOptions);
    assert.equal(option.resoluble, engine.damagePerImpactForMethod(method, methodOptions) !== null, `método ${method}`);
  });
});

test('derivePlanAttackValue: unidad con carga pesada/ligera (F-2A/B, Perfil B) — reproduce el "6" del golden test con carga ligera', () => {
  const planB = f2ab.plans.antiShip.B;
  assert.equal(planB.loadFormat, 'dual');
  // known-ambiguities.md (2026-09-27): heavy = primer número impreso = Carga
  // pesada; light = segundo = Carga ligera. Para "4/6": pesada=4, ligera=6.
  assert.equal(engine.derivePlanAttackValue(planB, { loadType: 'heavy', damaged: false }), 4);
  assert.equal(engine.derivePlanAttackValue(planB, { loadType: 'light', damaged: false }), 6);
});

test('derivePlanAttackValue: unidad con valores distintos en estado completo y dañado (F-2A/B, Perfil B)', () => {
  const planB = f2ab.plans.antiShip.B;
  assert.equal(engine.derivePlanAttackValue(planB, { loadType: 'heavy', damaged: false }), 4);
  assert.equal(engine.derivePlanAttackValue(planB, { loadType: 'heavy', damaged: true }), 2);
  assert.equal(engine.derivePlanAttackValue(planB, { loadType: 'light', damaged: false }), 6);
  assert.equal(engine.derivePlanAttackValue(planB, { loadType: 'light', damaged: true }), 3);
});

test('derivePlanAttackValue: unidad con formato de carga simple (BS-MG, buque japonés) — un único valor, sin distinción pesada/ligera', () => {
  const planA = bsMg.plans.antiShip.A;
  assert.equal(planA.loadFormat, 'single');
  assert.equal(engine.derivePlanAttackValue(planA, { damaged: false }), 1);
  assert.equal(engine.derivePlanAttackValue(planA, { damaged: true }), 1);
});

test('derivePlanAttackValue: plan sin variante de carga pesada (F-5E surcoreano, Perfil B) devuelve null, no 0', () => {
  const planB = f5e.plans.antiShip.B;
  assert.equal(planB.full.heavy, null);
  assert.equal(engine.derivePlanAttackValue(planB, { loadType: 'heavy', damaged: false }), null);
  assert.equal(engine.derivePlanAttackValue(planB, { loadType: 'light', damaged: false }), 6);
});

test('derivePlanRange: lee el alcance transcrito del lado completo/dañado correspondiente', () => {
  const planB = f2ab.plans.antiShip.B;
  assert.equal(engine.derivePlanRange(planB, { damaged: false }), 3);
  assert.equal(engine.derivePlanRange(planB, { damaged: true }), 3);
});

test('attackDistanceBucket: reproduce los 3 buckets de fleet_electronic_resistance#attack_distance, leídos de las opciones reales del workflow', () => {
  assert.equal(engine.attackDistanceBucket(0, attackDistanceBucketOptions), '0_2');
  assert.equal(engine.attackDistanceBucket(2, attackDistanceBucketOptions), '0_2');
  assert.equal(engine.attackDistanceBucket(3, attackDistanceBucketOptions), '3_5');
  assert.equal(engine.attackDistanceBucket(5, attackDistanceBucketOptions), '3_5');
  assert.equal(engine.attackDistanceBucket(6, attackDistanceBucketOptions), '6plus');
  assert.equal(engine.attackDistanceBucket('', attackDistanceBucketOptions), null);
  assert.equal(engine.attackDistanceBucket('no-es-un-numero', attackDistanceBucketOptions), null);
});

test('attackDistanceBucket/parseDistanceBucketValue: un value que no sigue "N_M" ni "Nplus" no se asume ningún rango', () => {
  assert.equal(engine.attackDistanceBucket(4, [{ value: 'texto-libre' }]), null);
});

// COR02-010 (correcciones.02.md): attack_intensity#distance del workflow 08
// usa buckets de un único número exacto ("0"/"1"/"2plus"), distinto de los
// rangos "N_M" del workflow 07 — mismo parser genérico, formato adicional.
test('attackDistanceBucket: reproduce los 3 buckets exactos de attack_intensity#distance del workflow 08 ("0"/"1"/"2plus")', () => {
  const bucketOptions = [{ value: '0' }, { value: '1' }, { value: '2plus' }];
  assert.equal(engine.attackDistanceBucket(0, bucketOptions), '0');
  assert.equal(engine.attackDistanceBucket(1, bucketOptions), '1');
  assert.equal(engine.attackDistanceBucket(2, bucketOptions), '2plus');
  assert.equal(engine.attackDistanceBucket(10, bucketOptions), '2plus');
});

// COR02-006 (correcciones.02.md): munitionIconRef/damagePerImpact ya no son
// constantes de combat-wizard-engine.js — viven en las opciones de la
// pregunta `method` del workflow real. Este test protege su esquema para
// que derivePlanMethod/damagePerImpactForMethod puedan seguir leyéndolas.
test('workflows/07_ataque_antibuque_guiado.json#method.options: cada opción declara munitionIconRef único y damagePerImpact (número o null explícito)', () => {
  assert.equal(methodOptions.length, 4, 'se esperan exactamente los 4 métodos guiados');
  const iconRefs = methodOptions.map((o) => o.munitionIconRef);
  iconRefs.forEach((ref) => assert.equal(typeof ref, 'string', 'munitionIconRef debería ser un icono transcrito'));
  assert.equal(iconRefs.length, new Set(iconRefs).size, 'munitionIconRef duplicado entre 2 métodos');
  methodOptions.forEach((o) => {
    assert.ok(Object.prototype.hasOwnProperty.call(o, 'damagePerImpact'), `${o.value}: falta damagePerImpact (debe ser un número o null explícito, nunca "undefined")`);
    assert.ok(o.damagePerImpact === null || typeof o.damagePerImpact === 'number', `${o.value}: damagePerImpact debería ser número o null`);
  });
});

test('workflows/07_ataque_antibuque_guiado.json#method.options: cada opción declara finalTableRowScheme ("sub_sup"/"par_ec") e impliesCmBmMarker (booleano) — correcciones03.md COR03-002', () => {
  const validSchemes = ['sub_sup', 'par_ec'];
  methodOptions.forEach((o) => {
    assert.ok(validSchemes.includes(o.finalTableRowScheme), `${o.value}: finalTableRowScheme "${o.finalTableRowScheme}" no es "sub_sup" ni "par_ec"`);
    assert.equal(typeof o.impliesCmBmMarker, 'boolean', `${o.value}: impliesCmBmMarker debería ser un booleano explícito, nunca "undefined"`);
  });
  assert.equal(methodOptions.find((o) => o.value === 'ballistic').impliesCmBmMarker, true, 'Balístico = Misil Balístico (BM) siempre implica marcador CM/BM');
  assert.equal(methodOptions.filter((o) => o.impliesCmBmMarker).length, 1, 'solo Balístico debería implicar el marcador automáticamente');
});

test('workflows/07_ataque_antibuque_guiado.json#cmBmMarkerIcons: array no vacío de icon IDs conocidos, sin duplicados', () => {
  assert.ok(Array.isArray(cmBmMarkerIcons) && cmBmMarkerIcons.length > 0, 'cmBmMarkerIcons debería ser un array no vacío');
  assert.equal(cmBmMarkerIcons.length, new Set(cmBmMarkerIcons).size, 'cmBmMarkerIcons no debería tener IDs duplicados');
  const iconsDir = path.join(DATA_DIR, 'sources', 'tcw_attack_workflows', 'icons');
  cmBmMarkerIcons.forEach((iconId) => {
    assert.ok(fs.existsSync(path.join(iconsDir, `${iconId}.png`)), `cmBmMarkerIcons: "${iconId}" no tiene un PNG transcrito en data/sources/tcw_attack_workflows/icons/`);
  });
});

test('rules/dice-formulas.json: cada fórmula declara label/rollCount/pick válidos y sourceRefs', () => {
  const validPicks = ['single', 'highest', 'lowest'];
  const formulaIds = Object.keys(diceFormulas.formulas);
  assert.ok(formulaIds.length >= 3, 'se esperan al menos las 3 fórmulas ya usadas por los workflows');
  formulaIds.forEach((id) => {
    const f = diceFormulas.formulas[id];
    assert.equal(typeof f.label, 'string', `${id}: label debería ser texto`);
    assert.ok(Number.isInteger(f.rollCount) && f.rollCount > 0, `${id}: rollCount debería ser un entero positivo`);
    assert.ok(validPicks.includes(f.pick), `${id}: pick "${f.pick}" no es "single"/"highest"/"lowest"`);
    assert.ok(Array.isArray(f.sourceRefs) && f.sourceRefs.length > 0, `${id}: sin sourceRefs`);
  });
  // Todo diceRule/effects[].value que el workflow 07 declara (el único con
  // wizard real, antiship-guided-wizard.js) debe resolver a una fórmula
  // declarada — nunca un ID huérfano sin significado. No se exige lo mismo
  // de otros workflows (02/12) cuyos diceRules todavía no consume ningún
  // wizard: extender dice-formulas.json a sus IDs es tarea de cuando esos
  // wizards se construyan, no de esta corrección.
  methodOptions.forEach((o) => {
    const diceValue = (o.effects || []).find((e) => e.type === 'dice' && e.target === 'attack_resolution');
    if (!diceValue) return;
    assert.ok(diceFormulas.formulas[diceValue.value], `"${diceValue.value}" (método ${o.value}) no está declarado en dice-formulas.json`);
  });
});

test('workflows/07_ataque_antibuque_guiado.json#attack_distance.options: cada value sigue el formato "N_M" o "Nplus" que attackDistanceBucket sabe interpretar', () => {
  assert.equal(attackDistanceBucketOptions.length, 3, 'se esperan exactamente los 3 buckets de distancia');
  attackDistanceBucketOptions.forEach((o) => {
    assert.match(o.value, /^\d+(_\d+|plus)$/, `${o.value}: no sigue el formato "N_M"/"Nplus"`);
  });
});

test('isDistanceWithinRange: distancia en el límite y fuera del límite del alcance del plan', () => {
  assert.equal(engine.isDistanceWithinRange(3, 3), true, 'en el límite exacto: dentro de alcance');
  assert.equal(engine.isDistanceWithinRange(4, 3), false, 'un hexágono más allá: fuera de alcance');
  assert.equal(engine.isDistanceWithinRange(0, 3), true);
  assert.equal(engine.isDistanceWithinRange(3, null), false, 'alcance no transcrito: nunca se trata como "sin límite"');
});

// --- derivePlanCmOrBmMarker / deriveShortRangeRestriction
// (correcciones.02.md COR02-004, alcance reducido tras COR02-005) ---

test('derivePlanCmOrBmMarker: un método Balístico siempre cuenta como Misil Balístico (BM), aunque el plan no lleve icono de marcador (methodOptions[].impliesCmBmMarker, correcciones03.md COR03-002)', () => {
  const planC = bs055.plans.antiShip.C; // YJ-21, icons: ["munition_parabolic"]
  assert.equal(engine.derivePlanCmOrBmMarker(planC, 'ballistic', methodOptions, cmBmMarkerIcons), true);
});

test('derivePlanCmOrBmMarker: un plan sin marcador CM/BM y método Subsónico/Supersónico no está marcado', () => {
  const planB = f2ab.plans.antiShip.B; // Type 93, icons: ["munition_subsonic"]
  assert.equal(engine.derivePlanCmOrBmMarker(planB, 'subsonic', methodOptions, cmBmMarkerIcons), false);
});

test('derivePlanCmOrBmMarker: un plan con icono de marcador CM/LF-CM/SUP.CM está marcado, incluso combinado con un método guiado reconocido', () => {
  // Ningún plan antibuque ya transcrito combina hoy un icono de método
  // guiado con un marcador CM (los únicos casos reales con marcador,
  // p.ej. ch-bs-055 plan B "CJ" en landAttack o ru-bs-1155m plan E "3M22"
  // en antiShip, no llevan ningún icono de GUIDED_METHOD_BY_ICON — ver
  // correcciones.02.md COR02-004), pero el patrón de icons[] combinados sí
  // existe en datos reales (p.ej. NSM: ["attack_high_penetration",
  // "munition_subsonic"]), así que la función debe reconocerlo si ocurre.
  const marked = { munition: 'X', icons: ['munition_subsonic', 'marker_cruise_missile'] };
  assert.equal(engine.derivePlanCmOrBmMarker(marked, 'subsonic', methodOptions, cmBmMarkerIcons), true);
  const markedLf = { munition: 'X', icons: ['munition_supersonic', 'marker_low_flight_cruise_missile'] };
  assert.equal(engine.derivePlanCmOrBmMarker(markedLf, 'supersonic', methodOptions, cmBmMarkerIcons), true);
  const markedSup = { munition: 'X', icons: ['munition_supersonic', 'marker_supersonic_cruise_missile'] };
  assert.equal(engine.derivePlanCmOrBmMarker(markedSup, 'supersonic', methodOptions, cmBmMarkerIcons), true);
});

test('derivePlanCmOrBmMarker: el campo `cruiseMissile` transcrito también marca el plan, aunque falte el icono', () => {
  const marked = { munition: 'X', icons: ['munition_subsonic'], cruiseMissile: 'CM' };
  assert.equal(engine.derivePlanCmOrBmMarker(marked, 'subsonic', methodOptions, cmBmMarkerIcons), true);
});

test('derivePlanCmOrBmMarker: sin plan no hay nada que derivar — false, no null (nunca bloquea la etapa por un dato ausente que no aplica)', () => {
  assert.equal(engine.derivePlanCmOrBmMarker(null, 'subsonic', methodOptions, cmBmMarkerIcons), false);
});

test('deriveShortRangeRestriction: distancia 1 siempre aplica la restricción, sea cual sea la misión', () => {
  assert.equal(engine.deriveShortRangeRestriction(1, ''), 'yes');
  assert.equal(engine.deriveShortRangeRestriction(1, 'no'), 'yes');
});

test('deriveShortRangeRestriction: distancia > 2 nunca aplica la restricción, sea cual sea la misión', () => {
  assert.equal(engine.deriveShortRangeRestriction(3, ''), 'no');
  assert.equal(engine.deriveShortRangeRestriction(8, 'yes'), 'no');
});

test('deriveShortRangeRestriction: distancia exactamente 2 es el único caso ambiguo — depende de si es Misión de Área', () => {
  assert.equal(engine.deriveShortRangeRestriction(2, ''), null, 'sin respuesta de Misión de Área todavía: no se puede derivar');
  assert.equal(engine.deriveShortRangeRestriction(2, 'yes'), 'yes');
  assert.equal(engine.deriveShortRangeRestriction(2, 'no'), 'no');
});

test('deriveShortRangeRestriction: distancia vacía o no numérica no se puede derivar', () => {
  assert.equal(engine.deriveShortRangeRestriction('', 'yes'), null);
  assert.equal(engine.deriveShortRangeRestriction('no-es-un-numero', 'yes'), null);
});

// --- Interceptación de Munición con consumo Bajo y contra ataques balísticos ("Interceptación
// Terminal", Decision Book §6.5.1/§6.9.2; known-ambiguities.md, 2026-10-04). Valores leídos de la
// página 4 impresa (Tablas-de-combate 5.pdf), no derivados de la propia función. ---

test('resolveInterceptionShot: consumo "low" agrupa el A.A. (3 -> columna "2~3"; 5 -> "4~5") con los mismos datos de celda que Alto 1/2', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const aa3 = engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 9, modifierTotal: 0, defenderAaValue: 3, consumption: 'low' });
  assert.equal(aa3.result.columnLabel, '2~3');
  assert.equal(aa3.result.rawCell, '-1'); // fila 9, 1ª columna de datos
  const aa5 = engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 9, modifierTotal: 0, defenderAaValue: 5, consumption: 'low' });
  assert.equal(aa5.result.columnLabel, '4~5');
  assert.equal(aa5.result.rawCell, '-2'); // fila 9, 2ª columna de datos
});

test('resolveInterceptionShot: consumo "low" con A.A.=1 no puede interceptar (no hay columna Bajo para 1) — no lanza ni inventa celda', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const shot = engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 9, modifierTotal: 0, defenderAaValue: 1, consumption: 'low' });
  assert.equal(shot.notEligible, true);
  assert.equal(shot.result, null);
});

test('resolveInterceptionShot: consumo "low" respeta el tope Más Allá del Horizonte (A.A.=8 sin alerta temprana -> como 5 -> "4~5"; con alerta temprana -> "8+")', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const capped = engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 9, modifierTotal: 0, defenderAaValue: 8, earlyWarning: false, consumption: 'low' });
  assert.equal(capped.result.columnLabel, '4~5');
  assert.equal(capped.horizonCap.capped, true);
  const warned = engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 9, modifierTotal: 0, defenderAaValue: 8, earlyWarning: true, consumption: 'low' });
  assert.equal(warned.result.columnLabel, '8+');
  assert.equal(warned.result.rawCell, '-3'); // fila 9, 4ª columna de datos
});

test('resolveInterceptionShot: la misma agrupación Bajo existe en munition-interception-unguided (page-08.json)', () => {
  const interceptionTable = table(page08, 'munition-interception-unguided');
  const shot = engine.resolveInterceptionShot(interceptionTable, tableEngine, { roll: 9, modifierTotal: 0, defenderAaValue: 9, earlyWarning: true, consumption: 'low' });
  assert.equal(shot.result.columnLabel, '8+');
  assert.equal(shot.result.rawCell, '-3');
});

test('resolveBallisticMunitionInterceptionShot: 2d10 toma la MENOR (7 y 5 -> 5) y usa consumo Bajo', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const shot = engine.resolveBallisticMunitionInterceptionShot(interceptionTable, tableEngine, { roll: 7, roll2: 5, modifierTotal: -1, defenderAaValue: 8, earlyWarning: true });
  assert.equal(shot.naturalRoll, 5);
  assert.equal(shot.modifiedRoll, 4);
  assert.equal(shot.noEffect, false);
  assert.equal(shot.result.columnLabel, '8+');
  assert.equal(shot.result.rawCell, '-2'); // fila 4, 4ª columna de datos
});

test('resolveBallisticMunitionInterceptionShot: tirada natural 0 (la menor de las dos) falla por Alta Velocidad (§6.9.2), aunque el modificador la suba', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const shot = engine.resolveBallisticMunitionInterceptionShot(interceptionTable, tableEngine, { roll: 0, roll2: 6, modifierTotal: 3, defenderAaValue: 4 });
  assert.equal(shot.noEffect, true);
  assert.match(shot.reason, /Alta Velocidad/);
});

test('resolveBallisticMunitionInterceptionShot: resultado modificado 0 (o negativo) no tiene efecto (§6.5.4) y no consulta la tabla', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const zero = engine.resolveBallisticMunitionInterceptionShot(interceptionTable, tableEngine, { roll: 2, roll2: 4, modifierTotal: -2, defenderAaValue: 4 });
  assert.equal(zero.noEffect, true);
  const negative = engine.resolveBallisticMunitionInterceptionShot(interceptionTable, tableEngine, { roll: 2, roll2: 4, modifierTotal: -3, defenderAaValue: 4 });
  assert.equal(negative.noEffect, true);
  assert.equal(negative.result, null);
});

test('resolveBallisticMunitionInterceptionShot: A.A.=1 no puede interceptar (solo consumo Bajo); sin roll2 lanza error explícito', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const shot = engine.resolveBallisticMunitionInterceptionShot(interceptionTable, tableEngine, { roll: 8, roll2: 9, modifierTotal: 0, defenderAaValue: 1 });
  assert.equal(shot.noEffect, true);
  assert.throws(() => engine.resolveBallisticMunitionInterceptionShot(interceptionTable, tableEngine, { roll: 8, modifierTotal: 0, defenderAaValue: 4 }), /2d10/);
});

test('sumInterceptionReductions: ignora los disparos sin efecto / no elegibles en vez de fallar', () => {
  const interceptionTable = table(page04, 'munition-interception-standard');
  const ok = engine.resolveBallisticMunitionInterceptionShot(interceptionTable, tableEngine, { roll: 7, roll2: 5, modifierTotal: -1, defenderAaValue: 8, earlyWarning: true });
  const failed = engine.resolveBallisticMunitionInterceptionShot(interceptionTable, tableEngine, { roll: 0, roll2: 6, modifierTotal: 0, defenderAaValue: 4 });
  assert.equal(engine.sumInterceptionReductions([ok, failed]), -2);
});
