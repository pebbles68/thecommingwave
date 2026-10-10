// Borradores de wizard (ajuste AJ-003): lógica pura de recuperación/descarte.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDraftManager } = require('../public/js/wizard-drafts.js');

function fakeStorage() {
  const drafts = {};
  return {
    drafts,
    DRAFT_SCHEMA_VERSION: 1,
    loadDraft: (k) => drafts[k] || null,
    saveDraft: (k, state, pendingId) => { drafts[k] = { schemaVersion: 1, pendingId, state: JSON.parse(JSON.stringify(state)) }; },
    removeDraft: (k) => { delete drafts[k]; }
  };
}
const fresh = () => ({ step: 0, a: '' }); // como los wizards reales: sin turnResolutionId inicial

test('un estado inicial sin vincular al turno no deja borrador; al cambiar se guarda', () => {
  const st = fakeStorage();
  const m = createDraftManager(st, () => true);
  const s = m.resolve('w', null, fresh);
  m.persist('w', s);
  assert.equal(st.drafts.w, undefined);
  s.a = '5';
  m.persist('w', s);
  assert.equal(st.drafts.w.state.a, '5');
});

test('vinculado al turno guarda siempre, con el id de la resolución pendiente', () => {
  const st = fakeStorage();
  const m = createDraftManager(st, () => true);
  const s = m.resolve('w', null, fresh);
  s.turnResolutionId = 'r1';
  m.persist('w', s);
  assert.equal(st.drafts.w.pendingId, 'r1');
});

test('tras una recarga se recupera el paso y las respuestas, con aviso', () => {
  const st = fakeStorage();
  st.saveDraft('w', { step: 2, a: '7', turnResolutionId: 'r1' }, 'r1');
  const m = createDraftManager(st, (id) => id === 'r1');
  const s = m.resolve('w', null, fresh);
  assert.equal(s.step, 2);
  assert.equal(s.a, '7');
  assert.equal(s.turnResolutionId, 'r1');
  assert.deepEqual(m.takeNotice('w'), { kind: 'restored', step: 3 });
  assert.equal(m.takeNotice('w'), null);
});

test('si la marca pendiente ya no existe se suelta el vínculo, no las respuestas', () => {
  const st = fakeStorage();
  st.saveDraft('w', { step: 1, a: '7', turnResolutionId: 'r1' }, 'r1');
  const m = createDraftManager(st, () => false);
  const s = m.resolve('w', null, fresh);
  assert.equal(s.a, '7');
  assert.equal(s.turnResolutionId, null);
});

test('un borrador con otro esquema o forma se descarta y se avisa, sin reutilizar respuestas', () => {
  const st = fakeStorage();
  st.drafts.w = { schemaVersion: 99, pendingId: null, state: { step: 1, a: '7', turnResolutionId: null } };
  st.drafts.v = { schemaVersion: 1, pendingId: null, state: { step: 1, otra: 'cosa' } };
  const m = createDraftManager(st, () => true);
  assert.equal(m.resolve('w', null, fresh).a, '');
  assert.deepEqual(m.takeNotice('w'), { kind: 'unrecoverable' });
  assert.equal(st.drafts.w, undefined);
  assert.equal(m.resolve('v', null, fresh).a, '');
  assert.deepEqual(m.takeNotice('v'), { kind: 'unrecoverable' });
});

test('con estado en memoria no se toca el almacén; descartar elimina el borrador', () => {
  const st = fakeStorage();
  st.saveDraft('w', { step: 1, a: '7', turnResolutionId: null }, null);
  const m = createDraftManager(st, () => true);
  const mem = fresh();
  assert.equal(m.resolve('w', mem, fresh), mem);
  m.discard('w');
  assert.equal(st.drafts.w, undefined);
});

test('tras guardar/cancelar (discard) el mismo contenido no se vuelve a guardar; un cambio sí', () => {
  const st = fakeStorage();
  const m = createDraftManager(st, () => true);
  const s = m.resolve('w', null, fresh);
  s.a = '5';
  m.persist('w', s);
  m.discard('w', s);
  m.persist('w', s);
  assert.equal(st.drafts.w, undefined);
  s.a = '6';
  m.persist('w', s);
  assert.equal(st.drafts.w.state.a, '6');
});

test('tras reiniciar un wizard vinculado al turno, el estado nuevo vuelve a guardarse', () => {
  const st = fakeStorage();
  const m = createDraftManager(st, () => true);
  const s = m.resolve('w', null, fresh);
  m.discard('w', s);
  const again = fresh();
  again.turnResolutionId = 'r1';
  m.persist('w', again);
  assert.equal(st.drafts.w.pendingId, 'r1');
});
