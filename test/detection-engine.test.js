const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/detection-engine.js');

// correcciones.02.md COR02-006: los valores/listas fijos que antes vivían
// incrustados en detection-engine.js (alcance fijo de baja altitud,
// multiplicador de terreno, acciones de "brevemente detectable", tipos de
// detector terrestre/naval) ahora viven en data/detection/help-sheet.json —
// se cargan aquí, como haría la UI real, en vez de repetirlos a mano.
const helpSheet = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'detection', 'help-sheet.json'), 'utf8'));
const briefActions = helpSheet.groundDetection.brieflyDetectableTriggers.actions;
const capableTypes = helpSheet.groundDetection.whoCanDetect.capableTypes;
const incapableTypes = helpSheet.groundDetection.whoCanDetect.cannotDetect;
const navalRules = helpSheet.navalDetection.detectedBy;
const lowAltitudeFixedRangeHex = helpSheet.airDetection.lowAltitudeFixedRangeHex;
const terrainMultiplier = helpSheet.groundDetection.mobileUnitDetectability.terrainMultiplier;

// --- Detección aire-aire (1.2) ---

test('resolveAirToAirExposure: distancia <= firma aérea del objetivo expone', () => {
  const r = engine.resolveAirToAirExposure({ hexDistance: 3, targetAirSignature: 5 });
  assert.equal(r.exposed, true);
  assert.match(r.reason, /no supera/);
});

test('resolveAirToAirExposure: distancia > firma aérea del objetivo no expone', () => {
  const r = engine.resolveAirToAirExposure({ hexDistance: 6, targetAirSignature: 5 });
  assert.equal(r.exposed, false);
  assert.match(r.reason, /supera/);
});

test('resolveAirToAirExposure: distancia igual a la firma expone (umbral inclusivo)', () => {
  const r = engine.resolveAirToAirExposure({ hexDistance: 5, targetAirSignature: 5 });
  assert.equal(r.exposed, true);
});

// KF-16C/D (firma aérea 3) vs J-16 (firma aérea 5): mismos valores que el
// ejemplo de data/detection/help-sheet.json#airDetection.workedExample. La
// hoja no transcribe la distancia exacta en hexágonos de cada uno de los 3
// casos (no es medible con precisión en sus fotografías), así que las
// distancias usadas aquí son ilustrativas, elegidas para reproducir cada uno
// de los 3 resultados cualitativos que sí describe la hoja — no un dato
// transcrito literalmente.
const KF16 = { id: 'kf-16c-d', airSignature: 3 };
const J16 = { id: 'j-16', airSignature: 5 };

test('resolveAirToAirMutualExposure: distancia dentro de ambas firmas expone mutuamente', () => {
  const r = engine.resolveAirToAirMutualExposure({ hexDistance: 2, unitA: KF16, unitB: J16 });
  assert.equal(r.outcome, 'mutual');
  assert.equal(r.aExposesB.exposed, true);
  assert.equal(r.bExposesA.exposed, true);
});

test('resolveAirToAirMutualExposure: distancia entre ambas firmas expone en un solo sentido', () => {
  // 3 < 4 <= 5: KF-16C/D (firma 5 de J-16 como umbral) expone a J-16, pero
  // J-16 (firma 3 de KF-16 como umbral) no expone al KF-16C/D — coincide con
  // "el KF-16C/D surcoreano expone al J-16 chino, pero no al contrario".
  const r = engine.resolveAirToAirMutualExposure({ hexDistance: 4, unitA: KF16, unitB: J16 });
  assert.equal(r.outcome, 'one-way');
  assert.equal(r.aExposesB.exposed, true);
  assert.equal(r.bExposesA.exposed, false);
});

test('resolveAirToAirMutualExposure: distancia fuera de ambas firmas no expone a ninguno', () => {
  const r = engine.resolveAirToAirMutualExposure({ hexDistance: 6, unitA: KF16, unitB: J16 });
  assert.equal(r.outcome, 'none');
  assert.equal(r.aExposesB.exposed, false);
  assert.equal(r.bExposesA.exposed, false);
});

// --- Detección naval de unidades aéreas ---

test('resolveSurfaceDetectsAir: unidad de baja altitud usa el alcance fijo de la hoja (1 hex)', () => {
  const dentro = engine.resolveSurfaceDetectsAir({ hexDistance: 1, targetIsLowAltitude: true, lowAltitudeFixedRangeHex });
  assert.equal(dentro.exposed, true);
  assert.equal(dentro.rule, 'low-altitude-fixed-range');
  const fuera = engine.resolveSurfaceDetectsAir({ hexDistance: 2, targetIsLowAltitude: true, lowAltitudeFixedRangeHex });
  assert.equal(fuera.exposed, false);
});

