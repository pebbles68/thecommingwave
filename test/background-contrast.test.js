// El logotipo del fondo (.bg-logo) se ve con nitidez, pero nunca debe impedir leer el primer plano: aun en el peor caso
// (un píxel blanco del logotipo bajo el texto), el texto atenuado conserva un contraste WCAG AA (4.5:1) y el principal más.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'style.css'), 'utf8');

const hex = (name) => {
  const m = new RegExp(`--${name}:\\s*#([0-9a-fA-F]{6})`).exec(css);
  assert.ok(m, `falta --${name}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
};
const lum = ([r, g, b]) => {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

const block = /\.bg-logo\s*\{[^}]*\}/.exec(css);
assert.ok(block, 'falta la regla .bg-logo');
const opacity = Number(/opacity:\s*([0-9.]+)/.exec(block[0])[1]);

test('el logotipo del fondo es visible (no queda casi transparente) y sin difuminado', () => {
  assert.ok(opacity >= 0.1, `opacidad ${opacity}: el logotipo apenas se vería`);
  assert.doesNotMatch(block[0], /filter:\s*blur/, 'el logotipo no se difumina');
});

test('el logotipo no supera la opacidad con la que el texto atenuado pierde contraste AA, ni en el peor píxel', () => {
  const bg = hex('bg');
  const worst = bg.map((c) => c * (1 - opacity) + 255 * opacity); // píxel blanco del logotipo sobre el fondo
  assert.ok(contrast(hex('text-muted'), worst) >= 4.5, `texto atenuado: ${contrast(hex('text-muted'), worst).toFixed(2)}:1`);
  assert.ok(contrast(hex('text'), worst) >= 7, `texto principal: ${contrast(hex('text'), worst).toFixed(2)}:1`);
});
