const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');

test('AGENTS.md §3.1.1 existe y todos los archivos de código y datos que cita existen en el repositorio', () => {
  const start = agents.indexOf('### 3.1.1.');
  const end = agents.indexOf('### 3.2.');
  assert.ok(start > 0 && end > start, 'sección 3.1.1 ausente');
  const section = agents.slice(start, end);
  const files = [...section.matchAll(/`((?:public|data|docs|scripts)\/[A-Za-z0-9_./-]+\.(?:js|json|md))`/g)].map((m) => m[1]);
  assert.ok(files.length >= 8, 'se esperaban al menos 8 rutas citadas');
  files.forEach((f) => assert.ok(fs.existsSync(path.join(root, f)), `AGENTS.md cita ${f}, que no existe`));
});

test('AGENTS.md ya no lista «restablecimiento de capacidades» como paso de la fase aérea y describe el turno real', () => {
  assert.equal(/y restablecimiento de capacidades/i.test(agents), false);
  assert.match(agents, /banda de dos días/);
  assert.match(agents, /Nivel de Reacción/);
  assert.match(agents, /No existe\*\* «Restablecimiento de capacidades»/);
});