test('resolveSurfaceDetectsAir: unidad aérea normal usa su firma terrestre como umbral', () => {
  const r = engine.resolveSurfaceDetectsAir({ hexDistance: 4, targetIsLowAltitude: false, targetGroundSignature: 4, lowAltitudeFixedRangeHex });
  assert.equal(r.exposed, true);
  assert.equal(r.rule, 'ground-signature');
  const r2 = engine.resolveSurfaceDetectsAir({ hexDistance: 5, targetIsLowAltitude: false, targetGroundSignature: 4, lowAltitudeFixedRangeHex });
  assert.equal(r2.exposed, false);
});

// --- Detectabilidad de unidades terrestres móviles ---

test('resolveGroundMobileDetectability: unidad principal detectable cuando Terreno×4 < Fuerza', () => {
  const r = engine.resolveGroundMobileDetectability({ unitType: 'main', terrainValue: 1, strengthOrTechnicalCount: 5, terrainMultiplier });
  assert.equal(r.detectable, true);
  assert.equal(r.state, 'detectable');
  assert.equal(r.threshold, 4);
});

test('resolveGroundMobileDetectability: unidad principal oculta cuando Terreno×4 >= Fuerza', () => {
  const r = engine.resolveGroundMobileDetectability({ unitType: 'main', terrainValue: 2, strengthOrTechnicalCount: 5, terrainMultiplier });
  assert.equal(r.detectable, false);
  assert.equal(r.state, 'hidden');
});

test('resolveGroundMobileDetectability: unidad técnica usa el número de unidades técnicas', () => {
  const r = engine.resolveGroundMobileDetectability({ unitType: 'technical', terrainValue: 1, strengthOrTechnicalCount: 3, terrainMultiplier });
  assert.equal(r.detectable, false);
  assert.match(r.reason, /unidades técnicas/);
});

test('resolveGroundMobileDetectability: unitType desconocido lanza un error explícito, no adivina', () => {
  assert.throws(() => engine.resolveGroundMobileDetectability({ unitType: 'naval', terrainValue: 1, strengthOrTechnicalCount: 5, terrainMultiplier }));
});

// --- Brevemente detectable ---

test('resolveBrieflyDetectable: una acción de la lista dispara el estado temporal', () => {
  const r = engine.resolveBrieflyDetectable({ action: 'movement', actions: briefActions });
  assert.equal(r.triggers, true);
  assert.equal(r.state, 'briefly-detectable');
});

test('resolveBrieflyDetectable: una acción fuera de la lista no dispara el estado', () => {
  const r = engine.resolveBrieflyDetectable({ action: 'reload', actions: briefActions });
  assert.equal(r.triggers, false);
  assert.equal(r.state, 'hidden');
});

test('help-sheet.json#brieflyDetectableTriggers.actions: expone exactamente las 4 acciones de la hoja', () => {
  assert.deepEqual(briefActions.map((a) => a.id).sort(), ['fire', 'movement', 'retreat', 'support'].sort());
});

// --- Instalaciones fijas ---

test('resolveFixedInstallationExposure: siempre expuesta, sin cálculo', () => {
  const r = engine.resolveFixedInstallationExposure();
  assert.equal(r.exposed, true);
  assert.equal(r.state, 'continuously-exposed');
});

// --- Quién puede detectar unidades terrestres ---

test('resolveGroundDetectorEligibility: unidades aéreas/baja altitud en ISR sí pueden', () => {
  assert.equal(engine.resolveGroundDetectorEligibility({ detectorType: 'air-isr', capableTypes, incapableTypes }).capable, true);
  assert.equal(engine.resolveGroundDetectorEligibility({ detectorType: 'low-altitude-isr', capableTypes, incapableTypes }).capable, true);
});

test('resolveGroundDetectorEligibility: terrestres/navales/submarinas no pueden', () => {
  assert.equal(engine.resolveGroundDetectorEligibility({ detectorType: 'ground', capableTypes, incapableTypes }).capable, false);
  assert.equal(engine.resolveGroundDetectorEligibility({ detectorType: 'naval', capableTypes, incapableTypes }).capable, false);
  assert.equal(engine.resolveGroundDetectorEligibility({ detectorType: 'submarine', capableTypes, incapableTypes }).capable, false);
});

