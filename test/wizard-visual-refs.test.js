// AJ-008: todo campo numérico que un wizard pide leer tiene su ayuda visual
// declarada (o una razón explícita de por qué no hay valor físico/recorte), y
// las referencias apuntan a recursos que existen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { findEntry, wizardIdFromHash } = require('../public/js/core-visual-refs.js');

const ROOT = path.join(__dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const refs = readJson('data/rules/wizard-visual-refs.json');
const factorMap = readJson('data/counters/factor-map.json');
const tablesIndex = readJson('data/tables/index.json');
const catalog = readJson('data/visual-help/entities.json');
const VisualHelp = require('../public/js/visual-help-engine.js');

const VIEWS = path.join(ROOT, 'public', 'js', 'views');

// Fichero -> wizard que lo renderiza ('*' = pasos compartidos por varios).
function wizardOf(file) {
  if (file === 'core-wizard-steps.js') return '*';
  if (file.startsWith('antiship-guided-')) return 'antiship-guided';
  return file.replace(/-wizard\.js$/, '');
}

function numericLabels() {
  const found = [];
  const files = fs.readdirSync(VIEWS).filter((f) => /-wizard\.js$/.test(f) || /^antiship-guided-(steps|result)\.js$/.test(f))
    .map((f) => ({ file: f, full: path.join(VIEWS, f) }));
  files.push({ file: 'core-wizard-steps.js', full: path.join(ROOT, 'public', 'js', 'core-wizard-steps.js') });
  for (const { file, full } of files) {
    const src = fs.readFileSync(full, 'utf8');
    const re = /makeNumberField\(\s*(['`])((?:(?!\1).)+)\1/g;
    let m;
    while ((m = re.exec(src))) {
      const sample = m[2].replace(/\$\{[^}]*\}/g, (x) => (/idx|\bn\b/.test(x) ? '1' : 'X'));
      found.push({ wizard: wizardOf(file), raw: m[2], sample, file });
    }
  }
  return found;
}

test('wizard-visual-refs: estructura, tipos válidos y razones obligatorias', () => {
  const kinds = Object.keys(refs.kinds);
  const ids = new Set();
  refs.entries.forEach((e) => {
    assert.ok(!ids.has(e.id), `id duplicado ${e.id}`);
    ids.add(e.id);
    assert.ok(kinds.includes(e.kind), `${e.id}: tipo inválido ${e.kind}`);
    assert.ok(Array.isArray(e.wizards) && e.wizards.length, `${e.id}: sin wizards`);
    assert.doesNotThrow(() => new RegExp(e.pattern), `${e.id}: patrón inválido`);
    if (e.kind === 'pending-visual' || e.kind === 'no-physical-source') assert.ok(e.reason, `${e.id}: ${e.kind} sin reason`);
    if (e.kind === 'source-page') assert.ok(e.document && e.description, `${e.id}: source-page sin documento/descripción`);
  });
});

test('wizard-visual-refs: los factores de ficha y las tablas referenciados existen', () => {
  refs.entries.forEach((e) => {
    if (e.kind === 'counter-factor') {
      assert.ok(e.entityRef && e.entityRef.factorId, `${e.id}: counter-factor sin entityRef con factorId`);
      assert.ok(factorMap.factorVocabulary[e.entityRef.factorId], `${e.id}: factor ${e.entityRef.factorId} sin vocabulario`);
    }
    if (e.entityRef) {
      // TUR-012: toda entityRef resuelve a plantillas del catálogo; con factor, a todas las fichas que lo tienen.
      const sel = VisualHelp.selectTemplates(catalog, e.entityRef, { factorMap });
      assert.ok(sel.templates.length > 0, `${e.id}: la entityRef no resuelve a ninguna plantilla (${sel.status})`);
      if (e.entityRef.factorId) assert.equal(sel.status, 'generic', `${e.id}`);
    }
    if (e.kind === 'table') {
      const page = tablesIndex.pages.find((p) => p.file === e.page);
      assert.ok(page, `${e.id}: página ${e.page} inexistente`);
      assert.ok(page.tableIds.includes(e.tableId), `${e.id}: tabla ${e.tableId} no está en ${e.page}`);
    }
  });
});

test('wizard-visual-refs: ningún campo numérico de los wizards carece de ayuda visual declarada', () => {
  const labels = numericLabels();
  assert.ok(labels.length > 40, `se esperaban más de 40 campos numéricos, hay ${labels.length}`);
  const missing = labels.filter((l) => {
    const wizard = l.wizard === '*' ? '*' : l.wizard;
    // Para pasos compartidos basta con que alguna entrada comodín encaje.
    return !findEntry(refs, wizard, l.sample);
  });
  assert.deepEqual(missing.map((l) => `${l.file}: ${l.raw}`), [], 'campos numéricos sin entrada en data/rules/wizard-visual-refs.json');
});

test('wizard-visual-refs: los campos de factor de ficha que piden Protección, Defensa Aérea, Valor Electrónico y Tamaño de fuerza muestran dónde se leen', () => {
  const must = [
    ['antiship-unguided', 'Buque 1: Protección', 'protection'],
    ['air-combat-bvr', 'A: Valor Electrónico', 'electronic'],
    ['air-combat-wvr', 'A · unidad 1: Valor de Combate Aéreo (vacío si no tiene)', 'air_combat'],
    ['ground-close-combat', 'Tamaño de Fuerza antes del combate.', 'size'],
    ['ground-close-combat', 'Valor Electrónico más alto de tu bando.', 'electronic'],
    ['ground-guided', 'Disparo 1: Valor de Defensa Aérea propio', 'aa'],
    ['asw-air-search', 'Unidad 1: X', 'asw']
  ];
  must.forEach(([wizard, label, factor]) => {
    const e = findEntry(refs, wizard, label);
    assert.ok(e, `${wizard}: ${label}`);
    assert.equal(e.kind, 'counter-factor', `${wizard}: ${label}`);
    assert.equal(e.entityRef.factorId, factor, `${wizard}: ${label}`);
  });
});

test('wizardIdFromHash', () => {
  assert.equal(wizardIdFromHash('#/wizard/ground-guided'), 'ground-guided');
  assert.equal(wizardIdFromHash('#/ayuda/tablas'), null);
});

// --- TUR-012: ID estable por campo, sin depender del texto de la etiqueta ---

const { scanCall, labelOf, wizardOf: wizardOfFile } = require('../scripts/visual-refs-codemod.js');
const { findEntryById } = require('../public/js/core-visual-refs.js');

function declaredFields() {
  const out = [];
  const files = fs.readdirSync(VIEWS).filter((f) => /-wizard\.js$/.test(f) || /^antiship-guided-(steps|result)\.js$/.test(f)).map((f) => ({ file: f, full: path.join(VIEWS, f) }));
  files.push({ file: 'core-wizard-steps.js', full: path.join(ROOT, 'public', 'js', 'core-wizard-steps.js') });
  for (const { file, full } of files) {
    const src = fs.readFileSync(full, 'utf8');
    const re = /makeNumberField\(/g;
    let m = re.exec(src);
    while (m) {
      const { args } = scanCall(src, m.index + 'makeNumberField'.length);
      const label = labelOf(args[0].text);
      if (label !== null) {
        const decl = /visualRef:\s*'([a-z0-9-]+)'/.exec(args.slice(1).map((a) => a.text).join(','));
        out.push({ file, wizard: wizardOfFile(file), label, id: decl ? decl[1] : null });
      }
      m = re.exec(src);
    }
  }
  return out;
}

test('wizard-visual-refs: todo campo numérico de los wizards declara el ID estable de su ayuda y existe para ese wizard', () => {
  const fields = declaredFields();
  assert.ok(fields.length >= 55, `se esperaban al menos 55 campos, hay ${fields.length}`);
  const undeclared = fields.filter((f) => !f.id).map((f) => `${f.file}: ${f.label}`);
  assert.deepEqual(undeclared, [], 'campos sin visualRef');
  fields.forEach((f) => assert.ok(findEntryById(refs, f.wizard, f.id), `${f.file}: «${f.label}» declara ${f.id}, que no existe o no aplica a ese wizard`));
});

test('wizard-visual-refs: el ID declarado coincide con la entrada que cubría el texto (migración sin cambios de comportamiento)', () => {
  declaredFields().forEach((f) => {
    const sample = f.label.replace(/\$\{[^}]*\}/g, (x) => (/idx|\bn\b/.test(x) ? '1' : 'X'));
    const byPattern = findEntry(refs, f.wizard, sample);
    assert.equal(f.id, byPattern.id, `${f.file}: «${f.label}»`);
  });
});

test('resolveEntry: un campo con ID declarado usa esa entrada aunque el texto de su etiqueta cambie; sin ID, el patrón', () => {
  const { resolveEntry } = require('../public/js/core-visual-refs.js');
  assert.equal(resolveEntry(refs, 'ground-attack-result', 'ground-protection', 'Un texto que no encaja con ningún patrón').id, 'ground-protection');
  assert.equal(resolveEntry(refs, 'ground-attack-result', null, 'Valor de Protección de la unidad').id, 'ground-protection');
  assert.equal(resolveEntry(refs, 'ground-attack-result', null, 'Un texto que no encaja con ningún patrón'), null);
  // El ID debe aplicar al wizard: una entrada de otro wizard no se aplica.
  assert.equal(resolveEntry(refs, 'ground-close-combat', 'ground-protection', 'x'), null);
});
