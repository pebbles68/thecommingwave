// Composición de la aplicación (correcciones.md COR-005): inicialización,
// pantalla de inicio, panel de ayuda flotante, árbol de rutas (routeDispatch)
// y el botón "volver arriba"/paralaje de fondo. La carga de datos, la
// persistencia y las utilidades de construcción de vistas compartidas viven
// en public/js/core.js (AppCore); cada dominio de pantalla (turno, plantilla
// de fuerzas, historial, ayuda rápida, wizard de ataque guiado) vive en su
// propio archivo bajo public/js/views/ (paso 4 de la incidencia, extraído de
// una versión anterior de este archivo que superaba las 3.800 líneas).
(function () {
  const { viewRoot, breadcrumbEl, setBreadcrumb, el, QUICK_HELP_CATEGORIES, recordRecentHelp } = AppCore;
  const helpPanel = document.getElementById('help-panel');
  const helpPanelBody = document.getElementById('help-panel-body');
  const helpBackdrop = document.getElementById('help-backdrop');

  // AJ-006: referencias de desarrollo del texto principal -> «Fuente y trazabilidad».
  PlayerText.attach(viewRoot);
  // AJ-008: «¿Dónde se lee este valor?» bajo cada campo numérico de los wizards.
  AppVisualRefs.attach(viewRoot);

  // ---------- Vistas ----------

  // Atajos a los wizards de resolución, agrupados por dominio (AJ-006: texto en
  // lenguaje de juego; la trazabilidad de cada wizard va dentro de él).
  const COMBAT_ENTRY_GROUPS = [
    { title: 'Ataque y combate terrestre', entries: [
      ['Combate cercano terrestre', 'Fuerza de combate, guerra electrónica y umbral de Derrota.', '#/wizard/ground-close-combat'],
      ['Ataque terrestre guiado', 'Defensas, modificación por tipo de objetivo y tabla de ataque de precisión (página 5).', '#/wizard/ground-guided'],
      ['Ataque terrestre no guiado', 'Intercepción, modificación contra unidades móviles y tabla de la página 9.', '#/wizard/ground-unguided'],
      ['Ataque antirradiación (ARM)', 'Defensas, modificación -5, fila [L]/Normal de la página 13 y contraataque a baja altura.', '#/wizard/anti-radiation'],
      ['Ataques de reacción terrestres', 'Contrabatería, Contrafuegos, Persecución Aérea e Interdicción de Batalla: quién puede atacar, objetivos y orden, y consecuencias.', '#/wizard/ground-reaction'],
      ['Resultado del ataque terrestre', 'Qué hacen los impactos sobre una unidad terrestre, un puerto con sus buques o un aeródromo.', '#/wizard/ground-attack-result']
    ] },
    { title: 'Combate aéreo', entries: [
      ['Grupo de misión aéreo', 'Los dos bandos y sus unidades, compartidos por la asignación de objetivos y el combate cercano; recoge retiradas y bajas.', '#/wizard/air-mission-group'],
      ['Asignación de objetivos BVR', 'Orden de selección, duelos 1 contra 1 y retirada antes del BVR.', '#/wizard/air-intercept-targets'],
      ['Combate aéreo BVR', 'Iniciativa, tipo de combate y ataque 1 contra 1 (página 16).', '#/wizard/air-combat-bvr'],
      ['Combate aéreo cercano WVR', 'Patrulla en red, escolta electrónica, rondas y absorción de impactos (página 17).', '#/wizard/air-combat-wvr']
    ] },
    { title: 'Ataque a buques y submarinos', entries: [
      ['Ataque guiado a superficie', 'Resuelve el ataque paso a paso hasta la tabla final.', '#/wizard/antiship-guided'],
      ['Ataque antibuque no guiado', 'Intercepción final, interceptación de munición y modificación de intensidad.', '#/wizard/antiship-unguided'],
      ['Efectos del impacto antibuque', 'Daño crítico, portaeronaves y transportes.', '#/wizard/ship-impact-effects'],
      ['Torpedos contra superficie', 'Tipo de torpedo, estado del submarino y segundo dado.', '#/wizard/torpedo-surface'],
      ['Ataque ASW (superficie y aéreas)', 'Alcance, profundidad, Firma del submarino y tabla de la página 29.', '#/wizard/asw-surface-air'],
      ['Ataque ASW (submarinos)', 'Torpedos de submarino contra submarino expuesto (página 30).', '#/wizard/asw-submarine'],
      ['Búsqueda por Diferencia de Firma', 'Columna por Firma o marco del Valor ASW y rango de descubrimiento (página 33).', '#/wizard/asw-signature-search'],
      ['Búsqueda Aérea ASW', 'Suma de detección aérea, Firma por profundidad y rango de descubrimiento (página 34).', '#/wizard/asw-air-search'],
      ['Emboscada de submarino', 'Quién puede emboscar, Zona de Emboscada y secuencia de resolución (Decision Book 9.16).', '#/wizard/submarine-ambush']
    ] },
    { title: 'Logística', entries: [
      ['Logística de puerto y munición', 'Reabastecimiento de munición, reparación de buques, reparaciones de emergencia y agotamiento de munición.', '#/wizard/port-logistics'],
      ['Garantía logística', 'Nodos de Suministro, Líneas de Comunicación y consecuencias de perder el suministro.', '#/wizard/logistics-guarantee'],
      ['Reabastecimiento de Campo del Ejército', 'Condiciones, tirada por Nivel de Iniciativa y aumento de fuerza de una unidad principal (página 32).', '#/wizard/army-resupply']
    ] },
    { title: 'Acciones estratégicas (regla opcional)', entries: [
      ['Ataque cibernético', 'Capacidad de Guerra Cibernética, tiradas de ataque y defensa y efecto según el sistema atacado (Decision Book 14.2-14.4).', '#/wizard/cyber-attack'],
      ['Guerra espacial', 'Orden de acciones, apoyo, destrucción y garantía espacial y escombros (Decision Book 14.5-14.9).', '#/wizard/space-war']
    ] }
  ];

  function renderHome() {
    setBreadcrumb(['TCW Assistant']);
    viewRoot.innerHTML = '';
    const wrap = el('div', 'home');
    wrap.appendChild(el('h1', 'home__title', 'THE COMING WAVE'));
    wrap.appendChild(el('p', 'home__subtitle', 'Guía interactiva de reglas, tablas y resolución de acciones'));

    // Tres entradas principales (AJ-006); los accesos recientes quedan debajo.
    const main = el('div', 'home__actions');
    main.appendChild(makeActionCard('Seguir turno', 'Recorre la hoja de turnos fase a fase o entra directamente en la que necesites.', () => { location.hash = '#/turno'; }));
    const combatCard = makeActionCard('Resolver combate', 'Elige el tipo de ataque o combate y responde paso a paso hasta el resultado.', () => {
      combatPanel.hidden = !combatPanel.hidden;
      combatCard.setAttribute('aria-expanded', String(!combatPanel.hidden));
      if (!combatPanel.hidden) combatPanel.scrollIntoView({ block: 'start' });
    });
    combatCard.setAttribute('aria-expanded', 'false');
    main.appendChild(combatCard);
    main.appendChild(makeActionCard('Consultar ayuda', 'Reglas, tablas, detección, planes de ataque, munición y fichas.', () => { location.hash = '#/ayuda'; }));
    wrap.appendChild(main);

    const combatPanel = el('div', 'home__combat');
    combatPanel.hidden = true;
    COMBAT_ENTRY_GROUPS.forEach((group) => {
      combatPanel.appendChild(el('h2', 'home__group-title', group.title));
      const row = el('div', 'home__actions');
      group.entries.forEach(([title, desc, hash]) => row.appendChild(makeActionCard(title, desc, () => { location.hash = hash; })));
      combatPanel.appendChild(row);
    });
    wrap.appendChild(combatPanel);

    wrap.appendChild(el('h2', 'home__group-title', 'Accesos recientes'));
    const recent = el('div', 'home__actions');
    recent.appendChild(makeActionCard('Plantilla de fuerzas', 'Unidades de la sesión y su estado (Actuada/Dañada).', () => { location.hash = '#/unidades'; }));
    recent.appendChild(makeActionCard('Perfil de reglas', 'Elige si usas la expansión y las reglas opcionales: se ocultan las opciones que no uses.', () => { location.hash = '#/perfil-reglas'; }));
    recent.appendChild(makeActionCard('Historial de resoluciones', 'Combates guardados: repetir, copiar o revisar el resumen.', () => { location.hash = '#/historial'; }));
    wrap.appendChild(recent);

    viewRoot.appendChild(wrap);
  }

  function makeActionCard(title, desc, onClick) {
    const btn = el('button', 'action-card');
    btn.type = 'button';
    btn.appendChild(el('span', 'action-card__title', title));
    btn.appendChild(el('span', 'action-card__desc', desc));
    btn.addEventListener('click', onClick);
    return btn;
  }

  // ---------- Panel de ayuda flotante (accesible desde cualquier pantalla, AGENTS.md §1) ----------

  // COR-008 (correcciones.md): el panel de ayuda es un diálogo modal
  // (`role="dialog"`/`aria-modal` en public/index.html) y debe cumplir sus
  // obligaciones de foco: guardar de dónde vino el foco, moverlo dentro del
  // panel al abrir, mantenerlo confinado con Tab/Shift+Tab y devolverlo al
  // cerrar por cualquier mecanismo (botón, backdrop o Escape).
  let helpPanelPreviouslyFocused = null;
  const appContentEl = document.getElementById('app-content');

  function openHelpPanel() {
    helpPanelPreviouslyFocused = document.activeElement;
    helpPanelBody.innerHTML = '';
    const searchItem = el('button', 'help-panel__item', '🔎 Buscar');
    searchItem.type = 'button';
    searchItem.addEventListener('click', () => { closeHelpPanel(); location.hash = '#/ayuda/buscar'; });
    helpPanelBody.appendChild(searchItem);
    QUICK_HELP_CATEGORIES.forEach((cat) => {
      const item = el('button', 'help-panel__item', cat.title);
      item.type = 'button';
      item.addEventListener('click', () => {
        closeHelpPanel();
        location.hash = `#/ayuda/${cat.id}`;
      });
      helpPanelBody.appendChild(item);
    });
    helpPanel.hidden = false;
    helpBackdrop.hidden = false;
    // `inert` (soportado en los navegadores objetivo de este proyecto desde
    // 2022) saca todo el contenido de fondo del orden de tabulación y de la
    // interacción táctil/de ratón de una sola vez, sin necesidad de recorrer
    // manualmente cada control — más robusto que fijar `tabindex="-1"` uno a
    // uno y revertirlo después. No se implementa un polyfill: es el mismo
    // criterio de "navegadores objetivo modernos" ya aplicado al resto del
    // proyecto (fetch, async/await, CSS custom properties).
    appContentEl.inert = true;
    document.getElementById('btn-help-close').focus();
  }

  function closeHelpPanel() {
    helpPanel.hidden = true;
    helpBackdrop.hidden = true;
    appContentEl.inert = false;
    if (helpPanelPreviouslyFocused && document.body.contains(helpPanelPreviouslyFocused)) {
      helpPanelPreviouslyFocused.focus();
    }
    helpPanelPreviouslyFocused = null;
  }

  // Confina Tab/Shift+Tab dentro del panel (COR-008 punto 5): `inert` ya
  // impide entrar en el contenido de fondo, pero por sí solo no hace que el
  // foco vuelva a envolver desde el último control al primero (o viceversa)
  // — sin este manejador, Tab desde el último control del panel saldría del
  // documento en vez de volver al primero.
  function trapFocusInHelpPanel(ev) {
    const focusable = Array.from(helpPanel.querySelectorAll('button, [href], input, select, textarea, [tabindex]'))
      .filter((node) => !node.disabled && node.tabIndex !== -1 && node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  document.getElementById('btn-help').addEventListener('click', openHelpPanel);
  document.getElementById('btn-help-close').addEventListener('click', closeHelpPanel);
  helpBackdrop.addEventListener('click', closeHelpPanel);
  document.getElementById('btn-home').addEventListener('click', () => { location.hash = '#/'; });
  // Navegación por teclado (roadmap Fase 17): Escape cierra el panel de
  // ayuda flotante, igual que ya hacía openImageLightbox con las imágenes.
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !helpPanel.hidden) closeHelpPanel();
    if (ev.key === 'Tab' && !helpPanel.hidden) trapFocusInHelpPanel(ev);
  });

  // ---------- Router (hash-based) ----------
  //
  // El ciclo de vida genérico de navegación (analizar el hash, invocar el
  // despachador, mover el foco al terminar, capturar errores, y el contador
  // de "token" anti-carreras de renderizado) vive en public/js/router.js
  // (correcciones.md COR-005, pasos 2-3). `routeDispatch` de abajo es
  // exactamente el árbol de rutas que ya existía — la tabla ruta→vista ahora
  // resuelve a las funciones de cada módulo de public/js/views/ (paso 4).
  // "Último contexto de turno visitado" (correcciones.02.md COR02-003, ajustes_de_turno.md TUR-015):
  // lo fijan las propias vistas del turno al cargar un segmento, un paso de la Fase 0 o una
  // subfase (con el nodo exacto, p. ej. «phase-1/air-2»), se conserva al pasar por "Combate por
  // tipo" o un wizard (pasos intermedios que no tienen contexto propio) y se limpia en cualquier
  // otra ruta — así un wizard nunca se vincula a un contexto de turno obsoleto.
  function maintainLastTurnContext(parts) {
    if (parts[0] === 'turno') return; // lo gestionan las vistas del turno
    if (parts[0] === 'ayuda' && parts[1] === 'combate') return;
    if (parts[0] === 'wizard') return;
    AppCore.clearLastTurnContext();
  }

  // Rutas del turno (banda de dos días): #/turno, #/turno/fase/0[/<paso>[/<subfase>]],
  // #/turno/fase/<1-6>[/<segmento>[/<subfase>]]. Las URL del modelo anterior
  // (#/turno/proceso_estrategico/1/... y #/turno/proceso_campana/...) se redirigen sin inferir:
  // la Fase 0 tiene correspondencia inequívoca; las dos «campañas» genéricas vuelven al índice.
  function routeTurn(parts) {
    if (parts.length === 1) return Views.Turn.renderTurnIndex();
    if (parts[1] === 'proceso_estrategico') {
      location.replace(`#/turno/fase/0${parts.slice(3).map((p) => `/${p}`).join('')}`);
      return undefined;
    }
    if (parts[1] === 'proceso_campana') {
      location.replace('#/turno');
      return undefined;
    }
    if (parts[1] === 'mando' && parts.length === 3) return Views.Turn.renderCommandRecovery(parts[2]);
    if (parts[1] !== 'fase' || parts.length < 3) return Views.Turn.renderTurnIndex();
    const number = Number(parts[2]);
    if (!Number.isInteger(number) || number < 0 || number > 6) return Views.Turn.renderTurnIndex();
    if (number === 0) {
      if (parts.length === 3) return Views.Turn.renderStrategic();
      if (parts.length === 4) return Views.Turn.renderStrategicPhase(parts[3]);
      return Views.Turn.renderSubphase(0, parts[3], parts[4]);
    }
    if (parts.length === 3) return Views.Turn.renderImpulse(number);
    if (parts.length === 4) return Views.Turn.renderSegment(number, parts[3]);
    return Views.Turn.renderSubphase(number, parts[3], parts[4]);
  }

  function routeDispatch(parts) {
    {
      maintainLastTurnContext(parts);
      // Favoritos y recientes (roadmap Fase 17): registra la visita a
      // cualquier categoría de Ayuda rápida (incluidas sus sub-páginas),
      // antes de despachar la ruta — sin bloquear ni alterar el resultado.
      if (parts[0] === 'ayuda' && parts[1] && QUICK_HELP_CATEGORIES.some((c) => c.id === parts[1])) {
        recordRecentHelp(parts[1]);
      }
      if (parts.length === 0) return renderHome();
      if (parts[0] === 'turno') return routeTurn(parts);
      if (parts[0] === 'ayuda' && parts.length === 1) return Views.HelpIndex.renderHelpIndex();
      if (parts[0] === 'ayuda' && parts[1] === 'tablas' && parts[2] === 'router') return Views.HelpTablas.renderTableRouter(parts.slice(3));
      if (parts[0] === 'ayuda' && parts[1] === 'tablas' && parts.length === 2) return Views.HelpTablas.renderTablesIndex();
      if (parts[0] === 'ayuda' && parts[1] === 'tablas' && parts.length === 3) return Views.HelpTablas.renderTablesPage(parts[2]);
      if (parts[0] === 'ayuda' && parts[1] === 'tablas' && parts.length === 4) return Views.HelpTablas.renderTableViewer(parts[2], parts[3]);
      if (parts[0] === 'ayuda' && parts[1] === 'counters' && parts.length === 2) return Views.HelpCounters.renderCountersIndex();
      if (parts[0] === 'ayuda' && parts[1] === 'counters' && parts.length === 3) return Views.HelpCounters.renderCountersCategory(parts[2]);
      if (parts[0] === 'ayuda' && parts[1] === 'counters' && parts.length === 4) return Views.HelpCounters.renderCounterDetail(parts[2], parts[3]);
      if (parts[0] === 'ayuda' && parts[1] === 'municion' && parts.length === 2) return Views.HelpMunicion.renderMunicionIndex();
      if (parts[0] === 'ayuda' && parts[1] === 'municion' && parts[2] === 'iconos') return Views.HelpMunicion.renderMunicionIconLegend();
      if (parts[0] === 'ayuda' && parts[1] === 'municion' && parts.length === 3) return Views.HelpMunicion.renderMunicionCountry(parts[2]);
      if (parts[0] === 'ayuda' && parts[1] === 'municion' && parts.length === 4) return Views.HelpMunicion.renderMunicionCategory(parts[2], parts[3]);
      if (parts[0] === 'ayuda' && parts[1] === 'municion' && parts.length === 5) return Views.HelpMunicion.renderMunicionUnitDetail(parts[2], parts[3], parts[4]);
      if (parts[0] === 'ayuda' && parts[1] === 'combate' && parts.length === 2) return Views.HelpCombate.renderCombateIndex();
      if (parts[0] === 'ayuda' && parts[1] === 'combate' && parts.length === 3) return Views.HelpCombate.renderCombateDetail(parts[2]);
      if (parts[0] === 'ayuda' && parts[1] === 'buscar' && parts.length === 2) return Views.HelpSearch.renderSearch('');
      if (parts[0] === 'ayuda' && parts[1] === 'buscar' && parts.length === 3) return Views.HelpSearch.renderSearch(parts[2]);
      if (parts[0] === 'ayuda' && parts[1] === 'deteccion' && parts[2] === 'resolver' && parts.length === 3) return Views.HelpDeteccion.renderDetectionResolverIndex();
      if (parts[0] === 'ayuda' && parts[1] === 'deteccion' && parts[2] === 'resolver' && parts.length === 4) return Views.HelpDeteccion.renderDetectionResolverDetail(parts[3]);
      if (parts[0] === 'ayuda' && parts[1] === 'deteccion' && parts.length === 2) return Views.HelpDeteccion.renderDeteccionHelp();
      if (parts[0] === 'ayuda' && parts[1] === 'secuencia' && parts.length === 2) return Views.HelpSecuencia.renderSecuenciaHelp();
      if (parts[0] === 'ayuda' && parts[1] === 'reglas' && parts.length === 2) return Views.HelpReglas.renderReglasHelp();
      if (parts[0] === 'ayuda' && parts.length === 2) return Views.HelpIndex.renderHelpCategory(parts[1]);
      if (parts[0] === 'wizard' && parts[1] === 'antiship-guided') return Views.AntishipWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'antiship-unguided') return Views.AntishipUnguidedWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'ground-close-combat') return Views.GroundCloseCombatWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'torpedo-surface') return Views.TorpedoSurfaceWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'asw-surface-air') return Views.AswSurfaceAirWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'asw-submarine') return Views.AswSubmarineWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'asw-air-search') return Views.AswAirSearchWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'asw-signature-search') return Views.AswSignatureSearchWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'army-resupply') return Views.ArmyResupplyWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'logistics-guarantee') return Views.LogisticsGuaranteeWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'submarine-ambush') return Views.SubmarineAmbushWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'port-logistics') return Views.PortLogisticsWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'cyber-attack') return Views.CyberAttackWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'space-war') return Views.SpaceWarWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'ground-reaction') return Views.GroundReactionWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'ground-guided') return Views.GroundGuidedWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'ground-unguided') return Views.GroundUnguidedWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'ground-attack-result') return Views.GroundAttackResultWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'air-combat-bvr') return Views.AirCombatBvrWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'air-combat-wvr') return Views.AirCombatWvrWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'air-intercept-targets') return Views.AirInterceptTargetsWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'air-mission-group') return Views.AirMissionGroupWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'anti-radiation') return Views.AntiRadiationWizard.render();
      if (parts[0] === 'wizard' && parts[1] === 'ship-impact-effects') return Views.ShipImpactEffectsWizard.render();
      if (parts[0] === 'unidades' && parts.length === 1) return Views.Roster.renderRosterIndex();
      if (parts[0] === 'unidades' && parts[1] === 'anadir') return Views.Roster.renderRosterAddForm();
      if (parts[0] === 'historial' && parts.length === 1) return Views.History.renderResolutionHistory();
      if (parts[0] === 'perfil-reglas' && parts.length === 1) return Views.RuleProfile.render();
      AppCore.renderNotFound('Ruta no reconocida');
    }
  }

  Router.start({
    dispatch: routeDispatch,
    onError: (err) => {
      viewRoot.innerHTML = '';
      viewRoot.appendChild(el('p', 'error-note', 'Error al cargar la vista: ' + err.message));
    },
    focusTarget: viewRoot
  });

  // ---------- Botón "volver arriba" y scroll paralaje del fondo (AGENTS.md §4) ----------

  const bgLogo = document.getElementById('bg-logo');
  const scrollTopBtn = document.getElementById('btn-scroll-top');
  const SCROLL_TOP_THRESHOLD = 400;
  let scrollTicking = false;

  const reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const prefersReducedMotion = () => !!(reducedMotionQuery && reducedMotionQuery.matches);

  // Único punto de lectura/escritura del scroll de página (AJ-001).
  function pageScroller() {
    return document.scrollingElement || document.documentElement;
  }

  function updateOnScroll() {
    const y = pageScroller().scrollTop || window.scrollY || 0;
    if (bgLogo) {
      bgLogo.style.transform = prefersReducedMotion() ? 'none' : `translateY(${(-y * 0.15).toFixed(1)}px)`;
    }
    if (scrollTopBtn) scrollTopBtn.hidden = y < SCROLL_TOP_THRESHOLD;
    scrollTicking = false;
  }

  window.addEventListener('scroll', () => {
    if (!scrollTicking) {
      window.requestAnimationFrame(updateOnScroll);
      scrollTicking = true;
    }
  }, { passive: true });

  if (scrollTopBtn) {
    scrollTopBtn.addEventListener('click', () => {
      pageScroller().scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
  }
})();
