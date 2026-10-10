// Modelo de dominio del wizard de Ataque Guiado contra Superficie (roadmap
// Fase 7; correcciones03.md COR03-006): forma del estado del wizard y cálculos
// puros derivados de ese estado (reducción por Defensa Aérea de Área,
// Interceptación de Munición, V.E.F./multiplicador, asignación de impactos).
// Extraído de views/antiship-guided-wizard.js para separar estado/cálculo del
// renderizado DOM — no toca el DOM ni `AppCore`, así que funciona igual en
// Node (tests) y en el navegador, mismo patrón UMD-lite que el resto de
// motores. Las reglas en sí viven en combat-wizard-engine.js y en los
// workflows/tablas de data/; aquí solo se encadenan.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./combat-wizard-engine.js'), require('./table-engine.js'));
  } else {
    root.AntishipGuidedModel = factory(root.CombatWizardEngine, root.TableEngine);
  }
})(typeof self !== 'undefined' ? self : this, function (CombatWizardEngine, TableEngine) {
  'use strict';

  // Etiqueta de un método de ataque guiado (workflow 07#attack_method),
  // leída de `methodOptions[].label` — correcciones03.md COR03-002: antes
  // una constante `METHOD_LABELS` incrustada aquí, duplicando el `label` que
  // el propio workflow ya declara por opción.
  function methodLabel(methodOptions, method) {
    const opt = methodOptions.find((o) => o.value === method);
    return (opt && opt.label) || method;
  }

  const ANTISHIP_WIZARD_STEPS = [
    'Disparo en Área (reacción contra el avión atacante)',
    'Datos base del ataque',
    'Defensa aérea de área e interceptación de munición',
    'Resistencia electrónica de la flota (V.E.F.)',
    'Método de ataque y tirada',
    'Resultado'
  ];

  function freshAntishipWizardState() {
    return {
      step: 0,
      attackerLabel: '',
      // Misión aérea del ataque (AJ-002): { missionId, areaMission, source }.
      missionContext: { missionId: '', areaMission: '', source: 'manual' },
      targetLabel: '',
      attackerProtection: '',
      areaAirDefenseRoll: '',
      baseAttackValue: '',
      // Selección de unidad/plan real (correcciones.md COR-007). `mode`:
      // 'manual' (por defecto, comportamiento histórico: los campos de
      // arriba se rellenan a mano) o 'validated' (país/unidad/plan
      // seleccionados de data/ammunition/, con los valores derivados —
      // AGENTS.md §9.2/§14: no se inventa nada, solo se deja de preguntar lo
      // que ya se puede leer de un dato ya transcrito).
      unitSelection: {
        mode: 'manual',
        country: '',
        unitId: '',
        planLetter: '',
        loadType: '',
        damaged: false,
        attackDistanceHexes: ''
      },
      areaAirDefenseAttackRoll: '',
      areaAirDefenseAttackRoll2: '',
      areaAirDefenseGroupedAaValue: '',
      interceptionShips: [{ aa: '', roll: '', consumption: 'high' }],
      stageAnswers: {
        area_defense: {},
        area_air_defense: {},
        munition_interception: {},
        fleet_electronic_resistance: {},
        attack_method: {}
      },
      vefRoll: '',
      rollInputs: [''],
      impactAssignment: {
        fleetShips: [{ id: '', protection: '', sinkingThreshold: '' }],
        rounds: [],
        pendingTargetRoll: '',
        pendingSinkingRoll: ''
      }
    };
  }

  function getWizardStage(workflow, id) {
    return workflow.stages.find((st) => st.id === id);
  }

  // Resuelve cada disparo de interceptación ya introducido (con A.A. y tirada
  // válidos) y suma sus reducciones. Ver public/js/combat-wizard-engine.js
  // #resolveInterceptionShot: la fila de la tabla es la tirada modificada por
  // rendimiento/detección, la columna es el A.A. propio de quien dispara.
  function computeInterceptionResult(workflow, state, interceptionTable) {
    const stage2 = getWizardStage(workflow, 'munition_interception');
    const modResult = CombatWizardEngine.sumModifiers(stage2.questions, state.stageAnswers.munition_interception, 'munition_interception_roll');
    const earlyWarning = state.stageAnswers.munition_interception.early_warning_effect === 'yes';
    const shots = state.interceptionShips
      .filter((sh) => sh.aa !== '' && sh.roll !== '' && !Number.isNaN(Number(sh.aa)) && !Number.isNaN(Number(sh.roll)))
      .map((sh) => {
        try {
          return { input: sh, shot: CombatWizardEngine.resolveInterceptionShot(interceptionTable, TableEngine, { roll: Number(sh.roll), modifierTotal: modResult.total, defenderAaValue: Number(sh.aa), earlyWarning, consumption: sh.consumption }) };
        } catch (err) {
          return { input: sh, error: err };
        }
      });
    const validShots = shots.filter((s) => s.shot).map((s) => s.shot);
    const reduction = CombatWizardEngine.sumInterceptionReductions(validShots);
    return { modResult, shots, reduction };
  }

  // Resuelve la reducción de la etapa "area_air_defense" (page-03.json): solo
  // aplica cuando la munición está marcada CM/BM (pregunta
  // munition_marked_cm_or_bm, añadida el 2026-09-27 al resolver esta
  // ambigüedad — ver docs/rules/known-ambiguities.md). Si no aplica, la
  // reducción es 0 sin pedir ningún dato más.
  function computeStage1Reduction(workflow, state, areaAirDefenseAttackTable) {
    const answers = state.stageAnswers.area_air_defense;
    if (answers.munition_marked_cm_or_bm !== 'yes') return { applies: false, value: 0 };
    if (state.areaAirDefenseAttackRoll === '' || Number.isNaN(Number(state.areaAirDefenseAttackRoll))) return { applies: true, value: null };
    const isNearSpace = answers.near_space_trajectory === 'yes';
    let roll2;
    if (isNearSpace) {
      if (state.areaAirDefenseAttackRoll2 === '' || Number.isNaN(Number(state.areaAirDefenseAttackRoll2))) return { applies: true, value: null };
      roll2 = Number(state.areaAirDefenseAttackRoll2);
    }
    if (state.areaAirDefenseGroupedAaValue === '' || Number.isNaN(Number(state.areaAirDefenseGroupedAaValue))) return { applies: true, value: null };
    const stage1 = getWizardStage(workflow, 'area_air_defense');
    const modResult = CombatWizardEngine.sumModifiers(stage1.questions, answers, 'area_air_defense_roll');
    try {
      const resolved = CombatWizardEngine.resolveAreaAirDefenseAttackReduction(areaAirDefenseAttackTable, TableEngine, {
        roll: Number(state.areaAirDefenseAttackRoll),
        roll2,
        modifierTotal: modResult.total,
        groupedAaValue: Number(state.areaAirDefenseGroupedAaValue)
      });
      const value = Number(resolved.result.rawCell);
      return { applies: true, value: Number.isNaN(value) ? 0 : value, resolved, modResult };
    } catch (err) {
      return { applies: true, value: null, error: err, modResult };
    }
  }

  function computeAttackValueAfterDefenses(workflow, state, interceptionTable, areaAirDefenseAttackTable) {
    const { reduction } = computeInterceptionResult(workflow, state, interceptionTable);
    const stage1Info = computeStage1Reduction(workflow, state, areaAirDefenseAttackTable);
    const stage1Reduction = stage1Info.value || 0;
    const baseAttackValue = Number(state.baseAttackValue);
    return { total: baseAttackValue + stage1Reduction + reduction, stage1Reduction, interceptionReduction: reduction, stage1Info };
  }

  // Resuelve la etapa "Resistencia Electrónica de la Flota" con la mecánica
  // corregida: la tabla Mod. V.E.F. da un modificador a la TIRADA de esta
  // etapa (siempre 1d10, según el golden test), no al V.E.F. La tirada ya
  // modificada se cruza con la tabla de multiplicador. Devuelve null cuando
  // todavía faltan datos para poder resolver (no lanza, no inventa un 0).
  function computeVefAndMultiplier(workflow, state, vefTable, multTable) {
    const stage3 = getWizardStage(workflow, 'fleet_electronic_resistance');
    const answers = state.stageAnswers.fleet_electronic_resistance;
    const modResult = CombatWizardEngine.sumModifiers(stage3.questions, answers, 'vef_modifier');
    const highest = Number(answers.highest_fleet_electronic);
    if (answers.highest_fleet_electronic === undefined || answers.highest_fleet_electronic === '' || Number.isNaN(highest)) {
      return { modResult, highest: null, rawVef: null, vefRollResult: null, modifiedRoll: null, multiplierResult: null };
    }
    const rawVef = highest + modResult.total;
    const vefRollResult = CombatWizardEngine.resolveVefRollModifier(vefTable, TableEngine, rawVef);
    if (state.vefRoll === '' || Number.isNaN(Number(state.vefRoll))) {
      return { modResult, highest, rawVef, vefRollResult, modifiedRoll: null, multiplierResult: null };
    }
    const modifiedRoll = Number(state.vefRoll) + vefRollResult.rollModifier;
    let multiplierResult = null;
    let multiplierError = null;
    try {
      multiplierResult = CombatWizardEngine.resolveAttackMultiplier(multTable, TableEngine, modifiedRoll);
    } catch (err) {
      multiplierError = err;
    }
    return { modResult, highest, rawVef, vefRollResult, modifiedRoll, multiplierResult, multiplierError };
  }

  // Resuelve el estado de la asignación de impactos (pasos 5-6 de la hoja de
  // ayuda): qué buques siguen vivos, cuántos impactos quedan sin asignar, y si
  // la resolución ya ha terminado (sin más impactos útiles, sin supervivientes,
  // o porque la última tirada cayó sobre una unidad cuya Protección superaba
  // los impactos disponibles — caso no descrito en la fuente para reintentar
  // con otro objetivo, así que aquí se trata como fin de la resolución en vez
  // de inventar una regla de reintento).
  function computeImpactAssignmentSummary(state, totalImpacts, damagePerImpact) {
    const perImpact = damagePerImpact || 1;
    const rounds = state.impactAssignment.rounds;
    const sunkIds = new Set(rounds.filter((r) => r.sank).map((r) => r.targetId));
    // Un buque dañado por una ronda anterior (o marcado como ya dañado) que
    // recibe otro punto de daño queda eliminado directamente (§5.9).
    const damagedIds = new Set(rounds.filter((r) => r.damaged && !r.sank).map((r) => r.targetId));
    const validShips = state.impactAssignment.fleetShips
      .filter((sh) => sh.id !== '' && sh.protection !== '' && !Number.isNaN(Number(sh.protection)))
      .map((sh) => ({ id: sh.id, protection: Number(sh.protection), sinkingThreshold: sh.sinkingThreshold, damaged: sh.damaged === 'Sí' || damagedIds.has(sh.id) }));
    const survivors = validShips.filter((sh) => !sunkIds.has(sh.id));
    const impactsUsed = rounds.reduce((sum, r) => sum + r.absorbed, 0);
    const impactsRemaining = totalImpacts - impactsUsed;
    const lastRound = rounds[rounds.length - 1];
    const haltedByMissedTarget = !!lastRound && lastRound.damaged === false;
    const minSurvivorProtection = survivors.length ? Math.min(...survivors.map((sh) => sh.protection)) : null;
    const minSurvivorImpactsNeeded = minSurvivorProtection !== null ? Math.ceil(minSurvivorProtection / perImpact) : null;
    const complete = impactsRemaining <= 0
      || survivors.length === 0
      || haltedByMissedTarget
      || (minSurvivorImpactsNeeded !== null && impactsRemaining < minSurvivorImpactsNeeded);
    return { survivors, impactsRemaining, complete, haltedByMissedTarget, minSurvivorProtection };
  }

  return {
    WIZARD_STEPS: ANTISHIP_WIZARD_STEPS,
    methodLabel,
    freshAntishipWizardState,
    getWizardStage,
    computeInterceptionResult,
    computeStage1Reduction,
    computeAttackValueAfterDefenses,
    computeVefAndMultiplier,
    computeImpactAssignmentSummary
  };
});
