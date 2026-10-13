// Un eje de tabla puede declarar solo variantes (sin «values»): el motor exige elegir esquema y no falla con un error opaco.
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../public/js/table-engine.js');

const axis = { label: 'Valor', variants: { pasivo: ['1', '2'], activo: ['.', '1'] } };

test('isPlaceholderScheme tolera etiquetas inexistentes', () => {
  assert.equal(engine.isPlaceholderScheme(undefined), false);
  assert.equal(engine.isPlaceholderScheme(['c1', 'c2']), true);
});

test('un eje sin «values» exige indicar esquema; con esquema devuelve sus etiquetas', () => {
  assert.throws(() => engine.pickAxisLabels(axis), (err) => err.code === 'scheme_required' && err.details.availableSchemes.length === 2);
  assert.deepEqual(engine.pickAxisLabels(axis, 'pasivo'), ['1', '2']);
});

test('resolveCell con un eje solo de variantes: sin esquema pide esquema; con esquema resuelve la celda', () => {
  const table = { id: 't', rowAxis: { label: 'Tirada', values: ['0', '1'] }, columnAxis: axis, cells: [['A', 'B'], ['C', 'D']] };
  assert.throws(() => engine.resolveCell(table, '0', '1'), (err) => err.code === 'scheme_required');
  assert.equal(engine.resolveCell(table, '1', '2', { columnScheme: 'pasivo' }).rawCell, 'D');
});
