// Selección de la ayuda visual según el contexto (ajustes_de_turno.md TUR-010). Funciones puras sobre el
// catálogo data/visual-help/entities.json: nunca elige el primer ejemplo disponible a ciegas.
//
// Una referencia (`ref`) declara qué entidad se menciona y con qué precisión:
//   { entityType, templateId }   entidad concreta conocida     -> solo esa plantilla
//   { entityType, subsetIds }    tipo restringido por la regla -> solo las plantillas de esos subconjuntos
//   { entityType, scope:'generic' } referencia genérica        -> todos los tipos del dominio
//   { entityType }                contexto insuficiente         -> selector completo, marcado como tal
// Con `factorId` (un wizard que pide un factor) solo se ofrecen las plantillas que lo tienen.
//
// UMD-lite: funciona en Node (tests) y en el navegador.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VisualHelpEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function templateKey(t) {
    return t.templateId || t.boardType || t.unitId || t.id;
  }

  // Factores pedidos por una referencia: `factorId`, o `factorIds` cuando un mismo valor se imprime con otro nombre
  // según la ficha (p. ej. el Nivel de Reacción es «Iniciativa» en las unidades principales y «Móvil / Fijo» en las técnicas).
  function wantedFactors(ref) {
    if (ref && Array.isArray(ref.factorIds) && ref.factorIds.length) return ref.factorIds;
    return ref && ref.factorId ? [ref.factorId] : [];
  }

  // Devuelve { status, entity, templates, genericExample, missingContext }.
  // status: 'concrete' | 'restricted' | 'generic' | 'missing-context' | 'unknown-entity' | 'no-compatible'.
  function selectTemplates(catalog, ref, options) {
    const entity = catalog && catalog.entities ? catalog.entities[ref && ref.entityType] : null;
    if (!entity) return { status: 'unknown-entity', entity: null, templates: [], genericExample: false, missingContext: true };

    let status;
    let templates;
    if (ref.templateId) {
      templates = entity.templates.filter((t) => t.id === ref.templateId || templateKey(t) === ref.templateId);
      status = templates.length ? 'concrete' : 'unknown-entity';
    } else if (Array.isArray(ref.subsetIds) && ref.subsetIds.length) {
      const ids = new Set();
      ref.subsetIds.forEach((s) => { ((entity.subsets && entity.subsets[s] && entity.subsets[s].templates) || []).forEach((id) => ids.add(id)); });
      templates = entity.templates.filter((t) => ids.has(t.id));
      status = templates.length ? 'restricted' : 'unknown-entity';
    } else if (ref.scope === 'generic') {
      templates = entity.templates.slice();
      status = 'generic';
    } else {
      // Contexto insuficiente: no se escoge ninguno; se ofrece el conjunto completo declarándolo.
      templates = entity.templates.slice();
      status = 'missing-context';
    }

    // Un wizard que pide un factor solo ofrece las plantillas donde ese factor existe.
    const wanted = wantedFactors(ref);
    if (options && options.factorMap && wanted.length && templates.length) {
      const has = (t) => {
        if (t.kind !== 'counter-template') return false;
        const tpl = options.factorMap.counterTemplates.find((x) => x.id === t.templateId);
        return !!tpl && tpl.factors.some((f) => wanted.includes(f.factor));
      };
      const compatible = templates.filter(has);
      if (!compatible.length) return { status: 'no-compatible', entity, templates: [], genericExample: false, missingContext: false };
      templates = compatible;
    }

    return {
      status,
      entity,
      templates,
      // Un ejemplo es genérico cuando la regla no fija la entidad concreta.
      genericExample: status === 'generic' || status === 'missing-context',
      missingContext: status === 'missing-context' || status === 'unknown-entity'
    };
  }

  // Referencias de un texto: sustituye cada marcador `[[id]]` por un segmento de referencia y deja el resto literal.
  // Devuelve [{ type:'text', text } | { type:'ref', ref }] sin tocar el DOM (puro).
  function splitTextWithRefs(text, refs) {
    const byId = new Map((refs || []).map((r) => [r.id, r]));
    const parts = [];
    let last = 0;
    const re = /\[\[([a-z0-9-]+)\]\]/g;
    let m = re.exec(text);
    while (m) {
      if (m.index > last) parts.push({ type: 'text', text: text.slice(last, m.index) });
      const ref = byId.get(m[1]);
      parts.push(ref ? { type: 'ref', ref } : { type: 'text', text: m[0] });
      last = m.index + m[0].length;
      m = re.exec(text);
    }
    if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
    // Texto contiguo (p. ej. un marcador sin referencia, que queda literal) se une en un solo segmento.
    return parts.reduce((acc, p) => {
      const prev = acc[acc.length - 1];
      if (prev && prev.type === 'text' && p.type === 'text') prev.text += p.text; else acc.push({ ...p });
      return acc;
    }, []);
  }

  return { selectTemplates, splitTextWithRefs, templateKey, wantedFactors };
});
