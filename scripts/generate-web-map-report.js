/*
 * Genera el informe Word del mapa funcional de la web TCW Assistant.
 *
 * Uso:
 *   node scripts/generate-web-map-report.js
 *
 * Requiere el servidor en http://localhost:8080, Playwright y docx.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType
} = require('docx');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'docs', 'analisis-mapa-web');
const SHOTS_DIR = path.join(OUTPUT_DIR, 'capturas');
const OUTPUT_DOCX = path.join(OUTPUT_DIR, 'analisis-mapa-web-thecommingwave.docx');
const BASE_URL = process.env.TCW_REPORT_BASE_URL || 'http://localhost:8080/';

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
const turn = readJson('data/phases/turn-template.json');
const counters = readJson('data/counters/factor-map.json');
const workflows = readJson('data/workflows/index.json');
const tablesIndex = readJson('data/tables/index.json');
const registry = readJson('data/units/registry-index.json');
const routing = readJson('data/routing/table-routing.json');

const countryLabels = { us: 'Estados Unidos', ch: 'China', jp: 'Japón', kr: 'Corea del Sur', kp: 'Corea del Norte', ru: 'Rusia' };
const ammoCategories = [
  { id: 'aviones', label: 'Aviones tácticos', dir: 'attack-plans', keys: ['units'] },
  { id: 'naval', label: 'Buques y submarinos', dir: 'naval-plans', keys: ['surfaceShips', 'submarines'] },
  { id: 'especiales', label: 'Unidades especiales / helicópteros / artillería', dir: 'special-unit-plans', keys: ['units'] }
];

function ammoCounts() {
  const rows = [];
  for (const [country, countryLabel] of Object.entries(countryLabels)) {
    for (const cat of ammoCategories) {
      const data = readJson(`data/ammunition/${cat.dir}/${country}.json`);
      const units = cat.keys.flatMap((key) => data[key] || []);
      rows.push({ country, countryLabel, category: cat.id, categoryLabel: cat.label, count: units.length });
    }
  }
  return rows;
}

const ammoSummary = ammoCounts();

function codeLink(label, code, route, behavior = 'Navegación interna por hash.') {
  return { label, code, route, behavior };
}

const screens = [
  {
    code: 'INI-001', title: 'Inicio', hash: '#/', implementation: 'public/js/app.js · renderHome()',
    summary: 'Portada y distribuidor principal de la aplicación. Presenta los siete accesos funcionales de primer nivel.',
    functionality: 'Permite entrar directamente en el turno, la consulta rápida, cualquiera de los tres asistentes implementados, la plantilla de fuerzas o el historial. No obliga a seguir una secuencia.',
    links: [
      codeLink('Turno guiado', 'TUR-001', '#/turno'), codeLink('Ayuda rápida', 'AYU-001', '#/ayuda'),
      codeLink('Wizard: ataque guiado a superficie', 'WIZ-001', '#/wizard/antiship-guided'),
      codeLink('Wizard: ataque antibuque no guiado', 'WIZ-002', '#/wizard/antiship-unguided'),
      codeLink('Wizard: combate cercano terrestre', 'WIZ-003', '#/wizard/ground-close-combat'),
      codeLink('Wizard: torpedos contra superficie', 'WIZ-004', '#/wizard/torpedo-surface'),
      codeLink('Wizard: ataque ASW (superficie y aéreas)', 'WIZ-005', '#/wizard/asw-surface-air'),
      codeLink('Wizard: ataque ASW (submarinos)', 'WIZ-008', '#/wizard/asw-submarine'),
      codeLink('Wizard: búsqueda aérea ASW', 'WIZ-009', '#/wizard/asw-air-search'),
      codeLink('Wizard: búsqueda por diferencia de firma', 'WIZ-013', '#/wizard/asw-signature-search'),
      codeLink('Wizard: reabastecimiento de campo del Ejército', 'WIZ-014', '#/wizard/army-resupply'),
      codeLink('Wizard: garantía logística', 'WIZ-015', '#/wizard/logistics-guarantee'),
      codeLink('Wizard: ataque terrestre guiado', 'WIZ-016', '#/wizard/ground-guided'),
      codeLink('Wizard: ataque terrestre no guiado', 'WIZ-017', '#/wizard/ground-unguided'),
      codeLink('Wizard: resultado del ataque terrestre', 'WIZ-018', '#/wizard/ground-attack-result'),
      codeLink('Wizard: asignación de objetivos BVR', 'WIZ-012', '#/wizard/air-intercept-targets'),
      codeLink('Wizard: combate aéreo BVR', 'WIZ-010', '#/wizard/air-combat-bvr'),
      codeLink('Wizard: combate aéreo cercano WVR', 'WIZ-011', '#/wizard/air-combat-wvr'),
      codeLink('Wizard: ataque antirradiación (ARM)', 'WIZ-006', '#/wizard/anti-radiation'),
      codeLink('Wizard: efectos del impacto antibuque', 'WIZ-007', '#/wizard/ship-impact-effects'),
      codeLink('Plantilla de fuerzas', 'UNI-001', '#/unidades'), codeLink('Historial de resoluciones', 'HIS-001', '#/historial')
    ]
  },
  {
    code: 'GLB-001', title: 'Panel global de ayuda rápida', hash: '#/', action: 'open-help', implementation: 'public/index.html + public/js/app.js · openHelpPanel()',
    summary: 'Diálogo modal accesible desde la cabecera de cualquier vista.',
    functionality: 'Ofrece búsqueda y acceso directo a las siete categorías de ayuda sin depender del punto del turno. Bloquea temporalmente el contenido de fondo mediante inert, confina el foco y se cierra con botón, fondo o Escape.',
    links: [codeLink('Buscar', 'BUS-001', '#/ayuda/buscar'), codeLink('Secuencia de turno y fases', 'SEC-001', '#/ayuda/secuencia'), codeLink('Detección', 'DET-001', '#/ayuda/deteccion'), codeLink('Combate por tipo', 'COM-001', '#/ayuda/combate'), codeLink('Tablas', 'TAB-001', '#/ayuda/tablas'), codeLink('Planes de ataque y municiones', 'MUN-001', '#/ayuda/municion'), codeLink('Leyenda de counters / fichas', 'CNT-001', '#/ayuda/counters'), codeLink('Reglas y extractos', 'REG-001', '#/ayuda/reglas')]
  },
  {
    code: 'TUR-001', title: 'Índice del turno', hash: '#/turno', implementation: 'public/js/views/turn.js · renderTurnIndex()',
    summary: 'Vista general del turno de juego, banda temporal y tres ocurrencias de proceso navegables.',
    functionality: 'Permite cambiar de banda, consultar la secuencia completa, abrir la plantilla y entrar libremente en el Proceso Estratégico o en cualquiera de los dos Procesos de Campaña. Muestra progreso informativo sin bloquear opciones.',
    links: [codeLink('Banda anterior / siguiente', 'TUR-001', '#/turno', 'Actualiza la banda en localStorage y vuelve a representar la misma pantalla.'), codeLink('Referencia completa', 'SEC-001', '#/ayuda/secuencia'), codeLink('Plantilla de fuerzas', 'UNI-001', '#/unidades'), codeLink('Proceso Estratégico', 'TUR-002-E1', '#/turno/proceso_estrategico/1'), codeLink('Proceso de Campaña 1', 'TUR-002-C1', '#/turno/proceso_campana/1'), codeLink('Proceso de Campaña 2', 'TUR-002-C2', '#/turno/proceso_campana/2')]
  },
  {
    code: 'TUR-002', title: 'Detalle de proceso', hash: '#/turno/proceso_campana/1', implementation: 'public/js/views/turn.js · renderProcess(processId, occurrence)',
    summary: 'Lista las fases que pertenecen a una ocurrencia concreta del proceso y su estado independiente.',
    functionality: 'Funciona como índice/checklist parcial. Cada fase se puede abrir sin prerrequisitos. Las fases opcionales pueden marcarse como omitidas y todas conservan progreso por banda y ocurrencia.',
    variants: ['TUR-002-E1 · Proceso Estratégico', 'TUR-002-C1 · Proceso de Campaña 1', 'TUR-002-C2 · Proceso de Campaña 2'],
    links: [codeLink('Cada tarjeta de fase', 'TUR-003-*', '#/turno/{processId}/{occurrence}/{phaseId}'), codeLink('Saltar fase opcional', 'TUR-002', 'misma ruta', 'Marca voluntariamente la fase como omitida; no bloquea otras fases.'), codeLink('Volver', 'TUR-001', '#/turno', 'Usa el historial del navegador.')]
  },
  {
    code: 'TUR-003', title: 'Detalle de fase', hash: '#/turno/proceso_campana/1/acciones_aereas', implementation: 'public/js/views/turn.js · renderPhase(processId, occurrence, phaseId)',
    summary: 'Presenta resumen, acciones, subfases, estado de resoluciones vinculadas y accesos contextuales.',
    functionality: 'Permite entrar en cualquier subfase, marcar la fase como terminada sin exigir completar las subfases y reanudar resoluciones pendientes cuando existen. Las fases sin subfases muestran directamente sus acciones y cierre.',
    links: [codeLink('Cada subfase', 'TUR-004-*', '#/turno/{processId}/{occurrence}/{phaseId}/{subphaseId}'), codeLink('Reanudar resolución pendiente', 'WIZ-00*', '#/wizard/{tipo}', 'Solo aparece cuando existe una resolución vinculada.'), codeLink('Plantilla de fuerzas', 'UNI-001', '#/unidades', 'Disponible en fases relacionadas con unidades.'), codeLink('Tablas', 'TAB-001', '#/ayuda/tablas'), codeLink('Detección', 'DET-001', '#/ayuda/deteccion'), codeLink('Reglas y extractos', 'REG-001', '#/ayuda/reglas'), codeLink('Counters', 'CNT-001', '#/ayuda/counters'), codeLink('Terminar fase', 'TUR-002-*', '#/turno/{processId}/{occurrence}', 'Marca progreso; solicita confirmación solo si hay trabajo activo que pudiera descartarse.')]
  },
  {
    code: 'TUR-004', title: 'Detalle de subfase', hash: '#/turno/proceso_campana/1/acciones_superficie/combate_superficie', implementation: 'public/js/views/turn.js · renderSubphase(processId, occurrence, phaseId, subId)',
    summary: 'Vista operativa de una subfase con explicación, ayudas relacionadas y cierre voluntario.',
    functionality: 'Explica la actividad de la subfase y muestra vínculos a los tipos de combate relacionados. Puede terminarse o abandonarse sin condicionar la entrada a otras subfases.',
    links: [codeLink('Combate contextual', 'COM-002-*', '#/ayuda/combate/{workflowId}'), codeLink('Tablas', 'TAB-001', '#/ayuda/tablas'), codeLink('Detección', 'DET-001', '#/ayuda/deteccion'), codeLink('Reglas y extractos', 'REG-001', '#/ayuda/reglas'), codeLink('Counters', 'CNT-001', '#/ayuda/counters'), codeLink('Terminar subfase', 'TUR-003-*', '#/turno/{processId}/{occurrence}/{phaseId}'), codeLink('Terminar fase', 'TUR-002-*', '#/turno/{processId}/{occurrence}')]
  },
  {
    code: 'AYU-001', title: 'Índice de ayuda rápida', hash: '#/ayuda', implementation: 'public/js/views/help.js · renderHelpIndex()',
    summary: 'Índice de búsqueda, categorías, favoritos y accesos recientes.',
    functionality: 'Centraliza la consulta independiente. Añadir o quitar favoritos modifica solo la presentación del índice y no el estado del turno.',
    links: [codeLink('Buscar', 'BUS-001', '#/ayuda/buscar'), codeLink('Secuencia', 'SEC-001', '#/ayuda/secuencia'), codeLink('Detección', 'DET-001', '#/ayuda/deteccion'), codeLink('Combate', 'COM-001', '#/ayuda/combate'), codeLink('Tablas', 'TAB-001', '#/ayuda/tablas'), codeLink('Municiones', 'MUN-001', '#/ayuda/municion'), codeLink('Counters', 'CNT-001', '#/ayuda/counters'), codeLink('Reglas', 'REG-001', '#/ayuda/reglas'), codeLink('Añadir/quitar favorito', 'AYU-001', 'misma ruta', 'Actualiza preferencias en localStorage.')]
  },
  {
    code: 'BUS-001', title: 'Buscador global', hash: '#/ayuda/buscar', implementation: 'public/js/views/help.js · renderSearch(rawQuery)',
    summary: 'Búsqueda transversal sobre unidades, municiones, combates, fichas, tablas y reglas.',
    functionality: 'Construye un índice desde los JSON del proyecto; la consulta se codifica en la URL. Cada resultado conserva el tipo y abre la pantalla funcional correspondiente.',
    links: [codeLink('Buscar', 'BUS-001', '#/ayuda/buscar/{consulta}'), codeLink('Resultado de unidad/munición', 'MUN-005-*', '#/ayuda/municion/{pais}/{categoria}/{unidad}'), codeLink('Resultado de combate', 'COM-002-*', '#/ayuda/combate/{workflowId}'), codeLink('Resultado de tabla', 'TAB-003/004-*', '#/ayuda/tablas/{fichero}[/{tabla}]'), codeLink('Resultado de ficha', 'CNT-003-*', '#/ayuda/counters/{categoria}/{plantilla}'), codeLink('Resultado de reglas', 'REG-001', '#/ayuda/reglas')]
  },
  {
    code: 'SEC-001', title: 'Secuencia de turno y fases', hash: '#/ayuda/secuencia', implementation: 'public/js/views/help.js · renderSecuenciaHelp()',
    summary: 'Referencia de las bandas temporales, procesos y secuencia transcrita de la hoja de turno.',
    functionality: 'Consulta de solo lectura; no cambia el progreso. Sirve como referencia completa desde el turno guiado o la ayuda global.',
    links: [codeLink('Volver', 'ORIGEN', 'history.back()', 'Regresa a la vista desde la que se abrió.')]
  },
  {
    code: 'DET-001', title: 'Referencia de detección', hash: '#/ayuda/deteccion', implementation: 'public/js/views/help.js · renderDeteccionHelp()',
    summary: 'Expone estados, terminología y reglas de detección aérea, naval, terrestre y electrónica.',
    functionality: 'Permite consultar la hoja de ayuda y abrir un resolutor determinista. Distingue detectable, oculto y estados de exposición.',
    links: [codeLink('Resolver detección', 'DET-002', '#/ayuda/deteccion/resolver'), codeLink('Volver', 'ORIGEN', 'history.back()')]
  },
  {
    code: 'DET-002', title: 'Índice de resolutores de detección', hash: '#/ayuda/deteccion/resolver', implementation: 'public/js/views/help.js · renderDetectionResolverIndex()',
    summary: 'Selector de ocho problemas de detección soportados.',
    functionality: 'Lleva a un formulario específico que pregunta únicamente las variables declaradas para el caso elegido.',
    links: [codeLink('Cada tipo de detección', 'DET-003-*', '#/ayuda/deteccion/resolver/{typeId}'), codeLink('Volver', 'DET-001', 'history.back()')]
  },
  {
    code: 'DET-003', title: 'Resolutor de detección', hash: '#/ayuda/deteccion/resolver/air-to-air', implementation: 'public/js/views/help.js · renderDetectionResolverDetail(typeId)',
    summary: 'Formulario de resolución con entradas, veredicto, explicación y referencias.',
    functionality: 'Recalcula inmediatamente el resultado con el motor de detección. Las ocho variantes comparten estructura, pero aplican preguntas y reglas diferentes.',
    variants: ['air-to-air', 'surface-vs-air', 'naval-detector-eligibility', 'ground-mobile', 'briefly-detectable', 'fixed-installation', 'ground-detector-eligibility', 'electronic'],
    links: [codeLink('Cambiar respuestas', 'DET-003', 'misma ruta', 'Actualiza estado en memoria y vuelve a representar el resultado.'), codeLink('Volver', 'DET-002', 'history.back()')]
  },
  {
    code: 'COM-001', title: 'Combate por tipo', hash: '#/ayuda/combate', implementation: 'public/js/views/help.js · renderCombateIndex()',
    summary: 'Índice de los 13 workflows de ataque/combate, agrupados por dominio.',
    functionality: 'Permite consultar el flujo explicativo de cualquier combate soportado sin iniciar necesariamente una resolución.',
    links: [codeLink('Cada workflow', 'COM-002-*', '#/ayuda/combate/{workflowId}'), codeLink('Volver', 'AYU-001', 'history.back()')]
  },
  {
    code: 'COM-002', title: 'Detalle de combate', hash: '#/ayuda/combate/antiship_guided', implementation: 'public/js/views/help.js · renderCombateDetail(workflowId)',
    summary: 'Representación explicativa de etapas, preguntas, reglas, cortes de flujo, dados y referencias del workflow.',
    functionality: 'Sirve de documentación del procedimiento. Cuando el workflow tiene asistente implementado ofrece iniciar la resolución; también enlaza sus tablas relacionadas.',
    links: [codeLink('Resolver con wizard (si existe)', 'WIZ-001/002/003', '#/wizard/{tipo}'), codeLink('Tabla relacionada', 'TAB-004-*', '#/ayuda/tablas/{fichero}/{tabla}'), codeLink('Volver', 'COM-001', 'history.back()')]
  },
  {
    code: 'TAB-001', title: 'Índice de tablas', hash: '#/ayuda/tablas', implementation: 'public/js/views/help.js · renderTablesIndex()',
    summary: 'Catálogo de las 33 páginas estructuradas del PDF de tablas de combate.',
    functionality: 'Permite localizar una página manualmente o utilizar el router de decisión para llegar a una tabla por tipo de acción.',
    links: [codeLink('Buscar tabla por tipo de combate', 'TAB-002', '#/ayuda/tablas/router'), codeLink('Cada página', 'TAB-003-*', '#/ayuda/tablas/{fileName}'), codeLink('Volver', 'AYU-001', 'history.back()')]
  },
  {
    code: 'TAB-002', title: 'Router de selección de tabla', hash: '#/ayuda/tablas/router', implementation: 'public/js/views/help.js · renderTableRouter(pathValues)',
    summary: 'Árbol de decisión que selecciona un workflow o tabla desde el tipo de objetivo y ataque.',
    functionality: 'Añade cada respuesta como segmento de URL, muestra el rastro de decisión y, al llegar a una hoja, ofrece tablas o wizard disponibles. Puede retroceder un paso o reiniciar.',
    links: [codeLink('Cada respuesta', 'TAB-002', '#/ayuda/tablas/router/{respuesta…}'), codeLink('Tabla resultante', 'TAB-004-*', '#/ayuda/tablas/{fichero}/{tabla}'), codeLink('Wizard resultante', 'WIZ-001/002/003', '#/wizard/{tipo}'), codeLink('Volver una pregunta', 'TAB-002', 'ruta sin el último segmento'), codeLink('Reiniciar', 'TAB-002', '#/ayuda/tablas/router')]
  },
  {
    code: 'TAB-003', title: 'Página de tablas', hash: '#/ayuda/tablas/page-02.json', implementation: 'public/js/views/help.js · renderTablesPage(fileName)',
    summary: 'Ficha de una página del documento fuente con sus tablas, notas y workflows relacionados.',
    functionality: 'Presenta las tablas disponibles en la página y deriva al visor calculable. Las páginas sin tabla propia explican su función o reutilización.',
    links: [codeLink('Workflow relacionado', 'COM-002-*', '#/ayuda/combate/{workflowId}'), codeLink('Cada tabla', 'TAB-004-*', '#/ayuda/tablas/{fileName}/{tableId}'), codeLink('Tabla reutilizada', 'TAB-004-*', '#/ayuda/tablas/{fichero}/{tabla}'), codeLink('Volver', 'TAB-001', 'history.back()')]
  },
  {
    code: 'TAB-004', title: 'Visor interactivo de tabla', hash: '#/ayuda/tablas/page-03.json/ground-guided-area-air-defense', implementation: 'public/js/views/help.js · renderTableViewer(fileName, tableId)',
    summary: 'Visualiza una tabla estructurada y permite seleccionar valores de fila y columna.',
    functionality: 'Calcula la intersección mediante el motor genérico, resalta columna, fila y celda final, y muestra notas y referencias. No usa la imagen como fuente del cálculo.',
    links: [codeLink('Cambiar entradas', 'TAB-004', 'misma ruta', 'Recalcula y resalta otra celda.'), codeLink('Volver', 'TAB-003-*', 'history.back()')]
  },
  {
    code: 'MUN-001', title: 'Índice de planes de ataque y munición', hash: '#/ayuda/municion', implementation: 'public/js/views/help.js · renderMunicionIndex()',
    summary: 'Selector de leyenda de iconos y de los seis países transcritos.',
    functionality: 'Abre la nomenclatura visual de munición o el catálogo de planes de un país.',
    links: [codeLink('Iconos y tipos de munición', 'MUN-002', '#/ayuda/municion/iconos'), ...Object.entries(countryLabels).map(([id, label]) => codeLink(label, `MUN-003-${id.toUpperCase()}`, `#/ayuda/municion/${id}`)), codeLink('Volver', 'AYU-001', 'history.back()')]
  },
  {
    code: 'MUN-002', title: 'Leyenda de iconos y tipos de munición', hash: '#/ayuda/municion/iconos', implementation: 'public/js/views/help.js · renderMunicionIconLegend()',
    summary: 'Catálogo visual de iconos de ataque, marcadores y tipos de munición.',
    functionality: 'Explica el significado de cada símbolo y permite ampliarlo con puntero o toque. Es una referencia visual, no un calculador.',
    links: [codeLink('Ampliar icono', 'MUN-002', 'misma ruta', 'Abre/cierra la ampliación en la propia vista.'), codeLink('Volver', 'MUN-001', 'history.back()')]
  },
  {
    code: 'MUN-003', title: 'Planes de un país', hash: '#/ayuda/municion/us', implementation: 'public/js/views/help.js · renderMunicionCountry(countryId)',
    summary: 'Distribuidor de categorías de unidades del país y galería completa de hojas originales.',
    functionality: 'Muestra el número de unidades en cada categoría y permite consultar las páginas de armamento completas como apoyo visual.',
    links: [codeLink('Aviones tácticos', 'MUN-004-*', '#/ayuda/municion/{pais}/aviones'), codeLink('Buques y submarinos', 'MUN-004-*', '#/ayuda/municion/{pais}/naval'), codeLink('Unidades especiales', 'MUN-004-*', '#/ayuda/municion/{pais}/especiales'), codeLink('Ampliar hoja original', 'MUN-003', 'misma ruta', 'Abre un lightbox de imagen.'), codeLink('Volver', 'MUN-001', 'history.back()')]
  },
  {
    code: 'MUN-004', title: 'Categoría de unidades por país', hash: '#/ayuda/municion/us/aviones', implementation: 'public/js/views/help.js · renderMunicionCategory(countryId, categoryId)',
    summary: 'Lista las unidades transcritas de una categoría concreta.',
    functionality: 'Organiza las unidades por grupo cuando procede y ofrece su ficha detallada. El catálogo completo contiene 264 tipos de unidad en las fuentes indexadas del proyecto.',
    links: [codeLink('Cada unidad', 'MUN-005-*', '#/ayuda/municion/{pais}/{categoria}/{unitId}'), codeLink('Volver', 'MUN-003-*', 'history.back()')]
  },
  {
    code: 'MUN-005', title: 'Detalle de unidad y planes', hash: '#/ayuda/municion/us/aviones/us-f-35a', implementation: 'public/js/views/help.js · renderMunicionUnitDetail(countryId, categoryId, unitId)',
    summary: 'Ficha de una unidad con recorte de la fuente, planes, munición, rangos, carga/daño, iconos y notas.',
    functionality: 'Permite interpretar los valores transcritos y compararlos con el recorte del PDF. Los datos estructurados son la fuente de la interfaz; el recorte es apoyo visual.',
    links: [codeLink('Ampliar recorte', 'MUN-005', 'misma ruta', 'Abre el lightbox.'), codeLink('Ampliar iconos', 'MUN-005', 'misma ruta', 'Zoom por toque/ratón.'), codeLink('Volver', 'MUN-004-*', 'history.back()')]
  },
  {
    code: 'CNT-001', title: 'Índice de counters / fichas', hash: '#/ayuda/counters', implementation: 'public/js/views/help.js · renderCountersIndex()',
    summary: 'Selector de cuatro familias de fichas y resumen del volumen transcrito.',
    functionality: 'Separa fichas aéreas, navales/submarinas, de baja altitud y terrestres.',
    links: [codeLink('Aéreas', 'CNT-002-AIR', '#/ayuda/counters/air'), codeLink('Navales y submarinas', 'CNT-002-NAV', '#/ayuda/counters/naval'), codeLink('Baja altitud', 'CNT-002-LOW', '#/ayuda/counters/low-altitude'), codeLink('Terrestres', 'CNT-002-GND', '#/ayuda/counters/ground'), codeLink('Volver', 'AYU-001', 'history.back()')]
  },
  {
    code: 'CNT-002', title: 'Categoría de counters', hash: '#/ayuda/counters/air', implementation: 'public/js/views/help.js · renderCountersCategory(catId)',
    summary: 'Muestra la hoja visual de referencia y los tipos de ficha pertenecientes a la categoría.',
    functionality: 'Permite elegir una plantilla de ficha concreta. La imagen general es apoyo; las posiciones y descripciones provienen del JSON estructurado.',
    links: [codeLink('Cada tipo de ficha', 'CNT-003-*', '#/ayuda/counters/{categoria}/{templateId}'), codeLink('Volver', 'CNT-001', 'history.back()')]
  },
  {
    code: 'CNT-003', title: 'Detalle interactivo de counter', hash: '#/ayuda/counters/air/aircraft-combat-tactical', implementation: 'public/js/views/help.js · renderCounterDetail(catId, templateId)',
    summary: 'Recorte de una ficha con zonas activas y listado de factores.',
    functionality: 'Al tocar, enfocar o pasar el puntero por un factor, dibuja un recuadro rojo en su posición y muestra su significado, estado, bandas de rol y ambigüedades relacionadas.',
    links: [codeLink('Cada factor', 'CNT-003', 'misma ruta', 'Activa la indicación visual del factor.'), codeLink('Volver', 'CNT-002-*', 'history.back()')]
  },
  {
    code: 'REG-001', title: 'Reglas y extractos', hash: '#/ayuda/reglas', implementation: 'public/js/views/help.js · renderReglasHelp()',
    summary: 'Extractos verificados del Decision Book y glosario de modificadores.',
    functionality: 'Consulta de solo lectura con referencias de fuente. Algunos extractos enlazan el workflow de combate relacionado.',
    links: [codeLink('Workflow relacionado', 'COM-002-*', '#/ayuda/combate/{workflowId}'), codeLink('Volver', 'AYU-001', 'history.back()')]
  },
  {
    code: 'WIZ-001', title: 'Wizard de ataque antibuque guiado', hash: '#/wizard/antiship-guided', implementation: 'public/js/views/antiship-guided-wizard.js · renderAntishipGuidedWizard() (controlador) + antiship-guided-steps.js / antiship-guided-result.js (pasos) + antiship-guided-model.js (estado y cálculos)',
    summary: 'Asistente determinista de seis pasos para ataque guiado contra buques de superficie.',
    functionality: 'Recoge defensa aérea de área, unidad/plan, defensas, flota, método y tiradas; calcula modificadores, resalta tablas, asigna impactos y permite guardar un resumen auditable. Mantiene respuestas compatibles al retroceder.',
    variants: ['Paso 1: defensa aérea de área', 'Paso 2: atacante y plan', 'Paso 3: defensas e interceptación', 'Paso 4: flota / V.E.F.', 'Paso 5: método y asignación', 'Paso 6: resultado y resumen'],
    links: [codeLink('Tabla de defensa de área', 'TAB-004-*', '#/ayuda/tablas/page-03.json/ground-guided-area-air-defense'), codeLink('Tabla de interceptación', 'TAB-004-*', '#/ayuda/tablas/page-04.json/munition-interception-standard'), codeLink('Tabla V.E.F.', 'TAB-004-*', '#/ayuda/tablas/page-21.json/antiship-guided-vef-modifier'), codeLink('Tabla de daño final', 'TAB-004-*', '#/ayuda/tablas/page-22.json/antiship-guided-final-damage'), codeLink('Anterior / siguiente', 'WIZ-001', 'misma ruta', 'Cambia el paso interno del wizard.'), codeLink('Guardar resolución', 'HIS-001', '#/historial', 'Persiste el resumen en localStorage cuando se confirma.')]
  },
  {
    code: 'WIZ-002', title: 'Wizard de ataque antibuque no guiado', hash: '#/wizard/antiship-unguided', implementation: 'public/js/views/antiship-unguided-wizard.js · renderAntishipUnguidedWizard()',
    summary: 'Asistente de cuatro pasos para ataque no guiado contra superficie.',
    functionality: 'Resuelve Intercepción Final, contexto de ataque, Interceptación de Munición/Intensidad y resultado final. Incluye tiradas, asignación de impactos y persistencia en historial.',
    variants: ['Paso 1: Intercepción Final', 'Paso 2: introducción/contexto', 'Paso 3: Interceptación de Munición', 'Paso 4: resultado'],
    links: [codeLink('Anterior / siguiente', 'WIZ-002', 'misma ruta'), codeLink('Guardar resolución', 'HIS-001', '#/historial')]
  },
  {
    code: 'WIZ-003', title: 'Wizard de combate cercano terrestre', hash: '#/wizard/ground-close-combat', implementation: 'public/js/views/ground-close-combat-wizard.js · renderGroundCloseCombatWizard()',
    summary: 'Asistente de cinco pasos para combate cercano terrestre.',
    functionality: 'Comprueba elegibilidad, recoge fuerzas, aplica guerra electrónica y bajas, calcula el resultado/Derrota y genera un resumen reproducible.',
    variants: ['Paso 1: elegibilidad', 'Paso 2: valor de ataque', 'Paso 3: guerra electrónica', 'Paso 4: bajas', 'Paso 5: resultado'],
    links: [codeLink('Anterior / siguiente', 'WIZ-003', 'misma ruta'), codeLink('Guardar resolución', 'HIS-001', '#/historial')]
  },
  {
    code: 'WIZ-004', title: 'Wizard de torpedos contra superficie', hash: '#/wizard/torpedo-surface', implementation: 'public/js/views/torpedo-surface-wizard.js · renderTorpedoSurfaceWizard() + public/js/torpedo-attack-engine.js',
    summary: 'Asistente de cuatro pasos para el ataque submarino con torpedos contra unidades de superficie.',
    functionality: 'Informa de la Emboscada, recoge velocidad de la flota, contexto ASW, estado del submarino, tipo de torpedo y Valor de Ataque, resuelve la tirada (y el segundo dado si el tipo de torpedo lo exige) contra la tabla de la página 27 con la celda resaltada, y explica cómo se absorben los Puntos de Impacto.',
    variants: ['Paso 1: emboscada (informativo)', 'Paso 2: datos del ataque', 'Paso 3: tirada y segundo dado', 'Paso 4: resultado'],
    links: [codeLink('Anterior / siguiente', 'WIZ-004', 'misma ruta'), codeLink('Guardar resolución', 'HIS-001', '#/historial')]
  },
  {
    code: 'WIZ-005', title: 'Wizard de ataque ASW (superficie y aéreas)', hash: '#/wizard/asw-surface-air', implementation: 'public/js/views/asw-surface-air-wizard.js · renderAswSurfaceAirWizard() + public/js/asw-attack-engine.js',
    summary: 'Asistente de cuatro pasos para el ataque antisubmarino de unidades de superficie y aéreas.',
    functionality: 'Comprueba el alcance (zona de patrulla aérea enemiga, objetivo adyacente), recoge profundidad, Firma del submarino (+1 si está en movimiento) y Valor de Ataque ASW, elige la banda de la cabecera de la página 29, resuelve la tirada con la celda resaltada y avisa si el submarino se hunde.',
    variants: ['Paso 1: elegibilidad y alcance', 'Paso 2: datos del objetivo', 'Paso 3: tirada', 'Paso 4: resultado'],
    links: [codeLink('Anterior / siguiente', 'WIZ-005', 'misma ruta'), codeLink('Guardar resolución', 'HIS-001', '#/historial')]
  },
  {
    code: 'WIZ-006', title: 'Wizard de ataque antirradiación (ARM)', hash: '#/wizard/anti-radiation', implementation: 'public/js/views/anti-radiation-wizard.js · renderAntiRadiationWizard() + public/js/anti-radiation-attack-engine.js',
    summary: 'Asistente de cuatro pasos para el ataque anti-radiación (Decision Book §5.14).',
    functionality: 'Recoge el Valor de Ataque, resuelve Defensa Aérea de Área e Interceptación de Munición (con consumo Alto/Bajo), aplica la modificación -5 del sistema de detección activado con desplazamiento de columna y tope 13, elige la fila [L]/Normal de la página 13, aplica la cancelación por tirada 9, muestra la celda resaltada y ofrece el Contraataque a Baja Altura.',
    variants: ['Paso 1: datos base', 'Paso 2: defensas', 'Paso 3: modificación y tirada', 'Paso 4: resultado y contraataque'],
    links: [codeLink('Anterior / siguiente', 'WIZ-006', 'misma ruta'), codeLink('Guardar resolución', 'HIS-001', '#/historial')]
  },
  {
    code: 'WIZ-007', title: 'Wizard de efectos del impacto antibuque', hash: '#/wizard/ship-impact-effects', implementation: 'public/js/views/ship-impact-effects-wizard.js · renderShipImpactEffectsWizard() + public/js/ship-impact-effects-engine.js',
    summary: 'Asistente de tres pasos para los efectos de 1 punto de daño sobre una unidad de superficie (Decision Book §5.9).',
    functionality: 'Según el tipo de casco (único, doble, multi-buque), lado dañado, Escudo y Buque de Asalto Anfibio determina si la unidad se da la vuelta, reduce su flota, se hunde o es eliminada; resuelve la verificación por daño crítico y muestra las consecuencias para portaeronaves y transportes con la cita de cada regla.',
    variants: ['Paso 1: unidad objetivo', 'Paso 2: verificación por daño crítico', 'Paso 3: resultado'],
    links: [codeLink('Anterior / siguiente', 'WIZ-007', 'misma ruta'), codeLink('Guardar resolución', 'HIS-001', '#/historial')]
  },
  {
    code: 'WIZ-008', title: 'Wizard de ataque ASW de submarinos', hash: '#/wizard/asw-submarine', implementation: 'public/js/views/asw-submarine-wizard.js · renderAswSubmarineWizard() + public/js/asw-attack-engine.js (resolveSubmarineAswAttack)',
    summary: 'Asistente de tres pasos para el ataque con torpedos de un submarino contra un submarino expuesto.',
    functionality: 'Recoge profundidad, Firma del objetivo (+1 si está en movimiento), tipo de torpedo y Valor de Ataque, elige la banda de la cabecera de la página 30 por profundidad, resuelve la tirada con la celda resaltada, aplica la regla del asterisco del torpedo de hexágono y avisa si el submarino se hunde por su Protección.',
    variants: ['Paso 1: datos del ataque', 'Paso 2: tirada', 'Paso 3: resultado'],
    links: [codeLink('Anterior / siguiente', 'WIZ-008', 'misma ruta'), codeLink('Guardar resolución', 'HIS-001', '#/historial')]
  },
  {
    code: 'WIZ-009', title: 'Wizard de búsqueda aérea ASW', hash: '#/wizard/asw-air-search', implementation: 'public/js/views/asw-air-search-wizard.js · renderAswAirSearchWizard() + public/js/asw-air-search-engine.js',
    summary: 'Asistente de cuatro pasos para la búsqueda aérea antisubmarina (Decision Book §9.15.4).',
    functionality: 'Según el evento elige la tabla de la página 34, suma los Valores de Detección Aérea de las unidades que pueden buscar (excluyendo las de zona de patrulla enemiga y las de Alta Velocidad en rutina/movimiento), lee la fila de Firma por profundidad (+1 si está en movimiento), muestra el rango de descubrimiento y resuelve la tirada, informando de si el submarino queda Expuesto.',
    variants: ['Paso 1: evento y objetivo', 'Paso 2: unidades que buscan', 'Paso 3: tirada', 'Paso 4: resultado'],
    links: [codeLink('Anterior / siguiente', 'WIZ-009', 'misma ruta'), codeLink('Guardar resolución', 'HIS-001', '#/historial')]
  },
  {
    code: 'WIZ-010', title: 'Wizard de combate aéreo BVR', hash: '#/wizard/air-combat-bvr', implementation: 'public/js/views/air-combat-bvr-wizard.js · renderAirCombatBvrWizard() + public/js/air-combat-bvr-engine.js',
    summary: 'Asistente de tres pasos para el combate aéreo BVR de una interceptación (Decision Book §7.16.2-§7.16.3).',
    functionality: 'Calcula la Diferencia de Iniciativa (+1 por AWACS en red) y su DRM, determina el tipo de combate BVR con 1d10 (sin BVR, simultáneo, ventaja; penetración y duelo sigiloso), resuelve el ataque 1 contra 1 de cada bando con la fila de la página 16 según su misión y AWACS, aplica el modificador electrónico y el daño por Protección (CAPs solo absorben 1).',
    variants: ['Paso 1: iniciativa y tipo de combate', 'Paso 2: ataques BVR', 'Paso 3: resultado'],
    links: [codeLink('Anterior / siguiente', 'WIZ-010', 'misma ruta'), codeLink('Guardar resolución', 'HIS-001', '#/historial')]
  },
  {
    code: 'UNI-001', title: 'Plantilla de fuerzas', hash: '#/unidades', implementation: 'public/js/views/roster.js · renderRosterIndex()',
    summary: 'Inventario de unidades de la sesión con estado Actuada y Dañada.',
    functionality: 'Añade, retira y actualiza banderas operativas de instancias de unidad. Desde unidades compatibles abre su ficha de munición. El contenido se conserva en localStorage.',
    links: [codeLink('Añadir unidad', 'UNI-002', '#/unidades/anadir'), codeLink('Ver planes de unidad', 'MUN-005-*', '#/ayuda/municion/{pais}/{categoria}/{unitId}'), codeLink('Actuada / Dañada', 'UNI-001', 'misma ruta', 'Alterna el estado en localStorage.'), codeLink('Quitar', 'UNI-001', 'misma ruta', 'Solicita confirmación y elimina la instancia.'), codeLink('Volver', 'ORIGEN', 'history.back()')]
  },
  {
    code: 'UNI-002', title: 'Añadir unidad a la plantilla', hash: '#/unidades/anadir', implementation: 'public/js/views/roster.js · renderRosterAddForm()',
    summary: 'Formulario de selección por país, categoría y tipo de unidad.',
    functionality: 'Carga el registro transcrito, permite asignar un nombre/identificador de instancia y añade la unidad a la sesión sin modificar los datos fijos.',
    links: [codeLink('Añadir', 'UNI-001', '#/unidades', 'Valida y guarda la instancia en localStorage.'), codeLink('Cancelar', 'UNI-001', '#/unidades')]
  },
  {
    code: 'HIS-001', title: 'Historial de resoluciones', hash: '#/historial', implementation: 'public/js/views/history.js · renderResolutionHistory()',
    summary: 'Lista persistente de resoluciones guardadas por los wizards.',
    functionality: 'Permite revisar el resumen, copiarlo, repetir una resolución restaurando sus datos, eliminar una entrada o vaciar el historial. En una sesión nueva puede aparecer vacío.',
    links: [codeLink('Repetir resolución', 'WIZ-001/002/003', '#/wizard/{tipo}', 'Restaura los datos guardados en el asistente correspondiente.'), codeLink('Copiar resumen', 'HIS-001', 'misma ruta', 'Copia texto al portapapeles.'), codeLink('Eliminar / vaciar', 'HIS-001', 'misma ruta', 'Solicita confirmación y actualiza localStorage.'), codeLink('Volver', 'ORIGEN', 'history.back()')]
  }
];

function ensureDirectories() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
}

async function captureScreens() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());

  for (const screen of screens) {
    await page.goto(BASE_URL + screen.hash, { waitUntil: 'networkidle' });
    await page.waitForTimeout(450);
    // El panel es estado DOM global y un cambio de hash no recarga el documento.
    // Ciérralo antes de cada captura normal para que la imagen represente la
    // vista de entrada real y no herede el modal capturado en GLB-001.
    if (screen.action !== 'open-help' && await page.locator('#help-panel').isVisible()) {
      await page.locator('#btn-help-close').click();
      await page.waitForTimeout(100);
    }
    if (screen.action === 'open-help') {
      await page.locator('#btn-help').click();
      await page.waitForTimeout(150);
    }
    screen.screenshot = path.join(SHOTS_DIR, `${screen.code.toLowerCase()}.png`);
    await page.screenshot({ path: screen.screenshot, fullPage: false });
  }
  await browser.close();
}

const colors = {
  navy: '17324D', blue: '285F8F', paleBlue: 'DCEAF5', gold: 'C7A35A', paleGold: 'F5EBD5',
  dark: '263238', gray: '5D6870', lightGray: 'EEF1F3', white: 'FFFFFF', green: '2F6B4F'
};

function pngSize(buffer) {
  if (buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error('Imagen no PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function fitImage(buffer, maxWidth, maxHeight) {
  const size = pngSize(buffer);
  const scale = Math.min(maxWidth / size.width, maxHeight / size.height);
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

function textParagraph(text, options = {}) {
  return new Paragraph({
    spacing: { after: options.after === undefined ? 120 : options.after, line: 276 },
    alignment: options.alignment,
    children: [new TextRun({ text: String(text), bold: options.bold, color: options.color || colors.dark, size: options.size || 20, italics: options.italics })]
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { after: 70, line: 250 },
    children: [new TextRun({ text, size: 19, color: colors.dark })]
  });
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ heading: level, spacing: { before: 180, after: 120 }, children: [new TextRun(text)] });
}

function cell(text, width, options = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: options.shading ? { fill: options.shading, type: ShadingType.CLEAR } : undefined,
    margins: { top: 90, bottom: 90, left: 100, right: 100 },
    children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: String(text || ''), bold: options.bold, color: options.color || colors.dark, size: options.size || 18 })] })]
  });
}

function simpleTable(headers, rows, widths) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, widths[i], { bold: true, shading: colors.navy, color: colors.white })) }),
      ...rows.map((row, rowIndex) => new TableRow({ children: row.map((value, i) => cell(value, widths[i], { shading: rowIndex % 2 ? colors.lightGray : colors.white })) }))
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 3, color: 'AAB4BC' }, bottom: { style: BorderStyle.SINGLE, size: 3, color: 'AAB4BC' },
      left: { style: BorderStyle.SINGLE, size: 3, color: 'AAB4BC' }, right: { style: BorderStyle.SINGLE, size: 3, color: 'AAB4BC' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'D4DADF' }, insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'D4DADF' }
    }
  });
}

function screenshotBlock(screen) {
  const data = fs.readFileSync(screen.screenshot);
  const dimensions = fitImage(data, 820, 510);
  return [
    new Paragraph({ spacing: { before: 100, after: 70 }, children: [new TextRun({ text: 'Captura al entrar (viewport 1280 × 800, tablet horizontal)', bold: true, color: colors.blue, size: 19 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new ImageRun({ data, type: 'png', transformation: dimensions })] }),
    textParagraph(`Ruta capturada: ${BASE_URL}${screen.hash}`, { size: 16, color: colors.gray, italics: true, alignment: AlignmentType.CENTER })
  ];
}

function screenSection(screen) {
  const rows = [
    ['Código', screen.code], ['Ruta / estado de entrada', screen.action === 'open-help' ? `${screen.hash} + abrir «Ayuda rápida»` : screen.hash],
    ['Implementación', screen.implementation], ['Tipo', screen.variants ? 'Pantalla parametrizada / multipaso' : 'Pantalla única']
  ];
  const children = [
    new Paragraph({ children: [new PageBreak()] }),
    heading(`${screen.code} — ${screen.title}`, HeadingLevel.HEADING_2),
    simpleTable(['Atributo', 'Valor'], rows, [2200, 7880]),
    ...screenshotBlock(screen),
    heading('Información mostrada', HeadingLevel.HEADING_3),
    textParagraph(screen.summary),
    heading('Funcionalidad', HeadingLevel.HEADING_3),
    textParagraph(screen.functionality)
  ];
  if (screen.variants && screen.variants.length) {
    children.push(heading('Variantes cubiertas por esta codificación', HeadingLevel.HEADING_3));
    screen.variants.forEach((variant) => children.push(bullet(variant)));
  }
  children.push(heading('Enlaces y controles de navegación', HeadingLevel.HEADING_3));
  children.push(simpleTable(['Opción / control', 'Destino', 'Ruta o acción', 'Comportamiento'], screen.links.map((l) => [l.label, l.code, l.route, l.behavior]), [2800, 1700, 2700, 2880]));
  return children;
}

function countRoutingLeaves(node) {
  if (!node || typeof node !== 'object') return 0;
  if (node.workflowId || node.attackWorkflowId || node.tableFile || node.tableId) return 1;
  const options = node.options || node.branches || [];
  if (Array.isArray(options)) return options.reduce((sum, option) => sum + countRoutingLeaves(option.next || option), 0);
  return Object.values(node).reduce((sum, value) => sum + countRoutingLeaves(value), 0);
}

function phaseRows() {
  const rows = [];
  for (const process of turn.processes) {
    const occurrences = process.repeat || 1;
    for (let occurrence = 1; occurrence <= occurrences; occurrence += 1) {
      for (const phaseId of process.phases) {
        const phase = turn.phases[phaseId];
        rows.push([
          `TUR-003-${process.id === 'proceso_estrategico' ? 'E' : `C${occurrence}`}-${String(phase.order).padStart(2, '0')}`,
          process.title + (occurrences > 1 ? ` ${occurrence}` : ''), phase.title,
          `#/turno/${process.id}/${occurrence}/${phase.id}`
        ]);
      }
    }
  }
  return rows;
}

function subphaseRows() {
  const rows = [];
  const campaign = turn.processes.find((p) => p.id === 'proceso_campana');
  for (let occurrence = 1; occurrence <= campaign.repeat; occurrence += 1) {
    for (const phaseId of campaign.phases) {
      const phase = turn.phases[phaseId];
      for (const subId of phase.subphases || []) {
        const sub = turn.subphases[subId];
        rows.push([`TUR-004-C${occurrence}-${phase.order}.${sub.order}`, phase.title, sub.title, `#/turno/proceso_campana/${occurrence}/${phaseId}/${subId}`]);
      }
    }
  }
  return rows;
}

function annexSections() {
  const sections = [];
  sections.push(new Paragraph({ children: [new PageBreak()] }), heading('Anexo A — Catálogo de rutas parametrizadas', HeadingLevel.HEADING_1));
  sections.push(textParagraph('Las siguientes tablas completan el mapa sin duplicar capturas de plantillas visualmente equivalentes. Cada fila representa una opción accesible o una variante de datos de la pantalla indicada.'));

  sections.push(heading('A.1 Fases del turno (TUR-003)', HeadingLevel.HEADING_2));
  sections.push(simpleTable(['Código', 'Proceso', 'Fase', 'Ruta'], phaseRows(), [1900, 2200, 2600, 3380]));

  sections.push(heading('A.2 Subfases del turno (TUR-004)', HeadingLevel.HEADING_2));
  sections.push(simpleTable(['Código', 'Fase', 'Subfase', 'Ruta'], subphaseRows(), [1700, 2400, 2600, 3380]));

  sections.push(heading('A.3 Tipos de combate (COM-002)', HeadingLevel.HEADING_2));
  sections.push(simpleTable(['Código', 'Dominio', 'Título', 'Ruta'], workflows.files.map((wf, i) => [`COM-002-${String(i + 1).padStart(2, '0')}`, wf.category, wf.title, `#/ayuda/combate/${wf.id}`]), [1600, 1600, 3900, 2980]));

  sections.push(heading('A.4 Páginas de tablas (TAB-003)', HeadingLevel.HEADING_2));
  sections.push(simpleTable(['Código', 'Página', 'Título', 'Ruta'], tablesIndex.pages.map((page) => [`TAB-003-${String(page.page).padStart(2, '0')}`, String(page.page), page.title, `#/ayuda/tablas/${page.file}`]), [1600, 900, 4400, 3180]));

  const tableRows = [];
  for (const pageInfo of tablesIndex.pages) {
    const page = readJson(`data/tables/${pageInfo.file}`);
    for (const table of page.tables || []) {
      tableRows.push([`TAB-004-${String(pageInfo.page).padStart(2, '0')}-${table.id}`, pageInfo.file, table.title, `#/ayuda/tablas/${pageInfo.file}/${table.id}`]);
    }
  }
  sections.push(heading('A.5 Tablas interactivas (TAB-004)', HeadingLevel.HEADING_2));
  sections.push(simpleTable(['Código', 'Archivo', 'Tabla', 'Ruta'], tableRows, [2600, 1700, 3000, 2780]));

  sections.push(heading('A.6 Plantillas de counters (CNT-003)', HeadingLevel.HEADING_2));
  sections.push(simpleTable(['Código', 'Categoría', 'Plantilla', 'Ruta'], counters.counterTemplates.map((tpl, i) => [`CNT-003-${String(i + 1).padStart(2, '0')}`, tpl.category, tpl.title, `#/ayuda/counters/${tpl.category}/${tpl.id}`]), [1600, 1500, 3800, 3180]));

  const detectionTypes = [
    ['air-to-air', 'Aire-aire'], ['surface-vs-air', 'Naval contra aérea'], ['naval-detector-eligibility', 'Quién puede detectar unidades navales'], ['ground-mobile', 'Detectabilidad terrestre móvil'], ['briefly-detectable', 'Brevemente detectable'], ['fixed-installation', 'Instalación fija'], ['ground-detector-eligibility', 'Quién puede detectar terrestres'], ['electronic', 'Detección electrónica']
  ];
  sections.push(heading('A.7 Resolutores de detección (DET-003)', HeadingLevel.HEADING_2));
  sections.push(simpleTable(['Código', 'Tipo', 'Ruta'], detectionTypes.map(([id, title], i) => [`DET-003-${String(i + 1).padStart(2, '0')}`, title, `#/ayuda/deteccion/resolver/${id}`]), [1800, 3300, 5080]));

  sections.push(heading('A.8 Catálogo de munición por país y categoría', HeadingLevel.HEADING_2));
  sections.push(simpleTable(['Código de pantalla', 'País', 'Categoría', 'Unidades', 'Ruta'], ammoSummary.map((row) => [`MUN-004-${row.country.toUpperCase()}-${row.category.toUpperCase()}`, row.countryLabel, row.categoryLabel, String(row.count), `#/ayuda/municion/${row.country}/${row.category}`]), [2400, 1700, 2800, 900, 2380]));
  sections.push(textParagraph(`El índice de registro declara ${registry.count} tipos de unidad. Cada entrada abre MUN-005 cuando pertenece a una de las tres familias de planes; las formaciones/sistemas sin planes se utilizan principalmente desde UNI-002.`, { italics: true, color: colors.gray }));

  sections.push(heading('A.9 Router de tablas', HeadingLevel.HEADING_2));
  sections.push(textParagraph(`El router se implementa como árbol declarativo en data/routing/table-routing.json. La navegación conserva las respuestas en los segmentos de la ruta. Recuento técnico aproximado de hojas detectadas: ${countRoutingLeaves(routing)}. Los destinos finales se resuelven a COM-002, TAB-003/TAB-004 o WIZ-001/002/003 según la hoja.`));

  return sections;
}

function buildDocument() {
  const body = [];
  body.push(
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800, after: 300 }, children: [new TextRun({ text: 'THE COMING WAVE COMPANION', bold: true, color: colors.navy, size: 38 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: 'Análisis del mapa funcional de la aplicación web', bold: true, color: colors.blue, size: 30 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: 'Inventario de pantallas, capturas, funcionalidad y trazabilidad de enlaces', color: colors.gray, size: 22 })] }),
    simpleTable(['Dato', 'Valor'], [
      ['Proyecto', 'thecommingwave / TCW Assistant'], ['Fecha de análisis', '28 de septiembre de 2026'],
      ['Entorno visual', 'localhost:8080 · viewport 1280 × 800 · tablet horizontal'],
      ['Tecnología', 'SPA HTML/JavaScript con router por hash y servidor Node.js'],
      ['Alcance', `${screens.length} vistas funcionales documentadas; variantes parametrizadas inventariadas en anexos`]
    ], [2600, 7480]),
    new Paragraph({ spacing: { before: 900 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Documento técnico-funcional para desarrollo y validación', italics: true, color: colors.gray, size: 20 })] }),
    new Paragraph({ children: [new PageBreak()] }),
    heading('Control del documento', HeadingLevel.HEADING_1),
    simpleTable(['Versión', 'Fecha', 'Autoría', 'Estado'], [['1.0', '2026-09-28', 'Análisis asistido por Codex', 'Emitido']], [1600, 1800, 3800, 2880]),
    heading('Índice', HeadingLevel.HEADING_1),
    new TableOfContents('Contenido', { hyperlink: true, headingStyleRange: '1-3' }),
    new Paragraph({ children: [new PageBreak()] }),
    heading('1. Resumen ejecutivo', HeadingLevel.HEADING_1),
    textParagraph('La aplicación se organiza como una SPA con rutas por hash. La pantalla de inicio ofrece siete accesos principales y la cabecera añade dos controles globales: Inicio y Ayuda rápida. El turno guiado es un índice flexible, no una máquina de estados restrictiva; la consulta rápida y los asistentes pueden abrirse de forma independiente.'),
    textParagraph(`Se han identificado ${screens.length} familias de pantalla distintas. El contenido parametrizado amplía estas familias a 9 fases, 36 ocurrencias de subfase en las dos campañas, 13 workflows, 33 páginas de tablas, ${counters.counterTemplates.length} plantillas de counter, 8 resolutores de detección, 18 catálogos país/categoría y ${registry.count} tipos de unidad indexados.`),
    heading('2. Criterio de codificación', HeadingLevel.HEADING_1),
    textParagraph('El código identifica la responsabilidad funcional y no la posición obligatoria en una secuencia. Un asterisco o sufijo indica una variante parametrizada de la misma plantilla de pantalla.'),
    simpleTable(['Prefijo', 'Dominio'], [['INI', 'Inicio'], ['GLB', 'Navegación global'], ['TUR', 'Turno guiado'], ['AYU/BUS', 'Ayuda y búsqueda'], ['SEC', 'Secuencia'], ['DET', 'Detección'], ['COM', 'Combate por tipo'], ['TAB', 'Tablas y router'], ['MUN', 'Munición y planes'], ['CNT', 'Counters'], ['REG', 'Reglas'], ['WIZ', 'Asistentes'], ['UNI', 'Plantilla de fuerzas'], ['HIS', 'Historial']], [1800, 8280]),
    heading('3. Arquitectura de navegación', HeadingLevel.HEADING_1),
    textParagraph('La ruta se analiza en public/js/router.js y se despacha en public/js/app.js. Las vistas viven en public/js/views/*.js; los datos proceden de data/*.json. La URL visible conserva el contexto de las pantallas parametrizadas, mientras que los pasos internos de los wizards se mantienen en memoria.'),
    simpleTable(['Origen', 'Ramificaciones principales'], [
      ['INI-001', 'TUR-001 · AYU-001 · WIZ-001/002/003 · UNI-001 · HIS-001'],
      ['TUR-001', 'TUR-002 → TUR-003 → TUR-004; ayudas contextuales y resoluciones'],
      ['AYU-001 / GLB-001', 'BUS-001 · SEC-001 · DET-001 · COM-001 · TAB-001 · MUN-001 · CNT-001 · REG-001'],
      ['COM-002 / TAB-002', 'Wizards y tablas concretas'],
      ['UNI-001 / HIS-001', 'Detalle de unidad y repetición de resoluciones']
    ], [2500, 7580]),
    heading('4. Consideraciones transversales', HeadingLevel.HEADING_1),
    bullet('Inicio y Ayuda rápida están disponibles globalmente desde la cabecera.'),
    bullet('Los botones «Volver» dependen del historial real del navegador; el destino puede variar según el origen.'),
    bullet('Progreso, favoritos, recientes, plantilla e historial se conservan en localStorage.'),
    bullet('Las rutas de fase y subfase incluyen la ocurrencia de campaña para evitar mezclar progreso entre Campaña 1 y Campaña 2.'),
    bullet('Las pantallas de tablas y munición calculan desde JSON; las imágenes son apoyo visual.'),
    bullet('Las capturas reflejan el estado inicial limpio. Contenido condicional —resoluciones pendientes, favoritos, unidades o historial— aparece al existir datos de sesión.'),
    heading('5. Inventario detallado de pantallas', HeadingLevel.HEADING_1)
  );

  for (const screen of screens) body.push(...screenSection(screen));
  body.push(...annexSections());

  body.push(new Paragraph({ children: [new PageBreak()] }), heading('Anexo B — Trazabilidad técnica', HeadingLevel.HEADING_1));
  body.push(simpleTable(['Capa', 'Archivos principales', 'Responsabilidad'], [
    ['Servidor', 'server/server.js', 'Servicio estático de public/ y data/.'],
    ['Composición / rutas', 'public/js/app.js · public/js/router.js', 'Inicio, panel global, dispatch y ciclo de navegación.'],
    ['Núcleo compartido', 'public/js/core.js (fachada AppCore) · core-data.js · core-widgets.js · core-visuals.js · core-wizard-steps.js · public/js/storage.js', 'Cargadores de datos, widgets DOM, apoyo visual con imágenes, pasos de wizard compartidos y persistencia.'],
    ['Turno', 'public/js/views/turn.js', 'Índice, proceso, fase y subfase.'],
    ['Ayudas', 'public/js/views/help.js', 'Búsqueda, detección, tablas, munición, counters, reglas y combate.'],
    ['Asistentes', 'public/js/views/*-wizard.js', 'Resoluciones guiadas implementadas.'],
    ['Plantilla / historial', 'public/js/views/roster.js · history.js', 'Estado de unidades y resoluciones guardadas.'],
    ['Datos', 'data/**/*.json', 'Fases, workflows, tablas, munición, counters, reglas y fuentes.']
  ], [1700, 4200, 4180]));

  return new Document({
    creator: 'Codex', title: 'Análisis del mapa web — The Coming Wave Companion', subject: 'Mapa funcional y navegación',
    description: 'Inventario técnico-funcional de pantallas, capturas y enlaces de TCW Assistant.',
    styles: {
      default: { document: { run: { font: 'Aptos', size: 20, color: colors.dark }, paragraph: { spacing: { line: 276 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: 'Aptos Display', size: 38, bold: true, color: colors.navy } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Aptos Display', size: 30, bold: true, color: colors.navy }, paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Aptos Display', size: 25, bold: true, color: colors.blue }, paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Aptos', size: 21, bold: true, color: colors.green }, paragraph: { spacing: { before: 170, after: 90 }, outlineLevel: 2 } }
      ]
    },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 180 } } } }] }] },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 650, right: 650, bottom: 650, left: 650, header: 300, footer: 300 }
        }
      },
      headers: {},
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'TCW Assistant · Análisis del mapa web · ', color: colors.gray, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], color: colors.gray, size: 16 })] })] }) },
      children: body
    }]
  });
}

async function main() {
  ensureDirectories();
  await captureScreens();
  const doc = buildDocument();
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(OUTPUT_DOCX, buffer);
  console.log(JSON.stringify({ output: OUTPUT_DOCX, screenshots: screens.length, bytes: buffer.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
