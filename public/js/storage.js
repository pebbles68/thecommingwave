// Persistencia en localStorage (correcciones.md COR-005, paso 1): historial de
// navegación, progreso del turno guiado, plantilla de fuerzas, historial de
// resoluciones y favoritos/recientes de Ayuda rápida. Extraído de
// public/js/app.js, que hasta ahora concentraba también esta capa.
//
// Sin dependencias de estado interno de app.js: cualquier dato externo que
// una función necesite (p.ej. `turnTemplate` para migrar el progreso vía
// TurnProgressEngine.normalizeProgress) se recibe como parámetro explícito,
// nunca se lee de una variable de cierre compartida — así este módulo puede
// cargarse y entenderse de forma independiente.
//
// Solo navegador (usa `localStorage`/`Date`): no sigue el patrón UMD-lite de
// los motores de dominio (table-engine.js, etc.), que sí necesitan funcionar
// también en Node para los tests. Expone su API en `window.AppStorage` (no
// `window.Storage`, para no ensombrecer la interfaz nativa del mismo nombre).
(function (root) {
  'use strict';

  const HISTORY_KEY = 'tcw-nav-history';
  const PROGRESS_KEY = 'tcw-progress';
  const ROSTER_KEY = 'tcw-roster';
  const RESOLUTION_HISTORY_KEY = 'tcw-resolution-history';
  const FAVORITE_HELP_KEY = 'tcw-favorite-help';
  const RECENT_HELP_KEY = 'tcw-recent-help';
  const DRAFTS_KEY = 'tcw-wizard-drafts';
  const DRAFT_SCHEMA_VERSION = 1;
  const RULE_PROFILE_KEY = 'tcw-rule-profile';
  const AIR_GROUP_KEY = 'tcw-air-group';

  // ---------- Historial de navegación (fases/subfases, roadmap Fase 1) ----------

  function pushHistory(entry) {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      list.push({ ...entry, at: new Date().toISOString() });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-50)));
    } catch (_err) {
      // Almacenamiento no disponible (modo privado, cuota, etc.): no es crítico para navegar.
    }
  }

  // ---------- Progreso del turno guiado (roadmap Fase 2, esquema v2 COR-001) ----------
  //
  // El estado en sí (normalización, transiciones de fase/subfase/banda) vive
  // en public/js/turn-progress-engine.js, un módulo puro sin `localStorage`.
  // Estas funciones son solo la fina capa de persistencia. `turnTemplate` se
  // recibe como parámetro (ya cargado por el llamador) porque
  // `normalizeProgress` lo necesita para migrar el esquema plano anterior si
  // hiciera falta (correcciones.md COR-001).
  function loadProgress(turnTemplate) {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      return TurnProgressEngine.normalizeProgress(raw ? JSON.parse(raw) : null, turnTemplate);
    } catch (_err) {
      return TurnProgressEngine.emptyProgress();
    }
  }

  function saveProgress(progress) {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch (_err) {
      // No crítico: el progreso visual es una ayuda, no un requisito de reglas.
    }
  }

  // Marcas voluntarias por nodo del turno (esquema v4, ajustes_de_turno.md TUR-014): terminado,
  // omitido, reabierto y visitado son independientes; ninguna exige otra.
  function markNodeFinished(nodeId, turnTemplate) {
    saveProgress(TurnProgressEngine.finishNode(loadProgress(turnTemplate), nodeId));
  }

  function markNodeSkipped(nodeId, turnTemplate) {
    saveProgress(TurnProgressEngine.skipNode(loadProgress(turnTemplate), nodeId));
  }

  function reopenNode(nodeId, turnTemplate) {
    saveProgress(TurnProgressEngine.reopenNode(loadProgress(turnTemplate), nodeId));
  }

  function markNodeVisited(nodeId, turnTemplate) {
    const progress = loadProgress(turnTemplate);
    const next = TurnProgressEngine.visitNode(progress, nodeId);
    if (next !== progress) saveProgress(next);
  }

  function dismissNotice(noticeId, turnTemplate) {
    saveProgress(TurnProgressEngine.dismissNotice(loadProgress(turnTemplate), noticeId));
  }

  // Cambia la banda de día actual (data/phases/turn-template.json#sheet.dayBands,
  // 14 bandas de 2 días transcritas de la hoja de turnos física). Esquema v3
  // (correcciones.02.md COR02-001): cada banda guarda su propio progreso
  // (`bandRuns[bandIndex]`), así que cambiar de banda ya NO lo reinicia —
  // solo cambia cuál es la banda "actual"; volver a una banda ya visitada
  // recupera su progreso tal como se dejó.
  function changeBand(delta, maxBand, turnTemplate) {
    const result = TurnProgressEngine.changeBand(loadProgress(turnTemplate), delta, maxBand);
    if (!result.changed) return false;
    saveProgress(result.progress);
    pushHistory({ type: 'navigation', view: 'band-change', band: result.band });
    return result.band;
  }

  // ---------- Resoluciones pendientes (correcciones.02.md COR02-003) ----------
  //
  // Vincula un wizard de combate abierto DESDE una fase/subfase concreta del
  // turno guiado a esa fase, para que evaluatePhaseCompletion pueda avisar si
  // queda una resolución sin guardar/cancelar al intentar cerrarla. La lógica
  // vive en TurnProgressEngine (puro); estas son solo la capa de persistencia,
  // mismo patrón que markPhaseFinished/etc.
  function registerPendingResolution(resolution, turnTemplate) {
    saveProgress(TurnProgressEngine.registerPendingResolution(loadProgress(turnTemplate), resolution));
  }

  function removePendingResolution(resolutionId, turnTemplate) {
    saveProgress(TurnProgressEngine.removePendingResolution(loadProgress(turnTemplate), resolutionId));
    removeDraftsForPending(resolutionId);
  }

  // ---------- Borradores de wizard (ajuste AJ-003) ----------
  //
  // Almacén versionado, separado del historial final, con el estado de cada
  // wizard en curso (paso y respuestas) para sobrevivir a una recarga. Un
  // borrador por wizard (`key`); `pendingId` lo enlaza con la resolución
  // pendiente del turno, de modo que cancelar esa resolución lo elimina.
  function loadDrafts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_err) {
      return {};
    }
  }

  function writeDrafts(drafts) {
    try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)); } catch (_err) { /* no crítico */ }
  }

  function saveDraft(key, state, pendingId) {
    const drafts = loadDrafts();
    drafts[key] = {
      schemaVersion: DRAFT_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      pendingId: pendingId || null,
      state: JSON.parse(JSON.stringify(state))
    };
    writeDrafts(drafts);
  }

  function loadDraft(key) {
    const entry = loadDrafts()[key];
    return entry && typeof entry === 'object' ? entry : null;
  }

  function removeDraft(key) {
    const drafts = loadDrafts();
    if (!(key in drafts)) return;
    delete drafts[key];
    writeDrafts(drafts);
  }

  function removeDraftsForPending(pendingId) {
    const drafts = loadDrafts();
    let changed = false;
    Object.keys(drafts).forEach((k) => {
      if (drafts[k] && drafts[k].pendingId === pendingId) { delete drafts[k]; changed = true; }
    });
    if (changed) writeDrafts(drafts);
  }

  function hasDraftForPending(pendingId) {
    return Object.values(loadDrafts()).some((d) => d && d.pendingId === pendingId && d.schemaVersion === DRAFT_SCHEMA_VERSION);
  }

  // ---------- Modelo de unidades: plantilla de fuerzas de la sesión (roadmap Fase 2) ----------
  //
  // Alcance deliberado (AGENTS.md §14, no inventar): rastrea qué unidades
  // existen en la sesión y 2 estados de ficha ya confirmados por fuente —
  // Actuada/No Actuada (turn-template.json#phases.logistica, acción 3: "Al
  // finalizar, cambia las unidades marcadas como Actuadas a No Actuadas") y
  // Dañada (el lado dañado de la ficha física, ya reflejado en los planes
  // "damaged" de data/ammunition/). No modela posición, alcance, detección,
  // munición consumida ni ningún otro estado — no hay fuente transcrita
  // todavía que confirme esos mecanismos con el detalle necesario para no
  // inventarlos. Cada unidad de la plantilla referencia un `typeId` del
  // catálogo ya transcrito (`data/units/registry-index.json`), nunca duplica
  // sus datos.
  function loadRoster() {
    try {
      const raw = localStorage.getItem(ROSTER_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }

  function saveRoster(roster) {
    try {
      localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
    } catch (_err) {
      // No crítico: la plantilla de fuerzas es una ayuda, no un requisito de reglas.
    }
  }

  function addRosterUnit({ typeId, name, country, domain, side, label }) {
    const roster = loadRoster();
    roster.push({
      id: `u${Date.now()}${Math.floor(Math.random() * 1000)}`,
      typeId,
      name,
      country,
      domain,
      side: side || '',
      label: label || '',
      actuada: false,
      damaged: false
    });
    saveRoster(roster);
  }

  function removeRosterUnit(instanceId) {
    saveRoster(loadRoster().filter((u) => u.id !== instanceId));
  }

  function toggleRosterFlag(instanceId, flag) {
    const roster = loadRoster();
    const unit = roster.find((u) => u.id === instanceId);
    if (unit) unit[flag] = !unit[flag];
    saveRoster(roster);
  }

  // Acción de la Fase Logística (turn-template.json#phases.logistica): "Al
  // finalizar, cambia las unidades marcadas como Actuadas a No Actuadas".
  function resetAllActuada() {
    const roster = loadRoster();
    if (!roster.length) return 0;
    let count = 0;
    roster.forEach((u) => { if (u.actuada) count += 1; u.actuada = false; });
    saveRoster(roster);
    return count;
  }

  // ---------- Historial de resoluciones (roadmap Fase 17) ----------
  //
  // Distinto de tcw-nav-history (Fase 1, solo navegación de fases/subfases):
  // esto guarda resoluciones de combate completas — resumen textual +
  // snapshot del estado del wizard, para poder "repetir" (recargar el
  // estado y ver el mismo resultado) sin tener que volver a introducir
  // todos los valores a mano.
  function loadResolutionHistory() {
    try {
      const raw = localStorage.getItem(RESOLUTION_HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }

  function saveResolutionHistoryList(list) {
    try {
      localStorage.setItem(RESOLUTION_HISTORY_KEY, JSON.stringify(list.slice(-50)));
    } catch (_err) {
      // No crítico.
    }
  }

  function saveResolutionToHistory({ workflowId, workflowTitle, summaryText, state, turnOrigin }) {
    const list = loadResolutionHistory();
    list.push({
      id: `r${Date.now()}${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      workflowId,
      workflowTitle,
      summaryText,
      state: JSON.parse(JSON.stringify(state)),
      turnOrigin: turnOrigin || null
    });
    saveResolutionHistoryList(list);
  }

  function removeResolutionHistoryEntry(entryId) {
    saveResolutionHistoryList(loadResolutionHistory().filter((e) => e.id !== entryId));
  }

  // ---------- Favoritos y recientes de Ayuda rápida (roadmap Fase 17) ----------

  function loadFavoriteHelp() {
    try {
      const raw = localStorage.getItem(FAVORITE_HELP_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }

  function toggleFavoriteHelp(catId) {
    const favs = loadFavoriteHelp();
    const idx = favs.indexOf(catId);
    if (idx === -1) favs.push(catId); else favs.splice(idx, 1);
    try { localStorage.setItem(FAVORITE_HELP_KEY, JSON.stringify(favs)); } catch (_err) { /* no crítico */ }
  }

  function loadRecentHelp() {
    try {
      const raw = localStorage.getItem(RECENT_HELP_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }

  // Registra `catId` como el más reciente, sin duplicarlo dentro de la lista
  // (se mueve al final en vez de repetirse) y con un límite razonable.
  function recordRecentHelp(catId) {
    try {
      const list = loadRecentHelp().filter((id) => id !== catId);
      list.push(catId);
      localStorage.setItem(RECENT_HELP_KEY, JSON.stringify(list.slice(-20)));
    } catch (_err) {
      // No crítico.
    }
  }

  // ---------- Perfil de reglas (básico / expansión / reglas opcionales) ----------

  function loadRuleProfile() {
    try {
      const raw = localStorage.getItem(RULE_PROFILE_KEY);
      return RuleProfileEngine.normalize(raw ? JSON.parse(raw) : null);
    } catch (_err) {
      return RuleProfileEngine.normalize(null);
    }
  }

  function saveRuleProfile(profile) {
    try {
      localStorage.setItem(RULE_PROFILE_KEY, JSON.stringify(RuleProfileEngine.normalize(profile)));
    } catch (_err) {
      // No crítico: el perfil vuelve al básico en la siguiente carga.
    }
  }

  // ---------- Grupo de misión aéreo compartido (Fase 11) ----------

  function loadAirGroup() {
    try {
      const raw = localStorage.getItem(AIR_GROUP_KEY);
      return AirMissionGroup.normalize(raw ? JSON.parse(raw) : null);
    } catch (_err) {
      return AirMissionGroup.emptyGroup();
    }
  }

  function saveAirGroup(group) {
    try {
      localStorage.setItem(AIR_GROUP_KEY, JSON.stringify(AirMissionGroup.normalize(group)));
    } catch (_err) {
      // No crítico: el grupo se pierde al recargar.
    }
  }

  root.AppStorage = {
    loadAirGroup,
    saveAirGroup,
    loadRuleProfile,
    saveRuleProfile,
    pushHistory,
    loadProgress,
    saveProgress,
    markNodeFinished,
    markNodeSkipped,
    reopenNode,
    markNodeVisited,
    dismissNotice,
    changeBand,
    registerPendingResolution,
    removePendingResolution,
    DRAFT_SCHEMA_VERSION,
    saveDraft,
    loadDraft,
    removeDraft,
    hasDraftForPending,
    loadRoster,
    saveRoster,
    addRosterUnit,
    removeRosterUnit,
    toggleRosterFlag,
    resetAllActuada,
    loadResolutionHistory,
    saveResolutionHistoryList,
    saveResolutionToHistory,
    removeResolutionHistoryEntry,
    loadFavoriteHelp,
    toggleFavoriteHelp,
    loadRecentHelp,
    recordRecentHelp
  };
})(typeof window !== 'undefined' ? window : globalThis);
