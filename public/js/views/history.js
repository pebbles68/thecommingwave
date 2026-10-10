// Vista del historial de resoluciones (correcciones.md COR-005, paso 4),
// extraída de public/js/app.js. "↻ Repetir" carga la resolución guardada en
// el wizard de ataque guiado a través de Views.AntishipWizard.loadStateFromHistory
// (views/antiship-guided-wizard.js) — el estado del wizard vive en ese
// módulo, no aquí, así que nunca se manipula directamente.
(function (root) {
  'use strict';

  const {
    viewRoot, setBreadcrumb, el, backRow,
    loadResolutionHistory, saveResolutionHistoryList, removeResolutionHistoryEntry,
    copyTextToClipboard
  } = AppCore;

  function renderResolutionHistory() {
    setBreadcrumb(['TCW Assistant', 'Historial de resoluciones']);
    viewRoot.innerHTML = '';
    const wrap = el('div', 'turn-view');
    wrap.appendChild(el('h1', 'turn-view__title', 'Historial de resoluciones'));
    wrap.appendChild(el('p', 'turn-view__desc', 'Resoluciones de combate guardadas manualmente desde el botón "💾 Guardar en historial" del wizard. Se guardan en este navegador (localStorage), no en un servidor.'));

    const list = loadResolutionHistory().slice().reverse();
    if (!list.length) {
      wrap.appendChild(el('p', 'pending-note', 'Sin resoluciones guardadas todavía.'));
    } else {
      const clearBtn = el('button', 'btn btn--secondary', 'Vaciar historial');
      clearBtn.type = 'button';
      clearBtn.addEventListener('click', () => {
        if (confirm('¿Vaciar todo el historial de resoluciones guardadas?')) { saveResolutionHistoryList([]); renderResolutionHistory(); }
      });
      wrap.appendChild(clearBtn);

      const entryList = el('div', 'phase-list');
      list.forEach((entry) => {
        const row = el('div', 'phase-card-wrapper');
        const main = el('div', 'phase-card');
        const when = new Date(entry.timestamp).toLocaleString();
        main.appendChild(el('span', 'phase-card__title', entry.workflowTitle));
        main.appendChild(el('span', 'phase-card__count', when));
        if (entry.turnOrigin && entry.turnOrigin.text) main.appendChild(el('span', 'phase-card__count', `Origen: ${entry.turnOrigin.text}`));
        row.appendChild(main);

        const pre = document.createElement('pre');
        pre.className = 'source-refs';
        pre.style.whiteSpace = 'pre-wrap';
        pre.textContent = entry.summaryText;
        row.appendChild(pre);

        const actionsRow = el('div', 'action-row');
        const repeatBtn = el('button', 'btn btn--secondary', '↻ Repetir (cargar en el wizard)');
        repeatBtn.type = 'button';
        repeatBtn.addEventListener('click', () => {
          if (entry.workflowId === 'antiship_guided') {
            Views.AntishipWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/antiship-guided';
          } else if (entry.workflowId === 'antiship_unguided') {
            Views.AntishipUnguidedWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/antiship-unguided';
          } else if (entry.workflowId === 'ground_close_combat') {
            Views.GroundCloseCombatWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/ground-close-combat';
          } else if (entry.workflowId === 'torpedo_vs_surface') {
            Views.TorpedoSurfaceWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/torpedo-surface';
          } else if (entry.workflowId === 'asw_surface_air') {
            Views.AswSurfaceAirWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/asw-surface-air';
          } else if (entry.workflowId === 'air_combat') {
            Views.AirCombatBvrWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/air-combat-bvr';
          } else if (entry.workflowId === 'air_intercept_targets') {
            Views.AirInterceptTargetsWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/air-intercept-targets';
          } else if (entry.workflowId === 'air_combat_wvr') {
            Views.AirCombatWvrWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/air-combat-wvr';
          } else if (entry.workflowId === 'ground_attack_result') {
            Views.GroundAttackResultWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/ground-attack-result';
          } else if (entry.workflowId === 'ground_unguided') {
            Views.GroundUnguidedWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/ground-unguided';
          } else if (entry.workflowId === 'ground_guided') {
            Views.GroundGuidedWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/ground-guided';
          } else if (entry.workflowId === 'ground_reaction') {
            Views.GroundReactionWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/ground-reaction';
          } else if (entry.workflowId === 'logistics_guarantee') {
            Views.LogisticsGuaranteeWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/logistics-guarantee';
          } else if (entry.workflowId === 'space_war') {
            Views.SpaceWarWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/space-war';
          } else if (entry.workflowId === 'cyber_attack') {
            Views.CyberAttackWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/cyber-attack';
          } else if (entry.workflowId === 'port_logistics') {
            Views.PortLogisticsWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/port-logistics';
          } else if (entry.workflowId === 'submarine_ambush') {
            Views.SubmarineAmbushWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/submarine-ambush';
          } else if (entry.workflowId === 'army_resupply') {
            Views.ArmyResupplyWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/army-resupply';
          } else if (entry.workflowId === 'asw_signature_search') {
            Views.AswSignatureSearchWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/asw-signature-search';
          } else if (entry.workflowId === 'asw_search_support') {
            Views.AswAirSearchWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/asw-air-search';
          } else if (entry.workflowId === 'asw_submarine') {
            Views.AswSubmarineWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/asw-submarine';
          } else if (entry.workflowId === 'anti_radiation') {
            Views.AntiRadiationWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/anti-radiation';
          } else if (entry.workflowId === 'ship_impact_effects') {
            Views.ShipImpactEffectsWizard.loadStateFromHistory(entry.state);
            location.hash = '#/wizard/ship-impact-effects';
          }
        });
        actionsRow.appendChild(repeatBtn);

        const copyBtn = el('button', 'btn btn--secondary', '📋 Copiar resumen');
        copyBtn.type = 'button';
        copyBtn.addEventListener('click', () => {
          copyTextToClipboard(entry.summaryText).then((ok) => {
            copyBtn.textContent = ok ? '✓ Copiado' : 'No se pudo copiar';
            setTimeout(() => { copyBtn.textContent = '📋 Copiar resumen'; }, 2000);
          });
        });
        actionsRow.appendChild(copyBtn);

        const removeBtn = el('button', 'btn btn--secondary', '✕ Eliminar');
        removeBtn.type = 'button';
        removeBtn.addEventListener('click', () => { removeResolutionHistoryEntry(entry.id); renderResolutionHistory(); });
        actionsRow.appendChild(removeBtn);

        row.appendChild(actionsRow);
        entryList.appendChild(row);
      });
      wrap.appendChild(entryList);
    }

    wrap.appendChild(backRow());
    viewRoot.appendChild(wrap);
  }

  root.Views = root.Views || {};
  root.Views.History = { renderResolutionHistory };
})(typeof window !== 'undefined' ? window : globalThis);
