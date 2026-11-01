// Lógica pura del árbol de decisión de combate (Fase 25). Recorre data/routing/decision-graph.json según el contrato
// de «Grafo de decisión/AGENTS.md»: solo se pregunta el nodo actual, cada respuesta acumula sus efectos, volver atrás o
// cambiar una respuesta descarta todo lo posterior y un nodo terminal no pregunta nada más. Sin DOM ni reglas
// incrustadas: preguntas, respuestas, efectos y fuentes salen del archivo de datos.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DecisionGraphEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getNode(graph, nodeId) {
    return (graph.nodes && Object.prototype.hasOwnProperty.call(graph.nodes, nodeId)) ? graph.nodes[nodeId] : null;
  }

  // Invariantes del grafo (AGENTS.md del árbol, «Invariantes del grafo» y «Pruebas mínimas» 1-2).
  function validateGraph(graph) {
    const errors = [];
    const nodes = graph.nodes || {};
    if (!getNode(graph, graph.entrypoint)) errors.push(`entrypoint inexistente: ${graph.entrypoint}`);
    Object.entries(nodes).forEach(([id, node]) => {
      if (!node.source || !node.source.length) errors.push(`nodo sin fuente: ${id}`);
      if (node.type === 'decision') {
        if (!node.question) errors.push(`decisión sin pregunta: ${id}`);
        if (!Array.isArray(node.routes) || node.routes.length < 2) errors.push(`decisión con menos de dos rutas: ${id}`);
        (node.routes || []).forEach((route, i) => {
          if (!route.answer) errors.push(`ruta sin respuesta: ${id}[${i}]`);
          if (!getNode(graph, route.to)) errors.push(`ruta rota: ${id}[${i}] -> ${route.to}`);
        });
      } else if (node.type === 'terminal') {
        if (node.routes && node.routes.length) errors.push(`terminal con rutas: ${id}`);
        if (!node.title || !Array.isArray(node.instructions) || !node.instructions.length) errors.push(`terminal sin título o instrucciones: ${id}`);
      } else {
        errors.push(`tipo de nodo desconocido: ${id}`);
      }
    });
    const reachable = reachableFrom(graph, graph.entrypoint);
    Object.keys(nodes).forEach((id) => { if (!reachable.has(id)) errors.push(`nodo inalcanzable: ${id}`); });
    return errors;
  }

  function reachableFrom(graph, startId) {
    const seen = new Set();
    const stack = [startId];
    while (stack.length) {
      const id = stack.pop();
      const node = getNode(graph, id);
      if (!node || seen.has(id)) continue;
      seen.add(id);
      (node.routes || []).forEach((r) => stack.push(r.to));
    }
    return seen;
  }

  // Sesión inmutable: `startNode` es donde se entró (el inicio o un punto a mitad del árbol) y `history` guarda, por
  // paso, el nodo, la respuesta elegida, el destino y una copia de sus efectos, para volver atrás sin dejar
  // modificadores huérfanos.
  function createSession(graph, options) {
    const opts = options || {};
    const startNode = opts.startNode || graph.entrypoint;
    if (!getNode(graph, startNode)) throw new Error(`Nodo de entrada inexistente: ${startNode}`);
    let session = { startNode, history: [] };
    (opts.presetAnswers || []).forEach((preset) => {
      const node = currentNode(graph, session);
      if (!node || node.id !== preset.nodeId) throw new Error(`Respuesta previa fuera de secuencia: ${preset.nodeId}`);
      session = choose(graph, session, preset.routeIndex, { preset: true });
    });
    return session;
  }

  function currentNodeId(session) {
    const last = session.history[session.history.length - 1];
    return last ? last.to : session.startNode;
  }

  function currentNode(graph, session) {
    const id = currentNodeId(session);
    const node = getNode(graph, id);
    return node ? { id, ...node } : null;
  }

  function choose(graph, session, routeIndex, meta) {
    const node = currentNode(graph, session);
    if (!node || node.type !== 'decision') throw new Error('El nodo actual no admite respuestas');
    const route = node.routes[routeIndex];
    if (!route) throw new Error(`Respuesta inexistente: ${node.id}[${routeIndex}]`);
    const step = {
      nodeId: node.id,
      question: node.question,
      routeIndex,
      answer: route.answer,
      to: route.to,
      effects: [...(route.effects || [])],
      source: [...(node.source || [])],
      preset: Boolean(meta && meta.preset)
    };
    return { ...session, history: [...session.history, step] };
  }

  function goBack(session) {
    if (!session.history.length) return session;
    return { ...session, history: session.history.slice(0, -1) };
  }

  // Cambiar la respuesta del paso `index`: se vuelve a esa pregunta y se descartan ella y todo lo posterior.
  function rewindTo(session, index) {
    if (index < 0 || index >= session.history.length) return session;
    return { ...session, history: session.history.slice(0, index) };
  }

  function accumulatedEffects(session) {
    return session.history.flatMap((step) => step.effects.map((text) => ({ nodeId: step.nodeId, answer: step.answer, text })));
  }

  // Fuentes de todo lo recorrido más las del nodo actual, sin repetir y en orden de aparición.
  function sourceTrace(graph, session) {
    const seen = new Set();
    const out = [];
    const add = (list) => (list || []).forEach((s) => { if (!seen.has(s)) { seen.add(s); out.push(s); } });
    session.history.forEach((step) => add(step.source));
    const node = currentNode(graph, session);
    if (node) add(node.source);
    return out;
  }

  function isFinished(graph, session) {
    const node = currentNode(graph, session);
    return Boolean(node && node.type === 'terminal');
  }

  // Enlaces de cada resultado final al cálculo existente (data/routing/decision-graph-links.json).
  function terminalLinks(linksData, terminalId) {
    const entry = ((linksData && linksData.terminals) || {})[terminalId];
    return entry ? entry : { wizards: [], tables: [] };
  }

  // Cálculo que se ofrece en una pregunta donde se cruza una tabla (p. ej. cada ronda WVR).
  function nodeLinks(linksData, nodeId) {
    return ((linksData && linksData.nodes) || {})[nodeId] || [];
  }

  function validateLinks(graph, linksData, isKnownHash, tablePages) {
    const errors = [];
    Object.entries((linksData && linksData.nodes) || {}).forEach(([id, list]) => {
      const node = getNode(graph, id);
      if (!node || node.type !== 'decision') errors.push(`cálculo en un nodo que no es pregunta: ${id}`);
      list.forEach((w) => { if (!isKnownHash(w.hash)) errors.push(`wizard desconocido ${w.hash}: ${id}`); });
    });
    const terminals = Object.entries(graph.nodes || {}).filter(([, n]) => n.type === 'terminal').map(([id]) => id);
    const declared = (linksData && linksData.terminals) || {};
    Object.keys(declared).forEach((id) => {
      const node = getNode(graph, id);
      if (!node || node.type !== 'terminal') errors.push(`enlace a un nodo que no es terminal: ${id}`);
      (declared[id].wizards || []).forEach((w) => { if (!isKnownHash(w.hash)) errors.push(`wizard desconocido ${w.hash}: ${id}`); });
      (declared[id].tables || []).forEach((p) => { if (!tablePages.has(p)) errors.push(`página de tabla inexistente ${p}: ${id}`); });
    });
    terminals.forEach((id) => {
      if (!id.startsWith('terminal.illegal.') && !declared[id]) errors.push(`resultado sin enlace al cálculo: ${id}`);
    });
    return errors;
  }

  // Páginas de tablas citadas por un nodo («Tablas p.16», «Tablas pp.8-9», «Tablas pp.6, 9 y 22»), como nombres de archivo
  // de data/tables/. `maxPages` descarta las citas de resumen de un dominio entero (p. ej. «pp.2-14») y la p.1 es índice.
  function tablePagesFromSource(sources, maxPages) {
    const pages = [];
    (sources || []).forEach((src) => {
      const m = /^Tablas pp?\.\s*(.+)$/.exec(src);
      if (!m) return;
      const found = [];
      m[1].split(/,|\sy\s/).map((p) => p.trim()).filter(Boolean).forEach((piece) => {
        const range = /^(\d+)\s*-\s*(\d+)$/.exec(piece);
        if (range) { for (let n = Number(range[1]); n <= Number(range[2]); n += 1) found.push(n); } else if (/^\d+$/.test(piece)) found.push(Number(piece));
      });
      if (maxPages && found.length > maxPages) return;
      found.filter((n) => n > 1).forEach((n) => {
        const file = `page-${String(n).padStart(2, '0')}.json`;
        if (!pages.includes(file)) pages.push(file);
      });
    });
    return pages;
  }

  // Cuántas veces se ha respondido ya el nodo actual (un bucle real, como otra ronda WVR).
  function repeatCount(session) {
    const id = currentNodeId(session);
    return session.history.filter((step) => step.nodeId === id).length;
  }

  // Puntos de entrada por página (data/routing/decision-entrypoints.json): una entrada es la lista de respuestas que se
  // dan por puestas desde el inicio; se buscan por su texto exacto y quedan en el historial marcadas como `preset`.
  function entryForContext(entriesData, kind, key) {
    const map = (entriesData && entriesData[kind]) || {};
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
  }

  function sessionFromEntry(graph, entriesData, entryId) {
    const entry = ((entriesData && entriesData.entries) || {})[entryId];
    if (!entry) throw new Error(`Punto de entrada inexistente: ${entryId}`);
    let session = { startNode: graph.entrypoint, entryId, history: [] };
    entry.answers.forEach((answer) => {
      const node = currentNode(graph, session);
      const index = node && node.type === 'decision' ? node.routes.findIndex((r) => r.answer === answer) : -1;
      if (index === -1) throw new Error(`Respuesta «${answer}» inexistente en ${node ? node.id : '?'} (entrada ${entryId})`);
      session = choose(graph, session, index, { preset: true });
    });
    return session;
  }

  function validateEntrypoints(graph, entriesData, known) {
    const errors = [];
    const entries = (entriesData && entriesData.entries) || {};
    Object.keys(entries).forEach((id) => {
      if (!entries[id].title) errors.push(`entrada sin título: ${id}`);
      try {
        const s = sessionFromEntry(graph, entriesData, id);
        if (isFinished(graph, s)) errors.push(`entrada que ya es un resultado: ${id}`);
      } catch (err) { errors.push(err.message); }
    });
    ['subphases', 'workflows', 'tablePages'].forEach((kind) => {
      Object.entries((entriesData && entriesData[kind]) || {}).forEach(([key, entryId]) => {
        if (!entries[entryId]) errors.push(`${kind}.${key} remite a una entrada inexistente: ${entryId}`);
        if (known && known[kind] && !known[kind].all.has(key)) errors.push(`${kind}.${key} no existe en la aplicación`);
      });
      // `required`: las páginas de combate que deben poder abrir el asistente.
      if (known && known[kind]) known[kind].required.forEach((key) => { if (!entryForContext(entriesData, kind, key)) errors.push(`${kind}.${key} sin punto de entrada`); });
    });
    return errors;
  }

  return {
    entryForContext, sessionFromEntry, validateEntrypoints, tablePagesFromSource, repeatCount,
    getNode, validateGraph, reachableFrom, createSession, currentNodeId, currentNode, choose, goBack, rewindTo,
    accumulatedEffects, sourceTrace, isFinished, terminalLinks, nodeLinks, validateLinks
  };
});
