// Motor del wizard de combate (roadmap Fase 7, vertical slice: ataque guiado
// contra superficie). Funciones puras que interpretan las respuestas de un
// wizard sobre las `questions`/`effects` ya declaradas en
// data/workflows/07_ataque_antibuque_guiado.json, y encadenan las tablas de
// data/tables/page-21.json y page-22.json usando table-engine.js.
//
// Mecánica verificada contra el golden test real (roadmap Fase 7):
// data/scenarios/golden-antiship-guided.json, transcrito de
// "TCW_-_Hoja_de_Ayuda_-_Ataque_Guiado_Superficie.pdf". Esa hoja reveló dos
// correcciones respecto a una primera versión de este motor (ver
// docs/rules/known-ambiguities.md):
//
// 1. La tabla "Mod. V.E.F." (page-21.json#antiship-guided-vef-modifier) NO
//    da un ajuste al propio V.E.F.: da un modificador que se resta/suma a LA
//    TIRADA que hace el atacante en esta misma etapa (siempre 1d10, según la
//    hoja). Esa tirada ya modificada es la que se cruza con la tabla de
//    multiplicador (page-21.json#antiship-guided-attack-multiplier), cuyo eje
//    de fila está literalmente etiquetado "V.E.F. final (tras Mod. V.E.F.)"
//    pero en la práctica es la tirada modificada, no un V.E.F. recalculado.
// 2. La tabla final (page-22.json#antiship-guided-final-damage) tiene una
//    doble lectura de fila (`alternateLabels.par_ec`/`sub_sup`) que hay que
//    elegir según el método de ataque: subsónico/supersónico usan `sub_sup`;
//    balístico/espacio cercano usan `par_ec`. Un wizard que ignore este
//    esquema resuelve la fila equivocada.
//
// La etapa "Defensa Aérea de Área" (disparo contra el propio avión atacante,
// tabla page-18.json#area-air-defense-concentrated-damage) y la mecánica
// exacta de "Interceptación de Munición" (tirada modificada por rendimiento/
// detección, cruzada con el valor de defensa aérea PROPIO de cada unidad que
// intercepta) también se confirmaron contra el golden test — ver
// `resolveInterceptionShot` más abajo.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CombatWizardEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class CombatWizardError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'CombatWizardError';
      this.code = code;
      this.details = details || {};
    }
  }

  // Suma los efectos `type: "modifier"` de las opciones elegidas en `answers`
  // (mapa questionId -> optionValue) cuyo `target` coincide, y devuelve el
  // total junto con la traza de qué pregunta/opción aportó cada valor.
  function sumModifiers(questions, answers, target) {
    let total = 0;
    const trace = [];
    (questions || []).forEach((q) => {
      const chosenValue = answers[q.id];
      if (chosenValue === undefined) return;
      const option = (q.options || []).find((o) => o.value === chosenValue);
      if (!option) return;
      (option.effects || []).forEach((eff) => {
        if (eff.type === 'modifier' && eff.target === target) {
          total += eff.value;
          trace.push({ questionId: q.id, prompt: q.prompt, optionLabel: option.label, value: eff.value });
        }
      });
    });
    return { total, trace };
  }

  // Recoge los efectos `type: "rule"` de las opciones elegidas (reglas
  // textuales como "no_interception" o "only_same_hex_defenders"), para
  // mostrarlas como contexto sin intentar aplicarlas numéricamente.
  function collectRuleEffects(questions, answers) {
    const rules = [];
    (questions || []).forEach((q) => {
      const chosenValue = answers[q.id];
      if (chosenValue === undefined) return;
      const option = (q.options || []).find((o) => o.value === chosenValue);
      if (!option) return;
      (option.effects || []).forEach((eff) => {
        if (eff.type === 'rule') {
          rules.push({ questionId: q.id, prompt: q.prompt, optionLabel: option.label, ruleValue: eff.value, cutsStage: !!eff.cutsStage });
        }
      });
    });
    return rules;
  }

  // Busca, entre las preguntas ya respondidas, el primer efecto de un `type`
  // (y `target` opcional) dado — usado para leer el efecto `dice` de la
  // etapa de método de ataque, que no es un `modifier` acumulable.
  function findFirstEffect(questions, answers, type, target) {
    for (const q of questions || []) {
      const chosenValue = answers[q.id];
      if (chosenValue === undefined) continue;
      const option = (q.options || []).find((o) => o.value === chosenValue);
      if (!option) continue;
      const eff = (option.effects || []).find((e) => e.type === type && (!target || e.target === target));
      if (eff) return { questionId: q.id, prompt: q.prompt, optionLabel: option.label, effect: eff };
    }
    return null;
  }

  // Interpreta literalmente el texto de una celda de "Mod. V.E.F." (page-21):
  // "+7"/"+3"/"-8"/"-9" son un delta; "-V.E.F." es la instrucción impresa de
  // restar el propio V.E.F. bruto (equivalente a un delta = -rawVef).
  function parseVefModifierCell(cellText, rawVef) {
    if (cellText === null || cellText === undefined) return { kind: 'unknown', raw: cellText };
    const text = String(cellText).trim();
    if (/^-V\.E\.F\.$/i.test(text)) return { kind: 'self', delta: -rawVef, raw: text };
    const deltaMatch = text.match(/^([+-]\d+)$/);
    if (deltaMatch) return { kind: 'delta', delta: Number(deltaMatch[1]), raw: text };
    return { kind: 'unknown', raw: text };
  }

  // "x3" -> 3. Devuelve null (no un número inventado) si el texto no coincide.
  function parseMultiplierCell(cellText) {
    const match = String(cellText || '').trim().match(/^x(\d+)$/i);
    return match ? Number(match[1]) : null;
  }

  // Resuelve el modificador que la tabla "Mod. V.E.F." aplica a la TIRADA del
  // atacante (no al V.E.F.) dado el V.E.F. bruto (Valor Electrónico más alto
  // de la flota + modificadores de distancia/detección).
  function resolveVefRollModifier(vefModifierTable, tableEngine, rawVef) {
    const modResult = tableEngine.resolveCell(vefModifierTable, rawVef, 'V.E.F.');
    const parsed = parseVefModifierCell(modResult.rawCell, rawVef);
    return { rawVef, modResult, parsedModifier: parsed, rollModifier: parsed.delta };
  }

  // Con la tirada de V.E.F. (siempre 1d10, según la hoja de ayuda) ya
  // modificada por `resolveVefRollModifier`, resuelve el multiplicador de
  // ataque. El eje de fila de esa tabla está etiquetado "V.E.F. final" pero
  // el valor que se cruza es la tirada modificada, no un V.E.F. recalculado.
  function resolveAttackMultiplier(attackMultiplierTable, tableEngine, modifiedRoll) {
    const multiplierResult = tableEngine.resolveCell(attackMultiplierTable, modifiedRoll, 'Mult.');
    return { multiplierResult, multiplier: parseMultiplierCell(multiplierResult.rawCell) };
  }

  // `diceFormulas` es el objeto ya cargado de data/rules/dice-formulas.json
  // (correcciones03.md COR03-002: antes una constante `DICE_FORMULAS`
  // incrustada aquí — el mismo vocabulario de IDs de tirada lo usan varios
  // workflows, no solo el de ataque guiado a superficie). Nunca inventa una
  // fórmula: si el ID no está declarado en los datos, devuelve `null`.
  function describeDiceFormula(diceFormulas, diceValue) {
    return (diceFormulas && diceFormulas.formulas && diceFormulas.formulas[diceValue]) || null;
  }

  // `rolls` son los valores ya elegidos por el usuario (del propio rowAxis.values
  // de la tabla final, nunca generados con una convención de caras de dado
  // inventada por este motor).
  function resolveRoll(formulaInfo, rolls) {
    const numericRolls = rolls.map(Number);
    if (formulaInfo.pick === 'single') return numericRolls[0];
    if (formulaInfo.pick === 'highest') return Math.max.apply(null, numericRolls);
    if (formulaInfo.pick === 'lowest') return Math.min.apply(null, numericRolls);
    throw new CombatWizardError('unknown_dice_pick', `Regla de tirada desconocida: ${formulaInfo.pick}`);
  }

  // Esquema de fila de la tabla final (page-22.json) que corresponde a cada
  // método de ataque. El caso subsónico está confirmado contra el golden
  // test ("SUB/SUP"). El caso balístico/espacio cercano ("PAR/E.C.") no
  // tiene golden test propio, pero quedó confirmado el 2026-09-27 al
  // verificar la tabla a 600 DPI (docs/rules/known-ambiguities.md, entrada
  // resuelta): la cabecera impresa de la tabla agrupa literalmente "PAR"
  // (Parabólica) y "E.C." (Espacio Cercano) bajo una misma columna de
  // "MÉTODO DE ATAQUE", separada de "SUB"/"SUP" — coincidiendo exactamente
  // con los valores/etiquetas ya usados por la pregunta `method` del
  // workflow 07 ("ballistic"/"Trayectoria balística",
  // "near_space"/"Trayectoria de espacio cercano"). No es ya una analogía
  // de nombre sin verificar: es la estructura impresa de la propia tabla.
  // Leído de `methodOptions[].finalTableRowScheme` (correcciones03.md
  // COR03-002: antes una constante `FINAL_TABLE_ROW_SCHEME_BY_METHOD`
  // incrustada aquí — mismo patrón ya establecido por
  // `damagePerImpactForMethod`/COR02-006 para el mismo array de opciones).
  function finalTableRowScheme(method, methodOptions) {
    const opt = methodOptions.find((o) => o.value === method);
    return (opt && opt.finalTableRowScheme) || null;
  }

  // Aplica el tope de "Interceptación Más Allá del Horizonte" (Decision Book
  // §6.5.2, localizado con pdftotext -layout el 2026-09-27 — ver
  // data/tables/page-04.json#tables[0].columnAxis.beyondHorizonColumns y
  // data/rules/decision-book-excerpts.json#defensa-antiaerea): sin el efecto
  // de alerta temprana, la unidad antiaérea como máximo solo puede usar la
  // columna más a la derecha de la sección "No más allá del horizonte" —
  // NO que la interceptación se cancele, sino que el valor de Defensa Aérea
  // efectivo para resolver la celda se topa hacia abajo.
  //
  // Alcance deliberadamente limitado (AGENTS.md §14, no inventar/mezclar):
  // solo cubre el esquema "Convencional" ya modelado hoy por el wizard (el
  // valor de A.A. propio se usa directamente como columna 1-9). El esquema
  // de "consumo Bajo" (`alternateLabelSets.low`) lo selecciona el llamador de
  // `resolveInterceptionShot` con `consumption: 'low'`; el tope se calcula
  // igual porque trabaja sobre el valor de A.A., no sobre la etiqueta de columna.
  function applyBeyondHorizonCap(interceptionTable, { defenderAaValue, earlyWarning }) {
    const columnAxis = interceptionTable.columnAxis;
    const beyondHorizonColumns = columnAxis.beyondHorizonColumns || [];
    const aaKey = String(defenderAaValue);
    if (earlyWarning || !beyondHorizonColumns.includes(aaKey)) {
      return { effectiveValue: defenderAaValue, capped: false };
    }
    const nonBeyondValues = columnAxis.values.map(Number).filter((v) => !beyondHorizonColumns.includes(String(v)));
    const cappedValue = Math.max(...nonBeyondValues);
    return { effectiveValue: cappedValue, capped: true, originalValue: defenderAaValue };
  }

  // Resuelve un disparo de Interceptación de Munición (page-04.json /
  // munition-interception-standard, reutilizada en page-20 para el ataque
  // guiado a superficie): la fila NO es "Valor del marcador de munición"
  // (pese a como está etiquetado el eje) sino la tirada del interceptor ya
  // modificada por rendimiento/detección; la columna es el valor de Defensa
  // Aérea PROPIO de la unidad que dispara (no el valor agrupado de la
  // flota). Confirmado con las dos unidades del golden test: BS-20381
  // (A.A.=2) y BS-1164 (A.A.=4) con la misma tirada modificada dan -1 y -2
  // respectivamente. Ver docs/rules/known-ambiguities.md.
  //
  // `earlyWarning` (opcional, por defecto false = sin alerta temprana) aplica
  // el tope de `applyBeyondHorizonCap` antes de resolver la celda.
  //
  // `consumption` (opcional, por defecto 'high' = columnas Alto 1-9): con
  // 'low' (consumo Bajo, correcciones03.md COR03-005 / known-ambiguities.md
  // "Interceptación Terminal") la columna se lee con el esquema
  // `alternateLabelSets.low` (2~3, 4~5, 6~7, 8+ — mismo patrón que
  // page-18.json). Con consumo Bajo un A.A. de 1 NO puede interceptar
  // (Tablas-de-combate 5.pdf p.4: no existe columna Bajo para él): se devuelve
  // `result: null` y `notEligible: true` en vez de lanzar o inventar una celda.
  function resolveInterceptionShot(interceptionTable, tableEngine, { roll, modifierTotal, defenderAaValue, earlyWarning, consumption }) {
    const modifiedRoll = roll + modifierTotal;
    const horizonCap = applyBeyondHorizonCap(interceptionTable, { defenderAaValue, earlyWarning });
    if (consumption !== 'low') {
      const result = tableEngine.resolveCell(interceptionTable, modifiedRoll, horizonCap.effectiveValue);
      return { modifiedRoll, result, horizonCap };
    }
    try {
      const result = tableEngine.resolveCell(interceptionTable, modifiedRoll, horizonCap.effectiveValue, { columnScheme: 'low' });
      return { modifiedRoll, result, horizonCap, consumption: 'low' };
    } catch (err) {
      if (err && err.code === 'column_out_of_range') {
        return { modifiedRoll, result: null, horizonCap, consumption: 'low', notEligible: true, reason: 'Con consumo Bajo hace falta Defensa Aérea >= 2 para intentar interceptar (Tablas-de-combate 5.pdf p.4).' };
      }
      throw err;
    }
  }

  // Interceptación de Munición contra un ataque BALÍSTICO (Decision Book
  // §6.5.1 viñeta "ataque balístico" y §6.9.2 "Interceptación Terminal", que
  // describen lo mismo: unidad antiaérea con capacidad antimisiles en la misma
  // celda que el objetivo, SOLO consumo Bajo, 2d10 tomando el MENOR). Es la
  // fila "Terminal" que cita §6.9.2: la tabla impresa no tiene ninguna fila con
  // ese nombre — su fila de consumo Bajo está rotulada "Convencional /
  // Penetración / BM" (Tablas-de-combate 5.pdf p.4), y §6.5.1 impone Bajo
  // para BM (ver docs/rules/known-ambiguities.md, 2026-10-04). No mezcla esta
  // regla en `resolveInterceptionShot` (AGENTS.md §14): es una función aparte
  // que el llamador usa solo contra ataques balísticos.
  //
  // Dos reglas de "sin efecto": §6.9.2 Alta Velocidad — si la tirada natural
  // (antes de modificadores; aquí la MENOR de las dos) es 0, la interceptación
  // falla —; y §6.5.4 nota — si el resultado MODIFICADO es 0 (o menos), no
  // tiene efecto. `noEffect` las agrega; el motivo concreto va en `reason`.
  function resolveBallisticMunitionInterceptionShot(interceptionTable, tableEngine, { roll, roll2, modifierTotal, defenderAaValue, earlyWarning }) {
    if (roll === undefined || roll2 === undefined) {
      throw new Error('La interceptación de munición contra un ataque balístico tira 2d10: faltan roll y/o roll2 (Decision Book §6.5.1).');
    }
    const naturalRoll = Math.min(roll, roll2);
    const modifiedRoll = naturalRoll + modifierTotal;
    // Las dos reglas de "sin efecto" se comprueban ANTES de consultar la tabla:
    // un resultado modificado <= 0 puede caer fuera del eje de fila (p.ej. -1).
    let reason = null;
    if (checkHighSpeedInterceptionFailure(naturalRoll)) {
      reason = 'Interceptación de Alta Velocidad (Decision Book §6.9.2): la tirada natural es 0 → la interceptación falla.';
    } else if (modifiedRoll <= 0) {
      reason = 'Decision Book §6.5.4: contra ataques balísticos, un resultado modificado de 0 no tiene efecto.';
    }
    if (reason) {
      return { naturalRoll, modifiedRoll, result: null, consumption: 'low', noEffect: true, reason };
    }
    const shot = resolveInterceptionShot(interceptionTable, tableEngine, { roll: naturalRoll, modifierTotal, defenderAaValue, earlyWarning, consumption: 'low' });
    return Object.assign({}, shot, { naturalRoll, noEffect: !!shot.notEligible, reason: shot.notEligible ? shot.reason : null });
  }

  // Suma las reducciones de una lista de disparos de interceptación ya
  // resueltos con `resolveInterceptionShot`, ignorando las celdas sin dato
  // numérico (".", "NO_DISPARAR") en vez de tratarlas como 0 silenciosamente
  // sin dejar traza — la caller decide cómo mostrarlas.
  function sumInterceptionReductions(shots) {
    let total = 0;
    shots.forEach((shot) => {
      if (shot.noEffect || !shot.result) return;
      const value = Number(shot.result.rawCell);
      if (!Number.isNaN(value)) total += value;
    });
    return total;
  }

  // Resuelve la "Interceptación Final" (Decision Book §6.4.1-§6.4.2,
  // data/tables/page-07.json#ground-unguided-final-interception, reutilizada
  // en page-23.json para antiship_unguided): una única tirada (1d10) se
  // consulta contra la tabla dos veces cuando hay unidades de ambos consumos
  // ("el lado defensor aplica el resultado del lanzamiento de dados a AMBOS
  // modos de disparo y suma los puntos de impacto") — una vez con el A.A.
  // TOTAL de consumo Bajo, otra con el A.A. TOTAL de consumo Alto, sumando
  // los impactos de puntos resultantes. Si un total no aplica (0 unidades de
  // ese consumo), se omite esa consulta en vez de resolverla contra columna 0
  // (que sí tendría una celda real, normalmente ".", pero no representa "no
  // hay unidades" sino "A.A. total = 0").
  //
  // El límite superior de la tabla ("18+") ya cubre por sí solo la regla "si
  // el valor antiaéreo total excede el límite de la tabla, se considera igual
  // al valor límite" (parseRangeToken lo resuelve como bucket abierto) — no
  // hace falta ningún tope adicional, a diferencia de `applyBeyondHorizonCap`.
  //
  // Sin golden test oficial (ninguna hoja de ayuda ejemplifica esta mecánica
  // con un caso numérico completo): verificado contra la cita y contra los
  // datos ya transcritos, no contra una partida real — documentado así en
  // roadmap.md/development_status.md, mismo criterio que
  // `resolveAttackValueColumnShift` (Fase 5).
  function resolveFinalInterceptionShot(finalInterceptionTable, tableEngine, { roll, aaTotalLow, aaTotalHigh }) {
    const shots = {};
    if (aaTotalLow !== undefined && aaTotalLow !== null && aaTotalLow > 0) {
      shots.low = tableEngine.resolveCell(finalInterceptionTable, roll, aaTotalLow);
    }
    if (aaTotalHigh !== undefined && aaTotalHigh !== null && aaTotalHigh > 0) {
      shots.high = tableEngine.resolveCell(finalInterceptionTable, roll, aaTotalHigh);
    }
    let totalImpacts = 0;
    Object.keys(shots).forEach((key) => {
      const value = Number(shots[key].rawCell);
      if (!Number.isNaN(value)) totalImpacts += value;
    });
    return { roll, shots, totalImpacts };
  }

  // Resuelve un disparo de "Contraataque a Baja Altura" (Decision Book
  // §6.6.1-§6.6.2; data/tables/page-06.json#low-altitude-counterattack
  // ["Unidad principal"] / page-14.json#anti-radiation-low-altitude-counterattack
  // ["Sistema de Defensa Aérea"] / page-22.json#surface-artillery-low-altitude-counterattack
  // ["Artillería Naval"] — mismo mecanismo, distinto esquema de columna según
  // el tipo de unidad defensora): el defensor confirma su A.A. total UNA vez
  // para todo el contraataque (fijo, no recalculado por disparo) y lanza 1d10
  // POR CADA unidad de vuelo bajo atacante (el orden lo decide el defensor);
  // si los puntos de impacto obtenidos ≥ el Valor de Protección del atacante,
  // esa unidad es destruida directamente — más simple que Interceptación Final
  // (sin paso de "dañada, luego tirada de hundimiento"). El límite superior de
  // cada tabla ("8+"/"2+"/"5+") ya cubre de forma nativa la regla "si el A.A.
  // excede el límite, se usa la columna límite" (parseRangeToken, bucket
  // abierto), igual que en Interceptación Final.
  //
  // Verificado visualmente contra la fuente a 600 DPI (páginas 6 y 22 de
  // Tablas-de-combate 5.pdf, 2026-09-27): ambas tablas coinciden carácter a
  // carácter con la transcripción ya existente en data/tables/. Sin golden
  // test oficial de extremo a extremo: el único ejemplo numérico de la
  // Decision Book (§6.4, nota 18 — 4 aviones de baja altura vs. una formación
  // con "un total de 8 puntos de artillería naval") NO reproduce sus propios
  // resultados si se usa A.A.=8 contra la tabla ya transcrita (y verificada a
  // 600 DPI) de la página 22; SÍ los reproduce exactamente con A.A.=4 — lo que
  // sugiere que el ejemplo describe la composición INICIAL de la formación
  // (8 puntos, 4 buques), no el A.A. superviviente ya reducido tras el ataque
  // previo (que el propio texto no restablece antes del contraataque). Esta
  // es una inferencia razonada, no una cita textual — documentada así en vez
  // de presentarla como un hecho confirmado; ver test correspondiente.
  function resolveLowAltitudeCounterattackShot(table, tableEngine, { roll, defenderAaTotal, attackerProtection }) {
    const result = tableEngine.resolveCell(table, roll, defenderAaTotal);
    const impacts = Number(result.rawCell);
    const validImpacts = Number.isNaN(impacts) ? 0 : impacts;
    const destroyed = validImpacts >= attackerProtection;
    return { roll, result, impacts: validImpacts, destroyed };
  }

  // "Interceptación de Alta Velocidad" (Decision Book §6.9.2): en cualquier
  // interceptación de misiles balísticos (Fase Media —un tipo de Defensa
  // Aérea de Área— o Terminal —un tipo de Interceptación de Munición—), si la
  // tirada NATURAL (antes de aplicar cualquier modificador) es 0, la
  // interceptación falla automáticamente, sin excepción. Regla genuinamente
  // nueva de §6.9 — el resto de esa sección (marco de elegibilidad: símbolo
  // especial, red de alerta de misiles; Fase Media/Terminal) reutiliza
  // mecánicas ya construidas (`resolveAreaAirDefenseAttackReduction`,
  // `resolveInterceptionShot`) y no necesita una tabla ni una función nueva.
  //
  // No integrado todavía en `resolveAreaAirDefenseAttackReduction`/
  // `resolveInterceptionShot`: esta regla NO aplica a la interceptación de
  // munición convencional (no balística), así que mezclarla en esas
  // funciones genéricas violaría "no mezclar reglas básicas y de expansión
  // sin indicarlo" (AGENTS.md §14) — el llamador debe comprobarla primero,
  // solo cuando el objetivo sea un ataque balístico.
  function checkHighSpeedInterceptionFailure(naturalRoll) {
    return Number(naturalRoll) === 0;
  }

  // Resuelve el "Disparo en Área" (data/tables/page-18.json, workflow
  // independiente 06_defensa_aerea_area.json): un disparo de la Flota contra
  // el propio avión atacante, no una reducción del Valor de Ataque de la
  // munición (esa es la etapa homónima, pero distinta, del workflow 07 — ver
  // docs/rules/known-ambiguities.md). Fila = tirada (1d10, sin modificador
  // declarado en la fuente); columna = Valor de Combate Aéreo concentrado,
  // leído con el esquema "low" (consumo Bajo) o el canónico "Alto" según
  // `consumption`. Verificado contra el golden test: roll 4 × A.A. agrupado
  // 6 (consumo Alto) -> "3" puntos de daño.
  function resolveAreaAirDefenseShot(areaAirDefenseTable, tableEngine, { roll, aaValue, consumption }) {
    const columnScheme = consumption === 'low' ? 'low' : undefined;
    return tableEngine.resolveCell(areaAirDefenseTable, roll, aaValue, { columnScheme });
  }

  // Resuelve la reducción de Valor de Ataque de la etapa "area_air_defense"
  // del workflow 07/02/04 (data/tables/page-03.json#ground-guided-area-air-defense,
  // reutilizada en páginas 11/19) — mecánica DISTINTA del "Disparo en Área"
  // de arriba, con el mismo nombre. Solo aplica cuando la munición está
  // marcada CM o BM (Decision Book §5.12 paso 2; ver el propio archivo de
  // datos y docs/rules/known-ambiguities.md, resuelto 2026-09-27). El
  // llamador ya debe haber comprobado esa condición: esta función asume que
  // sí aplica y solo resuelve la mecánica de tirada/tabla.
  //
  // Tirada: 1d10, o 2d10 tomando el resultado MENOR si la munición usa
  // trayectoria de espacio cercano (Decision Book §6.3.2) — `roll`/`roll2`.
  // Modificador: se suma a la tirada base antes de consultar la tabla
  // (`modifierTotal`, ya calculado por el llamador con `sumModifiers` sobre
  // las preguntas attacker_detected/near_space_trajectory). El resultado
  // modificado es la fila; la columna es el Valor de Defensa Aérea agrupado
  // de las unidades que disparan (`groupedAaValue`). La celda ES la
  // reducción a aplicar directamente al Valor de Ataque (§6.3.3).
  function resolveAreaAirDefenseAttackReduction(table, tableEngine, { roll, roll2, modifierTotal, groupedAaValue }) {
    const baseRoll = (roll2 !== undefined && roll2 !== null && roll2 !== '') ? Math.min(roll, roll2) : roll;
    const modifiedRoll = baseRoll + modifierTotal;
    const rowValue = modifiedRoll <= -1 ? '<=-1' : String(modifiedRoll);
    const result = tableEngine.resolveCell(table, rowValue, groupedAaValue);
    return { baseRoll, modifiedRoll, rowValue, result };
  }

  // Asigna un impacto a una unidad superviviente de la flota, siguiendo la
  // convención impresa en la propia hoja de flota del tablero (TWC Flotas
  // Castellano.docx, inventariada en data/sources/sources.json#flotas-castellano-docx:
  // "Tira los dados para determinar la posición de las naves de superficie;
  // ordena de 0 a 9 de izquierda a derecha, saltando los espacios vacíos; si
  // no hay naves a la derecha, vuelve a empezar desde la izquierda para
  // continuar el conteo"): equivale a `roll % supervivientes.length`,
  // respetando su orden. Verificado contra el golden test: tirada 4, 3
  // buques (BS-1155, BS-20381, BS-1164) -> 4 % 3 = 1 -> BS-20381 (segundo de
  // la lista), coincide exactamente con "el buque BS-20381 es el dañado".
  function assignImpactTarget(roll, survivingShips) {
    if (!survivingShips || !survivingShips.length) return null;
    const index = roll % survivingShips.length;
    return { ship: survivingShips[index], index };
  }

  // Daño que causa CADA punto de impacto antibuque, según el método de
  // ataque (Decision Book §5.6.5) — leído de `methodOptions[].damagePerImpact`
  // (correcciones.02.md COR02-006: antes incrustado aquí como Subsónico=1/
  // Supersónico=2 fijos). Balístico/Espacio Cercano declaran `damagePerImpact:
  // null` en el propio workflow (causan 6 SI la unidad tiene símbolo de
  // escudo en su Valor de Protección, o hunden la unidad directamente al
  // primer impacto si NO lo tiene — una mecánica cualitativamente distinta,
  // no un multiplicador más, y que requiere saber si cada buque tiene escudo,
  // un dato que este proyecto no modela todavía). Esta función nunca inventa
  // un valor: si el método no tiene opción reconocida, o su
  // `damagePerImpact` es `null`/`undefined`, devuelve `null`.
  function damagePerImpactForMethod(method, methodOptions) {
    const opt = methodOptions.find((o) => o.value === method);
    return (opt && opt.damagePerImpact !== undefined && opt.damagePerImpact !== null) ? opt.damagePerImpact : null;
  }

  // Aplica los impactos disponibles a la unidad asignada: absorbe puntos de
  // impacto continuamente hasta que el DAÑO total (impactos × daño por
  // impacto) ≥ su Protección (Decision Book §5.6.5); en ese momento queda
  // "dañada" y consume exactamente los impactos necesarios para llegar a ese
  // umbral (redondeando hacia arriba: un impacto "sobrante" que solo cubre
  // parte del último punto de Protección igual se consume entero). Si los
  // impactos disponibles no bastan, no se daña y no se consumen contra ella
  // — mismo principio que la hoja aplica al remanente final ("se desprecia
  // ese punto restante al ser insuficiente para dañar"), confirmado también
  // por el propio Decision Book §5.6.5 ("no es necesario resolver más
  // efectos de impacto antibuque").
  //
  // `damagePerImpact` (opcional, por defecto 1 = Subsónico, el único método
  // verificado por el golden test): pasar el valor de
  // `damagePerImpactForMethod` para Supersónico (2); NO llamar esta función
  // para Balístico/Espacio Cercano (devuelve `null`, ver esa función).
  function applyImpactsToShip(ship, impactsAvailable, damagePerImpact) {
    const perImpact = damagePerImpact || 1;
    const impactsNeeded = Math.ceil(ship.protection / perImpact);
    if (impactsAvailable >= impactsNeeded) {
      return { damaged: true, absorbed: impactsNeeded, remainingImpacts: impactsAvailable - impactsNeeded };
    }
    return { damaged: false, absorbed: 0, remainingImpacts: impactsAvailable };
  }

  // Tirada de hundimiento (1d10) tras dañar una unidad: se hunde si el
  // resultado es menor o igual que su Valor de Hundimiento (impreso en el
  // lado dañado del counter, p.ej. "≤4"). Verificado: tirada 4, umbral 4 ->
  // se hunde, coincidiendo con "la unidad sufre un daño crítico y se hunde".
  function checkSinking(roll, sinkingThreshold) {
    return roll <= sinkingThreshold;
  }

  // ---------- Selección de unidad/plan (correcciones.md COR-007) ----------
  //
  // Deriva del plan de ataque ya transcrito (data/ammunition/attack-plans|
  // naval-plans|special-unit-plans) lo que antes se preguntaba a mano en el
  // wizard: método de ataque, Valor de Ataque y alcance. Nunca infiere un
  // dato ausente (AGENTS.md §14): si el plan no tiene un icono de método
  // reconocido, o el valor de carga solicitado no está transcrito (p.ej.
  // `heavy: null`, "sin variante de carga pesada para esa munición" — ver
  // docs/rules/known-ambiguities.md), estas funciones devuelven `null` en vez
  // de asumir un valor.

  // Icono de munición -> método de ataque guiado y daño por impacto
  // (correcciones.02.md COR02-006): `methodOptions` es
  // `data/workflows/07_ataque_antibuque_guiado.json#stages[attack_method]
  // .questions[method].options` — cada opción ya declara su
  // `munitionIconRef` (el icono que aparece en los planes de munición
  // transcritos, p.ej. `munition_parabolic` para Balístico — confirmado por
  // la correspondencia 1:1 con Decision Book §6.9.1, que llama "parabólico"
  // a la trayectoria balística) y su `damagePerImpact` (Decision Book §5.6.5;
  // `null` para Balístico/Espacio Cercano — ver la nota de esas opciones en
  // el propio workflow). Ya no viven incrustados aquí como constantes: el
  // motor solo sabe buscarlos en las opciones que recibe. Un plan sin ningún
  // `munitionIconRef` reconocido (p.ej. `munition_unguided`) no es válido
  // para ESTE wizard guiado.
  function derivePlanMethod(plan, methodOptions) {
    const icons = (plan && plan.icons) || [];
    for (let i = 0; i < icons.length; i++) {
      const opt = methodOptions.find((o) => o.munitionIconRef === icons[i]);
      if (opt) return opt.value;
    }
    return null;
  }

  // Construye las opciones de plan de ataque ANTIBUQUE guiado de una unidad
  // ya transcrita. `unit.plans` tiene la forma `{antiShip:{A:.., B:..}, ...}`
  // en attack-plans/naval-plans, o un mapa plano de letras cuando
  // `unit.domainSplit === false` (special-unit-plans, p.ej. helicópteros).
  // Un plan solo se ofrece si tiene un método guiado reconocido y un valor
  // numérico transcrito ("no ofrecer planes con transcripción parcial como
  // completos" — correcciones.md COR-007, restricciones de dominio).
  //
  // `resoluble` (correcciones.02.md COR02-005): Balístico/Espacio Cercano
  // dependen de si el buque objetivo tiene la "marca de Escudo" en su Valor
  // de Protección (Decision Book §9.x) — un dato real del juego, pero que
  // este proyecto no tiene transcrito para ninguna unidad todavía (ver
  // `damagePerImpactForMethod`). En vez de ofrecerlos como si el wizard
  // pudiera resolverlos de principio a fin y descubrirlo recién en el
  // resultado, se marcan aquí como no resolubles — el llamador decide qué
  // hacer (el wizard los excluye del selector; la ayuda de munición, que no
  // usa esta función, los sigue mostrando igual que cualquier otro plan).
  function buildAntishipPlanOptions(unit, methodOptions) {
    const plansSource = unit.domainSplit === false ? (unit.plans || {}) : ((unit.plans || {}).antiShip || {});
    return Object.keys(plansSource)
      .map((letter) => {
        const plan = plansSource[letter];
        const method = derivePlanMethod(plan, methodOptions);
        return { letter, plan, method, resoluble: !!method && damagePerImpactForMethod(method, methodOptions) !== null };
      })
      .filter((opt) => opt.method && opt.plan.munition && opt.plan.full);
  }

  // Valor de Ataque numérico de un plan ya elegido, según carga pesada/ligera
  // (`loadFormat: "dual"`, orden confirmado en known-ambiguities.md:
  // `heavy` = primer número impreso = Carga pesada, `light` = segundo =
  // Carga ligera) o valor único (`loadFormat: "single"`), y según se use el
  // lado completo o dañado de la unidad. `null` si el dato no está transcrito
  // (`heavy: null` = "sin variante de carga pesada para esa munición", visto
  // en F-5E/FA-50/KF-16C — nunca se asume 0).
  function derivePlanAttackValue(plan, { loadType, damaged } = {}) {
    if (!plan) return null;
    const side = damaged ? plan.damaged : plan.full;
    if (!side) return null;
    if (plan.loadFormat === 'dual') {
      const value = loadType === 'light' ? side.light : side.heavy;
      return (value === null || value === undefined) ? null : value;
    }
    return (side.damage === null || side.damage === undefined) ? null : side.damage;
  }

  // Alcance transcrito del plan (mismo lado completo/dañado que el valor de
  // ataque; en la práctica es igual en ambos lados, pero se lee del lado
  // correspondiente en vez de asumirlo).
  function derivePlanRange(plan, { damaged } = {}) {
    if (!plan) return null;
    const side = damaged ? plan.damaged : plan.full;
    return (side && side.range !== undefined && side.range !== null) ? side.range : null;
  }

  // Límites min/max de un valor de bucket con alguna de las 3 formas que usan
  // los workflows de ataque antibuque: `"N_M"` es un rango cerrado [N,M],
  // `"Nplus"` es abierto por arriba [N,∞), y un número suelto `"N"` (p.ej.
  // `attack_intensity#distance` del workflow 08: `"0"`/`"1"`/`"2plus"`) es un
  // valor exacto [N,N]. `null` si `value` no sigue ninguno de los 3 formatos
  // (no se asume un rango).
  function parseDistanceBucketValue(value) {
    const plusMatch = /^(\d+)plus$/.exec(value);
    if (plusMatch) return { min: Number(plusMatch[1]), max: Infinity };
    const rangeMatch = /^(\d+)_(\d+)$/.exec(value);
    if (rangeMatch) return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
    const exactMatch = /^(\d+)$/.exec(value);
    if (exactMatch) return { min: Number(exactMatch[1]), max: Number(exactMatch[1]) };
    return null;
  }

  // Bucket de distancia de ataque de la etapa `fleet_electronic_resistance`
  // del workflow 07, derivado de la distancia real en hexágonos en vez de
  // preguntarse por separado cuando ya se conoce (COR-007). `bucketOptions`
  // (correcciones.02.md COR02-006: antes los límites 2/5 estaban incrustados
  // aquí) es `data/workflows/07_ataque_antibuque_guiado.json#stages
  // [fleet_electronic_resistance].questions[attack_distance].options` — los
  // 3 buckets ("0_2"/"3_5"/"6plus") y sus límites se leen directamente de
  // los `value` ya transcritos, sin repetirlos como números fijos.
  function attackDistanceBucket(distanceHexes, bucketOptions) {
    const d = Number(distanceHexes);
    if (distanceHexes === '' || distanceHexes === null || distanceHexes === undefined || Number.isNaN(d) || d < 0) return null;
    for (let i = 0; i < bucketOptions.length; i++) {
      const range = parseDistanceBucketValue(bucketOptions[i].value);
      if (range && d >= range.min && d <= range.max) return bucketOptions[i].value;
    }
    return null;
  }

  // Comprueba que la distancia de ataque no exceda el alcance del plan
  // elegido (COR-007, diseño punto 4: "evaluar la distancia antes de entrar
  // en la resolución"). `planRange === null` (dato no transcrito) nunca se
  // trata como "sin límite": se considera fuera de alcance, para no dejar
  // pasar una combinación que no se puede verificar.
  function isDistanceWithinRange(distanceHexes, planRange) {
    const d = Number(distanceHexes);
    if (distanceHexes === '' || distanceHexes === null || distanceHexes === undefined || Number.isNaN(d) || d < 0) return false;
    if (planRange === null || planRange === undefined) return false;
    return d <= planRange;
  }

  // ---------- Derivación de propiedades en modo validado (correcciones.02.md
  // COR02-005 reduce el alcance original de COR02-004: con los planes
  // Balístico/Espacio Cercano ya excluidos del modo validado —ver
  // buildAntishipPlanOptions#resoluble—, `near_space_trajectory` y la alerta
  // temprana automática por Misil Balístico ya no llegan a plantearse ahí;
  // solo quedan por derivar `munition_marked_cm_or_bm` y
  // `short_range_restriction`) ----------

  // munition_marked_cm_or_bm (workflow 07#area_air_defense): si el plan de
  // ataque ya elegido lleva un marcador CM/LF-CM/SUP.CM (icono, de la lista
  // `cmBmMarkerIcons` del propio workflow, o el campo `cruiseMissile`
  // transcrito) o su método derivado lo implica (`methodOptions[].
  // impliesCmBmMarker`, p.ej. Balístico = Misil Balístico), el dato ya se
  // conoce por el plan — no hace falta preguntarlo. Devuelve siempre un
  // booleano (nunca `null`): a diferencia del Valor de Ataque o el alcance,
  // esto no depende de carga/estado, así que es siempre derivable a partir
  // de un plan ya resuelto.
  //
  // Correcciones03.md COR03-002: antes `CM_BM_MARKER_ICONS` (constante) y
  // `method === 'ballistic'` (comparación literal) estaban incrustados aquí;
  // ambos vienen ahora de data/workflows/07_ataque_antibuque_guiado.json
  // (`cmBmMarkerIcons` a nivel de workflow, `impliesCmBmMarker` por opción de
  // `methodOptions` — mismo patrón que `damagePerImpactForMethod`/COR02-006).
  function derivePlanCmOrBmMarker(plan, method, methodOptions, cmBmMarkerIcons) {
    if (!plan) return false;
    const opt = methodOptions.find((o) => o.value === method);
    if (opt && opt.impliesCmBmMarker) return true;
    const icons = plan.icons || [];
    if (icons.some((icon) => cmBmMarkerIcons.includes(icon))) return true;
    return !!plan.cruiseMissile;
  }

  // short_range_restriction (workflow 07#munition_interception): "¿La
  // distancia de ataque es 1 (o 2 en Misión de Área)?". En modo validado la
  // distancia de ataque ya se conoce (introducida en "Datos base"), así que
  // solo hace falta preguntar el tipo de misión cuando la distancia es
  // EXACTAMENTE 2 — el único caso realmente ambiguo (con distancia 1 la
  // restricción siempre aplica; con distancia > 2 nunca aplica, sea cual sea
  // el tipo de misión). AGENTS.md §9.2: "solicitar únicamente el contexto
  // realmente desconocido", no modelar un campo de "tipo de misión"
  // persistente que ninguna otra parte del wizard necesita.
  //
  // Devuelve `'yes'`/`'no'` cuando es derivable sin ambigüedad, o `null`
  // cuando hace falta la respuesta de `isAreaMission` (`'yes'`/`'no'`/`''`)
  // para desambiguar el caso de distancia 2.
  function deriveShortRangeRestriction(distanceHexes, isAreaMission) {
    const d = Number(distanceHexes);
    if (distanceHexes === '' || distanceHexes === null || distanceHexes === undefined || Number.isNaN(d)) return null;
    if (d === 1) return 'yes';
    if (d > 2) return 'no';
    if (isAreaMission === 'yes') return 'yes';
    if (isAreaMission === 'no') return 'no';
    return null;
  }

  return {
    CombatWizardError,
    sumModifiers,
    collectRuleEffects,
    findFirstEffect,
    parseVefModifierCell,
    parseMultiplierCell,
    resolveVefRollModifier,
    resolveAttackMultiplier,
    describeDiceFormula,
    resolveRoll,
    finalTableRowScheme,
    applyBeyondHorizonCap,
    resolveInterceptionShot,
    resolveBallisticMunitionInterceptionShot,
    sumInterceptionReductions,
    resolveFinalInterceptionShot,
    resolveLowAltitudeCounterattackShot,
    checkHighSpeedInterceptionFailure,
    resolveAreaAirDefenseShot,
    resolveAreaAirDefenseAttackReduction,
    assignImpactTarget,
    damagePerImpactForMethod,
    applyImpactsToShip,
    checkSinking,
    derivePlanMethod,
    buildAntishipPlanOptions,
    derivePlanAttackValue,
    derivePlanRange,
    attackDistanceBucket,
    isDistanceWithinRange,
    derivePlanCmOrBmMarker,
    deriveShortRangeRestriction
  };
});