test('resolveGroundDetectorEligibility: detectorType desconocido lanza un error explícito', () => {
  assert.throws(() => engine.resolveGroundDetectorEligibility({ detectorType: 'satellite', capableTypes, incapableTypes }));
});

// --- Detección de unidades navales (quién puede exponer a un buque) ---

test('resolveNavalDetectorEligibility: unidad de superficie siempre puede, sin condición', () => {
  const r = engine.resolveNavalDetectorEligibility({ detectorType: 'surface', rules: navalRules });
  assert.equal(r.capable, true);
  assert.match(r.reason, /sin condición/);
});

test('resolveNavalDetectorEligibility: unidad aérea necesita misión especial/ISR', () => {
  const conMision = engine.resolveNavalDetectorEligibility({ detectorType: 'air', conditionMet: true, rules: navalRules });
  assert.equal(conMision.capable, true);
  const sinMision = engine.resolveNavalDetectorEligibility({ detectorType: 'air', conditionMet: false, rules: navalRules });
  assert.equal(sinMision.capable, false);
});

test('resolveNavalDetectorEligibility: unidad terrestre necesita hex. costero', () => {
  const r = engine.resolveNavalDetectorEligibility({ detectorType: 'ground', conditionMet: true, rules: navalRules });
  assert.equal(r.capable, true);
  assert.equal(r.conditionLabel, 'Unidad en hexágono costero');
});

test('resolveNavalDetectorEligibility: unidad de baja altitud necesita lado operativo', () => {
  const r = engine.resolveNavalDetectorEligibility({ detectorType: 'low-altitude', conditionMet: false, rules: navalRules });
  assert.equal(r.capable, false);
});

test('resolveNavalDetectorEligibility: detectorType desconocido lanza un error explícito', () => {
  assert.throws(() => engine.resolveNavalDetectorEligibility({ detectorType: 'submarine', rules: navalRules }));
});

// --- Detección electrónica ---

test('resolveElectronicDetection: EW contra radar expone electrónicamente', () => {
  const r = engine.resolveElectronicDetection({ attackerHasEwCapability: true, targetHasRadar: true });
  assert.equal(r.exposed, true);
  assert.equal(r.state, 'exposed-electronically');
});

test('resolveElectronicDetection: sin capacidad EW no expone, sin importar el objetivo', () => {
  const r = engine.resolveElectronicDetection({ attackerHasEwCapability: false, targetHasRadar: true });
  assert.equal(r.exposed, false);
  assert.match(r.reason, /no tiene capacidad/);
});

test('resolveElectronicDetection: objetivo sin radar no queda expuesto aunque el atacante tenga EW', () => {
  const r = engine.resolveElectronicDetection({ attackerHasEwCapability: true, targetHasRadar: false });
  assert.equal(r.exposed, false);
  assert.match(r.reason, /no es una unidad de radar/);
});

// --- armEligible / targetIsSurfaceUnit (COR03-004, correcciones03.md: las
// unidades de superficie son unidad de radar válida para exponerse
// electrónicamente, pero el Decision Book §4.4.1 las excluye explícitamente
// de los ataques antirradiación — exposed y armEligible dejan de ser
// sinónimos por esta excepción real) ---

test('resolveElectronicDetection: una unidad de radar normal (no de superficie) expuesta es elegible para ARM', () => {
  const r = engine.resolveElectronicDetection({ attackerHasEwCapability: true, targetHasRadar: true, targetIsSurfaceUnit: false });
  assert.equal(r.exposed, true);
  assert.equal(r.armEligible, true);
});

test('resolveElectronicDetection: un buque de superficie queda expuesto electrónicamente, pero NUNCA es elegible para ARM (Decision Book §4.4.1)', () => {
  const r = engine.resolveElectronicDetection({ attackerHasEwCapability: true, targetHasRadar: true, targetIsSurfaceUnit: true });
  assert.equal(r.exposed, true, 'un buque de superficie sigue siendo una unidad de radar válida a efectos de exposición');
  assert.equal(r.armEligible, false, 'las unidades de superficie no pueden ser objetivo de ataques antirradiación');
  assert.match(r.reason, /nunca son objetivo de ataques antirradiación/);
});

test('resolveElectronicDetection: sin exposición, armEligible es siempre false aunque el objetivo fuera un buque', () => {
  const r = engine.resolveElectronicDetection({ attackerHasEwCapability: false, targetHasRadar: true, targetIsSurfaceUnit: true });
  assert.equal(r.exposed, false);
  assert.equal(r.armEligible, false);
});
