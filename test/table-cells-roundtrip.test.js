// Prueba genérica de resolución de celda para todas las tablas transcritas (roadmap Fase 18):
// para cada celda de cada tabla cuyas etiquetas de fila y columna son numéricas (exactas, rangos, «N+» o «<=N»),
// el valor representativo de esas etiquetas debe devolver exactamente esa celda. Detecta ejes solapados,
// etiquetas ilegibles y filas/columnas desalineadas con los datos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/js/table-engine.js');

const TABLES_DIR = path.join(__dirname, '..', 'data', 'tables');
const pages = fs.readdirSync(TABLES_DIR).filter((f) => /^page-\d+\.json$/.test(f)).sort();

// Valor numérico que cae dentro de una etiqueta, o null si la etiqueta no es numérica.
function representative(label) {
  if (label === null || label === undefined) return null;
  let token;
  try { token = engine.parseRangeToken(String(label)); } catch (_err) { return null; }
  if (!token) return null;
  if (token.kind === 'exact') return token.value;
  if (token.kind === 'range') return token.min;
  if (token.kind === 'min') return token.value;
  if (token.kind === 'max') return token.value;
  return null;
}

// Etiquetas de un eje, canónicas y de cada esquema alternativo.
function labelSets(axis) {
  const sets = [{ scheme: undefined, labels: axis.values }];
  ['alternateLabels', 'alternateLabelSets', 'variants'].forEach((k) => {
    Object.keys(axis[k] || {}).forEach((name) => sets.push({ scheme: name, labels: axis[k][name] }));
  });
  return sets.filter((s) => Array.isArray(s.labels));
}

test('las 33 páginas de tablas existen y la prueba recorre un número significativo de celdas', () => {
  assert.equal(pages.length, 33);
});

test('todas las celdas con ejes numéricos se resuelven al valor representativo de su fila y su columna', () => {
  let checked = 0;
  const problems = [];
  pages.forEach((file) => {
    const page = JSON.parse(fs.readFileSync(path.join(TABLES_DIR, file), 'utf8'));
    (page.tables || []).forEach((table) => {
      if (!table.cells || !table.rowAxis || !table.columnAxis) return;
      labelSets(table.rowAxis).forEach((rowSet) => labelSets(table.columnAxis).forEach((colSet) => {
        if (engine.isPlaceholderScheme(rowSet.labels) || engine.isPlaceholderScheme(colSet.labels)) return;
        rowSet.labels.forEach((rl, i) => {
          const rv = representative(rl);
          if (rv === null || !table.cells[i]) return;
          colSet.labels.forEach((cl, j) => {
            const cv = representative(cl);
            if (cv === null || table.cells[i][j] === undefined) return;
            const where = `${file}#${table.id} fila «${rl}» (${rowSet.scheme || 'canónico'}) × columna «${cl}» (${colSet.scheme || 'canónico'})`;
            try {
              const r = engine.resolveCell(table, rv, cv, { rowScheme: rowSet.scheme, columnScheme: colSet.scheme });
              checked += 1;
              if (r.rowIndex !== i || r.columnIndex !== j) problems.push(`${where}: devuelve fila ${r.rowIndex}, columna ${r.columnIndex}`);
              else if (r.rawCell !== table.cells[i][j]) problems.push(`${where}: celda distinta`);
            } catch (err) {
              problems.push(`${where}: ${err.code || err.message}`);
            }
          });
        });
      }));
    });
  });
  assert.ok(checked >= 5000, `solo se comprobaron ${checked} celdas`);
  assert.deepEqual(problems.slice(0, 15), [], `${problems.length} problemas; primeros arriba`);
});
