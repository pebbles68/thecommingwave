// Motor puro de Combate Cercano Terrestre (roadmap Fase 9, primer vertical
// slice: data/workflows/01_combate_cercano_terrestre.json + data/tables/page-02.json).
// A diferencia del ataque guiado a superficie (Fase 7), no existe ninguna
// "hoja de ayuda" con un ejemplo resuelto para este dominio — las funciones de
// abajo están citadas contra el Decision Book §8.7 (Resolución del Combate
// Terrestre) directamente, incluido su ejemplo textual (§8.7.7, unidad Clase
// B con Tamaño de Fuerza 6), que sirve de caso reproducible en las pruebas.
//
// Funciona tanto en Node (tests) como en el navegador, mismo patrón UMD-lite
// que el resto de motores del proyecto.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GroundCloseCombatEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class GroundCloseCombatError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'GroundCloseCombatError';
      this.code = code;
      this.details = details || {};
    }
  }

  // Tabla 1 (page-02.json#ground-close-combat-result): Valor de Ataque +
  // Apoyo de Combate (columna, esquema "activo"/"pasivo" según quién inició
  // el combate — Decision Book §8.7.1) cruzado con la tirada 1d10 (fila) da
  // los Puntos de Impacto antes de guerra electrónica.
  function resolveCombatResult(table, TableEngine, { roll, attackValue, isActive }) {
    return TableEngine.resolveCell(table, String(roll), String(attackValue), {
      columnScheme: isActive ? 'activo' : 'pasivo'
    });
  }

  // Tabla 2 (page-02.json#ground-close-combat-electronic-warfare): solo se
  // consulta cuando los Valores Electrónicos más altos de ambos bandos
  // difieren (Decision Book §8.7.5); la llamada la controla quien invoca
  // esta función, comprobando electronicDifference > 0 antes.
  function resolveElectronicWarfareAdvantage(table, TableEngine, { roll, electronicDifference }) {
    return TableEngine.resolveCell(table, String(roll), String(electronicDifference));
  }

  // Decision Book §8.7.5: "El bando que obtiene ventaja en guerra electrónica
  // duplica su resultado final de Puntos de Impacto." `hasAdvantage` lo decide
  // el llamador (si el bando que se está resolviendo es el de mayor Valor
  // Electrónico) — esta función solo aplica el x2 si la tabla lo concede Y
  // ese bando es quien tiene la ventaja.
  function applyElectronicWarfareAdvantage(impactPoints, ewResult, hasAdvantage) {
    if (!hasAdvantage || !ewResult || ewResult.rawCell !== 'x2') return impactPoints;
    return impactPoints * 2;
  }

  // Tabla 3 (page-02.json#ground-close-combat-casualties): Nivel de reacción
  // (Clase A-D) + Tamaño de Fuerza antes del combate da el umbral de
  // "Derrota" — un valor único (Clases C/D) o un rango mín~máx (Clases A/B,
  // con elección — Decision Book §8.7.7).
  function resolveDefeatThreshold(table, TableEngine, { reactionLevel, forceSize }) {
    const result = TableEngine.resolveCell(table, reactionLevel, String(forceSize));
    return { result, parsed: TableEngine.parseRangeToken(result.rawCell) };
  }

  // Decision Book §8.7.7 (cita literal): "Cuando... la unidad sufre un daño
  // igual a su 'Valor Mínimo de Derrota', puede optar por dejar de soportar
  // daño y ser 'Derrotada'... Si el daño sufrido... alcanza el 'Valor Máximo
  // de Derrota', la unidad no puede continuar soportando daño y es
  // 'Derrotada' forzosamente." Para Clases C/D (umbral único): "cuando el
  // daño sufrido en el combate alcanza su valor de 'Derrota'... son
  // 'Derrotadas'" — sin elección, reproducido aquí también por
  // data/workflows/01_combate_cercano_terrestre.json#casualties.specialRules
  // ("Al alcanzar o superar los umbrales de derrota se aplica el estado
  // Derrotada"). El ejemplo textual del propio Decision Book (Clase B,
  // Tamaño de Fuerza 6 → umbral "2~3"): 2 puntos de daño = elección; 3 = forzosa.
  // Devuelve `canChooseDefeat`/`forcedDefeat` como HECHOS sobre el umbral
  // (¿está disponible la opción? ¿es obligatoria?) — nunca decide por el
  // jugador. `forcedDefeat` implica Derrotada automáticamente; cuando solo
  // `canChooseDefeat` es cierto, la unidad NO está Derrotada todavía: es el
  // jugador quien decide (Decision Book §8.7.7), y el wizard debe preguntarlo
  // en vez de asumir una respuesta.
  function evaluateGroundUnitDefeat(damage, thresholdParsed) {
    if (thresholdParsed.kind === 'skip') {
      return { canChooseDefeat: false, forcedDefeat: false };
    }
    if (thresholdParsed.kind === 'exact') {
      return { canChooseDefeat: false, forcedDefeat: damage >= thresholdParsed.value };
    }
    if (thresholdParsed.kind === 'range') {
      const forced = damage >= thresholdParsed.max;
      const canChoose = !forced && damage >= thresholdParsed.min;
      return { canChooseDefeat: canChoose, forcedDefeat: forced };
    }
    throw new GroundCloseCombatError(
      'unsupported_threshold',
      `Umbral de Derrota "${thresholdParsed.raw}" no reconocido (kind="${thresholdParsed.kind}").`,
      { thresholdParsed }
    );
  }

  return {
    GroundCloseCombatError,
    resolveCombatResult,
    resolveElectronicWarfareAdvantage,
    applyElectronicWarfareAdvantage,
    resolveDefeatThreshold,
    evaluateGroundUnitDefeat
  };
});
