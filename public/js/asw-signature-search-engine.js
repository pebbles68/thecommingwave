// Motor puro de la Búsqueda por Diferencia de Firma (roadmap Fase 13;
// data/workflows/13_busqueda_asw_apoyo.json, etapa `signature_search`, +
// data/tables/page-33.json). Cita el Decision Book §9.14.2 (profundidad y
// alcance), §9.15.1 (marcos del Valor ASW) y §9.15.3 (Pasos 1-7, pp. 214-218).
// Sin "hoja de ayuda" con ejemplo resuelto: las pruebas verifican la mecánica
// contra la regla citada y contra celdas leídas de la página 33 impresa
// (Tablas-de-combate 5.pdf).
//
//   Paso 2  Firma (SIG) del objetivo, +1 si está "En Movimiento".
//   Paso 3  Columna: submarino buscador -> su SIG (8 o más = "8+"); unidad de
//           superficie -> forma del marco de su Valor ASW + profundidad.
//   Paso 4  En esa columna se busca la celda que corresponde a la Firma del
//           objetivo; la fila de esa celda da el rango de descubrimiento a la
//           derecha.
//   Paso 5  La columna del rango la elige lo que activó la búsqueda.
//   Paso 6  La distancia elige HEX (misma casilla) o ADYAC (adyacente).
//   Paso 7  1d10 dentro del rango = éxito; "." o fuera de rango = fallo.
//
// El rango de descubrimiento se interpreta como en la Búsqueda Aérea ASW
// (`AswAirSearchEngine.parseDiscoveryRange`): "N" = solo la tirada N, "N+" =
// tirada N o más.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./asw-air-search-engine.js'));
  } else {
    root.AswSignatureSearchEngine = factory(root.AswAirSearchEngine);
  }
})(typeof self !== 'undefined' ? self : this, function (AswAirSearchEngine) {
  'use strict';

  class AswSignatureSearchError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'AswSignatureSearchError';
      this.code = code;
    }
  }

  const FRAMES = ['1', '2', '3'];
  const DEPTHS = ['P4', 'P3', 'P2'];
  const TRIGGER_GROUP = { routine_movement: 'rango1', after_attack_evasion: 'rango2' };

  function toSignature(value, label) {
    const n = Number(value);
    if (value === '' || value === undefined || value === null || Number.isNaN(n) || n < 0) {
      throw new AswSignatureSearchError('invalid_signature', `${label} debe ser un número ≥ 0.`);
    }
    return n;
  }

  // Paso 3: etiqueta de la columna de condiciones en `columnAxis.values`.
  function searchColumnLabel({ searcherKind, searcherSignature, frame, depth }) {
    if (searcherKind === 'submarine') {
      const s = toSignature(searcherSignature, 'El Valor de Firma del submarino que busca');
      return s >= 8 ? 'sub-8+' : `sub-${s}`;
    }
    if (searcherKind !== 'surface') {
      throw new AswSignatureSearchError('invalid_searcher', 'El buscador debe ser una unidad de superficie o submarina.');
    }
    if (!FRAMES.includes(String(frame))) throw new AswSignatureSearchError('invalid_frame', 'Elige la forma del marco del Valor ASW (1, 2 o 3).');
    if (!DEPTHS.includes(depth)) throw new AswSignatureSearchError('invalid_depth', 'Elige la profundidad (P4, P3 o P2).');
    return `sup${frame}-${depth.toLowerCase()}`;
  }

  // Restricciones de la búsqueda (ids de `signature_search.restrictions` del
  // workflow, cuyo texto se muestra tal cual).
  //   - Alta Velocidad no puede hacer Búsquedas de Rutina (§9.15.3 Paso 1).
  //   - Alcance 1 hex solo en Aguas Profundas; con marco cerrado, solo la propia
  //     casilla (§9.14.2, §9.15.1). `depth` es la del objetivo.
  function checkRestrictions({ searcherKind, trigger, highSpeed, frameClosed, depth, distance }) {
    const blocking = [];
    if (searcherKind === 'surface' && (highSpeed === true || highSpeed === 'yes') && trigger === 'routine_movement') {
      blocking.push('high_speed_no_routine');
    }
    if (distance === 'adjacent') {
      if (searcherKind === 'surface' && (frameClosed === true || frameClosed === 'yes')) blocking.push('closed_frame_own_hex');
      if (depth !== 'P4') blocking.push('adjacent_needs_deep_water');
    }
    return { allowed: blocking.length === 0, blocking };
  }

  // Pasos 2-7. `table` = tabla `asw-signature-difference-search` de page-33.json.
  function resolveSignatureSearch(table, tableEngine, input) {
    const { trigger, distance, targetSignature, targetMoving, roll } = input;
    const group = TRIGGER_GROUP[trigger];
    if (!group) throw new AswSignatureSearchError('invalid_trigger', 'Indica qué activó la búsqueda (Rutina/Movimiento/Emboscada o Después del Ataque/Antes de la Evasión).');
    if (distance !== 'hex' && distance !== 'adjacent') throw new AswSignatureSearchError('invalid_distance', 'Indica si el objetivo está en la misma casilla o en una adyacente.');
    const sig = toSignature(targetSignature, 'El Valor de Firma del objetivo');
    const effectiveSignature = sig + (targetMoving === true || targetMoving === 'yes' ? 1 : 0);

    const columnLabel = searchColumnLabel(input);
    const columnIndex = table.columnAxis.values.indexOf(columnLabel);
    if (columnIndex === -1) throw new AswSignatureSearchError('unknown_column', `La tabla no tiene la columna "${columnLabel}".`);

    // Paso 4: fila cuya celda, en la columna del buscador, corresponde a la Firma.
    const columnCells = table.cells.map((r) => r[columnIndex]);
    const match = tableEngine.matchAxisIndex(columnCells, effectiveSignature);
    const base = { columnLabel, effectiveSignature, targetSignature: sig, group };
    if (match.index === -1) {
      return Object.assign(base, { noRow: true, rowIndex: null, searchCell: null, cell: null, range: null, success: false });
    }
    const rowIndex = match.index;
    const rangeColumnLabel = `${group}-${distance === 'hex' ? 'hex' : 'adyac'}`;
    const searchCell = tableEngine.resolveCell(table, rowIndex, columnLabel);
    const cell = tableEngine.resolveCell(table, rowIndex, rangeColumnLabel);
    const range = AswAirSearchEngine.parseDiscoveryRange(cell.rawCell);
    const natural = roll === '' || roll === undefined || roll === null ? null : Number(roll);
    const success = natural !== null && range.kind !== 'none' && natural >= range.min && natural <= range.max;
    return Object.assign(base, { noRow: false, rowIndex, rangeColumnLabel, searchCell, cell, range, roll: natural, success });
  }

  return { AswSignatureSearchError, FRAMES, DEPTHS, searchColumnLabel, checkRestrictions, resolveSignatureSearch };
});
