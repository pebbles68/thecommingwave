const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/table-engine.js');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readTablePage(pageNumber) {
  const fileName = `page-${String(pageNumber).padStart(2, '0')}.json`;
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'tables', fileName), 'utf8'));
}

function getTable(pageNumber, tableId) {
  const page = readTablePage(pageNumber);
  const found = engine.findTableInPage(page, tableId);
  assert.ok(found && found.table, `no se encontró la tabla "${tableId}" en page-${pageNumber}.json`);
  return found.table;
}

// --- parseRangeToken: reconoce los formatos de etiqueta usados en data/tables/ ---

test('parseRangeToken: valores exactos, rangos "~", sufijo "+" y placeholder "."', () => {
  assert.deepEqual(engine.parseRangeToken('5'), { kind: 'exact', value: 5, raw: '5', hasAsterisk: false });
  assert.deepEqual(engine.parseRangeToken('0.5'), { kind: 'exact', value: 0.5, raw: '0.5', hasAsterisk: false });
  assert.deepEqual(engine.parseRangeToken('7~8'), { kind: 'range', min: 7, max: 8, raw: '7~8', hasAsterisk: false });
  assert.deepEqual(engine.parseRangeToken('24+'), { kind: 'min', value: 24, raw: '24+', hasAsterisk: false });
  assert.deepEqual(engine.parseRangeToken('<=1'), { kind: 'max', value: 1, raw: '<=1', hasAsterisk: false });
  assert.equal(engine.parseRangeToken('.').kind, 'skip');
  assert.equal(engine.parseRangeToken(null).kind, 'skip');
});

test('parseRangeToken: el asterisco de anotación no impide leer el número ("9*")', () => {
  const token = engine.parseRangeToken('9*');
  assert.equal(token.kind, 'exact');
  assert.equal(token.value, 9);
  assert.equal(token.hasAsterisk, true);
});

test('parseRangeToken: etiquetas no numéricas (placeholders "cN") quedan como "label"', () => {
  assert.equal(engine.parseRangeToken('c12').kind, 'label');
});

// --- resolveCell contra tablas reales ya transcritas ---

test('resolveCell: page-34 búsqueda aérea ASW rutina, fila exacta + columna con rango', () => {
  const table = getTable(34, 'asw-air-search-routine');
  // Fila "5/4/3" (índice 2), columna de valor de búsqueda "9~10" (índice 7) -> "9" según cells[2][7].
  const result = engine.resolveCell(table, '5/4/3', 10);
  assert.equal(result.rowIndex, 2);
  assert.equal(result.columnIndex, 7);
  assert.equal(result.rawCell, '9');
  assert.equal(result.displayValue, '9');
});

test('resolveCell: page-34, columna "24+" resuelve por el límite inferior abierto', () => {
  const table = getTable(34, 'asw-air-search-routine');
  const result = engine.resolveCell(table, '7+/6+/5+', 100);
  assert.equal(result.columnIndex, 15); // última columna, "24+"
  assert.equal(result.rawCell, '2+');
});

test('resolveCell: celda con "." usa cellLegend ("Sin detección")', () => {
  const table = getTable(34, 'asw-air-search-routine');
  const result = engine.resolveCell(table, '0~3/0~2/0~1', 1);
  assert.equal(result.rawCell, '.');
  assert.equal(result.legendText, 'Sin detección');
  assert.equal(result.displayValue, 'Sin detección');
});

test('resolveCell: page-22 (golden test Fase 7), tirada d10 exacta y valor de ataque final exacto', () => {
  const table = getTable(22, 'antiship-guided-final-damage');
  // Tirada "6" (índice 6), Valor de Ataque Final "9" (índice 9) -> cells[6][9] = "3".
  const result = engine.resolveCell(table, '6', 9);
  assert.equal(result.rowIndex, 6);
  assert.equal(result.columnIndex, 9);
  assert.equal(result.rawCell, '3');
});

test('resolveCell: page-22, fila índice 1 columna "34+" (corregida tras verificación a 1200 DPI, ya no es null)', () => {
  const table = getTable(22, 'antiship-guided-final-damage');
  const result = engine.resolveCell(table, '1', 34); // fila índice 1, última columna "34+"
  assert.equal(result.rawCell, '6');
  assert.equal(result.isMissingData, false);
});

test('resolveCell: esquema alternativo de fila (alternateLabels) por rowScheme explícito', () => {
  const table = getTable(22, 'antiship-guided-final-damage');
  // Esquema "sub_sup": índice 1 tiene etiqueta "0" (desfasada respecto al esquema canónico).
  const result = engine.resolveCell(table, 0, 18, { rowScheme: 'sub_sup' });
  assert.equal(result.rowIndex, 1);
  assert.equal(result.rowLabel, '0');
});

