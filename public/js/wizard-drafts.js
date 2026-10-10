// Borradores de wizard (ajuste AJ-003): lógica pura, sin DOM ni localStorage
// (el almacenamiento se inyecta), para poder probarla en Node.
//
// Cada wizard guarda su estado en una variable de módulo; este gestor lo
// persiste junto a la marca de resolución pendiente del turno para que una
// recarga recupere el paso y las respuestas exactos. Nunca reutiliza un
// borrador cuyo esquema o forma no coincide con el estado actual del wizard.
(function (root) {
  'use strict';

  // El vínculo con el turno (turnResolutionId) no cuenta como «respuesta del
  // usuario» al decidir si el estado cambió respecto al inicial.
  const LINK_KEYS = ['turnResolutionId', 'turnNodeId'];

  function signature(state) {
    return JSON.stringify(state, (k, v) => (LINK_KEYS.includes(k) ? undefined : v));
  }

  function sameShape(a, b) {
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return false;
    // turnResolutionId/turnNodeId los añade el vínculo con el turno, no el estado inicial.
    const ka = Object.keys(a).filter((k) => !LINK_KEYS.includes(k)).sort();
    const kb = Object.keys(b).filter((k) => !LINK_KEYS.includes(k)).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
  }

  // storage: { loadDraft, saveDraft, removeDraft, DRAFT_SCHEMA_VERSION }
  // hasPending(id): ¿sigue registrada esa resolución pendiente del turno?
  function createDraftManager(storage, hasPending) {
    const baselines = {};
    const notices = {};
    // Estado (firma) con el que se cerró la resolución en cada wizard: tras
    // guardar/cancelar, el mismo contenido no debe volver a persistirse.
    const closed = {};

    // Devuelve el estado a usar: el actual si ya existe en memoria; si no, el
    // borrador guardado (si es compatible) o uno nuevo.
    function resolve(key, current, makeFresh) {
      if (current) return current;
      const fresh = makeFresh();
      baselines[key] = signature(fresh);
      const entry = storage.loadDraft(key);
      if (!entry) return fresh;
      const compatible = entry.schemaVersion === storage.DRAFT_SCHEMA_VERSION && sameShape(entry.state, fresh);
      if (!compatible) {
        storage.removeDraft(key);
        notices[key] = { kind: 'unrecoverable' };
        return fresh;
      }
      const restored = entry.state;
      if (restored.turnResolutionId && !hasPending(restored.turnResolutionId)) restored.turnResolutionId = null;
      notices[key] = { kind: 'restored', step: typeof restored.step === 'number' ? restored.step + 1 : null };
      return restored;
    }

    // Guarda el borrador si el wizard está vinculado al turno o si ya se ha
    // tocado algo; si sigue siendo el estado inicial no deja rastro.
    function persist(key, state) {
      if (!state) return;
      if (closed[key] != null) {
        if (!state.turnResolutionId && signature(state) === closed[key]) return;
        delete closed[key];
      }
      if (state.turnResolutionId || signature(state) !== baselines[key]) {
        storage.saveDraft(key, state, state.turnResolutionId || null);
      } else {
        storage.removeDraft(key);
      }
    }

    function discard(key, state) {
      storage.removeDraft(key);
      if (state) closed[key] = signature(state);
      delete notices[key];
    }

    function takeNotice(key) {
      const n = notices[key] || null;
      delete notices[key];
      return n;
    }

    return { resolve, persist, discard, takeNotice };
  }

  const api = { createDraftManager, signature, sameShape };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WizardDrafts = api;
})(typeof window !== 'undefined' ? window : globalThis);
