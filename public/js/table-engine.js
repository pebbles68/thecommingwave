// Motor genérico de resolución de tablas (roadmap Fase 5, AGENTS.md §5.3/§6).
//
// Este módulo NO conoce ningún dominio de combate concreto: solo sabe interpretar
// el esquema de data/tables/page-NN.json (rowAxis/columnAxis/cells/cellLegend/
// alternateLabels/alternateLabelSets/reusesTable) y resolver, dados un valor de
// fila y un valor de columna, qué celda corresponde — sin que ninguna tabla
// concreta tenga lógica propia en este archivo ni en la UI que lo consuma.
//
// Funciona tanto en Node (tests, `require`) como en el navegador (`<script>`,
// sin módulos ES, igual que public/js/app.js) mediante el patrón UMD-lite de
// abajo.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TableEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class TableEngineError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'TableEngineError';
      this.code = code;
      this.details = details || {};
    }
  }

  // Una etiqueta de eje puede ser: ".", "24+", "7~8", "<=1", ">=3", "0.5", "9*"
  // (asterisco = anotación de fuente sin explicar, se ignora para el cálculo)
  // o una etiqueta no numérica (p.ej. placeholders "c1".."c25" en columnAxis.values
  // de tablas needsReview, o una etiqueta textual real).
  function parseRangeToken(raw) {
    if (raw === null || raw === undefined) {
      return { kind: 'skip', raw };
    }
    const token = String(raw).trim();
    if (token === '' || token === '.') {
      return { kind: 'skip', raw };
    }

    const hasAsterisk = token.endsWith('*');
    const clean = hasAsterisk ? token.slice(0, -1).trim() : token;

    if (clean.startsWith('<=')) {
      const value = Number(clean.slice(2));
      if (!Number.isNaN(value)) return { kind: 'max', value, raw, hasAsterisk };
    }
    if (clean.startsWith('>=')) {
      const value = Number(clean.slice(2));
      if (!Number.isNaN(value)) return { kind: 'min', value, raw, hasAsterisk };
    }
    if (clean.endsWith('+')) {
      const value = Number(clean.slice(0, -1));
      if (!Number.isNaN(value)) return { kind: 'min', value, raw, hasAsterisk };
    }
    if (clean.includes('~')) {
      const parts = clean.split('~');
      if (parts.length === 2) {
        const min = Number(parts[0]);
        const max = Number(parts[1]);
        if (!Number.isNaN(min) && !Number.isNaN(max)) {
          return { kind: 'range', min, max, raw, hasAsterisk };
        }
      }
    }
    const asNumber = Number(clean);
    if (clean !== '' && !Number.isNaN(asNumber)) {
      return { kind: 'exact', value: asNumber, raw, hasAsterisk };
    }
    // Etiqueta no numérica: placeholder ("c1") o texto real. Solo permite
    // coincidencia exacta de texto, nunca coincidencia numérica.
    return { kind: 'label', value: clean.toLowerCase(), raw, hasAsterisk };
  }

  function isPlaceholderScheme(labels) {
    return labels.length > 0 && labels.every((l) => /^c\d+$/i.test(String(l).trim()));
  }

  // Busca en `labels` (array de etiquetas de eje, en el orden de `cells`) el
  // índice que coincide con `input` (número o texto). Nunca adivina: si hay
  // más de una coincidencia numérica (esquema mal formado) o ninguna, informa
  // explícitamente en vez de devolver un índice arbitrario.
  function matchAxisIndex(labels, input) {
    const parsed = labels.map(parseRangeToken);

    if (typeof input === 'string') {
      const normalized = input.trim().toLowerCase();
      const exactLabelIndex = labels.findIndex((l) => String(l).trim().toLowerCase() === normalized);
      if (exactLabelIndex !== -1) {
        return { index: exactLabelIndex, matches: [exactLabelIndex] };
      }
    }

    const numericInput = typeof input === 'number' ? input : Number(String(input).trim());
    if (Number.isNaN(numericInput)) {
      return { index: -1, matches: [] };
    }

    const exact = [];
    const ranged = [];
    const bounded = [];
    parsed.forEach((token, idx) => {
      if (token.kind === 'exact' && token.value === numericInput) exact.push(idx);
      else if (token.kind === 'range' && numericInput >= token.min && numericInput <= token.max) ranged.push(idx);
      else if (token.kind === 'min' && numericInput >= token.value) bounded.push(idx);
      else if (token.kind === 'max' && numericInput <= token.value) bounded.push(idx);
    });

    const matches = exact.length ? exact : (ranged.length ? ranged : bounded);
    if (matches.length === 0) return { index: -1, matches: [] };
    return { index: matches[0], matches };
  }

  // Obtiene el array de etiquetas de un eje para un esquema dado. `schemeKey`
  // es opcional; sin él se usa siempre `axis.values` (el esquema canónico).
  function pickAxisLabels(axis, schemeKey) {
    if (!schemeKey) return axis.values;
    if (axis.alternateLabels && axis.alternateLabels[schemeKey]) return axis.alternateLabels[schemeKey];
    if (axis.alternateLabelSets && axis.alternateLabelSets[schemeKey]) return axis.alternateLabelSets[schemeKey];
    if (axis.variants && axis.variants[schemeKey]) return axis.variants[schemeKey];
    throw new TableEngineError(
      'unknown_scheme',
      `El eje no tiene un esquema de etiqueta "${schemeKey}" (alternateLabels/alternateLabelSets/variants).`,
      { schemeKey, availableSchemes: listSchemes(axis) }
    );
  }

  function listSchemes(axis) {
    return Object.keys(axis.alternateLabels || {})
      .concat(Object.keys(axis.alternateLabelSets || {}))
      .concat(Object.keys(axis.variants || {}));
  }

  // Resuelve una celda de `table` para los valores de fila/columna dados.
  // No aplica ningún modificador ni lógica de dominio: solo localiza fila,
  // columna y celda, y expande la leyenda si corresponde.
  //
  // opts.rowScheme / opts.columnScheme: obligatorios cuando el eje canónico
  // (`values`) es un placeholder no numérico (p.ej. "c1".."cN" en tablas
  // needsReview con varios esquemas de columna superpuestos) — nunca se elige
  // un esquema por defecto en ese caso, para no inventar cuál es el correcto.
  function resolveCell(table, rowValue, columnValue, opts) {
    opts = opts || {};

    const rowLabels = pickAxisLabels(table.rowAxis, opts.rowScheme);
    if (!opts.rowScheme && isPlaceholderScheme(rowLabels)) {
      throw new TableEngineError(
        'scheme_required',
        `La tabla "${table.id}" tiene un eje de fila con etiquetas placeholder; hay que indicar rowScheme explícitamente.`,
        { axis: 'row', availableSchemes: listSchemes(table.rowAxis) }
      );
    }

    const columnLabels = pickAxisLabels(table.columnAxis, opts.columnScheme);
    if (!opts.columnScheme && isPlaceholderScheme(columnLabels)) {
      throw new TableEngineError(
        'scheme_required',
        `La tabla "${table.id}" tiene un eje de columna con etiquetas placeholder; hay que indicar columnScheme explícitamente.`,
        { axis: 'column', availableSchemes: listSchemes(table.columnAxis) }
      );
    }

    const rowMatch = matchAxisIndex(rowLabels, rowValue);
    if (rowMatch.index === -1) {
      throw new TableEngineError('row_out_of_range', `Ningún valor de fila coincide con "${rowValue}".`, { rowValue, rowLabels });
    }
    if (rowMatch.matches.length > 1) {
      throw new TableEngineError('row_ambiguous', `Más de una fila coincide con "${rowValue}"; el eje no es válido.`, { rowValue, matches: rowMatch.matches });
    }

    const columnMatch = matchAxisIndex(columnLabels, columnValue);
    if (columnMatch.index === -1) {
      throw new TableEngineError('column_out_of_range', `Ningún valor de columna coincide con "${columnValue}".`, { columnValue, columnLabels });
    }
    if (columnMatch.matches.length > 1) {
      throw new TableEngineError('column_ambiguous', `Más de una columna coincide con "${columnValue}"; el eje no es válido.`, { columnValue, matches: columnMatch.matches });
    }

    const row = table.cells[rowMatch.index];
    if (!row) {
      throw new TableEngineError('missing_row', `La tabla "${table.id}" no tiene fila de datos en el índice ${rowMatch.index}.`, { rowIndex: rowMatch.index });
    }
    const rawCell = row[columnMatch.index];
    if (rawCell === undefined) {
      throw new TableEngineError('missing_column', `La tabla "${table.id}" no tiene columna de datos en el índice ${columnMatch.index}.`, { columnIndex: columnMatch.index });
    }

    const legendText = rawCell !== null && table.cellLegend && Object.prototype.hasOwnProperty.call(table.cellLegend, rawCell)
      ? table.cellLegend[rawCell]
      : null;

    return {
      tableId: table.id,
      rowIndex: rowMatch.index,
      columnIndex: columnMatch.index,
      rowLabel: rowLabels[rowMatch.index],
      columnLabel: columnLabels[columnMatch.index],
      rawCell,
      isMissingData: rawCell === null,
      legendText,
      displayValue: rawCell === null ? null : (legendText || String(rawCell))
    };
  }

  // Desplaza un índice de columna hacia la izquierda `shift` posiciones,
  // saltando las columnas "skip" (etiqueta ".", vacía o inexistente —
  // mismo criterio que ya usa `parseRangeToken`) sin que cuenten para el
  // desplazamiento. Generaliza la regla "los números negativos indican el
  // número de columnas a ajustar a la izquierda... se saltan las columnas
  // de '.'" que aparece en varias páginas de data/tables/ (p.ej.
  // page-05.json, page-09.json) como modificador de Fuerza de Ataque, pero
  // que ningún wizard aplicaba todavía (roadmap Fase 5, gap detectado en
  // la reconciliación de 2026-09-27). No conoce ningún dominio de combate:
  // solo opera sobre el array de etiquetas ya resuelto por el llamador.
  // Si el desplazamiento se sale por la izquierda, se detiene en el índice
  // 0 (columna más a la izquierda), igual que indica la fuente.
  function shiftColumnIndex(labels, startIndex, shift) {
    if (!(shift > 0)) return startIndex;
    let index = startIndex;
    let remaining = shift;
    while (remaining > 0 && index > 0) {
      index -= 1;
      const token = parseRangeToken(labels[index]);
      if (token.kind === 'skip') continue;
      remaining -= 1;
    }
    return index;
  }

  // Traza legible del cálculo, para el panel "Cómo se ha calculado" (AGENTS.md §9.2).
  function describeResolution(table, result) {
    const rowPart = `Fila: ${table.rowAxis.label} = ${result.rowLabel} (índice ${result.rowIndex})`;
    const colPart = `Columna: ${table.columnAxis.label} = ${result.columnLabel} (índice ${result.columnIndex})`;
    const cellPart = result.isMissingData
      ? 'Celda: sin dato transcrito; el cálculo se detiene aquí (regla pendiente de validar).'
      : `Celda: ${result.displayValue}`;
    return [rowPart, colPart, cellPart];
  }

  // Localiza una tabla por id dentro de una página ya cargada. Si la página
  // solo reutiliza la tabla de otra (reusesTable), devuelve una instrucción de
  // redirección en vez de resolverla aquí: este módulo no hace I/O (fs/fetch),
  // así que quien lo use decide cómo cargar `definedIn`.
  function findTableInPage(pageData, tableId) {
    if (pageData.tables) {
      const found = pageData.tables.find((t) => t.id === tableId);
      if (found) return { table: found };
    }
    if (pageData.reusesTable && pageData.reusesTable.id === tableId) {
      return { redirect: { file: pageData.reusesTable.definedIn, id: pageData.reusesTable.id } };
    }
    return null;
  }

  return {
    TableEngineError,
    parseRangeToken,
    matchAxisIndex,
    pickAxisLabels,
    isPlaceholderScheme,
    shiftColumnIndex,
    resolveCell,
    describeResolution,
    findTableInPage
  };
});