test('resolveCell: eje de columna placeholder ("cN") exige columnScheme explícito, nunca lo adivina', () => {
  const table = getTable(5, 'ground-precision-attack-damage');
  assert.throws(
    () => engine.resolveCell(table, 5, 10),
    (err) => err instanceof engine.TableEngineError && err.code === 'scheme_required'
  );

  // Con el esquema indicado explícitamente, sí resuelve.
  const result = engine.resolveCell(table, 5, 10, { rowScheme: 'movil', columnScheme: 'normal_ataque' });
  assert.equal(result.rowIndex, 5);
  assert.equal(result.columnIndex, 9); // "10" en normal_ataque
  assert.equal(result.rawCell, '8');
});

test('resolveCell: valor de fila/columna fuera de rango lanza row_out_of_range/column_out_of_range', () => {
  const table = getTable(34, 'asw-air-search-routine');
  assert.throws(
    () => engine.resolveCell(table, 'no-existe', 1),
    (err) => err instanceof engine.TableEngineError && err.code === 'row_out_of_range'
  );
  assert.throws(
    () => engine.resolveCell(table, '0~3/0~2/0~1', -5),
    (err) => err instanceof engine.TableEngineError && err.code === 'column_out_of_range'
  );
});

test('describeResolution: genera una traza legible con fila, columna y celda', () => {
  const table = getTable(34, 'asw-air-search-routine');
  const result = engine.resolveCell(table, '5/4/3', 10);
  const lines = engine.describeResolution(table, result);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /Fila:/);
  assert.match(lines[1], /Columna:/);
  assert.match(lines[2], /Celda: 9/);
});

// --- findTableInPage: sigue reusesTable sin duplicar datos ---

test('findTableInPage: page-10 reutiliza la tabla de page-06 vía reusesTable', () => {
  const page10 = readTablePage(10);
  const found = engine.findTableInPage(page10, 'low-altitude-counterattack');
  assert.ok(found.redirect);
  assert.equal(found.redirect.file, 'data/tables/page-06.json');

  const targetPage = JSON.parse(fs.readFileSync(path.join(DATA_DIR, '..', found.redirect.file), 'utf8'));
  const resolved = engine.findTableInPage(targetPage, found.redirect.id);
  assert.ok(resolved.table, 'la tabla referenciada por reusesTable debe existir en page-06.json');
});

test('findTableInPage: id inexistente devuelve null en vez de lanzar', () => {
  const page = readTablePage(34);
  assert.equal(engine.findTableInPage(page, 'tabla-que-no-existe'), null);
});

// --- shiftColumnIndex (roadmap Fase 5: desplazamiento de columna con modificadores) ---
// Usa el array real de page-05.json#ground-precision-attack-damage (esquema
// normal_ataque): ["1","2","3","4","5","6","7","8","9","10","11~12","13+",".",".",".",".",".",".",".",".",".",".",".",".","."]

const normalAtaqueLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11~12', '13+', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.'];

test('shiftColumnIndex: desplaza 1 columna a la izquierda desde "13+" (índice 11) hasta "11~12" (índice 10)', () => {
  assert.equal(engine.shiftColumnIndex(normalAtaqueLabels, 11, 1), 10);
});

test('shiftColumnIndex: desplaza 3 columnas desde "13+" (índice 11) hasta "9" (índice 8)', () => {
  assert.equal(engine.shiftColumnIndex(normalAtaqueLabels, 11, 3), 8);
});

test('shiftColumnIndex: shift 0 o negativo no mueve el índice', () => {
  assert.equal(engine.shiftColumnIndex(normalAtaqueLabels, 5, 0), 5);
  assert.equal(engine.shiftColumnIndex(normalAtaqueLabels, 5, -2), 5);
});

test('shiftColumnIndex: un desplazamiento mayor que las columnas disponibles se detiene en el índice 0 (columna más a la izquierda)', () => {
  assert.equal(engine.shiftColumnIndex(normalAtaqueLabels, 2, 10), 0);
});

test('shiftColumnIndex: salta las columnas "." sin que consuman desplazamiento', () => {
  // Desde el índice 12 (primera "." tras "13+"), desplazar 2 debe saltar
  // cualquier "." intermedia y aterrizar en columnas reales: 12->11("13+", consume 1, resto 1)->10("11~12", consume 1, resto 0).
  assert.equal(engine.shiftColumnIndex(normalAtaqueLabels, 12, 2), 10);
});
