// Perfiles de reglas básico/expansión (ajuste AJ-010, punto 4): lógica pura que
// decide si un elemento de los datos está disponible según el perfil activo.
// El selector vive en la pantalla «Perfil de reglas» (#/perfil-reglas); el perfil
// elegido se guarda en el navegador (AppStorage.loadRuleProfile). AGENTS.md: no
// mezclar reglas básicas y de expansión sin indicarlo.
(function (root) {
  'use strict';

  const BASIC = Object.freeze({ id: 'basic', expansion: false, optionalRules: false });
  const EXPANSION = Object.freeze({ id: 'expansion', expansion: true, optionalRules: false });

  // Un elemento marcado `expansionOnly` solo existe con la expansión; uno marcado
  // `optionalRule` solo si el perfil activa las reglas opcionales.
  function isAvailable(item, profile) {
    const p = profile || BASIC;
    if (item && item.expansionOnly === true && !p.expansion) return false;
    if (item && item.optionalRule === true && !p.optionalRules) return false;
    return true;
  }

  // Perfil guardado → perfil válido; cualquier cosa rara vuelve al básico.
  function normalize(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    const expansion = o.expansion === true;
    const optionalRules = o.optionalRules === true;
    return { id: expansion ? 'expansion' : 'basic', expansion, optionalRules };
  }

  function filterAvailable(items, profile) {
    return (items || []).filter((i) => isAvailable(i, profile));
  }

  const api = { BASIC, EXPANSION, isAvailable, filterAvailable, normalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RuleProfileEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
