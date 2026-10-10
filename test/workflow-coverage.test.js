// AJ-004: la matriz «workflow → wizard → etapas → aplicación del resultado →
// estado de la fuente» no puede contradecir a los workflows, a las rutas de la
// aplicación ni a las ambigüedades registradas, y un estado «done» no admite
// huecos abiertos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const coverage = readJson('data/rules/workflow-coverage.json');
const index = readJson('data/workflows/index.json');
const ambiguities = fs.readFileSync(path.join(ROOT, 'docs', 'rules', 'known-ambiguities.md'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');

const gapKinds = Object.keys(coverage.gapKinds);

test('workflow-coverage: cada workflow de data/workflows tiene exactamente una entrada', () => {
  const ids = index.files.map((f) => f.id).sort();
  assert.deepEqual(coverage.workflows.map((w) => w.workflowId).sort(), ids);
});

test('workflow-coverage: las etapas cubiertas y no cubiertas son exactamente las del workflow, con motivo en las no cubiertas', () => {
  coverage.workflows.forEach((entry) => {
    const file = index.files.find((f) => f.id === entry.workflowId).file;
    const stages = readJson(path.join('data', 'workflows', file)).stages.map((s) => s.id).sort();
    const declared = entry.stagesCovered.concat(entry.stagesNotCovered.map((s) => s.stage)).sort();
    assert.deepEqual(declared, stages, `${entry.workflowId}: etapas declaradas distintas de las del workflow`);
    entry.stagesNotCovered.forEach((s) => assert.ok(s.reason, `${entry.workflowId}/${s.stage}: sin motivo`));
  });
});

test('workflow-coverage: cada wizard declarado existe como ruta de la aplicación', () => {
  const wizards = new Set();
  coverage.workflows.forEach((w) => w.wizards.concat(w.embeddedIn || []).forEach((id) => wizards.add(id)));
  coverage.supportWizards.forEach((w) => wizards.add(w.wizard));
  wizards.forEach((id) => assert.ok(appJs.includes(`parts[1] === '${id}'`), `la ruta #/wizard/${id} no existe en app.js`));
});

test('workflow-coverage: estados válidos, coherentes con los huecos, y «done» sin huecos', () => {
  coverage.workflows.forEach((w) => {
    assert.ok(coverage.statuses.includes(w.status), `${w.workflowId}: estado inválido ${w.status}`);
    assert.ok(Object.keys(coverage.resultApplication).includes(w.resultApplication), `${w.workflowId}: resultApplication inválido`);
    w.gaps.forEach((g) => assert.ok(gapKinds.includes(g.kind) && g.text, `${w.workflowId}: hueco inválido`));
    if (w.status === 'done') {
      assert.equal(w.gaps.length, 0, `${w.workflowId}: «done» con huecos`);
      assert.equal(w.stagesNotCovered.length, 0, `${w.workflowId}: «done» con etapas sin cubrir`);
      assert.equal(w.resultApplication, 'calculated', `${w.workflowId}: «done» sin aplicación calculada`);
    } else {
      assert.ok(w.gaps.length > 0, `${w.workflowId}: estado ${w.status} sin huecos que lo expliquen`);
    }
    if (w.status === 'not_started') assert.equal(w.wizards.length, 0, `${w.workflowId}: not_started con wizard`);
    if (w.wizards.length === 0) assert.ok(w.status === 'not_started' || (w.embeddedIn && w.embeddedIn.length), `${w.workflowId}: sin wizard ni etapa embebida`);
    if (w.status === 'needs_review') assert.ok(w.gaps.some((g) => g.kind === 'needs_review'), `${w.workflowId}: needs_review sin hueco needs_review`);
    if (w.status === 'blocked_by_source') assert.ok(w.gaps.some((g) => g.kind === 'blocked_by_source'), `${w.workflowId}: blocked_by_source sin hueco blocked_by_source`);
  });
});

test('workflow-coverage: cada hueco needs_review con ref cita una ambigüedad que existe en known-ambiguities.md', () => {
  const refs = [];
  coverage.workflows.forEach((w) => w.gaps.forEach((g) => { if (g.ref) refs.push([w.workflowId, g.ref]); }));
  coverage.supportWizards.forEach((s) => { if (s.ref) refs.push([s.wizard, s.ref]); });
  assert.ok(refs.length >= 4);
  refs.forEach(([who, ref]) => assert.ok(ambiguities.includes(ref), `${who}: la ambigüedad «${ref}» no está en known-ambiguities.md`));
});

test('workflow-coverage: hay etiqueta en lenguaje de juego para cada estado y tipo de hueco, y el roadmap remite a la matriz', () => {
  coverage.statuses.forEach((s) => assert.ok(coverage.statusLabels[s], `sin etiqueta para el estado ${s}`));
  gapKinds.forEach((k) => assert.ok(coverage.gapKindLabels[k], `sin etiqueta para el hueco ${k}`));
  const roadmap = fs.readFileSync(path.join(ROOT, 'roadmap.md'), 'utf8');
  assert.ok(roadmap.includes('data/rules/workflow-coverage.json'));
  assert.ok(!roadmap.includes("**Fase 9 cerrada"), 'la Fase 9 no debe declararse «cerrada» con casillas abiertas');
});
