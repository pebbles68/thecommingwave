// Lógica pura de las guías de pasos del combate (Fase 24, TC-006). Resuelve las referencias de cada paso
// (misiones de data/missions/air-missions.json) y valida la coherencia del archivo data/guides/combat-steps.json.
// Sin DOM y sin reglas incrustadas: todos los textos y pasos salen de los datos.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CombatGuideEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getGuide(data, guideId) {
    return (data.guides || []).find((g) => g.id === guideId) || null;
  }

  // Pasos ordenados con sus misiones resueltas (nombre y descripción de la ficha de misiones).
  function buildSteps(guide, missionsData) {
    const missions = new Map(((missionsData && missionsData.missions) || []).map((m) => [m.id, m]));
    return [...guide.steps].sort((a, b) => a.order - b.order).map((step) => ({
      ...step,
      missions: (step.missionRefs || []).map((id) => missions.get(id)).filter(Boolean).map((m) => ({ id: m.id, name: m.name, abbreviation: m.abbreviation, description: m.description }))
    }));
  }

  // `routes` es la lista de rutas válidas (prefijos de hash) y `missionsData` la ficha de misiones.
  function validateGuides(data, missionsData, isKnownHash) {
    const errors = [];
    const ids = new Set();
    const missionIds = new Set(((missionsData && missionsData.missions) || []).map((m) => m.id));
    (data.guides || []).forEach((guide) => {
      if (ids.has(guide.id)) errors.push(`guía duplicada: ${guide.id}`);
      ids.add(guide.id);
      if (!guide.intro) errors.push(`guía sin introducción: ${guide.id}`);
      const stepIds = new Set();
      const orders = new Set();
      guide.steps.forEach((step) => {
        if (stepIds.has(step.id)) errors.push(`paso duplicado: ${guide.id}/${step.id}`);
        stepIds.add(step.id);
        if (orders.has(step.order)) errors.push(`orden repetido: ${guide.id}/${step.id}`);
        orders.add(step.order);
        if (!step.question || !step.explanation) errors.push(`paso sin pregunta o explicación: ${guide.id}/${step.id}`);
        if (!step.sourceRefs || !step.sourceRefs.length) errors.push(`paso sin fuente: ${guide.id}/${step.id}`);
        if (!['verified', 'needs_review'].includes(step.status)) errors.push(`estado inválido: ${guide.id}/${step.id}`);
        if (step.status === 'needs_review' && !step.pending) errors.push(`paso needs_review sin nota de pendiente: ${guide.id}/${step.id}`);
        (step.missionRefs || []).forEach((m) => { if (!missionIds.has(m)) errors.push(`misión inexistente ${m}: ${guide.id}/${step.id}`); });
        (step.links || []).forEach((l) => { if (!isKnownHash(l.hash)) errors.push(`enlace desconocido ${l.hash}: ${guide.id}/${step.id}`); });
      });
    });
    return errors;
  }

  return { getGuide, buildSteps, validateGuides };
});
