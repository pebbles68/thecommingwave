// Núcleo compartido de la capa de aplicación (correcciones.md COR-005, paso
// 4), extraído de public/js/app.js. Desde correcciones03.md COR03-006 este
// archivo es solo la FACHADA de la capa de aplicación: lo que sí le es
// propio (referencias de DOM de la cáscara — #view-root, migas —, envoltorios
// de persistencia, categorías de ayuda rápida, hashes de wizard y el último
// contexto de turno) vive aquí, y el resto se reparte en módulos cargados
// antes que él y re-exportados sin cambios bajo `AppCore`, de modo que
// ninguna vista tuvo que cambiar sus llamadas:
//   - core-data.js          (AppData)        cargadores de datos y caches, sin DOM;
//   - core-widgets.js       (AppWidgets)     constructores de DOM y widgets de formulario;
//   - core-visuals.js       (AppVisuals)     galerías/recortes/visor de fichas con imágenes;
//   - core-wizard-steps.js  (AppWizardSteps) pasos de wizard reutilizables.
// Lo que pertenece a un único dominio de pantalla vive en public/js/views/*.js.
(function (root) {
  'use strict';

  const viewRoot = document.getElementById('view-root');
  // Redibujar la vista con un campo enfocado hace que el navegador dispare su blur/change en pleno vaciado del DOM;
  // si ese manejador redibuja, el vaciado falla («The node to be removed is no longer a child»). Se quita el foco
  // ANTES de vaciar, para que el blur y su confirmación ocurran con el DOM intacto (visto en el CI de Linux).
  (function guardViewRootClear() {
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (!desc || !desc.set) return;
    Object.defineProperty(viewRoot, 'innerHTML', {
      configurable: true,
      get() { return desc.get.call(this); },
      set(value) {
        const active = document.activeElement;
        if (active && active !== document.body && this.contains(active) && typeof active.blur === 'function') {
          try { active.blur(); } catch (_err) { /* sin foco que quitar */ }
        }
        desc.set.call(this, value);
      }
    });
  })();
  const breadcrumbEl = document.getElementById('breadcrumb');
  const { el } = AppWidgets;
  const { getCachedTurnTemplate, loadTurnTemplate } = AppData;

  // Categorías de "Consulta rápida" (AGENTS.md §3.2). El contenido real de cada
  // una se transcribirá en la Fase 3 del roadmap; aquí solo se enlaza la fuente.
  const QUICK_HELP_CATEGORIES = [
    { id: 'secuencia', title: 'Secuencia de turno y fases', source: 'TCW - Hoja de turnos 1.1.pdf' },
    { id: 'deteccion', title: 'Detección', source: 'TCW-Hoja-de-Ayuda-Deteccion.pdf' },
    { id: 'combate', title: 'Combate por tipo', source: 'Tablas-de-combate 5.pdf' },
    { id: 'tablas', title: 'Tablas', source: 'Tablas-de-combate 5.pdf' },
    { id: 'municion', title: 'Planes de ataque y municiones', source: 'Tablas de municiones.pdf' },
    { id: 'counters', title: 'Leyenda de counters / fichas', source: 'Resumen counters - Español.pdf' },
    { id: 'reglas', title: 'Reglas y extractos', source: 'TCW_Decision_Book_v1.0_-_COMPLETO_[v.ESP_-_1.2].pdf' }
  ];

  // ---------- Persistencia en localStorage (correcciones.md COR-005, paso 1) ----------
  //
  // La lógica y el acceso a `localStorage` viven ahora en public/js/storage.js
  // (`AppStorage`), extraído de este archivo. Las funciones de abajo son
  // envoltorios finos que solo aportan la plantilla del turno (ya cacheada en
  // core-data.js) donde `AppStorage.loadProgress`/etc. la necesitan para migrar el
  // esquema de progreso (correcciones.md COR-001) — así ningún punto de
  // llamada existente en public/js/app.js/views/*.js tuvo que cambiar.
  function pushHistory(entry) { AppStorage.pushHistory(entry); }
  function loadProgress() { return AppStorage.loadProgress(getCachedTurnTemplate()); }
  function saveProgress(progress) { AppStorage.saveProgress(progress); }
  function markNodeFinished(nodeId) { AppStorage.markNodeFinished(nodeId, getCachedTurnTemplate()); }
  function markNodeSkipped(nodeId) { AppStorage.markNodeSkipped(nodeId, getCachedTurnTemplate()); }
  function reopenNode(nodeId) { AppStorage.reopenNode(nodeId, getCachedTurnTemplate()); }
  function markNodeVisited(nodeId) { AppStorage.markNodeVisited(nodeId, getCachedTurnTemplate()); }
  function dismissNotice(noticeId) { AppStorage.dismissNotice(noticeId, getCachedTurnTemplate()); }
  function changeBand(delta, maxBand) { return AppStorage.changeBand(delta, maxBand, getCachedTurnTemplate()); }
  function registerPendingResolution(resolution) { AppStorage.registerPendingResolution(resolution, getCachedTurnTemplate()); }
  function removePendingResolution(resolutionId) { AppStorage.removePendingResolution(resolutionId, getCachedTurnTemplate()); }
  function loadRoster() { return AppStorage.loadRoster(); }
  function loadRuleProfile() { return AppStorage.loadRuleProfile(); }
  function loadAirGroup() { return AppStorage.loadAirGroup(); }
  function saveAirGroup(group) { AppStorage.saveAirGroup(group); }
  function saveRuleProfile(profile) { AppStorage.saveRuleProfile(profile); }
  function saveRoster(roster) { AppStorage.saveRoster(roster); }
  function addRosterUnit(unit) { AppStorage.addRosterUnit(unit); }
  function removeRosterUnit(instanceId) { AppStorage.removeRosterUnit(instanceId); }
  function toggleRosterFlag(instanceId, flag) { AppStorage.toggleRosterFlag(instanceId, flag); }
  function resetAllActuada() { return AppStorage.resetAllActuada(); }
  function loadResolutionHistory() { return AppStorage.loadResolutionHistory(); }
  function saveResolutionHistoryList(list) { AppStorage.saveResolutionHistoryList(list); }
  // El historial conserva el origen en el turno (banda, fase, segmento y subfase) de la resolución, si la hay.
  function saveResolutionToHistory(entry) {
    const ctx = getLastTurnContext();
    const turnOrigin = ctx ? {
      band: ctx.band, impulseId: ctx.impulseId || null, segmentId: ctx.segmentId || null,
      phaseId: ctx.phaseId || null, subphaseId: ctx.subphaseId || null, nodeId: ctx.resolutionNodeId || null,
      text: TurnModel.describeOrigin(getCachedTurnTemplate() || { band: { strategic: {}, days: [], durationDays: 2 }, impulses: {}, phases: {}, subphases: {} }, ctx)
    } : null;
    AppStorage.saveResolutionToHistory({ ...entry, turnOrigin });
  }
  function removeResolutionHistoryEntry(entryId) { AppStorage.removeResolutionHistoryEntry(entryId); }
  function loadFavoriteHelp() { return AppStorage.loadFavoriteHelp(); }
  function toggleFavoriteHelp(catId) { AppStorage.toggleFavoriteHelp(catId); }
  function loadRecentHelp() { return AppStorage.loadRecentHelp(); }
  function recordRecentHelp(catId) { AppStorage.recordRecentHelp(catId); }

  // Workflows de data/workflows/ con un wizard interactivo ya construido
  // (roadmap Fase 7/9): compartido entre views/help.js (tarjeta "Resolver
  // con el wizard de combate") y views/turn.js (COR02-003: navegar "de
  // vuelta" a una resolución pendiente desde la fase que la inició).
  const WORKFLOW_WIZARD_HASHES = {
    antiship_guided: '#/wizard/antiship-guided',
    antiship_unguided: '#/wizard/antiship-unguided',
    ground_close_combat: '#/wizard/ground-close-combat',
    ground_guided: '#/wizard/ground-guided',
    ground_unguided: '#/wizard/ground-unguided',
    ground_attack_result: '#/wizard/ground-attack-result',
    torpedo_vs_surface: '#/wizard/torpedo-surface',
    asw_surface_air: '#/wizard/asw-surface-air',
    asw_submarine: '#/wizard/asw-submarine',
    asw_search_support: '#/wizard/asw-air-search',
    air_combat: '#/wizard/air-combat-bvr',
    // No son workflows propios: tipos de resolución pendiente de los wizards
    // WVR y de asignación de objetivos (partes del workflow `air_combat`),
    // para volver a ellos desde el turno.
    air_combat_wvr: '#/wizard/air-combat-wvr',
    air_intercept_targets: '#/wizard/air-intercept-targets',
    asw_signature_search: '#/wizard/asw-signature-search',
    army_resupply: '#/wizard/army-resupply',
    logistics_guarantee: '#/wizard/logistics-guarantee',
    submarine_ambush: '#/wizard/submarine-ambush',
    port_logistics: '#/wizard/port-logistics',
    cyber_attack: '#/wizard/cyber-attack',
    space_war: '#/wizard/space-war',
    ground_reaction: '#/wizard/ground-reaction',
    anti_radiation: '#/wizard/anti-radiation'
  };

  // Wizards adicionales de un mismo workflow (una etapa con su propio
  // wizard): se ofrecen junto a la tarjeta principal en "Combate por tipo"
  // y en el router de tablas.
  const RELATED_WORKFLOW_WIZARDS = {
    ground_close_combat: [{ hash: '#/wizard/ground-reaction', title: '▶ Resolver un ataque de reacción (CF, AS, KB, BAI)', desc: 'Contrabatería, Contrafuegos, Persecución Aérea e Interdicción de Batalla: quién puede atacar, objetivos y orden y consecuencias (Decision Book §5.16).' }],
    asw_search_support: [{ hash: '#/wizard/asw-signature-search', title: '▶ Resolver la Búsqueda por Diferencia de Firma', desc: 'Columna por Firma del submarino o marco del Valor ASW, rango de descubrimiento y tirada (página 33).' }],
    air_combat: [
      { hash: '#/wizard/air-intercept-targets', title: '▶ Asignar objetivos BVR y ver quién puede retirarse', desc: 'Orden de selección por escolta electrónica, detección y Valor Electrónico; duelos 1 contra 1 (Decision Book §7.16.1-§7.16.2).' },
      { hash: '#/wizard/air-combat-wvr', title: '▶ Resolver el combate aéreo cercano (WVR)', desc: 'Rondas de combate cercano, absorción de impactos, salida de combate y derrota (página 17).' }
    ]
  };

  // "Último contexto de turno visitado" (correcciones.02.md COR02-003): qué
  // banda/runKey/fase/subfase se estaba viendo en el turno guiado, para que
  // un wizard abierto poco después (vía "Ayuda contextual" → "Combate por
  // tipo" → el propio wizard) pueda vincularse a esa fase concreta sin que
  // cada vista tenga que pasarse el contexto explícitamente por parámetro a
  // través de 2-3 saltos de ruta. Solo en memoria (como el propio estado de
  // los wizards, `antishipWizardState`/etc.: ya no sobrevive a una recarga
  // hoy tampoco) y mantenido por `app.js#routeDispatch` en un único sitio:
  // se fija al visitar una fase/subfase del turno, se conserva al pasar por
  // "Combate por tipo" o el propio wizard, y se limpia en cualquier otra
  // ruta — así no puede vincular un wizard a un contexto de turno obsoleto
  // de hace varias navegaciones no relacionadas.
  // Se guarda también en sessionStorage (por pestaña) para que recargar la página dentro de un wizard
  // conserve el nodo del turno y recupere su borrador (los borradores se aíslan por nodo, TUR-015).
  const TURN_CONTEXT_KEY = 'tcw-turn-context';
  function readStoredTurnContext() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(TURN_CONTEXT_KEY) || 'null');
      return parsed && typeof parsed === 'object' && typeof parsed.resolutionNodeId === 'string' ? parsed : null;
    } catch (_err) { return null; }
  }
  function writeStoredTurnContext(ctx) {
    try {
      if (ctx) sessionStorage.setItem(TURN_CONTEXT_KEY, JSON.stringify(ctx)); else sessionStorage.removeItem(TURN_CONTEXT_KEY);
    } catch (_err) { /* no crítico */ }
  }
  let lastTurnContext = readStoredTurnContext();
  function setLastTurnContext(ctx) { lastTurnContext = ctx; writeStoredTurnContext(ctx); }
  function getLastTurnContext() { return lastTurnContext; }
  function clearLastTurnContext() { lastTurnContext = null; writeStoredTurnContext(null); }

  // ---------- Borradores de wizard (ajuste AJ-003) ----------
  //
  // La lógica vive en wizard-drafts.js; aquí solo se conecta con AppStorage, el
  // progreso del turno y el DOM (aviso de recuperación y autoguardado).
  const draftManager = WizardDrafts.createDraftManager(AppStorage, (id) =>
    TurnProgressEngine.listPendingResolutions(loadProgress()).some((r) => r.id === id));
  let activeDraft = null;

  // Un wizard abierto desde un nodo del turno guarda su borrador por nodo (TUR-015): dos resoluciones del
  // mismo wizard en segmentos distintos (p. ej. Aire I y Aire II) no se pisan; reabrir el mismo nodo recupera
  // el suyo. Fuera del turno la clave no cambia.
  function scopedKey(key) {
    const ctx = getLastTurnContext();
    return ctx && ctx.resolutionNodeId ? `${key}@${ctx.resolutionNodeId}` : key;
  }

  function resolveWizardState(key, current, makeFresh) {
    // Un estado en memoria ligado a OTRO nodo del turno no se reutiliza: su borrador ya está guardado
    // con su propia clave y este nodo recupera el suyo (o empieza uno nuevo). Un estado que nunca se
    // ligó al turno sí se conserva y se liga al nodo actual.
    const ctx = getLastTurnContext();
    const scope = ctx && ctx.resolutionNodeId ? ctx.resolutionNodeId : null;
    const reusable = current && !(current.turnNodeId && current.turnNodeId !== scope) ? current : null;
    return draftManager.resolve(scopedKey(key), reusable, makeFresh);
  }
  function discardWizardDraft(key, state) { draftManager.discard(scopedKey(key), state); }

  // Guarda ahora y deja instalado el autoguardado: cualquier cambio posterior
  // en la vista (escribir, elegir, pulsar) vuelve a guardar el estado.
  function persistWizardDraft(key, state, getState) {
    const scoped = scopedKey(key);
    draftManager.persist(scoped, state);
    activeDraft = { key: scoped, getState: getState || (() => state), token: Router.currentToken() };
  }

  function autosaveActiveDraft() {
    if (!activeDraft || !Router.isCurrent(activeDraft.token)) return;
    const { key, getState } = activeDraft;
    draftManager.persist(key, getState());
  }
  ['input', 'change', 'click'].forEach((type) => {
    viewRoot.addEventListener(type, () => setTimeout(autosaveActiveDraft, 0));
  });

  // Ciclo de vida común de una resolución de wizard (AJ-007): vincular al turno
  // la primera vez, y desvincular + descartar el borrador al guardar, cancelar o
  // reiniciar. Sustituye a las copias de linkToTurnContextIfNeeded /
  // unlinkTurnContext de cada vista. `getState()` devuelve el estado actual del
  // wizard (que guarda `turnResolutionId`).
  function createResolutionLifecycle({ key, type, getState }) {
    return {
      link(title) {
        const s = getState();
        if (s.turnResolutionId) return;
        const ctx = getLastTurnContext();
        if (!ctx) return;
        s.turnResolutionId = TurnProgressEngine.makeResolutionId(type, ctx.band, ctx.resolutionNodeId);
        s.turnNodeId = ctx.resolutionNodeId;
        registerPendingResolution({
          id: s.turnResolutionId, type, band: ctx.band, nodeId: ctx.resolutionNodeId,
          phaseId: ctx.phaseId, subphaseId: ctx.subphaseId, label: title
        });
      },
      unlink() {
        const s = getState();
        discardWizardDraft(key, s);
        if (!s.turnResolutionId) return;
        removePendingResolution(s.turnResolutionId);
        s.turnResolutionId = null;
        s.turnNodeId = null;
      }
    };
  }

  // Origen de la resolución: si el wizard se abrió desde el turno, se muestra de dónde (banda, día, fase, segmento y subfase).
  function mountTurnOrigin(wrap) {
    const ctx = getLastTurnContext();
    if (!ctx) return;
    const box = el('p', 'turn-origin');
    box.setAttribute('role', 'note');
    wrap.appendChild(box);
    loadTurnTemplate().then((template) => { box.textContent = `Origen en el turno: ${TurnModel.describeOrigin(template, ctx)}`; }).catch(() => { box.remove(); });
  }

  // Aviso al volver a un wizard cuyo borrador se ha recuperado (o no se puede
  // recuperar), con la opción de descartarlo.
  function mountWizardDraft(key, wrap, onDiscard) {
    mountTurnOrigin(wrap);
    const notice = draftManager.takeNotice(scopedKey(key));
    if (!notice) return;
    const box = el('div', 'help-card help-card--highlight');
    if (notice.kind === 'unrecoverable') {
      box.appendChild(el('span', 'help-card__title', '⚠ No se puede recuperar la resolución guardada'));
      box.appendChild(el('span', 'help-card__source', 'El formato del wizard ha cambiado desde que se guardó, así que se ha descartado el borrador. Revisa los datos que habías introducido.'));
    } else {
      box.appendChild(el('span', 'help-card__title', '↩ Resolución en curso recuperada'));
      box.appendChild(el('span', 'help-card__source', `Se han restaurado tus respuestas${notice.step ? ` y el paso ${notice.step}` : ''}. Puedes continuar o descartarla.`));
      const discardBtn = el('button', 'btn btn--secondary', '✕ Descartar y empezar de nuevo');
      discardBtn.type = 'button';
      discardBtn.addEventListener('click', onDiscard);
      box.appendChild(discardBtn);
    }
    wrap.appendChild(box);
  }

  // Retira las marcas de resolución pendiente que ya no tienen borrador
  // asociado (p.ej. creadas antes de existir los borradores): evita que
  // «Volver a la resolución» abra un wizard vacío ligado a una marca antigua.
  function repairOrphanPendingResolutions() {
    const removed = [];
    TurnProgressEngine.listPendingResolutions(loadProgress()).forEach((r) => {
      if (!AppStorage.hasDraftForPending(r.id)) { removed.push(r); removePendingResolution(r.id); }
    });
    return removed;
  }

  function setBreadcrumb(parts) {
    breadcrumbEl.textContent = parts.filter(Boolean).join(' › ');
  }

  function renderNotFound(message) {
    viewRoot.innerHTML = '';
    viewRoot.appendChild(el('p', 'not-found', message || 'No encontrado'));
  }

  root.AppCore = Object.assign({
    viewRoot,
    breadcrumbEl,
    QUICK_HELP_CATEGORIES,
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
    createResolutionLifecycle,
    resolveWizardState,
    discardWizardDraft,
    persistWizardDraft,
    mountWizardDraft,
    repairOrphanPendingResolutions,
    WORKFLOW_WIZARD_HASHES,
    RELATED_WORKFLOW_WIZARDS,
    setLastTurnContext,
    getLastTurnContext,
    clearLastTurnContext,
    loadRoster,
    loadRuleProfile,
    loadAirGroup,
    saveAirGroup,
    saveRuleProfile,
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
    recordRecentHelp,
    setBreadcrumb,
    renderNotFound
  }, AppData, AppWidgets, AppVisuals, AppWizardSteps, AppMission, AppStageQuestions);
})(typeof window !== 'undefined' ? window : globalThis);
