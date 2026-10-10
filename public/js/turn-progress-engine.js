// Motor puro del progreso del turno guiado (roadmap Fase 2/18/19/23).
//
// Este módulo NO toca `localStorage` ni ningún I/O: solo transforma un objeto
// `progress` dado el modelo canónico (data/phases/turn-template.json, ver
// public/js/turn-model.js); el llamador (storage.js) persiste el resultado.
//
// Esquema v4 (2026-10-07, ajustes_de_turno.md TUR-014/015/008). El progreso se guarda
// por INSTANCIA, no por definición de contenido: cada nodo del turno tiene un ID estable
// dentro de la banda (`phase-0`, `phase-1`, `phase-1/air-1`, `phase-1/air-1/<subfase>`,
// `day-odd`...; ver turn-model.js). Aire I y Aire II comparten contenido pero no estado,
// y terminar una subfase de una no marca la de la otra. Por banda de dos días:
//   bands[n] = { finished: [nodeId], skipped: [nodeId], visited: [nodeId] }
// Terminado, omitido y visitado son marcas voluntarias e independientes: ninguna exige
// otra ni se infiere (un nodo terminado no exige hijos terminados; AGENTS.md §3.1/§6).
//
// Esquemas anteriores (v1 plano, v2, v3 con `processRuns` por `runKey`) se migran de
// forma conservadora: solo lo que tiene correspondencia inequívoca (los pasos de la
// Fase 0) pasa a nodos; el progreso de las dos «campañas» genéricas, que no se puede
// repartir entre seis fases, se conserva intacto en `legacy` y se avisa una sola vez.
// Las resoluciones activas heredadas no se descartan: se conservan con su contexto
// antiguo y pueden retomarse o cancelarse.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./turn-model.js'));
  } else {
    root.TurnProgressEngine = factory(root.TurnModel);
  }
})(typeof self !== 'undefined' ? self : this, function (Model) {
  'use strict';

  const SCHEMA_VERSION = 4;
  const STRATEGIC_PROCESS = 'proceso_estrategico';

  function emptyBand() {
    return { finished: [], skipped: [], visited: [] };
  }

  function emptyProgress() {
    return { schemaVersion: SCHEMA_VERSION, currentBand: 1, bands: { 1: emptyBand() }, pendingResolutions: [], legacy: null, notices: [] };
  }

  function strings(list) {
    return Array.isArray(list) ? Array.from(new Set(list.filter((x) => typeof x === 'string'))) : [];
  }

  function normalizeBand(raw) {
    if (!raw || typeof raw !== 'object') return emptyBand();
    return { finished: strings(raw.finished), skipped: strings(raw.skipped), visited: strings(raw.visited) };
  }

  function getBand(progress, band) {
    const n = band === undefined ? progress.currentBand : band;
    return (progress.bands && progress.bands[n]) || emptyBand();
  }

  function withBand(progress, updatedBand) {
    const band = progress.currentBand;
    return { ...progress, bands: { ...(progress.bands || {}), [band]: updatedBand } };
  }

  // ---------- Marcas voluntarias por nodo ----------

  function addTo(list, id) { return Array.from(new Set([...list, id])); }
  function removeFrom(list, id) { return list.filter((x) => x !== id); }

  function finishNode(progress, nodeId) {
    const b = getBand(progress);
    return withBand(progress, { ...b, finished: addTo(b.finished, nodeId), skipped: removeFrom(b.skipped, nodeId) });
  }

  function skipNode(progress, nodeId) {
    const b = getBand(progress);
    return withBand(progress, { ...b, skipped: addTo(b.skipped, nodeId), finished: removeFrom(b.finished, nodeId) });
  }

  // Quita la marca de terminado u omitido (la navegación y las marcas son reversibles).
  function reopenNode(progress, nodeId) {
    const b = getBand(progress);
    return withBand(progress, { ...b, finished: removeFrom(b.finished, nodeId), skipped: removeFrom(b.skipped, nodeId) });
  }

  function visitNode(progress, nodeId) {
    const b = getBand(progress);
    if (b.visited.includes(nodeId)) return progress;
    return withBand(progress, { ...b, visited: addTo(b.visited, nodeId) });
  }

  function isFinished(progress, nodeId) { return getBand(progress).finished.includes(nodeId); }
  function isSkipped(progress, nodeId) { return getBand(progress).skipped.includes(nodeId); }
  function isVisited(progress, nodeId) { return getBand(progress).visited.includes(nodeId); }

  // Estado visible de un nodo: solo hechos, ninguno de secuencia.
  function getNodeState(progress, nodeId) {
    if (isSkipped(progress, nodeId)) return 'skipped';
    if (isFinished(progress, nodeId)) return 'completed';
    if (isVisited(progress, nodeId)) return 'visited';
    return 'not-started';
  }

  // Subfases u otros descendientes directos todavía sin marcar. Dato informativo: no impide terminar nada.
  function unmarkedChildren(template, progress, nodeId) {
    const b = getBand(progress);
    return Model.listNodes(template).filter((n) => n.parent === nodeId && !b.finished.includes(n.id) && !b.skipped.includes(n.id));
  }

  // Primer nodo de primer nivel sin terminar ni omitir (Fase 0 y las seis fases). Solo orienta ("siguiente
  // sugerida según la hoja"); nunca bloquea ni obliga.
  function getSuggestedNodeId(template, progress) {
    const b = getBand(progress);
    return Model.listTopLevelNodeIds(template).find((id) => !b.finished.includes(id) && !b.skipped.includes(id)) || null;
  }

  // Primer hijo directo de un nodo sin terminar ni omitir (siguiente sugerida dentro de la Fase 0 o de una fase).
  function getSuggestedChildId(template, progress, parentId) {
    const b = getBand(progress);
    const child = Model.listNodes(template).find((n) => n.parent === parentId && !b.finished.includes(n.id) && !b.skipped.includes(n.id));
    return child ? child.id : null;
  }

  // Una banda se considera terminada cuando el usuario marcó como terminados u omitidos sus nodos de primer
  // nivel; las subfases no visitadas no cuentan como trabajo pendiente.
  function isBandFinished(template, progress, band) {
    const b = getBand(progress, band);
    return Model.listTopLevelNodeIds(template).every((id) => b.finished.includes(id) || b.skipped.includes(id));
  }

  // Cambia la banda de dos días actual, en el rango [1, maxBand]; cada banda conserva su progreso.
  function changeBand(progress, delta, maxBand) {
    const next = Math.min(Math.max((progress.currentBand || 1) + delta, 1), maxBand);
    if (next === progress.currentBand) return { progress, changed: false, band: progress.currentBand };
    return { progress: { ...progress, currentBand: next }, changed: true, band: next };
  }

  // ---------- Resoluciones pendientes (TUR-015) ----------
  //
  // Un wizard abierto DESDE un nodo concreto queda vinculado a él: `{ id, type, band, nodeId,
  // phaseId, subphaseId, status, startedAt, label }`. `nodeId` es el nodo exacto (segmento o
  // subfase de ese segmento, incluido Aire I/Aire II); `phaseId`/`subphaseId` son los ids de
  // la definición de contenido. `id` es determinista (`makeResolutionId`): reabrir exactamente
  // la misma resolución la recupera; dos del mismo wizard en segmentos distintos no se pisan.

  function makeResolutionId(type, band, nodeId) {
    return `${type}:${band}:${nodeId}`;
  }

  function listPendingResolutions(progress) {
    return Array.isArray(progress.pendingResolutions) ? progress.pendingResolutions : [];
  }

  function registerPendingResolution(progress, resolution) {
    const id = resolution.id || makeResolutionId(resolution.type, resolution.band, resolution.nodeId);
    const entry = {
      id,
      type: resolution.type,
      band: resolution.band,
      nodeId: resolution.nodeId || null,
      phaseId: resolution.phaseId || null,
      subphaseId: resolution.subphaseId || null,
      status: resolution.status || 'in-progress',
      startedAt: resolution.startedAt || new Date().toISOString(),
      label: resolution.label || resolution.type,
      ...(resolution.legacyRunKey ? { legacyRunKey: resolution.legacyRunKey } : {})
    };
    return { ...progress, pendingResolutions: [...listPendingResolutions(progress).filter((r) => r.id !== id), entry] };
  }

  function removePendingResolution(progress, resolutionId) {
    return { ...progress, pendingResolutions: listPendingResolutions(progress).filter((r) => r.id !== resolutionId) };
  }

  // Resoluciones activas de este nodo o de cualquiera de sus descendientes en la banda indicada.
  function findPendingResolutionsForNode(progress, band, nodeId) {
    return listPendingResolutions(progress).filter((r) => r.status === 'in-progress' && r.band === band && r.nodeId && Model.isDescendantOrSelf(r.nodeId, nodeId));
  }

  // Resoluciones heredadas de un esquema anterior sin nodo que les corresponda sin ambigüedad.
  function listLegacyPendingResolutions(progress) {
    return listPendingResolutions(progress).filter((r) => r.status === 'in-progress' && !r.nodeId);
  }

  // Evalúa si un nodo puede cerrarse con «Terminar». Solo informa: lo único que merece
  // confirmación es dejar una resolución activa sin guardar (riesgo real de perder datos);
  // las subfases sin marcar no son un error ni impiden terminar.
  function evaluateNodeCompletion(template, progress, nodeId) {
    const pendingResolutions = findPendingResolutionsForNode(progress, progress.currentBand, nodeId);
    return {
      canFinishNormally: pendingResolutions.length === 0,
      unmarkedChildren: unmarkedChildren(template, progress, nodeId),
      pendingResolutions,
      blockReason: null
    };
  }

  // ---------- Avisos de una sola vez ----------

  function listNotices(progress) {
    return Array.isArray(progress.notices) ? progress.notices.filter((n) => !n.dismissed) : [];
  }

  function dismissNotice(progress, noticeId) {
    return { ...progress, notices: (progress.notices || []).map((n) => (n.id === noticeId ? { ...n, dismissed: true } : n)) };
  }

  // ---------- Normalización y migración ----------

  function normalizePendingResolution(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.id !== 'string' || typeof raw.type !== 'string') return null;
    const nodeId = typeof raw.nodeId === 'string' ? raw.nodeId : null;
    if (!nodeId && typeof raw.runKey !== 'string' && typeof raw.legacyRunKey !== 'string') return null;
    return {
      id: raw.id,
      type: raw.type,
      band: typeof raw.band === 'number' && raw.band > 0 ? raw.band : 1,
      nodeId,
      phaseId: typeof raw.phaseId === 'string' ? raw.phaseId : null,
      subphaseId: typeof raw.subphaseId === 'string' ? raw.subphaseId : null,
      status: typeof raw.status === 'string' ? raw.status : 'in-progress',
      startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : new Date().toISOString(),
      label: typeof raw.label === 'string' ? raw.label : raw.type,
      ...(typeof raw.runKey === 'string' && !nodeId ? { legacyRunKey: raw.runKey } : {}),
      ...(typeof raw.legacyRunKey === 'string' ? { legacyRunKey: raw.legacyRunKey } : {})
    };
  }

  function normalizePendingResolutions(raw) {
    return Array.isArray(raw) ? raw.map(normalizePendingResolution).filter(Boolean) : [];
  }

  function normalizeRun(raw) {
    if (!raw || typeof raw !== 'object') return { finishedPhases: [], finishedSubphases: [], skippedPhases: [] };
    return { finishedPhases: strings(raw.finishedPhases), finishedSubphases: strings(raw.finishedSubphases), skippedPhases: strings(raw.skippedPhases) };
  }

  function isLegacyFlatProgress(raw) {
    return !!raw && typeof raw === 'object' && !raw.processRuns && !raw.bandRuns && !raw.bands &&
      (Array.isArray(raw.finishedPhases) || Array.isArray(raw.finishedSubphases) || Array.isArray(raw.skippedPhases));
  }

  // Convierte cualquier progreso anterior (v1 plano, v2 `processRuns`, v3 `bandRuns`) a v4.
  function migrateBeforeV4(raw, template) {
    const currentBand = typeof raw.currentBand === 'number' && raw.currentBand > 0 ? raw.currentBand : 1;
    // Forma común: bandRuns[banda].processRuns[runKey] = { finishedPhases, finishedSubphases, skippedPhases }.
    let bandRuns;
    if (raw.bandRuns && typeof raw.bandRuns === 'object') {
      bandRuns = raw.bandRuns;
    } else if (raw.processRuns && typeof raw.processRuns === 'object') {
      bandRuns = { [currentBand]: { processRuns: raw.processRuns } };
    } else {
      // v1 plano: sin identidad de repetición. Lo ya marcado se atribuye a la banda actual y, como no se puede
      // saber a qué proceso pertenece sin la plantilla, solo se conserva si la hay (los pasos de la Fase 0 son
      // inequívocos; el resto va a `legacy`).
      const strategicIds = template && template.band ? template.band.strategic.phases : [];
      const strategic = { finishedPhases: [], finishedSubphases: [], skippedPhases: [] };
      const campaign = { finishedPhases: [], finishedSubphases: [], skippedPhases: [] };
      ['finishedPhases', 'finishedSubphases', 'skippedPhases'].forEach((key) => {
        strings(raw[key]).forEach((id) => { (strategicIds.includes(id) ? strategic : campaign)[key].push(id); });
      });
      bandRuns = { [currentBand]: { processRuns: { [`${STRATEGIC_PROCESS}:1`]: strategic, 'proceso_campana:1': campaign } } };
    }

    const bands = {};
    const legacyBands = {};
    Object.keys(bandRuns).forEach((bandKey) => {
      const processRuns = (bandRuns[bandKey] && bandRuns[bandKey].processRuns) || {};
      const band = emptyBand();
      Object.keys(processRuns).forEach((runKey) => {
        const run = normalizeRun(processRuns[runKey]);
        if (runKey === `${STRATEGIC_PROCESS}:1`) {
          band.finished.push(...run.finishedPhases.map((id) => Model.nodeId(Model.STRATEGIC_ID, id)));
          band.skipped.push(...run.skippedPhases.map((id) => Model.nodeId(Model.STRATEGIC_ID, id)));
        } else if (run.finishedPhases.length || run.finishedSubphases.length || run.skippedPhases.length) {
          // Las «campañas» genéricas no se pueden repartir entre seis fases: se conservan tal cual.
          legacyBands[bandKey] = { ...(legacyBands[bandKey] || {}), [runKey]: run };
        }
      });
      bands[bandKey] = normalizeBand(band);
    });
    if (!bands[currentBand]) bands[currentBand] = emptyBand();

    const pending = normalizePendingResolutions(raw.pendingResolutions).map((r) => {
      if (r.nodeId) return r;
      const legacyKey = r.legacyRunKey || '';
      // Una resolución de un paso de la Fase 0 sí tiene correspondencia inequívoca.
      if (legacyKey === `${STRATEGIC_PROCESS}:1` && r.phaseId) return { ...r, nodeId: Model.nodeId(Model.STRATEGIC_ID, r.phaseId) };
      return r;
    });

    const hasLegacyProgress = Object.keys(legacyBands).length > 0;
    return {
      schemaVersion: SCHEMA_VERSION,
      currentBand,
      bands,
      pendingResolutions: pending,
      legacy: hasLegacyProgress ? { migratedAt: new Date().toISOString(), fromSchema: raw.schemaVersion || 1, processRuns: legacyBands } : null,
      notices: hasLegacyProgress ? [{
        id: 'legacy-campaign-progress',
        text: 'El turno guiado ahora muestra dos días con seis fases por banda. El progreso que habías marcado en las dos «campañas» anteriores no se puede repartir entre las nuevas fases sin adivinar, así que se ha conservado aparte y las fases nuevas empiezan sin marcar.',
        dismissed: false
      }] : []
    };
  }

  // Normaliza un objeto de progreso posiblemente incompleto, corrupto o de un esquema anterior.
  // Nunca lanza. `template` solo se necesita para migrar el esquema plano v1.
  function normalizeProgress(raw, template) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyProgress();
    if (raw.schemaVersion !== SCHEMA_VERSION || !raw.bands) {
      try { return migrateBeforeV4(raw, template); } catch (_err) { return emptyProgress(); }
    }
    const currentBand = typeof raw.currentBand === 'number' && raw.currentBand > 0 ? raw.currentBand : 1;
    const bands = {};
    Object.keys(raw.bands && typeof raw.bands === 'object' ? raw.bands : {}).forEach((k) => { bands[k] = normalizeBand(raw.bands[k]); });
    if (!bands[currentBand]) bands[currentBand] = emptyBand();
    return {
      schemaVersion: SCHEMA_VERSION,
      currentBand,
      bands,
      pendingResolutions: normalizePendingResolutions(raw.pendingResolutions),
      legacy: raw.legacy && typeof raw.legacy === 'object' ? raw.legacy : null,
      notices: Array.isArray(raw.notices) ? raw.notices.filter((n) => n && typeof n.id === 'string') : []
    };
  }

  return {
    SCHEMA_VERSION,
    emptyProgress,
    emptyBand,
    getBand,
    normalizeProgress,
    finishNode,
    skipNode,
    reopenNode,
    visitNode,
    isFinished,
    isSkipped,
    isVisited,
    getNodeState,
    unmarkedChildren,
    getSuggestedNodeId,
    getSuggestedChildId,
    isBandFinished,
    changeBand,
    makeResolutionId,
    listPendingResolutions,
    registerPendingResolution,
    removePendingResolution,
    findPendingResolutionsForNode,
    listLegacyPendingResolutions,
    evaluateNodeCompletion,
    listNotices,
    dismissNotice
  };
});
