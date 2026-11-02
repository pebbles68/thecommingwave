// Vista del historial de resoluciones (correcciones.md COR-005, paso 4). "↻ Repetir" abre una resolución del asistente
// de combate en la misma pregunta y con los mismos datos (Views.DecisionGraph.restoreFromHistory).
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
    wrap.appendChild(el('p', 'turn-view__desc', 'Resoluciones de combate guardadas con el botón "💾 Guardar en el historial" del asistente de combate. Se guardan en este navegador (localStorage), no en un servidor.'));

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
        // Fase 25: los wizards se han retirado. Una resolución del asistente se repite; la de un wizard antiguo queda
        // como resumen (sus datos ya no se pueden cargar en ninguna pantalla).
        if (entry.workflowId === 'decision') {
          const repeatBtn = el('button', 'btn btn--secondary', '↻ Repetir (abrir en el asistente)');
          repeatBtn.type = 'button';
          repeatBtn.addEventListener('click', () => Views.DecisionGraph.restoreFromHistory(entry.state));
          actionsRow.appendChild(repeatBtn);
        } else {
          actionsRow.appendChild(el('span', 'source-refs', 'Resolución de un wizard ya retirado: se conserva solo el resumen.'));
        }

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
