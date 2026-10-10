// Ataques de Reacción terrestres (roadmap Fase 10; Decision Book §5.16,
// §8.5.6 y §8.7.8). Lógica pura sobre data/rules/ground-reactions.json: qué
// reacción desencadena cada hecho, quién puede ejecutarla, si el plan de
// ataque está bien formado y qué consecuencias tiene. No conoce el mapa: las
// condiciones de posición las declara el jugador.
(function (root) {
  'use strict';

  const YES = 'yes';

  function findReaction(rules, reactionId) {
    const r = rules.reactions.find((x) => x.id === reactionId);
    if (!r) throw new Error(`Reacción desconocida: ${reactionId}`);
    return r;
  }

  // La reacción que desencadena un hecho (null si el hecho no genera ninguna).
  function reactionForTrigger(rules, triggerId) {
    return rules.reactions.find((r) => r.triggerId === triggerId) || null;
  }

  function kindLabel(rules, kindId) {
    const k = rules.attackerKinds.find((x) => x.id === kindId);
    return k ? k.label : kindId;
  }

  // Evalúa si una unidad puede ejecutar la reacción. `attacker`:
  //   { kind, inPosition, usesCas, hasAmmo, alreadyDidCf, alreadyDynamic }
  // con valores 'yes'/'no'/'' (sin contestar). Devuelve
  //   { eligible, pending, reasons[], notes[] }
  // `pending`: faltan respuestas para decidir. `reasons`: por qué NO puede.
  function evaluateAttacker(rules, reactionId, attacker) {
    const reaction = findReaction(rules, reactionId);
    const reasons = [];
    const notes = [];
    let pending = false;
    const a = attacker || {};

    if (!a.kind) return { eligible: false, pending: true, reasons: [], notes: [] };
    if (!reaction.attackerKinds.includes(a.kind)) {
      reasons.push(`${kindLabel(rules, a.kind)} no puede ejecutar ${reaction.name}.`);
      return { eligible: false, pending: false, reasons, notes };
    }

    const need = (value, failText) => {
      if (value === '' || value === undefined) { pending = true; return; }
      if (value !== YES) reasons.push(failText);
    };
    const forbid = (value, failText) => {
      if (value === '' || value === undefined) { pending = true; return; }
      if (value === YES) reasons.push(failText);
    };

    need(a.inPosition, `No cumple la condición de posición: ${reaction.attackerConditions[a.kind]}`);

    if (a.kind === 'artillery_fire') {
      forbid(a.usesCas, 'La artillería que realiza Apoyo de Fuego Cercano (CAS) no puede realizar Contrabatería.');
      need(a.hasAmmo, 'La artillería necesita al menos 1 punto de munición.');
      forbid(a.alreadyDidCf, 'Cada unidad de artillería solo puede realizar una Operación de Contrabatería por enfrentamiento terrestre.');
    }
    // Un solo ataque dinámico por atacante y por salida (aviación) o fase (aviación
    // del ejército); el CAS cuenta como ataque dinámico (§8.4.3, p. 171).
    if (a.kind === 'air_on_call' || a.kind === 'low_altitude_operational') {
      forbid(a.alreadyDynamic, 'Un mismo atacante solo puede realizar un ataque dinámico por salida o fase (el Apoyo Aéreo Cercano también lo es).');
    }
    if (a.kind === 'air_on_call' && (reactionId === 'cf' || reactionId === 'as')) notes.push('El alcance de su plan de ataque terrestre aumenta en +1.');

    return { eligible: reasons.length === 0 && !pending, pending: pending && reasons.length === 0, reasons, notes };
  }

  // Ajustes de ataque que impone la reacción (leídos del JSON).
  function attackSettings(rules, reactionId) {
    const r = findReaction(rules, reactionId);
    return {
      usesPursuitRow: !!r.pursuitRow,
      resultKind: r.resultKind,
      targetGetsTerrainBonus: !!r.terrainBonus,
      targetCanLowAltitudeCounterattack: !!r.targetCanLowAltitudeCounterattack,
      specialRules: r.specialRules || [],
      limits: r.limits || ''
    };
  }

  // Valida el plan completo de reacciones antes de resolver el primero.
  // `plan`: { targetDetected, targets: [{name}], attackers: [{name, ...evaluación, target, order}] }
  // Devuelve { ok, errors[], warnings[] }.
  function validatePlan(rules, reactionId, plan) {
    const errors = [];
    const warnings = [];
    if (plan.targetDetected !== YES) errors.push('El objetivo debe haber sido detectado mientras está Brevemente Detectable.');
    const attackers = (plan.attackers || []).filter((a) => a.evaluation && a.evaluation.eligible);
    if (!attackers.length) errors.push('No hay ninguna unidad de ataque que cumpla las condiciones.');

    const used = new Set();
    attackers.forEach((a) => {
      const label = a.name || 'Unidad sin nombre';
      if (a.target === '' || a.target === undefined) errors.push(`${label}: falta el objetivo.`);
      if (a.order === '' || a.order === undefined) errors.push(`${label}: falta el orden de resolución.`);
      else {
        if (used.has(String(a.order))) errors.push(`Orden de resolución repetido: ${a.order}.`);
        used.add(String(a.order));
      }
    });
    const orders = [...used].map(Number).sort((x, y) => x - y);
    if (orders.length && orders.some((o, i) => o !== i + 1)) warnings.push('El orden de resolución debería ser 1, 2, 3… sin huecos.');
    if (!errors.length) warnings.push('Todo queda decidido antes del primer ataque: aunque un objetivo caiga, el resto de atacantes no puede cambiar de objetivo (§5.16).');
    return { ok: errors.length === 0, errors, warnings };
  }

  // Consecuencias tras completar los ataques de reacción de un tipo, según los
  // tipos de unidad que participaron.
  function aftermath(rules, reactionId, kindIds) {
    const r = findReaction(rules, reactionId);
    const lines = [];
    [...new Set(kindIds)].forEach((k) => { if (r.aftermath[k]) lines.push({ kind: k, text: r.aftermath[k] }); });
    (r.specialRules || []).forEach((t) => lines.push({ kind: 'special', text: t }));
    return lines;
  }

  const api = { reactionForTrigger, evaluateAttacker, attackSettings, validatePlan, aftermath, kindLabel, findReaction };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GroundReactionEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
