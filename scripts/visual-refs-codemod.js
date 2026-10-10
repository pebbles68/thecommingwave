// Herramienta de desarrollo (una sola vez, ajustes_de_turno.md TUR-012): declara en cada campo numérico de los
// wizards el ID estable de su ayuda visual (`{ visualRef: '<id de wizard-visual-refs.json>' }`) a partir de la
// entrada que hoy lo cubre por el patrón del texto de su etiqueta, para que la ayuda deje de depender de ese texto.
// Idempotente: los campos que ya declaran `visualRef` no se tocan. Uso: node scripts/visual-refs-codemod.js [--dry]
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');

function wizardOf(file) {
  if (file === 'core-wizard-steps.js') return '*';
  if (file.startsWith('antiship-guided-')) return 'antiship-guided';
  return file.replace(/-wizard\.js$/, '');
}

// Argumentos de nivel superior de una llamada que empieza en `open` (índice del paréntesis de apertura).
function scanCall(src, open) {
  const args = [];
  let depth = 0;
  let start = open + 1;
  let i = open;
  const stack = [];
  for (i = open; i < src.length; i += 1) {
    const ch = src[i];
    const inTemplate = stack.length && stack[stack.length - 1] === '`';
    if (stack.length && (stack[stack.length - 1] === "'" || stack[stack.length - 1] === '"' || inTemplate)) {
      if (ch === '\\') { i += 1; continue; }
      const q = stack[stack.length - 1];
      if (ch === q) { stack.pop(); continue; }
      if (inTemplate && ch === '$' && src[i + 1] === '{') { stack.push('${'); i += 1; continue; }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { stack.push(ch); continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth += 1; continue; }
    if (ch === '}' && stack.length && stack[stack.length - 1] === '${') { stack.pop(); continue; }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) { args.push({ text: src.slice(start, i), start, end: i }); return { args, close: i }; }
      continue;
    }
    if (ch === ',' && depth === 1) { args.push({ text: src.slice(start, i), start, end: i }); start = i + 1; }
  }
  throw new Error('llamada sin cerrar');
}

function labelOf(argText) {
  const m = /^\s*(['`"])((?:(?!\1)[\s\S])*)\1\s*$/.exec(argText);
  return m ? m[2] : null;
}

function main() {
  const refs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rules/wizard-visual-refs.json'), 'utf8'));
  const { findEntry } = require('../public/js/core-visual-refs.js');
  const VIEWS = path.join(ROOT, 'public/js/views');
  const files = fs.readdirSync(VIEWS).filter((f) => /-wizard\.js$/.test(f) || /^antiship-guided-(steps|result)\.js$/.test(f)).map((f) => ({ file: f, full: path.join(VIEWS, f) }));
  files.push({ file: 'core-wizard-steps.js', full: path.join(ROOT, 'public/js/core-wizard-steps.js') });

  let changed = 0;
  let skipped = 0;
  const missing = [];
  for (const { file, full } of files) {
    let src = fs.readFileSync(full, 'utf8');
    const crlf = src.includes('\r\n');
    if (crlf) src = src.replace(/\r\n/g, '\n');
    const wizard = wizardOf(file);
    const edits = [];
    const re = /makeNumberField\(/g;
    let m = re.exec(src);
    while (m) {
      const open = m.index + 'makeNumberField'.length;
      const { args, close } = scanCall(src, open);
      const label = labelOf(args[0].text);
      if (label === null) { m = re.exec(src); continue; }
      if (args.some((a) => /visualRef/.test(a.text))) { skipped += 1; m = re.exec(src); continue; }
      const sample = label.replace(/\$\{[^}]*\}/g, (x) => (/idx|\bn\b/.test(x) ? '1' : 'X'));
      const entry = findEntry(refs, wizard, sample);
      if (!entry) { missing.push(`${file}: ${label}`); m = re.exec(src); continue; }
      const opts = `{ visualRef: '${entry.id}' }`;
      const insertAt = close;
      const prefix = args.length >= 4 ? `, ${opts}` : `, undefined, ${opts}`;
      edits.push({ at: insertAt, text: prefix });
      m = re.exec(src);
    }
    edits.sort((a, b) => b.at - a.at).forEach((e) => { src = src.slice(0, e.at) + e.text + src.slice(e.at); });
    changed += edits.length;
    if (edits.length && !DRY) fs.writeFileSync(full, crlf ? src.replace(/\n/g, '\r\n') : src);
  }
  console.log(`${changed} campos marcados, ${skipped} ya marcados, ${missing.length} sin entrada`);
  missing.forEach((x) => console.log('  SIN ENTRADA', x));

}

module.exports = { scanCall, labelOf, wizardOf };
if (require.main === module) main();
