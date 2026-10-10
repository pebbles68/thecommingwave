// Renderizador común de las preguntas de una etapa (ajuste AJ-007). Interpreta
// `showIf`, `parallelGroups` e invalida las respuestas dependientes al cambiar
// una (StageQuestionsEngine). Los campos complejos (flotas, distancias
// derivadas, tiradas…) se enchufan como adaptadores en `opts.custom`.
(function (root) {
  'use strict';

  const { el, makeNumberField, makeOptionGroup } = AppWidgets;
  const Engine = StageQuestionsEngine;

  // opts:
  //   rerender()      — se llama tras cada cambio.
  //   custom          — { [questionId]: (question) => void }: dibuja la pregunta
  //                     a medida (sustituye al control por defecto).
  //   renderQuestion(q, target) — adaptador general: devuelve true si dibuja la
  //                     pregunta (derivada, campo complejo…) y false para usar
  //                     el control por defecto.
  //   afterQuestion(q, target) — se llama tras dibujar cada pregunta (p.ej. para
  //                     añadir una ayuda visual).
  //   onAnswer(q, value) — efecto propio del wizard al cambiar una respuesta.
  //   onInvalidate(ids) — respuestas retiradas por haberse ocultado su pregunta.
  function renderStageQuestions(wrap, stage, answers, opts) {
    const options = opts || {};
    const rerender = options.rerender || (() => {});
    const custom = options.custom || {};

    // Normaliza antes de pintar: nunca se muestra una respuesta cuya pregunta
    // ya no es visible.
    const removedNow = Engine.pruneHidden(stage, answers);
    if (removedNow.length && options.onInvalidate) options.onInvalidate(removedNow);

    const commit = (q, value) => {
      answers[q.id] = value;
      if (options.onAnswer) options.onAnswer(q, value);
      const removed = Engine.pruneHidden(stage, answers);
      if (removed.length && options.onInvalidate) options.onInvalidate(removed);
    };

    const drawQuestion = (target, q) => {
      if (custom[q.id]) { custom[q.id](q, target); }
      else if (options.renderQuestion && options.renderQuestion(q, target)) { /* dibujada por el adaptador */ }
      else if (q.type === 'number') {
        target.appendChild(makeNumberField(q.prompt, answers[q.id] || '', (v) => { answers[q.id] = v; }, () => { commit(q, answers[q.id]); rerender(); }));
      } else {
        target.appendChild(makeOptionGroup(q, answers[q.id], (v) => { commit(q, v); rerender(); }));
      }
      if (options.afterQuestion) options.afterQuestion(q, target);
    };
    Engine.layout(stage, answers).forEach((block) => {
      if (block.parallel) {
        const group = el('div', 'wizard-parallel');
        group.appendChild(el('p', 'source-refs', 'Estas preguntas son independientes: contéstalas en el orden que quieras.'));
        block.questions.forEach((q) => drawQuestion(group, q));
        wrap.appendChild(group);
      } else {
        block.questions.forEach((q) => drawQuestion(wrap, q));
      }
    });
  }

  // Avisos de las reglas del workflow que se activan en una etapa (cortes de
  // flujo, reglas de dados y reglas que dependen de la tirada). `context`: variables
  // que no son respuestas (p.ej. { finalRoll: 9 }).
  function renderStageRules(wrap, workflow, stageId, answers, context) {
    const rules = Engine.activeRules(workflow, stageId, answers, context);
    rules.flowCuts.forEach((c) => wrap.appendChild(el('p', 'pending-note', `Se corta esta etapa: ${c.sourceText}`)));
    rules.diceRules.forEach((r) => wrap.appendChild(el('p', 'pending-note', `Regla de dados: ${r.sourceText}`)));
    rules.rollDependentRules.forEach((r) => wrap.appendChild(el('p', 'pending-note', `Regla: ${r.sourceText}`)));
    return rules;
  }

  root.AppStageQuestions = { renderStageQuestions, renderStageRules };
})(typeof window !== 'undefined' ? window : globalThis);
