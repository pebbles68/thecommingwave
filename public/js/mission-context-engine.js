// Contexto de misión aérea de los wizards de ataque (ajuste AJ-002): lógica
// pura sobre data/missions/air-missions.json (Decision Book §7.3-§7.10). Es el
// «paso 0» del wizard de combate según esa ficha: antes de resolver un ataque
// aéreo hay que saber qué misión ejecuta el grupo, su alcance y si genera
// Zona Central. No contiene datos de misiones: todo se lee del JSON.
(function (root) {
  'use strict';

  const NONE = 'none';

  // Misiones elegibles: las que no son un procedimiento ni un estado adicional.
  // Con `surfaceOrGround: true` (wizards de ataque contra buques o terrestres)
  // se excluyen las categorías que los datos marcan como incapaces de atacar
  // esos objetivos (`canAttackSurfaceAndGround: false`, p.ej. las aire-aire).
  // Con `phaseId` se aplican además las restricciones por fase de los datos
  // (`phaseRestrictions`: p.ej. fuera de la Fase de acciones aéreas solo ON CALL).
  function listMissions(data, opts) {
    const categories = (data.definitions || {}).categories || {};
    const surfaceOrGround = !!(opts && opts.surfaceOrGround);
    const restriction = opts && opts.phaseId ? restrictionForPhase(data, opts.phaseId) : null;
    return (data.missions || []).filter((m) => {
      if (m.isProcedure || m.isAdditionalState) return false;
      if (restriction && !restriction.onlyMissionIds.includes(m.id)) return false;
      if (surfaceOrGround && categories[m.category] && categories[m.category].canAttackSurfaceAndGround === false) return false;
      return true;
    });
  }

  function restrictionForPhase(data, phaseId) {
    return (data.phaseRestrictions || []).find((r) => r.phaseIds.includes(phaseId)) || null;
  }

  // Misión que se preselecciona: la única permitida por la restricción de fase.
  function presetMissionForPhase(data, phaseId, opts) {
    if (!phaseId) return '';
    const list = listMissions(data, { ...(opts || {}), phaseId });
    return restrictionForPhase(data, phaseId) && list.length === 1 ? list[0].id : '';
  }

  function isMissionAllowed(data, missionId, opts) {
    return listMissions(data, opts).some((m) => m.id === missionId);
  }

  function findMission(data, missionId) {
    return (data.missions || []).find((m) => m.id === missionId) || null;
  }

  // 'yes'/'no' si la misión fija si es de Área; '' si no se sabe (sin misión,
  // «no procede de una misión aérea» o misión sin tipo declarado).
  function areaMissionAnswer(data, missionId) {
    if (!missionId || missionId === NONE) return '';
    const m = findMission(data, missionId);
    if (!m || !m.missionType) return '';
    return m.missionType === 'area' ? 'yes' : 'no';
  }

  // Estado de contexto a guardar en el wizard.
  function buildContext(data, missionId, source) {
    return { missionId: missionId || '', areaMission: areaMissionAnswer(data, missionId), source: source || 'manual' };
  }

  // Modelo de la tarjeta de misión, íntegramente derivado del JSON.
  function buildCard(data, missionId) {
    const m = findMission(data, missionId);
    if (!m) return null;
    const defs = data.definitions || {};
    const missionType = m.missionType ? (defs.missionTypes || {})[m.missionType] : null;
    const duration = m.durationType ? (defs.durationTypes || {})[m.durationType] : null;
    const category = (defs.categories || {})[m.category];
    const ranges = [];
    if (m.rangeMultiplier) ranges.push(`x${m.rangeMultiplier} el Alcance (ALC)`);
    (m.variants || []).forEach((v) => {
      if (v.rangeMultiplier) ranges.push(`${v.name}: x${v.rangeMultiplier} el Alcance (ALC)`);
    });
    return {
      id: m.id,
      title: `${m.name}${m.abbreviation ? ` (${m.abbreviation})` : ''}`,
      category: category ? category.label : m.category,
      duration: duration ? duration.label : (m.variants && m.variants.length ? 'Según variante' : null),
      missionType: missionType ? missionType.label : null,
      centralZone: m.missionType === 'area' ? 'Sí: tras llegar, el grupo obtiene una Zona Central (los 6 hexágonos adyacentes al objetivo).' : (m.missionType === 'point' ? 'No: la unidad se considera solo en el hexágono de su marcador.' : null),
      ranges,
      shortRangeNote: m.missionType === 'area'
        ? 'Misión de Área: en las restricciones de corto alcance la distancia 2 cuenta como 1.'
        : (m.missionType === 'point' ? 'Misión de Punto: solo la distancia 1 activa las restricciones de corto alcance.' : null),
      requirements: m.requirements || [],
      commandCost: typeof m.commandCost === 'number' ? m.commandCost : null,
      description: m.description || '',
      sourceRefs: (m.sourceRefs || []).map((r) => `Decision Book §${r.section}, p. ${r.page}`)
    };
  }

  // Invalida solo lo que depende de la misión (la respuesta Área/Punto de la
  // restricción de corto alcance) cuando cambia la misión.
  function invalidatedAnswerKeys() {
    return ['short_range_restriction_area_mission'];
  }

  const api = { NONE, listMissions, isMissionAllowed, restrictionForPhase, presetMissionForPhase, findMission, areaMissionAnswer, buildContext, buildCard, invalidatedAnswerKeys };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MissionContextEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
