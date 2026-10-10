// AJ-010: prueba parametrizada de TODAS las tablas estructuradas. Para cada
// tabla de cada página, cada combinación de esquema de fila/columna y cada
// celda: una etiqueta inequívoca resuelve exactamente esa celda; una ambigua
// o placeholder falla solo con los errores documentados del motor, nunca con
// otra excepción.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const TableEngine = require('../public/js/table-engine.js');

const TABLES_DIR = path.join(__dirname, '..', 'data', 'tables');
const KNOWN_ERRORS = new Set(['scheme_required', 'row_ambiguous', 'column_ambiguous', 'row_out_of_range', 'column_out_of_range']);

const listSchemes = (axis) => Object.keys(axis.alternateLabels || {}).concat(Object.keys(axis.alternateLabelSets || {})).concat(Object.keys(axis.variants || {}));

const pages = fs.readdirSync(TABLES_DIR).filter((f) => /^page-\d+\.json$/.test(f)).sort();

pages.forEach((file) => {
  const page = JSON.parse(fs.readFileSync(path.join(TABLES_DIR, file), 'utf8'));
  (page.tables || []).forEach((table) => {
    test(`${file} · ${table.id}: todas las celdas se resuelven (o fallan con un error documentado)`, () => {
      const schemesOf = (axis) => (Array.isArray(axis.values) ? [undefined] : []).concat(listSchemes(axis));
      const rowSchemes = schemesOf(table.rowAxis);
      const colSchemes = schemesOf(table.columnAxis);
      let resolved = 0;
      rowSchemes.forEach((rs) => colSchemes.forEach((cs) => {
        let rowLabels;
        let colLabels;
        try {
          rowLabels = TableEngine.pickAxisLabels(table.rowAxis, rs);
          colLabels = TableEngine.pickAxisLabels(table.columnAxis, cs);
        } catch (err) {
          assert.fail(`${table.id}: esquema declarado pero no seleccionable (${rs}/${cs}): ${err.message}`);
        }
        rowLabels.forEach((rl, ri) => colLabels.forEach((cl, ci) => {
          try {
            const res = TableEngine.resolveCell(table, rl, cl, { rowScheme: rs, columnScheme: cs });
            // Con etiquetas inequívocas, la celda resuelta es la de su posición.
            assert.equal(res.rawCell, table.cells[res.rowIndex][res.columnIndex]);
            resolved += 1;
          } catch (err) {
            assert.ok(err && err.code && KNOWN_ERRORS.has(err.code), `${table.id} [${rs}/${cs}] (${rl},${cl}): error inesperado ${err && err.message}`);
          }
        }));
      }));
      assert.ok(resolved > 0, `${table.id}: ninguna celda resoluble`);
    });
  });
});

test('hay al menos 30 tablas estructuradas cubiertas por la prueba parametrizada', () => {
  const count = pages.reduce((n, f) => n + (JSON.parse(fs.readFileSync(path.join(TABLES_DIR, f), 'utf8')).tables || []).length, 0);
  assert.ok(count >= 30, `solo ${count} tablas`);
});
