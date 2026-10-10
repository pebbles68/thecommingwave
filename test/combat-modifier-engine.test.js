const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modifierEngine = require('../public/js/combat-modifier-engine.js');
const tableEngine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readTablePage(pageNumber) {
  const fileName = `page-${String(pageNumber).padStart(2, '0')}.json`;
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'tables', fileName), 'utf8'));
}

// Etiquetas reales de data/tables/page-05.json#ground-precision-attack-damage
// (esquema normal_ataque), usadas para probar la mecánica contra un caso real
// en vez de datos sintéticos. No hay golden test oficial para esta tabla
// (ningún wizard la usa todavía): estos tests verifican la mecánica citada en
// Decision Book §5.12.10/§5.13.6 (ver combat-modifier-engine.js), no un
// ejemplo de partida verificado.
const page05 = readTablePage(5);
const table05 = page05.tables.find((t) => t.id === 'ground-precision-attack-damage');
const normalAtaqueLabels = tableEngine.pickAxisLabels(table05.columnAxis, 'normal_ataque');

test('resolveAttackValueColumnShift: sin modificadores, la columna es la del Valor de Ataque tal cual', () => {
  const result = modifierEngine.resolveAttackValueColumnShift(tableEngine, {
    rawAttackValue: 6,
    modifierTotal: 0,
    valueCap: 13,
    columnLabels: normalAtaqueLabels
  });
  assert.equal(result.effectiveValue, 6);
  assert.equal(result.consumedByCap, 0);
  assert.equal(result.remainingShift, 0);
  assert.equal(result.columnLabel, '6');
});

test('resolveAttackValueColumnShift: Valor de Ataque por debajo del límite, el modificador desplaza la columna (Decision Book §5.12.10 paso 4)', () => {
  // Valor de Ataque 6, modificador -3 (por debajo de 13: se busca la columna
  // de "6" y se desplaza 3 columnas a la izquierda) -> "6"(idx5)->"5"(idx4,-1)->"4"(idx3,-2)->"3"(idx2,-3).
  const result = modifierEngine.resolveAttackValueColumnShift(tableEngine, {
    rawAttackValue: 6,
    modifierTotal: -3,
    valueCap: 13,
    columnLabels: normalAtaqueLabels
  });
  assert.equal(result.effectiveValue, 6);
  assert.equal(result.remainingShift, 3);
  assert.equal(result.columnLabel, '3');
});

test('resolveAttackValueColumnShift: Valor de Ataque por encima del límite consume el modificador reduciendo el valor antes de desplazar columna (Decision Book §5.12.10 paso 3)', () => {
  // Valor de Ataque bruto 18, límite 13, modificador -4: primero se reduce
  // 18 -> 14 (consume 4 de reducción, quedando "por encima o hasta" el límite,
  // aquí quedan 0 puntos de desplazamiento tras solo poder bajar hasta 14...
  // pero el límite es 13, así que sigue reduciendo hasta 13 con solo 4 puntos
  // disponibles: 18-4=14, que sigue > 13 pero ya no quedan más puntos de
  // reducción, así que efectiveValue se capa a 13 igualmente (paso 5).
  const result = modifierEngine.resolveAttackValueColumnShift(tableEngine, {
    rawAttackValue: 18,
    modifierTotal: -4,
    valueCap: 13,
    columnLabels: normalAtaqueLabels
  });
  assert.equal(result.consumedByCap, 4);
  assert.equal(result.remainingShift, 0);
  assert.equal(result.effectiveValue, 13);
  assert.equal(result.columnLabel, '13+');
});

test('resolveAttackValueColumnShift: Valor de Ataque por encima del límite con modificador suficiente para bajar hasta el límite Y desplazar columna', () => {
  // Valor de Ataque bruto 15, límite 13: excede en 2. Modificador -5: 2 se
  // consumen para bajar 15->13 (dentro del límite), quedan 3 de desplazamiento
  // desde la columna "13+" (índice 11): 11->10("11~12")->9("10")->8("9").
  const result = modifierEngine.resolveAttackValueColumnShift(tableEngine, {
    rawAttackValue: 15,
    modifierTotal: -5,
    valueCap: 13,
    columnLabels: normalAtaqueLabels
  });
  assert.equal(result.consumedByCap, 2);
  assert.equal(result.effectiveValue, 13);
  assert.equal(result.remainingShift, 3);
  assert.equal(result.columnLabel, '9');
});

test('resolveAttackValueColumnShift: un modificador neto positivo se trata como 0 (Decision Book §5.12.9, "no puede ser netamente positiva")', () => {
  const result = modifierEngine.resolveAttackValueColumnShift(tableEngine, {
    rawAttackValue: 6,
    modifierTotal: 5,
    valueCap: 13,
    columnLabels: normalAtaqueLabels
  });
  assert.equal(result.modifierTotal, 0);
  assert.equal(result.columnLabel, '6');
});

test('resolveAttackValueColumnShift: un desplazamiento que se sale por la izquierda se detiene en la columna más a la izquierda', () => {
  const result = modifierEngine.resolveAttackValueColumnShift(tableEngine, {
    rawAttackValue: 3,
    modifierTotal: -20,
    valueCap: 13,
    columnLabels: normalAtaqueLabels
  });
  assert.equal(result.columnLabel, '1');
});
