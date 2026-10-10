// Wizard de combate: Ataque Guiado contra Superficie (roadmap Fase 7,
// vertical slice; correcciones.md COR-005 paso 4 / COR-007), extraído de
// public/js/app.js. Depende de public/js/core.js (AppCore) para DOM
// compartido, persistencia y cargadores de datos.
//
// Desde correcciones03.md COR03-006 este archivo es solo el CONTROLADOR del
// wizard: es dueño del estado de la sesión, carga los datos, vincula la
// resolución al turno guiado y elige qué paso pintar. El resto vive en:
//   - public/js/antiship-guided-model.js        (AntishipGuidedModel: forma del
//     estado y cálculos puros, testeable en Node),
//   - views/antiship-guided-steps.js            (pasos de entrada),
//   - views/antiship-guided-result.js           (paso Resultado + impactos).
//
// Alcance (ver public/js/combat-wizard-engine.js): desde 2026-09-27 la
// etapa "Defensa aérea de área" (reducción del Valor de Ataque cuando la
// munición está marcada CM/BM) se calcula automáticamente, resuelta la
// mecánica de la tabla `ground-guided-area-air-defense` contra el Decision
// Book §6.3-§6.3.3 (ver docs/rules/known-ambiguities.md y
// data/tables/page-03.json#resolutionMechanic). "Interceptación de
// Munición" ya se calculaba automáticamente desde el golden test. Las
// etapas de Resistencia Electrónica de la Flota (V.E.F.) y Método de
// Ataque también se resuelven de extremo a extremo, con la tabla final
// resaltada.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, loadWorkflow, loadTablePage, loadDiceFormulas, renderNotFound, loadAirMissions
  } = AppCore;
  const { WIZARD_STEPS, freshAntishipWizardState } = AntishipGuidedModel;
  const Steps = root.Views.AntishipGuidedSteps;
  const Result = root.Views.AntishipGuidedResult;

  let antishipWizardState = null;

  // Usado por views/history.js al "↻ Repetir" una resolución guardada: carga
  // el estado guardado directamente en el paso de Resultado, sin exponer el
  // estado interno del wizard fuera de este módulo.
  function loadStateFromHistory(state) {
    antishipWizardState = JSON.parse(JSON.stringify(state));
    antishipWizardState.step = 5;
  }

  // Ciclo de vida común de la resolución (AJ-007).
  const lifecycle = AppCore.createResolutionLifecycle({ key: 'antiship-guided', type: 'antiship_guided', getState: () => antishipWizardState });
  const linkToTurnContextIfNeeded = (_s, title) => lifecycle.link(title);

  // Cancela/completa la resolución vinculada (si la hay) y limpia la marca
  // del estado — usado al reiniciar el wizard y al guardarlo en historial.
  const unlinkTurnContext = () => lifecycle.unlink();

  async function renderAntishipGuidedWizard() {
    const navToken = Router.currentToken();
    antishipWizardState = AppCore.resolveWizardState('antiship-guided', antishipWizardState, freshAntishipWizardState);
    linkToTurnContextIfNeeded(antishipWizardState, 'Ataque guiado a superficie');
    AppCore.persistWizardDraft('antiship-guided', antishipWizardState, () => antishipWizardState);
    setBreadcrumb(['TCW Assistant', 'Wizard', 'Ataque guiado a superficie']);
    viewRoot.innerHTML = '<p class="loading">Cargando wizard…</p>';

    let workflow;
    let areaAirDefenseWorkflow;
    let page03;
    let page04;
    let page18;
    let page21;
    let page22;
    let diceFormulas;
    let airMissions;
    try {
      [workflow, areaAirDefenseWorkflow, page03, page04, page18, page21, page22, diceFormulas, airMissions] = await Promise.all([
        loadWorkflow('07_ataque_antibuque_guiado.json'),
        loadWorkflow('06_defensa_aerea_area.json'),
        loadTablePage('page-03.json'),
        loadTablePage('page-04.json'),
        loadTablePage('page-18.json'),
        loadTablePage('page-21.json'),
        loadTablePage('page-22.json'),
        loadDiceFormulas(),
        loadAirMissions()
      ]);
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    // correcciones03.md COR03-002: `methodOptions`/`cmBmMarkerIcons` se
    // derivan una sola vez aquí (en vez de en cada paso) — ambos vienen del
    // propio workflow ya cargado, no de constantes incrustadas en la vista.
    const methodOptions = workflow.stages.find((st) => st.id === 'attack_method').questions.find((q) => q.id === 'method').options;
    const cmBmMarkerIcons = workflow.cmBmMarkerIcons;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail wizard-view');
    wrap.appendChild(el('h1', 'help-detail__title', `${workflow.title} — Ataque contra buques de superficie`));
    wrap.appendChild(el('p', 'turn-view__desc', `Paso ${antishipWizardState.step + 1} de ${WIZARD_STEPS.length}: ${WIZARD_STEPS[antishipWizardState.step]}`));

    const rerender = () => { renderAntishipGuidedWizard(); };

    AppCore.mountWizardDraft('antiship-guided', wrap, () => { unlinkTurnContext(antishipWizardState); antishipWizardState = freshAntishipWizardState(); rerender(); });
    // Efectos sobre el estado propio del controlador que el paso Resultado
    // dispara (guardar la resolución / reiniciar el wizard).
    const resultCallbacks = {
      onSaved: () => unlinkTurnContext(antishipWizardState),
      onRestart: () => {
        unlinkTurnContext(antishipWizardState);
        antishipWizardState = freshAntishipWizardState();
      }
    };
    const stepRenderers = [
      () => AppCore.renderWizardStepAreaAirDefense(wrap, areaAirDefenseWorkflow, page18, antishipWizardState, rerender, () => { antishipWizardState.step = 1; rerender(); }),
      () => Steps.renderWizardStepIntro(wrap, antishipWizardState, rerender, methodOptions),
      () => Steps.renderWizardStepDefenses(wrap, antishipWizardState, workflow, page03, page04, rerender, methodOptions, cmBmMarkerIcons),
      () => Steps.renderWizardStepFleet(wrap, antishipWizardState, workflow, page21, rerender),
      () => Steps.renderWizardStepMethod(wrap, antishipWizardState, workflow, page22, rerender, methodOptions, diceFormulas),
      () => Result.renderWizardStepResult(wrap, antishipWizardState, resultCallbacks, workflow, page03, page04, page21, page22, rerender, methodOptions, diceFormulas)
    ];
    if (antishipWizardState.step === 0) {
      AppCore.renderMissionContext(wrap, antishipWizardState, airMissions, rerender, () => {
        MissionContextEngine.invalidatedAnswerKeys().forEach((k) => { delete antishipWizardState.stageAnswers.munition_interception[k]; });
      });
    }
    stepRenderers[antishipWizardState.step]();

    viewRoot.appendChild(wrap);
  }

  root.Views = root.Views || {};
  root.Views.AntishipWizard = { render: renderAntishipGuidedWizard, loadStateFromHistory };
})(typeof window !== 'undefined' ? window : globalThis);
