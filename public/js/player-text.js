// Texto para el jugador (ajuste AJ-006): red de seguridad que separa del texto
// principal las referencias de desarrollo (ids de roadmap/incidencias,
// nombres de archivos JSON, rutas de documentación…) y las deja en un bloque
// plegable «Fuente y trazabilidad». Parte pura (`splitPlayerText`, testeable en
// Node) + observador de DOM que la aplica a la vista activa.
//
// Es un complemento, no un sustituto: los textos que se pueden redactar bien
// en origen se redactan en origen; esto cubre el contenido que viene de los
// archivos de datos (notas de workflows, tablas y reglas).
(function (root) {
  'use strict';

  const JARGON = /roadmap|\bCOR0?\d*-\d+|correcciones0?\d*\.md|\.json|\.md\b|known-ambiguities|needsReview|needs_review|needs review|Vertical slice|golden test|\bworkflow\b|\bdata\/|\bdocs\//i;

  const REPLACEMENTS = [
    [/\(?\bneeds_review\b\)?/gi, 'pendiente de validar'],
    [/\bneedsReview\b/g, 'pendiente de validar'],
    [/\bneeds review\b/gi, 'pendiente de validar'],
    [/\bgolden test\b/gi, 'ejemplo oficial']
  ];

  function hasJargon(text) { return JARGON.test(text); }

  // Devuelve { main, trace[] }: `main` es el texto sin referencias de
  // desarrollo y `trace` los fragmentos retirados, en orden.
  function splitPlayerText(text) {
    if (!hasJargon(text)) return { main: text, trace: [] };
    const trace = [];
    let work = text;
    // 1. Paréntesis/corchetes con referencias.
    work = work.replace(/\s*\(([^()]*)\)/g, (m, inner) => {
      if (!hasJargon(inner)) return m;
      trace.push(inner.trim());
      return '';
    });
    // 2. Frases que siguen teniendo referencias técnicas.
    const sentences = work.split(/(?<=[.;:!?])\s+/);
    const kept = [];
    sentences.forEach((sentence) => {
      if (!hasJargon(sentence)) { kept.push(sentence); return; }
      let cleaned = sentence;
      REPLACEMENTS.forEach(([re, to]) => { cleaned = cleaned.replace(re, to); });
      if (!hasJargon(cleaned) && cleaned !== sentence) { kept.push(cleaned); return; }
      trace.push(sentence.trim());
    });
    let main = kept.join(' ').replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
    return { main, trace };
  }

  const api = { splitPlayerText, hasJargon };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PlayerText = api;

  if (typeof document === 'undefined') return;

  const SKIP_SELECTOR = 'details.trace-note, script, style, textarea, input, select, option, pre, code';
  let scheduled = false;

  function isLeafTextElement(node) {
    return node.nodeType === 1 && node.children.length === 0 && node.textContent.length > 0;
  }

  function processElement(node) {
    if (node.dataset.playerText === node.textContent) return;
    if (node.closest(SKIP_SELECTOR)) return;
    const text = node.textContent;
    if (!hasJargon(text)) return;
    const { main, trace } = splitPlayerText(text);
    if (!trace.length && main === text) { node.dataset.playerText = text; return; }
    if (main) node.textContent = main; else node.hidden = true;
    node.dataset.playerText = node.textContent;
    if (trace.length) {
      const details = document.createElement('details');
      details.className = 'trace-note';
      const summary = document.createElement('summary');
      summary.textContent = 'Fuente y trazabilidad';
      details.appendChild(summary);
      trace.forEach((t) => {
        const p = document.createElement('p');
        p.className = 'source-refs';
        p.textContent = t;
        details.appendChild(p);
      });
      node.insertAdjacentElement('afterend', details);
    }
  }

  function processTree(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
    const targets = [];
    let n = walker.nextNode();
    while (n) {
      if (isLeafTextElement(n)) targets.push(n);
      n = walker.nextNode();
    }
    targets.forEach(processElement);
  }

  function run(container) {
    scheduled = false;
    processTree(container);
  }

  function attach(container) {
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => run(container));
    });
    observer.observe(container, { childList: true, subtree: true });
    run(container);
  }

  root.PlayerText.attach = attach;
})(typeof window !== 'undefined' ? window : globalThis);
