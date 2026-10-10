// Modelo canónico del turno (ajustes_de_turno.md TUR-001): funciones puras sobre
// data/phases/turn-template.json (schemaVersion 4). Una banda de dos días tiene la
// Fase 0 (Estrategia, una vez) y seis fases de campaña (tres por día); cada fase
// recorre sus segmentos (Aire I, Superficie, Aire II, Tierra cuando corresponde,
// Submarino). Todo lo que el turno guiado, la consulta rápida y el buscador necesitan
// sale de aquí: no existe una segunda copia de la secuencia.
//
// Identidad de instancia (TUR-014): cada nodo del turno tiene un ID estable dentro de
// una banda; el progreso guarda ese ID, nunca el ID de la definición de contenido:
//   phase-0                      Fase 0 (Estrategia)
//   phase-0/<fase>               paso de la Fase 0 (crisis, logistica...)
//   day-odd | day-even           día de la banda
//   phase-N                      fase de campaña N (1-6)
//   phase-N/<segmento>           segmento (air-1, surface, air-2, ground, submarine)
//   phase-N/<segmento>/<sub>     subfase de ese segmento concreto
// Aire I y Aire II comparten definición de contenido (acciones_aereas) pero no estado.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TurnModel = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STRATEGIC_ID = 'phase-0';

  function nodeId(...parts) { return parts.filter(Boolean).join('/'); }

  // Recuperación de Mando se realiza antes del inicio de cada día.
  function commandRecoveryNodeId(dayId) { return nodeId(dayId, 'command-recovery'); }

  function listImpulses(template) {
    return Object.values(template.impulses).sort((a, b) => a.number - b.number);
  }

  function getImpulse(template, impulseId) {
    return template.impulses[impulseId] || null;
  }

  function getImpulseByNumber(template, number) {
    return listImpulses(template).find((i) => i.number === Number(number)) || null;
  }

  function listDays(template) {
    return template.band.days;
  }

  function listStrategicPhases(template) {
    return template.band.strategic.phases.map((id) => template.phases[id]);
  }

  // Segmentos de una fase de campaña con su definición de contenido resuelta.
  function listSegments(template, impulseId) {
    const impulse = getImpulse(template, impulseId);
    if (!impulse) return [];
    return impulse.segments.map((seg) => {
      const kind = template.segmentKinds[seg.id];
      const phase = kind && kind.phaseRef ? template.phases[kind.phaseRef] : null;
      const consultable = kind && kind.consultable ? template.band.consultables[kind.consultable] : null;
      // Algunos segmentos añaden pasos propios a los de su fase (p. ej. «Parálisis» al final de Aire I): se resuelven
      // en una copia de la fase para que todo consumidor vea la misma lista de subfases y acciones.
      const resolved = phase && kind && (kind.extraSubphases || kind.extraActions)
        ? { ...phase, subphases: [...(phase.subphases || []), ...(kind.extraSubphases || [])], actions: [...(phase.actions || []), ...(kind.extraActions || [])] }
        : phase;
      return { ...seg, kind, phaseRef: kind ? kind.phaseRef || null : null, phase: resolved, consultable, nodeId: nodeId(impulseId, seg.id) };
    });
  }

  function getSegment(template, impulseId, segmentId) {
    return listSegments(template, impulseId).find((s) => s.id === segmentId) || null;
  }

  function listSubphases(template, phase) {
    return (phase.subphases || []).map((id) => template.subphases[id]).filter(Boolean);
  }

  // Todos los nodos de una banda, en orden: Fase 0 y sus pasos, y por día sus fases con segmentos y subfases.
  function listNodes(template) {
    const nodes = [{ id: STRATEGIC_ID, kind: 'strategic', parent: null }];
    template.band.strategic.phases.forEach((p) => nodes.push({ id: nodeId(STRATEGIC_ID, p), kind: 'strategic-phase', parent: STRATEGIC_ID }));
    listDays(template).forEach((day) => {
      nodes.push({ id: day.id, kind: 'day', parent: null });
      nodes.push({ id: commandRecoveryNodeId(day.id), kind: 'consultable', parent: day.id });
      day.impulses.forEach((impulseId) => {
        nodes.push({ id: impulseId, kind: 'impulse', parent: day.id });
        listSegments(template, impulseId).forEach((seg) => {
          nodes.push({ id: seg.nodeId, kind: 'segment', parent: impulseId });
          listSubphases(template, seg.phase || {}).forEach((sub) => nodes.push({ id: nodeId(seg.nodeId, sub.id), kind: 'subphase', parent: seg.nodeId }));
        });
      });
    });
    return nodes;
  }

  function isDescendantOrSelf(candidate, ancestor) {
    return !!candidate && (candidate === ancestor || candidate.startsWith(`${ancestor}/`));
  }

  // Nodos de primer nivel que el usuario puede marcar como terminados y con los que se orienta la secuencia.
  function listTopLevelNodeIds(template) {
    return [STRATEGIC_ID, ...listImpulses(template).map((i) => i.id)];
  }

  // Workflows de combate y atajos de wizard aplicables a una fase de contenido: la unión de los de sus subfases y los
  // propios de la fase. Una página de segmento nunca invoca la ayuda con una lista vacía si algún combate le corresponde.
  function phaseWorkflows(template, phase) {
    const workflowIds = [];
    const wizardLinks = [];
    const seenWizard = new Set();
    const addLinks = (list) => (list || []).forEach((l) => { if (!seenWizard.has(l.wizard)) { seenWizard.add(l.wizard); wizardLinks.push(l); } });
    (phase.subphases || []).map((id) => template.subphases[id]).filter(Boolean).forEach((sub) => {
      (sub.relatedWorkflowIds || []).forEach((id) => { if (!workflowIds.includes(id)) workflowIds.push(id); });
      addLinks(sub.wizardLinks);
    });
    addLinks(phase.wizardLinks);
    return { workflowIds, wizardLinks };
  }

  // Texto de origen de una resolución («Banda 1 · Día 1 (impar) · 1.ª fase, mañana · Aire I · Salidas de combate») a
  // partir del contexto de turno con el que se abrió el wizard: banda, día, fase, segmento y subfase.
  function describeOrigin(template, ctx) {
    if (!ctx) return '';
    const parts = [`Banda ${ctx.band}`];
    if (ctx.impulseId && template.impulses[ctx.impulseId]) {
      const impulse = template.impulses[ctx.impulseId];
      const dayIdx = template.band.days.findIndex((d) => d.id === impulse.dayId);
      const day = template.band.days[dayIdx];
      parts.push(`Día ${(ctx.band - 1) * template.band.durationDays + dayIdx + 1} (${day.title.toLowerCase().replace('día ', '')})`);
      parts.push(`${impulse.number}.ª fase, ${impulse.periodLabel.toLowerCase()}`);
      const seg = impulse.segments.find((x) => x.id === ctx.segmentId);
      if (seg) parts.push(seg.title);
    } else {
      parts.push(template.band.strategic.title);
      const phase = ctx.phaseId && template.phases[ctx.phaseId];
      if (phase) parts.push(phase.title);
    }
    const sub = ctx.subphaseId && template.subphases[ctx.subphaseId];
    if (sub) parts.push(sub.title);
    return parts.join(' · ');
  }

  // Niveles de Reacción de las unidades terrestres que pueden activarse en una fase (null si no hay segmento terrestre).
  function groundReactionLevels(template, impulseId) {
    const impulse = getImpulse(template, impulseId);
    return impulse && impulse.groundReactionLevels ? impulse.groundReactionLevels : null;
  }

  // Vista de «Secuencia de turno y fases» (consulta rápida y buscador) generada a partir del modelo
  // canónico: nunca se mantiene a mano una segunda copia.
  function buildSequenceHelp(template) {
    const sheet = template.sheet;
    const impulses = listImpulses(template);
    const cycleLabels = { 1: 'Primer ciclo de Recuperación de Mando', 2: 'Segundo ciclo de Recuperación de Mando' };
    const cycles = [1, 2].map((n) => ({ label: cycleLabels[n], phaseIds: impulses.filter((i) => i.commandRecoveryCycle === n).map((i) => i.id) }));
    return {
      id: 'turn-sequence-help',
      title: sheet.title,
      sourceRefs: sheet.sourceRefs,
      note: sheet.note,
      dayBands: sheet.dayBands,
      strategicPhase: {
        title: template.band.strategic.title,
        steps: template.band.strategic.sheetSteps,
        note: template.band.strategic.sheetNote,
        spaceDebrisTracker: template.band.strategic.spaceDebrisTracker
      },
      commandRecoveryCycles: cycles,
      commandRecoveryNote: sheet.commandRecoveryNote,
      phases: impulses.map((i) => ({
        id: i.id,
        order: i.number,
        title: i.title,
        hours: i.hours,
        timeOfDay: i.timeOfDay,
        dayId: i.dayId,
        periodLabel: i.periodLabel,
        segments: i.segments.map((s, idx) => ({
          id: s.id,
          order: idx + 1,
          title: s.title,
          ...(s.sheetSteps ? { steps: s.sheetSteps } : { stepsNotPrinted: true }),
          ...(s.id === 'ground' && i.groundReactionLevels ? { groundActivationMarkers: i.groundReactionLevels } : {})
        })),
        ...(i.sheetNote ? { note: i.sheetNote } : {})
      })),
      groundActivationMarkersNote: sheet.groundActivationMarkersNote,
      phaseOrderCrossCheck: sheet.phaseOrderCrossCheck
    };
  }

  return {
    STRATEGIC_ID,
    nodeId,
    commandRecoveryNodeId,
    listImpulses,
    getImpulse,
    getImpulseByNumber,
    listDays,
    listStrategicPhases,
    listSegments,
    getSegment,
    listSubphases,
    listNodes,
    listTopLevelNodeIds,
    isDescendantOrSelf,
    groundReactionLevels,
    phaseWorkflows,
    describeOrigin,
    buildSequenceHelp
  };
});
