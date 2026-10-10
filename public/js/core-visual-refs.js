// Ayuda visual declarativa de los campos de wizard (ajuste AJ-008).
// data/rules/wizard-visual-refs.json declara, para cada campo numérico que un
// wizard pide leer de una ficha, tabla, plan u hoja de origen, dónde se lee.
// Este módulo observa la vista activa y añade bajo el campo un bloque plegable
// «¿Dónde se lee este valor?» (accesible con toque y teclado: es un <details>).
// No deduce ningún valor de imágenes: solo señala dónde se lee.
//
// La parte pura (`findEntry`, `wizardIdFromHash`) se comparte con los tests.
(function (root) {
  'use strict';

  function wizardIdFromHash(hash) {
    const m = /^#\/wizard\/([^/?#]+)/.exec(hash || '');
    return m ? m[1] : null;
  }

  // Primera entrada cuyo patrón coincide con el texto y cuyo wizard encaja.
  function findEntry(data, wizardId, text) {
    return (data.entries || []).find((e) => (e.wizards.includes('*') || e.wizards.includes(wizardId)) && new RegExp(e.pattern).test(text)) || null;
  }

  // Entrada declarada por su ID estable y aplicable al wizard (o comodín).
  function findEntryById(data, wizardId, id) {
    const e = (data.entries || []).find((x) => x.id === id);
    return e && (e.wizards.includes('*') || e.wizards.includes(wizardId)) ? e : null;
  }

  // Un campo con ID declarado usa esa entrada (aunque el texto de su etiqueta cambie); sin ID, el patrón del texto.
  function resolveEntry(data, wizardId, declaredId, text) {
    return declaredId ? findEntryById(data, wizardId, declaredId) : findEntry(data, wizardId, text);
  }

  const api = { wizardIdFromHash, findEntry, findEntryById, resolveEntry };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppVisualRefsCore = api;

  if (typeof document === 'undefined') return;

  const FIELD_SELECTOR = 'label.table-viewer__field';
  let data = null;
  let loading = null;
  let scheduled = false;

  function buildBody(entry) {
    const box = document.createElement('div');
    box.className = 'visual-ref__body';
    const add = (text, cls) => { const p = document.createElement('p'); p.className = cls || 'source-refs'; p.textContent = text; box.appendChild(p); };
    if (entry.kind === 'table') {
      if (entry.reason) add(entry.reason);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--secondary';
      btn.textContent = 'Ver la tabla relacionada';
      btn.addEventListener('click', () => { location.hash = `#/ayuda/tablas/${entry.page}/${entry.tableId}`; });
      box.appendChild(btn);
      add('Se abre sin perder lo que llevas en el wizard: al volver con «Atrás» sigues donde estabas.');
    } else if (entry.kind === 'source-page') {
      add(`Se lee en «${entry.document}»: ${entry.description}`);
    } else if (entry.kind === 'plan-crop') {
      add(`${entry.reason} En «Seleccionar unidad y plan» (cuando el wizard lo ofrece) se muestra el recorte del plan; las hojas completas de cada país están en Ayuda rápida → Planes de ataque y municiones.`);
    }
    return box;
  }

  function decorate(field, entry) {
    if (entry.entityRef) {
      // Ayuda visual declarada por entityRef (TUR-012): un botón que abre el panel lateral compartido con el catálogo,
      // sin cambiar de ruta ni perder lo ya respondido.
      const wrap = document.createElement('div');
      wrap.className = 'visual-ref';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--secondary visual-ref__btn';
      btn.textContent = '¿Dónde se lee este valor?';
      btn.setAttribute('aria-haspopup', 'true');
      const span = field.querySelector('span');
      btn.addEventListener('click', () => { AppVisualHelp.open({ ...entry.entityRef, fieldLabel: span ? span.textContent : '', refId: entry.id }, btn); });
      wrap.appendChild(btn);
      field.insertAdjacentElement('afterend', wrap);
      return;
    }
    const details = document.createElement('details');
    details.className = 'visual-ref';
    const summary = document.createElement('summary');
    summary.textContent = '¿Dónde se lee este valor?';
    details.appendChild(summary);
    let built = false;
    details.addEventListener('toggle', () => {
      if (details.open && !built) { built = true; details.appendChild(buildBody(entry)); }
    });
    field.insertAdjacentElement('afterend', details);
  }

  const VISIBLE_KINDS = ['counter-factor', 'table', 'source-page', 'plan-crop'];

  function process(container) {
    scheduled = false;
    const wizardId = wizardIdFromHash(location.hash);
    if (!wizardId || !data) return;
    container.querySelectorAll(FIELD_SELECTOR).forEach((field) => {
      if (field.dataset.visualRefDone === '1') return;
      field.dataset.visualRefDone = '1';
      const span = field.querySelector('span');
      if (!span) return;
      // Un campo declara el ID estable de su ayuda (`data-visual-ref`); el patrón del texto solo es el respaldo para
      // campos que aún no lo declaran.
      const entry = resolveEntry(data, wizardId, field.dataset.visualRef, span.textContent);
      if (!entry || entry.renderedBy === 'wizard' || !VISIBLE_KINDS.includes(entry.kind)) return;
      decorate(field, entry);
    });
  }

  function attach(container) {
    const run = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => process(container));
    };
    loading = AppData.loadWizardVisualRefs().then((d) => { data = d; run(); }).catch(() => {});
    new MutationObserver(run).observe(container, { childList: true, subtree: true });
  }

  root.AppVisualRefs = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
