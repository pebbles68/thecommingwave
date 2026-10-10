// Pruebas del motor de Combate Cercano Terrestre (roadmap Fase 9, primer
// vertical slice). Sin "hoja de ayuda" con ejemplo resuelto para este
// dominio (a diferencia de Fase 7): los casos de abajo reproducen datos
// reales de data/tables/page-02.json y el ejemplo textual del propio
// Decision Book §8.7.7 (unidad Clase B, Tamaño de Fuerza 6).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TableEngine = require('../public/js/table-engine.js');
const GroundCloseCombatEngine = require('../public/js/ground-close-combat-engine.js');

function readTable(id) {
  const page = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'tables', 'page-02.json'), 'utf8'));
  return page.tables.find((t) => t.id === id);
}

const resultTable = readTable('ground-close-combat-result');
const ewTable = readTable('ground-close-combat-electronic-warfare');
const casualtiesTable = readTable('ground-close-combat-casualties');

test('resolveCombatResult: columna "activo" con Valor de Ataque+Apoyo=6 y tirada 5 da 2 Puntos de Impacto', () => {
  // page-02.json, variante "activo": columna "6" es el índice 6 (["." ,1,2,3,4,5,6,...]).
  // Fila tirada "5": cells[5] = [".", ".", "1", "1", "2", "2", "3", ...] -> índice 6 = "3".
  const result = GroundCloseCombatEngine.resolveCombatResult(resultTable, TableEngine, { roll: 5, attackValue: 6, isActive: true });
  assert.equal(result.rawCell, '3');
  assert.equal(result.columnLabel, '6');
});

test('resolveCombatResult: columna "pasivo" usa el esquema distinto (mismo valor de ataque, distinta columna)', () => {
  // variante "pasivo": ["1","2","3","4","5~6","7~8",...] -> attackValue=6 cae en "5~6" (índice 4).
  const result = GroundCloseCombatEngine.resolveCombatResult(resultTable, TableEngine, { roll: 5, attackValue: 6, isActive: false });
  assert.equal(result.columnLabel, '5~6');
});

test('resolveCombatResult: valor de ataque 0 no coincide con ninguna columna (la primera, ".", nunca es alcanzable) y lanza column_out_of_range en vez de adivinar', () => {
  assert.throws(() => {
    GroundCloseCombatEngine.resolveCombatResult(resultTable, TableEngine, { roll: 5, attackValue: 0, isActive: true });
  }, (err) => err.code === 'column_out_of_range');
});

test('resolveElectronicWarfareAdvantage: tirada 6, diferencia 4 da "x2" (fila banda "6", columna "3~4")', () => {
  const result = GroundCloseCombatEngine.resolveElectronicWarfareAdvantage(ewTable, TableEngine, { roll: 6, electronicDifference: 4 });
  assert.equal(result.rawCell, 'x2');
});

test('resolveElectronicWarfareAdvantage: tirada 0, diferencia 1 no da ventaja (".")', () => {
  const result = GroundCloseCombatEngine.resolveElectronicWarfareAdvantage(ewTable, TableEngine, { roll: 0, electronicDifference: 1 });
  assert.equal(result.rawCell, '.');
});

test('applyElectronicWarfareAdvantage: duplica solo si hay ventaja Y el resultado de la tabla es "x2"', () => {
  const advantage = { rawCell: 'x2' };
  const noAdvantage = { rawCell: '.' };
  assert.equal(GroundCloseCombatEngine.applyElectronicWarfareAdvantage(3, advantage, true), 6);
  assert.equal(GroundCloseCombatEngine.applyElectronicWarfareAdvantage(3, advantage, false), 3, 'la tabla concede x2 pero a la unidad opuesta, no a esta');
  assert.equal(GroundCloseCombatEngine.applyElectronicWarfareAdvantage(3, noAdvantage, true), 3);
});

test('resolveDefeatThreshold: Clase B, Tamaño de Fuerza 6 reproduce el ejemplo textual del Decision Book §8.7.7 ("2~3")', () => {
  const { result, parsed } = GroundCloseCombatEngine.resolveDefeatThreshold(casualtiesTable, TableEngine, { reactionLevel: 'B', forceSize: 6 });
  assert.equal(result.rawCell, '2~3');
  assert.deepEqual(parsed, { kind: 'range', min: 2, max: 3, raw: '2~3', hasAsterisk: false });
});

test('resolveDefeatThreshold: Clase C, Tamaño de Fuerza 7 da un umbral único, sin elección', () => {
  const { parsed } = GroundCloseCombatEngine.resolveDefeatThreshold(casualtiesTable, TableEngine, { reactionLevel: 'C', forceSize: 7 });
  assert.equal(parsed.kind, 'exact');
});

test('evaluateGroundUnitDefeat: ejemplo del Decision Book §8.7.7 — 2 puntos de daño da opción, 3 fuerza la Derrota', () => {
  const { parsed } = GroundCloseCombatEngine.resolveDefeatThreshold(casualtiesTable, TableEngine, { reactionLevel: 'B', forceSize: 6 });
  const at1 = GroundCloseCombatEngine.evaluateGroundUnitDefeat(1, parsed);
  assert.equal(at1.canChooseDefeat, false);
  assert.equal(at1.forcedDefeat, false);
  const at2 = GroundCloseCombatEngine.evaluateGroundUnitDefeat(2, parsed);
  assert.equal(at2.canChooseDefeat, true, 'al alcanzar el Valor Mínimo de Derrota, la unidad PUEDE optar por ser Derrotada, no está obligada');
  assert.equal(at2.forcedDefeat, false);
  const at3 = GroundCloseCombatEngine.evaluateGroundUnitDefeat(3, parsed);
  assert.equal(at3.canChooseDefeat, false);
  assert.equal(at3.forcedDefeat, true, 'al alcanzar el Valor Máximo de Derrota, la unidad es Derrotada forzosamente');
});

test('evaluateGroundUnitDefeat: umbral único (Clases C/D) fuerza la Derrota al alcanzarlo, sin opción previa', () => {
  const { parsed } = GroundCloseCombatEngine.resolveDefeatThreshold(casualtiesTable, TableEngine, { reactionLevel: 'D', forceSize: 3 });
  assert.equal(parsed.kind, 'exact');
  assert.equal(parsed.value, 2);
  assert.equal(GroundCloseCombatEngine.evaluateGroundUnitDefeat(1, parsed).forcedDefeat, false);
  assert.equal(GroundCloseCombatEngine.evaluateGroundUnitDefeat(2, parsed).forcedDefeat, true);
});

test('evaluateGroundUnitDefeat: celda "." (sin bajas posibles) nunca ofrece ni fuerza Derrota', () => {
  const { parsed } = GroundCloseCombatEngine.resolveDefeatThreshold(casualtiesTable, TableEngine, { reactionLevel: 'A', forceSize: 1 });
  assert.equal(parsed.kind, 'skip');
  const evalResult = GroundCloseCombatEngine.evaluateGroundUnitDefeat(5, parsed);
  assert.equal(evalResult.canChooseDefeat, false);
  assert.equal(evalResult.forcedDefeat, false);
});
