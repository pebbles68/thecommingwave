// AJ-006: separación de referencias de desarrollo del texto para el jugador.
const test = require('node:test');
const assert = require('node:assert/strict');
const { splitPlayerText, hasJargon } = require('../public/js/player-text.js');

test('un texto sin referencias de desarrollo queda intacto', () => {
  const t = 'La tirada se lee en la fila 9 de la tabla.';
  assert.deepEqual(splitPlayerText(t), { main: t, trace: [] });
});

test('las referencias entre paréntesis pasan a la trazabilidad', () => {
  const r = splitPlayerText('Se usa la fila 9 (ver docs/rules/known-ambiguities.md).');
  assert.equal(r.main, 'Se usa la fila 9.');
  assert.deepEqual(r.trace, ['ver docs/rules/known-ambiguities.md']);
});

test('las frases que solo hablan de archivos se retiran y el resto se conserva', () => {
  const r = splitPlayerText('Coincide con el XML. Está definida en data/workflows/13_busqueda.json. Más texto.');
  assert.equal(r.main, 'Coincide con el XML. Más texto.');
  assert.equal(r.trace.length, 1);
});

test('needs_review y golden test se traducen a lenguaje de juego', () => {
  const r = splitPlayerText('Confirmado en el golden test. Es un dato needs_review.');
  assert.ok(!hasJargon(r.main));
  assert.match(r.main, /ejemplo oficial/);
  assert.match(r.main, /pendiente de validar/);
  assert.deepEqual(r.trace, []);
});
