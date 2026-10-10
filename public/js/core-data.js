// Cargadores de datos compartidos de la capa de aplicación (correcciones03.md
// COR03-006, dividido desde public/js/core.js): todo lo que hace `fetch` de un
// archivo de data/ y lo cachea en memoria, más el acceso a planes de
// munición/unidades que consumen A LA VEZ más de una vista (p.ej. "Ayuda
// rápida > Munición" y el wizard de ataque guiado, COR-007). Sin DOM: no toca
// `document` ni construye elementos. Expuesto como `AppData`; `AppCore`
// (core.js) lo re-exporta tal cual, así que ningún punto de llamada cambia.
(function (root) {
  'use strict';

  let turnTemplate = null;

  async function loadTurnTemplate() {
    if (turnTemplate) return turnTemplate;
    const res = await fetch('/data/phases/turn-template.json');
    if (!res.ok) throw new Error('No se pudo cargar turn-template.json');
    turnTemplate = await res.json();
    return turnTemplate;
  }

  // ---------- Tablas de combate (roadmap Fase 5/6): motor genérico + navegación ----------

  let tablesIndex = null;
  const tablePageCache = new Map();

  async function loadTablesIndex() {
    if (tablesIndex) return tablesIndex;
    const res = await fetch('/data/tables/index.json');
    if (!res.ok) throw new Error('No se pudo cargar data/tables/index.json');
    tablesIndex = await res.json();
    return tablesIndex;
  }

  async function loadTablePage(fileName) {
    if (tablePageCache.has(fileName)) return tablePageCache.get(fileName);
    const res = await fetch(`/data/tables/${fileName}`);
    if (!res.ok) throw new Error(`No se pudo cargar data/tables/${fileName}`);
    const data = await res.json();
    tablePageCache.set(fileName, data);
    return data;
  }

  const workflowCache = new Map();

  async function loadWorkflow(fileName) {
    if (workflowCache.has(fileName)) return workflowCache.get(fileName);
    const res = await fetch(`/data/workflows/${fileName}`);
    if (!res.ok) throw new Error(`No se pudo cargar data/workflows/${fileName}`);
    const data = await res.json();
    workflowCache.set(fileName, data);
    return data;
  }

  let workflowsIndex = null;

  async function loadWorkflowsIndex() {
    if (workflowsIndex) return workflowsIndex;
    const res = await fetch('/data/workflows/index.json');
    if (!res.ok) throw new Error('No se pudo cargar data/workflows/index.json');
    workflowsIndex = await res.json();
    return workflowsIndex;
  }

  let tableRouting = null;

  async function loadTableRouting() {
    if (tableRouting) return tableRouting;
    const res = await fetch('/data/routing/table-routing.json');
    if (!res.ok) throw new Error('No se pudo cargar data/routing/table-routing.json');
    tableRouting = await res.json();
    return tableRouting;
  }

  // Dado un leaf del router (workflowId/attackWorkflowId, o un tableFile
  // directo para el caso "Logística" sin workflow), localiza las tablas ya
  // transcritas en data/tables/index.json que le corresponden (lógica pura en
  // table-routing-engine.js; aquí solo se resuelve el fetch del índice).
  async function findTablesForLeaf(leaf) {
    const index = await loadTablesIndex();
    return TableRoutingEngine.findTablesForLeaf(leaf, index);
  }

  // Localiza una tabla por id partiendo de un fichero de página, siguiendo
  // `reusesTable` si esa página no la define directamente (ver table-engine.js).
  async function loadTableById(fileName, tableId) {
    const page = await loadTablePage(fileName);
    const found = TableEngine.findTableInPage(page, tableId);
    if (!found) throw new Error(`La tabla "${tableId}" no está en ${fileName}`);
    if (found.table) return { table: found.table, page, definedInFile: fileName };
    const targetFile = found.redirect.file.replace('data/tables/', '');
    return loadTableById(targetFile, found.redirect.id);
  }

  let ammoSourcePagesIndex = null;
  async function loadAmmoSourcePages() {
    if (ammoSourcePagesIndex) return ammoSourcePagesIndex;
    const res = await fetch('/data/ammunition/source-pages/index.json');
    if (!res.ok) throw new Error('No se pudo cargar data/ammunition/source-pages/index.json');
    ammoSourcePagesIndex = await res.json();
    return ammoSourcePagesIndex;
  }

  let unitRegistryIndex = null;
  async function loadUnitRegistry() {
    if (unitRegistryIndex) return unitRegistryIndex;
    const res = await fetch('/data/units/registry-index.json');
    if (!res.ok) throw new Error('No se pudo cargar data/units/registry-index.json');
    unitRegistryIndex = await res.json();
    return unitRegistryIndex;
  }

  let phaseSourceImagesIndex = null;
  async function loadPhaseSourceImages() {
    if (phaseSourceImagesIndex) return phaseSourceImagesIndex;
    const res = await fetch('/data/phases/source-images/index.json');
    if (!res.ok) throw new Error('No se pudo cargar data/phases/source-images/index.json');
    phaseSourceImagesIndex = await res.json();
    return phaseSourceImagesIndex;
  }

  let ammoUnitRegions = null;
  async function loadAmmoUnitRegions() {
    if (ammoUnitRegions) return ammoUnitRegions;
    const res = await fetch('/data/ammunition/source-pages/unit-regions.json');
    if (!res.ok) throw new Error('No se pudo cargar data/ammunition/source-pages/unit-regions.json');
    ammoUnitRegions = await res.json();
    return ammoUnitRegions;
  }

  // Secuencia de turno para la consulta rápida y el buscador: se genera a partir del modelo
  // canónico (data/phases/turn-template.json) con TurnModel.buildSequenceHelp; no existe una
  // segunda copia de la secuencia (ajustes_de_turno.md TUR-001).
  async function loadTurnSequenceHelp() {
    return TurnModel.buildSequenceHelp(await loadTurnTemplate());
  }

  // Vocabulario compartido de fórmulas de tirada (correcciones03.md
  // COR03-002), consumido por public/js/combat-wizard-engine.js#describeDiceFormula.
  let diceFormulasPromise = null;

  async function loadDiceFormulas() {
    if (diceFormulasPromise) return diceFormulasPromise;
    diceFormulasPromise = fetch('/data/rules/dice-formulas.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/rules/dice-formulas.json');
      return res.json();
    });
    return diceFormulasPromise;
  }

  // Cargadores promovidos desde views/help.js (correcciones03.md COR03-006,
  // 2026-09-29): cada uno lo consumía su propia categoría de Ayuda rápida Y
  // el buscador (`views/help-search.js#buildSearchIndex`) — vivir en core.js
  // evita que help-search.js dependa de otro módulo de vista para sus datos.
  let detectionHelpPromise = null;

  async function loadDetectionHelp() {
    if (detectionHelpPromise) return detectionHelpPromise;
    detectionHelpPromise = fetch('/data/detection/help-sheet.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/detection/help-sheet.json');
      return res.json();
    });
    return detectionHelpPromise;
  }

  let rulesExcerptsPromise = null;

  let ruleProfileDocPromise = null;

  // Textos del selector de perfil de reglas (data/rules/rule-profile.json).
  async function loadRuleProfileDoc() {
    if (ruleProfileDocPromise) return ruleProfileDocPromise;
    ruleProfileDocPromise = fetch('/data/rules/rule-profile.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/rules/rule-profile.json');
      return res.json();
    });
    return ruleProfileDocPromise;
  }

  async function loadRulesExcerpts() {
    if (rulesExcerptsPromise) return rulesExcerptsPromise;
    rulesExcerptsPromise = fetch('/data/rules/decision-book-excerpts.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/rules/decision-book-excerpts.json');
      return res.json();
    });
    return rulesExcerptsPromise;
  }

  // Hotspots de imágenes (ajuste_imagenes.md): geometría + catálogo de conceptos. Si no se
  // pueden cargar, devuelve null y las ayudas usan su comportamiento anterior.
  let imageHotspotsPromise = null;

  function loadImageHotspots() {
    if (imageHotspotsPromise) return imageHotspotsPromise;
    imageHotspotsPromise = Promise.all([
      fetch('/data/image-hotspots/counters.json').then((r) => (r.ok ? r.json() : null)),
      fetch('/data/image-hotspots/concepts.json').then((r) => (r.ok ? r.json() : null))
    ]).then(([counters, concepts]) => (counters && concepts ? { counters, concepts } : null)).catch(() => null);
    return imageHotspotsPromise;
  }

  // Tarjetas de aeródromos y puertos (ajuste_imagenes.md, IMG-003/IMG-004): instancias calibradas
  // y catálogo de zonas. Si no se pueden cargar, devuelve null y la galería de páginas sigue igual.
  let boardHotspotsPromise = null;

  function loadBoardHotspots() {
    if (boardHotspotsPromise) return boardHotspotsPromise;
    boardHotspotsPromise = Promise.all([
      fetch('/data/image-hotspots/boards.json').then((r) => (r.ok ? r.json() : null)),
      fetch('/data/image-hotspots/board-concepts.json').then((r) => (r.ok ? r.json() : null))
    ]).then(([boards, concepts]) => (boards && concepts ? { boards, concepts } : null)).catch(() => null);
    return boardHotspotsPromise;
  }

  // Subzonas de las filas de planes de ataque (IMG-006): solo posiciones; el texto sale de data/ammunition/.
  let ammoPlanHotspotsPromise = null;

  function loadAmmoPlanHotspots() {
    if (ammoPlanHotspotsPromise) return ammoPlanHotspotsPromise;
    ammoPlanHotspotsPromise = fetch('/data/image-hotspots/ammo-plans.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return ammoPlanHotspotsPromise;
  }

  // Catálogo de entidades con ayuda visual (data/visual-help/entities.json, TUR-010).
  let visualHelpCatalogPromise = null;

  function loadVisualHelpCatalog() {
    if (!visualHelpCatalogPromise) {
      visualHelpCatalogPromise = fetch('/data/visual-help/entities.json').then((r) => {
        if (!r.ok) throw new Error('No se pudo cargar data/visual-help/entities.json');
        return r.json();
      });
    }
    return visualHelpCatalogPromise;
  }

  let groundReactionsPromise = null;

  async function loadGroundReactions() {
    if (groundReactionsPromise) return groundReactionsPromise;
    groundReactionsPromise = fetch('/data/rules/ground-reactions.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/rules/ground-reactions.json');
      return res.json();
    });
    return groundReactionsPromise;
  }

  let workflowCoveragePromise = null;

  async function loadWorkflowCoverage() {
    if (workflowCoveragePromise) return workflowCoveragePromise;
    workflowCoveragePromise = fetch('/data/rules/workflow-coverage.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/rules/workflow-coverage.json');
      return res.json();
    });
    return workflowCoveragePromise;
  }

  let wizardVisualRefsPromise = null;

  async function loadWizardVisualRefs() {
    if (wizardVisualRefsPromise) return wizardVisualRefsPromise;
    wizardVisualRefsPromise = fetch('/data/rules/wizard-visual-refs.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/rules/wizard-visual-refs.json');
      return res.json();
    });
    return wizardVisualRefsPromise;
  }

  let airMissionsPromise = null;

  async function loadAirMissions() {
    if (airMissionsPromise) return airMissionsPromise;
    airMissionsPromise = fetch('/data/missions/air-missions.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/missions/air-missions.json');
      return res.json();
    });
    return airMissionsPromise;
  }

  let factorMap = null;

  async function loadFactorMap() {
    if (factorMap) return factorMap;
    const res = await fetch('/data/counters/factor-map.json');
    if (!res.ok) throw new Error('No se pudo cargar data/counters/factor-map.json');
    factorMap = await res.json();
    return factorMap;
  }

  // ---------- Ayuda de planes de ataque y munición: acceso compartido (roadmap Fase 3) ----------
  // Lo que consumen A LA VEZ "Ayuda rápida > Planes de ataque y munición"
  // (views/help.js) y la selección de unidad/plan real del wizard
  // (correcciones.md COR-007, views/antiship-guided-wizard.js) vive aquí, en
  // vez de duplicar la carga de datos entre ambas vistas.

  const AMMO_COUNTRIES = [
    { id: 'us', label: 'Estados Unidos' },
    { id: 'ch', label: 'China' },
    { id: 'jp', label: 'Japón' },
    { id: 'kr', label: 'Corea del Sur' },
    { id: 'kp', label: 'Corea del Norte' },
    { id: 'ru', label: 'Rusia' }
  ];

  const AMMO_CATEGORIES = [
    { id: 'aviones', title: 'Aviones tácticos', dir: 'attack-plans', groups: [{ key: 'units', label: null }] },
    { id: 'naval', title: 'Buques y submarinos', dir: 'naval-plans', groups: [{ key: 'surfaceShips', label: 'Buques de superficie' }, { key: 'submarines', label: 'Plataformas submarinas' }] },
    { id: 'especiales', title: 'Unidades especiales / helicópteros / artillería', dir: 'special-unit-plans', groups: [{ key: 'units', label: null }] }
  ];

  const ammoCache = new Map();

  async function loadAmmoFile(dir, country) {
    const key = `${dir}/${country}.json`;
    if (ammoCache.has(key)) return ammoCache.get(key);
    const res = await fetch(`/data/ammunition/${key}`);
    if (!res.ok) throw new Error(`No se pudo cargar data/ammunition/${key}`);
    const data = await res.json();
    ammoCache.set(key, data);
    return data;
  }

  function collectCategoryUnits(data, categoryDef) {
    const result = [];
    categoryDef.groups.forEach((g) => {
      (data[g.key] || []).forEach((unit) => result.push({ unit, groupLabel: g.label }));
    });
    return result;
  }

  // ---------- Selección de unidad/plan real en el wizard (correcciones.md COR-007) ----------
  //
  // Reutiliza exactamente la misma infraestructura que "Ayuda rápida >
  // Planes de ataque y munición" (AMMO_CATEGORIES/loadAmmoFile/
  // collectCategoryUnits) en vez de duplicar la carga de datos: para un
  // país, recorre sus 3 categorías (aviones/naval/especiales) y anota, para
  // cada unidad, sus opciones de plan ANTIBUQUE guiado ya derivadas
  // (`CombatWizardEngine.buildAntishipPlanOptions`). Una unidad sin ningún
  // plan guiado válido para este wizard (p.ej. una formación terrestre, o un
  // avión cuyos únicos planes son munición no guiada) no aparece en la
  // lista — no tendría sentido ofrecerla para quedarse sin opciones después.
  const countryUnitsCache = new Map();

  async function loadCountryUnitsWithAntishipPlans(countryId) {
    if (countryUnitsCache.has(countryId)) return countryUnitsCache.get(countryId);
    // correcciones.02.md COR02-006: el icono->método y el daño por impacto
    // ya no están incrustados en CombatWizardEngine — se leen de las
    // opciones de la pregunta `method` del propio workflow.
    const antishipWorkflow = await loadWorkflow('07_ataque_antibuque_guiado.json');
    const methodOptions = antishipWorkflow.stages.find((st) => st.id === 'attack_method').questions.find((q) => q.id === 'method').options;
    const results = [];
    for (const cat of AMMO_CATEGORIES) {
      let data;
      try {
        data = await loadAmmoFile(cat.dir, countryId);
      } catch (_err) {
        continue;
      }
      collectCategoryUnits(data, cat).forEach(({ unit, groupLabel }) => {
        const allOptions = CombatWizardEngine.buildAntishipPlanOptions(unit, methodOptions);
        // COR02-005 (correcciones.02.md): los planes Balístico/Espacio
        // Cercano (`resoluble: false`) se separan de las opciones
        // seleccionables — su daño final depende de un dato (marca de
        // Escudo del buque objetivo) que no está transcrito todavía. La
        // unidad sigue apareciendo si tiene AL MENOS un plan guiado válido
        // de cualquier tipo, para no ocultarla en silencio; `partialOptions`
        // deja ver qué se excluyó y por qué, antes de elegir un plan.
        const options = allOptions.filter((o) => o.resoluble);
        const partialOptions = allOptions.filter((o) => !o.resoluble);
        if (allOptions.length) results.push({ unit, categoryTitle: cat.title, groupLabel, options, partialOptions });
      });
    }
    results.sort((a, b) => a.unit.name.localeCompare(b.unit.name));
    countryUnitsCache.set(countryId, results);
    return results;
  }

  // Los envoltorios de persistencia de core.js necesitan la plantilla ya
  // cargada de forma síncrona, sin volver a pedirla.
  function getCachedTurnTemplate() { return turnTemplate; }

  // Reglas de los Efectos de Impacto antibuque (Decision Book §5.9), consumidas
  // por views/ship-impact-effects-wizard.js junto a ShipImpactEffectsEngine.
  let shipImpactEffectsPromise = null;

  async function loadShipImpactEffects() {
    if (shipImpactEffectsPromise) return shipImpactEffectsPromise;
    shipImpactEffectsPromise = fetch('/data/rules/ship-impact-effects.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/rules/ship-impact-effects.json');
      return res.json();
    });
    return shipImpactEffectsPromise;
  }

  // Reglas del Reabastecimiento de Campo del Ejército (Decision Book §8.11.3),
  // consumidas por views/army-resupply-wizard.js junto a ArmyResupplyEngine.
  let armyResupplyPromise = null;

  async function loadArmyResupply() {
    if (armyResupplyPromise) return armyResupplyPromise;
    armyResupplyPromise = fetch('/data/rules/army-resupply.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/rules/army-resupply.json');
      return res.json();
    });
    return armyResupplyPromise;
  }

  // Reglas de la Garantía Logística (Decision Book §11.2-§11.5), consumidas por
  // views/logistics-guarantee-wizard.js junto a LogisticsGuaranteeEngine.
  let logisticsGuaranteePromise = null;

  async function loadLogisticsGuarantee() {
    if (logisticsGuaranteePromise) return logisticsGuaranteePromise;
    logisticsGuaranteePromise = fetch('/data/rules/logistics-guarantee.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/rules/logistics-guarantee.json');
      return res.json();
    });
    return logisticsGuaranteePromise;
  }

  // Reglas de la Emboscada de submarino (Decision Book §9.16), consumidas por
  // views/submarine-ambush-wizard.js junto a SubmarineAmbushEngine.
  let submarineAmbushPromise = null;

  async function loadSubmarineAmbush() {
    if (submarineAmbushPromise) return submarineAmbushPromise;
    submarineAmbushPromise = fetch('/data/rules/submarine-ambush.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/rules/submarine-ambush.json');
      return res.json();
    });
    return submarineAmbushPromise;
  }

  // Reglas de logística de puerto y munición (Decision Book §9.9.4, §9.9.5, §11.6), consumidas por
  // views/port-logistics-wizard.js junto a PortLogisticsEngine.
  let portLogisticsPromise = null;

  async function loadPortLogistics() {
    if (portLogisticsPromise) return portLogisticsPromise;
    portLogisticsPromise = fetch('/data/rules/port-logistics.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/rules/port-logistics.json');
      return res.json();
    });
    return portLogisticsPromise;
  }

  // Reglas del ataque cibernético (Decision Book §14.2-§14.4, opcional), consumidas por
  // views/cyber-attack-wizard.js junto a CyberAttackEngine.
  let cyberAttackPromise = null;

  async function loadCyberAttack() {
    if (cyberAttackPromise) return cyberAttackPromise;
    cyberAttackPromise = fetch('/data/rules/cyber-attack.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/rules/cyber-attack.json');
      return res.json();
    });
    return cyberAttackPromise;
  }

  // Reglas de la guerra espacial (Decision Book §14.5-§14.9, opcional), consumidas por
  // views/space-war-wizard.js junto a StrategicActionsEngine.
  let spaceWarPromise = null;

  async function loadSpaceWar() {
    if (spaceWarPromise) return spaceWarPromise;
    spaceWarPromise = fetch('/data/rules/space-war.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/rules/space-war.json');
      return res.json();
    });
    return spaceWarPromise;
  }

  // Reglas de la Resolución del Resultado del Ataque Terrestre (Decision Book
  // §5.15), consumidas por views/ground-attack-result-wizard.js junto a
  // GroundAttackResultEngine.
  let groundAttackResultsPromise = null;

  async function loadGroundAttackResults() {
    if (groundAttackResultsPromise) return groundAttackResultsPromise;
    groundAttackResultsPromise = fetch('/data/rules/ground-attack-results.json').then((res) => {
      if (!res.ok) throw new Error('No se pudo cargar data/rules/ground-attack-results.json');
      return res.json();
    });
    return groundAttackResultsPromise;
  }

  root.AppData = {
    loadTurnTemplate,
    getCachedTurnTemplate,
    loadTablesIndex,
    loadTablePage,
    loadWorkflow,
    loadWorkflowsIndex,
    loadTableRouting,
    findTablesForLeaf,
    loadTableById,
    loadAmmoSourcePages,
    loadUnitRegistry,
    loadPhaseSourceImages,
    loadAmmoUnitRegions,
    loadTurnSequenceHelp,
    loadDiceFormulas,
    loadDetectionHelp,
    loadRulesExcerpts,
    loadRuleProfileDoc,
    loadAirMissions,
    loadWizardVisualRefs,
    loadWorkflowCoverage,
    loadGroundReactions,
    loadImageHotspots,
    loadBoardHotspots,
    loadVisualHelpCatalog,
    loadAmmoPlanHotspots,
    loadShipImpactEffects,
    loadArmyResupply,
    loadLogisticsGuarantee,
    loadSubmarineAmbush,
    loadPortLogistics,
    loadCyberAttack,
    loadSpaceWar,
    loadGroundAttackResults,
    loadFactorMap,
    AMMO_COUNTRIES,
    AMMO_CATEGORIES,
    loadAmmoFile,
    collectCategoryUnits,
    countryUnitsCache,
    loadCountryUnitsWithAntishipPlans
  };
})(typeof window !== 'undefined' ? window : globalThis);
