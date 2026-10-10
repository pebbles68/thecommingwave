// Motor puro del ataque cibernético (roadmap Fase 14; data/rules/cyber-attack.json).
// Decision Book §14.3 (pp. 244-245): cada punto de Capacidad de Guerra Cibernética da 3 tiradas de 1d10;
// primero se tiran las de defensa y luego las de ataque.
//   14.3.1  Defensa: cada Éxito reduce una tirada del atacante; cada Fracaso añade una.
//   14.3.2  Ataque: cada Éxito da un «éxito»; cada Fracaso resta uno.
//   14.3.3  Éxitos finales = éxitos − fracasos; el ataque tiene éxito si es > 0.
// El resultado de cada d10 (Éxito / Sin efecto / Fallo) se lee de la tabla de la página 32 (columna «Guerra Cibernética»);
// este módulo trabaja con los recuentos ya clasificados.
// Que el número de tiradas del atacante no baje de 0 es una consecuencia lógica de no poder tirar menos de
// cero dados; está declarado en los textos del JSON de reglas.
//
// UMD-lite: funciona en Node (tests) y en el navegador (`<script>`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CyberAttackEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROLLS_PER_POINT = 3;
  const isInt = (n) => Number.isInteger(n) && n >= 0;

  // Tiradas disponibles de cada bando a partir de los puntos gastados.
  function baseRolls(points) {
    return isInt(points) ? points * ROLLS_PER_POINT : null;
  }

  // Número final de tiradas del atacante tras la defensa (§14.3.3).
  function attackRolls({ attackPoints, defenseSuccesses, defenseFailures }) {
    const base = baseRolls(attackPoints);
    if (base === null || !isInt(defenseSuccesses) || !isInt(defenseFailures)) return null;
    return Math.max(0, base + defenseFailures - defenseSuccesses);
  }

  // Resuelve el ataque completo. `defenseUsed` es 'yes' | 'no'; con 'no' las tiradas de defensa son 0.
  function evaluateCyberAttack({ restricted, attackPoints, defenseUsed, defensePoints, defenseSuccesses, defenseFailures, attackSuccesses, attackFailures }) {
    const reasons = [];
    if (restricted === 'yes') return { ok: false, reasons: ['restricted_target'], defenseRolls: null, attackRolls: null, netSuccesses: null, success: null };
    if (!isInt(attackPoints) || !defenseUsed) return { ok: null, reasons, defenseRolls: null, attackRolls: null, netSuccesses: null, success: null };

    const defenseRolls = defenseUsed === 'yes' ? baseRolls(defensePoints) : 0;
    if (defenseRolls === null) return { ok: null, reasons, defenseRolls: null, attackRolls: null, netSuccesses: null, success: null };
    const dS = defenseUsed === 'yes' ? defenseSuccesses : 0;
    const dF = defenseUsed === 'yes' ? defenseFailures : 0;
    if (!isInt(dS) || !isInt(dF)) return { ok: null, reasons, defenseRolls, attackRolls: null, netSuccesses: null, success: null };
    if (dS + dF > defenseRolls) return { ok: false, reasons: ['defense_counts_exceed'], defenseRolls, attackRolls: null, netSuccesses: null, success: null };

    const rolls = attackRolls({ attackPoints, defenseSuccesses: dS, defenseFailures: dF });
    if (!isInt(attackSuccesses) || !isInt(attackFailures)) return { ok: null, reasons, defenseRolls, attackRolls: rolls, netSuccesses: null, success: null };
    if (attackSuccesses + attackFailures > rolls) return { ok: false, reasons: ['attack_counts_exceed'], defenseRolls, attackRolls: rolls, netSuccesses: null, success: null };

    const netSuccesses = attackSuccesses - attackFailures;
    return { ok: true, reasons, defenseRolls, attackRolls: rolls, netSuccesses, success: netSuccesses > 0 };
  }

  return { evaluateCyberAttack, attackRolls, baseRolls, ROLLS_PER_POINT };
});
