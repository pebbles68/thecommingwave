// Interpretación declarativa de las preguntas de una etapa de workflow
// (ajuste AJ-007): visibilidad por `showIf`, agrupación por `parallelGroups` e
// invalidación de respuestas dependientes. Lógica pura (sin DOM), reutilizable
// por cualquier wizard; los datos viven en data/workflows/*.json.
(function (root) {
  'use strict';

  function isVisible(question, answers) {
    if (!question.showIf) return true;
    return answers[question.showIf.questionId] === question.showIf.equals;
  }

  function visibleQuestions(stage, answers) {
    return (stage.questions || []).filter((q) => isVisible(q, answers));
  }

  // Preguntas independientes: `parallelGroups` es una lista de grupos de ids que
  // se pueden contestar en cualquier orden dentro del mismo paso.
  function groupOf(stage, questionId) {
    const groups = stage.parallelGroups || [];
    const idx = groups.findIndex((g) => g.includes(questionId));
    return idx;
  }

  // Bloques en el orden del workflow: las preguntas visibles consecutivas de un
  // mismo grupo paralelo con al menos 2 miembros visibles forman un bloque
  // `parallel`; el resto, bloques sueltos.
  function layout(stage, answers) {
    const visible = visibleQuestions(stage, answers);
    const blocks = [];
    visible.forEach((q) => {
      const g = groupOf(stage, q.id);
      const last = blocks[blocks.length - 1];
      if (g !== -1 && last && last.groupIndex === g) {
        last.questions.push(q);
      } else {
        blocks.push({ groupIndex: g, questions: [q] });
      }
    });
    return blocks.map((b) => ({ parallel: b.groupIndex !== -1 && b.questions.length > 1, questions: b.questions }));
  }

  // Elimina las respuestas de las preguntas que dejan de ser visibles (en
  // cascada: ocultar una pregunta puede ocultar las que dependían de ella).
  // Devuelve los ids retirados.
  function pruneHidden(stage, answers) {
    const removed = [];
    let changed = true;
    while (changed) {
      changed = false;
      (stage.questions || []).forEach((q) => {
        if (!isVisible(q, answers) && Object.prototype.hasOwnProperty.call(answers, q.id)) {
          delete answers[q.id];
          removed.push(q.id);
          changed = true;
        }
      });
    }
    return removed;
  }

  // Ids de las preguntas que dependen (directa o indirectamente) de otra.
  function dependentsOf(stage, questionId) {
    const result = new Set();
    let frontier = [questionId];
    while (frontier.length) {
      const next = [];
      (stage.questions || []).forEach((q) => {
        if (q.showIf && frontier.includes(q.showIf.questionId) && !result.has(q.id)) {
          result.add(q.id);
          next.push(q.id);
        }
      });
      frontier = next;
    }
    return [...result];
  }

  // ---- Reglas del workflow (flowCuts, diceRules, rollDependentRules) ----
  //
  // Las condiciones son del tipo `ident == 'texto'`, `ident == 9` o varias
  // unidas con `&&`. Si alguna parte no se puede evaluar con las respuestas y
  // el contexto dados (p.ej. depende del resultado de la tabla), devuelve
  // `null` (desconocido) y la regla NO se activa: nunca se adivina.
  function evaluateCondition(condition, scope) {
    if (!condition) return true;
    let result = true;
    for (const part of String(condition).split('&&').map((p) => p.trim())) {
      const m = /^(\w+)\s*==\s*(?:'([^']*)'|(-?\d+(?:\.\d+)?))$/.exec(part);
      if (!m) return null;
      const actual = scope[m[1]];
      if (actual === undefined || actual === '' || actual === null) return null;
      const expected = m[2] !== undefined ? m[2] : Number(m[3]);
      if (String(actual) !== String(expected)) result = false;
    }
    return result;
  }

  // Reglas aplicables a una etapa según las respuestas y el contexto
  // (variables como `finalRoll` que no son respuestas de pregunta).
  function activeRules(workflow, stageId, answers, context) {
    const scope = { ...(context || {}), ...(answers || {}) };
    const inStage = (r) => !r.stage || r.stage === stageId;
    return {
      flowCuts: (workflow.flowCuts || []).filter((c) => inStage(c) && scope[c.question] !== undefined && scope[c.question] === c.optionValue),
      diceRules: (workflow.diceRules || []).filter((r) => inStage(r) && r.condition && evaluateCondition(r.condition, scope) === true),
      rollDependentRules: (workflow.rollDependentRules || []).filter((r) => inStage(r) && r.condition && evaluateCondition(r.condition, scope) === true)
    };
  }

  const api = { isVisible, visibleQuestions, layout, pruneHidden, dependentsOf, evaluateCondition, activeRules };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StageQuestionsEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
