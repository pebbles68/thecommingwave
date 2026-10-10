// La web se publica como archivos estáticos (npm run build → dist/): public/ en la raíz y data/ en /data/,
// sin PDF ni DOCX de terceros y con las cabeceras de caché.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { build } = require('../scripts/build-static.js');

function walk(dir, found = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, found); else found.push(full);
  });
  return found;
}

test('el build estático contiene la web completa, sin PDF ni DOCX, y las cabeceras de caché', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tcw-dist-'));
  try {
    const r = build(out);
    assert.ok(r.files > 250, `solo ${r.files} archivos`);
    ['index.html', 'css/style.css', 'js/app.js', 'data/phases/turn-template.json', 'data/rules/space-war.json', '_headers', '.htaccess']
      .forEach((f) => assert.ok(fs.existsSync(path.join(out, f)), `falta ${f}`));
    const forbidden = walk(out).filter((f) => /\.(pdf|docx)$/i.test(f));
    assert.deepEqual(forbidden, [], 'el build no debe incluir material de terceros en PDF/DOCX');
    const headers = fs.readFileSync(path.join(out, '_headers'), 'utf8');
    assert.match(headers, /\/\*\.png\n\s+Cache-Control: public, max-age=604800/);
    assert.match(headers, /\/\*\.json\n\s+Cache-Control: public, max-age=0, must-revalidate/);
    // Todo lo que index.html carga existe en la salida.
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    [...html.matchAll(/(?:src|href)="((?:js|css|img)\/[^"]+)"/g)].forEach((m) => assert.ok(fs.existsSync(path.join(out, m[1])), `index.html carga ${m[1]}, que falta`));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('el build rechaza una carpeta de salida que sería parte de las fuentes', () => {
  assert.throws(() => build(path.join(__dirname, '..', 'data')), /no válida/);
  assert.throws(() => build(path.join(__dirname, '..')), /no válida/);
});
