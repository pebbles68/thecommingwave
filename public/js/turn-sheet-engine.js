// Lógica pura del Turno Comentado (Fase 24, TC-003): convierte las zonas calibradas de la hoja de
// turnos (data/image-hotspots/turn-sheet.json) y el modelo canónico del turno (turn-template.json)
// en zonas explicadas y en el cuadro de fases de cada apartado. No hay textos de reglas aquí: títulos,
// subfases y rutas salen del modelo; la geometría, de los datos de la hoja. Sin DOM.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./turn-model.js'));
  else root.TurnSheetEngine = factory(root.TurnModel);
})(typeof self !== 'undefined' ? self : this, function (Model) {
  'use strict';

  function impulseOf(template, number) { return Model.getImpulseByNumber(template, number); }

  function dayOf(template, impulse) {
    return template.band.days.find((d) => d.impulses.includes(impulse.id)) || null;
  }

  // Ruta de la página de un segmento / paso de Estrategia / Recuperación de Mando del turno guiado.
  function hashFor(zone) {
    const r = zone.ref;
    if (zone.kind === 'strategy-step') return `#/turno/fase/0/${r.step}`;
    if (zone.kind === 'command-recovery') return `#/turno/mando/${r.day}`;
    // Refuerzos es un nodo consultable (su página es la del Turno guiado); el resto de segmentos tiene página propia.
    if (r.segment === 'reinforcements') return `#/turno/fase/${r.phase}/${r.segment}`;
    return `#/turno-comentado/fase/${r.phase}/${r.segment}`;
  }

  function zoneTitle(template, zone) {
    const r = zone.ref;
    if (zone.kind === 'strategy-step') {
      const step = template.band.strategic.phases.indexOf(r.step);
      return `Estrategia · ${template.band.strategic.sheetSteps[step] || zone.label}`;
    }
    if (zone.kind === 'command-recovery') {
      const day = template.band.days.find((d) => d.id === r.day);
      return `Recuperación de Mando · ${day ? day.title : r.day}`;
    }
    const impulse = impulseOf(template, r.phase);
    return `${zone.label} · ${impulse ? impulse.title : `fase ${r.phase}`}`;
  }

  // Zona para el visor: etiqueta y resumen breve; el detalle va en el cuadro de fases.
  function buildHotspot(template, zone, sheetStatus) {
    const [x, y, width, height] = zone.rect;
    const summary = zone.kind === 'segment' && zone.ref.segment === 'reinforcements'
      ? 'Consulta los refuerzos al empezar la fase. Toca para ver el cuadro de la zona.'
      : 'Toca para ver las fases de este apartado y entra en la que necesites.';
    return {
      id: zone.id,
      label: zoneTitle(template, zone),
      summary,
      rect: { x, y, width, height },
      status: zone.reviewStatus === 'verified' ? 'verified' : (sheetStatus || 'needs_review'),
      sourceText: zone.source === 'inferred-from-grid'
        ? 'Posición colocada por la rejilla de la hoja (no detectada por color): pendiente de revisión.'
        : 'Posición detectada con OpenCV sobre la hoja de turnos 1.1.'
    };
  }

  // Cuadro con la lista de fases (subfases) del apartado y accesos relacionados.
  function buildToolbox(template, zone) {
    const title = zoneTitle(template, zone);
    const page = hashFor(zone);
    const box = { title, pageHash: page, pageLabel: 'Abrir la página completa', items: [], extras: [], note: null };
    if (zone.kind === 'command-recovery' || (zone.kind === 'segment' && zone.ref.segment === 'reinforcements')) {
      box.pageLabel = zone.kind === 'command-recovery' ? 'Abrir Recuperación de Mando' : 'Abrir Refuerzos';
      return box;
    }
    let phase;
    if (zone.kind === 'strategy-step') {
      phase = template.phases[zone.ref.step];
      box.pageLabel = `Abrir ${zone.label}`;
      box.items = Model.listSubphases(template, phase || {}).map((s) => ({ label: s.title, hash: `#/turno/fase/0/${zone.ref.step}/${s.id}` }));
      return box;
    }
    const impulse = impulseOf(template, zone.ref.phase);
    const seg = Model.getSegment(template, impulse.id, zone.ref.segment);
    box.pageLabel = `Abrir ${zone.label} (${impulse.title})`;
    box.items = Model.listSubphases(template, (seg && seg.phase) || {}).map((s) => ({ label: s.title, hash: `${page}/${s.id}` }));
    if (zone.ref.segment === 'ground' && impulse.groundReactionLevels) {
      box.note = `Nivel de Reacción de las unidades que pueden activarse: ${impulse.groundReactionLevels.join(', ')}.`;
    }
    if (zone.ref.segment === 'air-1') {
      box.extras.push({ label: 'Refuerzos (al empezar la fase)', hash: `#/turno/fase/${impulse.number}/reinforcements` });
      const day = dayOf(template, impulse);
      if (day && day.impulses[0] === impulse.id) {
        box.extras.push({ label: `Recuperación de Mando (primera fase del ${day.title.toLowerCase()})`, hash: `#/turno/mando/${day.id}` });
      }
    }
    return box;
  }

  // Página propia de un segmento en el Turno Comentado: todas sus subfases (con sus ayudas terminológicas, atajos y,
  // si la hay, ayuda gráfica declarada en data/phases/commented-turn-help.json) y lo que no hay que olvidar.
  function buildSegmentPage(template, number, segmentId, helpData) {
    const impulse = impulseOf(template, number);
    const seg = impulse && Model.getSegment(template, impulse.id, segmentId);
    if (!seg || !seg.phase) return null;
    const visuals = (helpData && helpData.subphaseVisuals) || {};
    const day = dayOf(template, impulse);
    const reminders = [];
    if (seg.id === 'air-1') {
      reminders.push({ label: 'Refuerzos (al empezar la fase)', hash: `#/turno/fase/${impulse.number}/reinforcements` });
      if (day && day.impulses[0] === impulse.id) {
        reminders.push({ label: `Recuperación de Mando (primera fase del ${day.title.toLowerCase()})`, hash: `#/turno/mando/${day.id}` });
      }
    }
    return {
      title: `${seg.title} — ${impulse.title}`,
      summary: seg.phase.summary,
      actions: (seg.phase.actions || []).map((a) => a.text),
      reminders,
      groundLevels: seg.id === 'ground' && impulse.groundReactionLevels ? impulse.groundReactionLevels : null,
      guidedHash: `#/turno/fase/${impulse.number}/${seg.id}`,
      subphases: Model.listSubphases(template, seg.phase).map((sub) => ({
        id: sub.id,
        title: sub.title,
        help: sub.help,
        entityRefs: sub.entityRefs || [],
        optionalRule: Boolean(sub.optionalRule),
        wizardLinks: sub.wizardLinks || [],
        relatedWorkflowIds: sub.relatedWorkflowIds || [],
        guidedHash: `#/turno/fase/${impulse.number}/${seg.id}/${sub.id}`,
        visual: visuals[sub.id] || null
      }))
    };
  }

  // Comprobaciones de coherencia entre los datos de la hoja y el modelo (usadas por los tests).
  function validateSheetData(sheet, template) {
    const errors = [];
    const ids = new Set();
    (sheet.zones || []).forEach((z) => {
      if (ids.has(z.id)) errors.push(`zona duplicada: ${z.id}`);
      ids.add(z.id);
      const [x, y, w, h] = z.rect;
      if (![x, y, w, h].every((v) => v >= 0 && v <= 1) || x + w > 1.0001 || y + h > 1.0001) errors.push(`rect fuera de rango: ${z.id}`);
      if (z.reviewStatus === 'verified') errors.push(`verified sin revisión del mantenedor: ${z.id}`);
      if (z.kind === 'strategy-step' && !template.phases[z.ref.step]) errors.push(`paso de Estrategia inexistente: ${z.id}`);
      if (z.kind === 'command-recovery' && !template.band.days.some((d) => d.id === z.ref.day)) errors.push(`día inexistente: ${z.id}`);
      if (z.kind === 'segment') {
        const imp = impulseOf(template, z.ref.phase);
        if (!imp || !Model.getSegment(template, imp.id, z.ref.segment)) errors.push(`segmento inexistente: ${z.id}`);
      }
    });
    // Cada segmento del modelo debe tener su zona y viceversa.
    Model.listImpulses(template).forEach((imp) => {
      Model.listSegments(template, imp.id).forEach((seg) => {
        if (!ids.has(`phase-${imp.number}:${seg.id}`)) errors.push(`falta la zona de ${imp.id}/${seg.id}`);
      });
    });
    template.band.strategic.phases.forEach((p) => { if (!ids.has(`strategy:${p}`)) errors.push(`falta la zona de Estrategia ${p}`); });
    template.band.days.forEach((d) => { if (!ids.has(`command-recovery:${d.id}`)) errors.push(`falta la zona de Recuperación de Mando ${d.id}`); });
    return errors;
  }

  return { buildHotspot, buildToolbox, buildSegmentPage, validateSheetData, hashFor, zoneTitle };
});
