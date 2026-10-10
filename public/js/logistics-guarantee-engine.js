// Motor puro de la Verificación de Garantía Logística (roadmap Fase 14;
// data/rules/logistics-guarantee.json). Cita el Decision Book §11.2-§11.5
// (pp. 234-237): una unidad obtiene garantía logística si puede conectarse a un
// Nodo de Suministro (Avanzado, u Ordinario de nivel >= 1) mediante una Línea
// de Comunicación.
//
//   §11.2.2  Origen: Nodo de Suministro Avanzado u Ordinario (nivel 1 o más).
//   §11.2.3  Si el hexágono del nodo lo controla el enemigo, el nodo se elimina.
//   §11.3.1  La línea no cruza bordes con Restricción de Movimiento "No" o "-",
//            ni pasa por hexágonos con unidades enemigas ni controlados por el
//            enemigo (sí puede entrar en ellos).
//   §11.3.2  Con Contención Táctica (§8.5.5) la línea sí puede pasar por
//            hexágonos con unidades enemigas (no por los controlados por el
//            enemigo: la regla solo habla de unidades).
//   §11.1    Los aeródromos de portaaviones / buques de asalto anfibio no
//            necesitan garantía para reacondicionar (reglas básicas).
//
// El motor no conoce el mapa: recibe las respuestas del jugador. Las claves de
// motivo (`reasons`) tienen su texto en el JSON de reglas.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LogisticsGuaranteeEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NODE_KINDS = ['advanced', 'ordinary', 'none'];
  const UNIT_TYPES = ['ground_main', 'ground_technical', 'airfield', 'port'];

  const yes = (v) => v === true || v === 'yes';

  // `input`: { unitType, carrier, nodeKind, nodeEnemyControlled, blockedEdge,
  //            enemyUnitsOnPath, tacticalContainment, enemyControlledOnPath }
  // Devuelve { guaranteed: true | false | null, reasons: [...], pending: [...] }.
  // `null` = faltan respuestas para decidir.
  function evaluateGuarantee(input) {
    const { unitType, carrier, nodeKind, nodeEnemyControlled, blockedEdge, enemyUnitsOnPath, tacticalContainment, enemyControlledOnPath } = input;
    if (!UNIT_TYPES.includes(unitType)) throw new Error('Tipo de unidad desconocido.');
    if (unitType === 'airfield' && yes(carrier)) {
      return { guaranteed: true, reasons: ['carrier_exception'], pending: [], exempt: true };
    }
    if (!NODE_KINDS.includes(nodeKind)) return { guaranteed: null, reasons: [], pending: ['node_kind'], exempt: false };
    if (nodeKind === 'none') return { guaranteed: false, reasons: ['no_node'], pending: [], exempt: false };

    const reasons = [];
    const pending = [];
    const need = (key, value) => { if (value === undefined || value === '' || value === null) pending.push(key); };
    need('node_enemy_controlled', nodeEnemyControlled);
    need('blocked_edge', blockedEdge);
    need('enemy_units_on_path', enemyUnitsOnPath);
    need('enemy_controlled_on_path', enemyControlledOnPath);
    if (yes(enemyUnitsOnPath)) need('tactical_containment', tacticalContainment);

    if (yes(nodeEnemyControlled)) reasons.push('node_eliminated');
    if (yes(blockedEdge)) reasons.push('blocked_edge');
    if (yes(enemyUnitsOnPath) && tacticalContainment === 'no') reasons.push('enemy_units_on_path');
    if (yes(enemyControlledOnPath)) reasons.push('enemy_controlled_on_path');

    // Un motivo bloqueante ya decide aunque queden preguntas sin responder.
    if (reasons.length) return { guaranteed: false, reasons, pending: [], exempt: false };
    if (pending.length) return { guaranteed: null, reasons: [], pending, exempt: false };
    return { guaranteed: true, reasons: [], pending: [], exempt: false };
  }

  return { NODE_KINDS, UNIT_TYPES, evaluateGuarantee };
});
