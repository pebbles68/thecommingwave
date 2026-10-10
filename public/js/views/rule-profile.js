// Pantalla «Perfil de reglas» (#/perfil-reglas; roadmap Fase 14): elegir si se usan la expansión y las
// reglas opcionales. Los textos salen de data/rules/rule-profile.json; la decisión de qué se oculta la
// toma RuleProfileEngine con las marcas `expansionOnly`/`optionalRule` de los datos.
(function (root) {
  'use strict';

  const { viewRoot, setBreadcrumb, el, backRow, renderNotFound, makeOptionGroup, loadRuleProfileDoc } = AppCore;
  const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];

  async function render() {
    const navToken = Router.currentToken();
    setBreadcrumb(['TCW Assistant', 'Perfil de reglas']);
    viewRoot.innerHTML = '<p class="loading">Cargando…</p>';
    let doc;
    try {
      doc = await loadRuleProfileDoc();
    } catch (err) {
      if (!Router.isCurrent(navToken)) return;
      renderNotFound(err.message);
      return;
    }
    if (!Router.isCurrent(navToken)) return;

    viewRoot.innerHTML = '';
    const wrap = el('div', 'help-detail');
    wrap.appendChild(el('h1', 'help-detail__title', 'Perfil de reglas'));
    wrap.appendChild(el('p', 'turn-view__desc', doc.intro));
    const profile = AppCore.loadRuleProfile();
    doc.toggles.forEach((t) => {
      const current = profile[t.key] ? 'yes' : 'no';
      wrap.appendChild(makeOptionGroup({ prompt: t.question, options: YES_NO }, current, (v) => {
        AppCore.saveRuleProfile({ ...profile, [t.key]: v === 'yes' });
        render();
      }));
      wrap.appendChild(el('p', 'source-refs', profile[t.key] ? t.yes : t.no));
    });
    doc.afterRules.forEach((t) => wrap.appendChild(el('p', 'source-refs', t)));
    wrap.appendChild(el('p', 'table-viewer__value', `Perfil actual: ${profile.expansion ? 'con expansión' : 'reglas básicas'}${profile.optionalRules ? ', con reglas opcionales' : ', sin reglas opcionales'}`));
    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  root.Views = root.Views || {};
  root.Views.RuleProfile = { render };
})(typeof window !== 'undefined' ? window : globalThis);
