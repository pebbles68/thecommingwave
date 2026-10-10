// Ciclo de vida genérico de navegación por hash (correcciones.md COR-005,
// paso 2), extraído de public/js/app.js: analizar el hash, invocar el
// despachador de rutas, mover el foco tras cada navegación y capturar
// errores — sin conocer qué rutas existen ni qué funciones de vista las
// resuelven (eso sigue en app.js#routeDispatch hasta que se extraigan las
// vistas por dominio, paso 4 del diseño original, todavía pendiente).
//
// También expone el mecanismo anti-carreras de renderizado (paso 3): un
// contador `token` que se incrementa en cada navegación real (`hashchange`/
// `DOMContentLoaded`). Cualquier función de vista asíncrona debe capturar
// `Router.currentToken()` al empezar y comprobar `Router.isCurrent(token)`
// justo antes de su mutación final del DOM — si una navegación posterior ya
// empezó mientras esperaba su propio `fetch`/`await`, debe descartar su
// resultado en vez de sobrescribir una vista más reciente ya renderizada.
// Repro confirmada de este problema real: ver correcciones.md#COR-005.
(function (root) {
  'use strict';

  let token = 0;

  function bump() {
    token += 1;
    return token;
  }

  function currentToken() {
    return token;
  }

  function isCurrent(t) {
    return t === token;
  }

  function parseHash(hash) {
    const clean = (hash || '').replace(/^#/, '') || '/';
    return clean.split('/').filter(Boolean);
  }

  // `dispatch(parts)`: recibe los segmentos de ruta ya separados y resuelve
  // la vista correspondiente (efectos secundarios sobre el DOM; no se espera
  // un valor de retorno). `onError(err)`: se llama si `dispatch` lanza,
  // siempre que la navegación siga siendo la más reciente. `focusTarget`:
  // elemento al que mover el foco tras cada navegación completada (opcional).
  function start({ dispatch, onError, focusTarget }) {
    async function run() {
      const myToken = bump();
      const parts = parseHash(location.hash);
      try {
        await dispatch(parts);
      } catch (err) {
        if (isCurrent(myToken) && onError) onError(err);
        return;
      }
      if (isCurrent(myToken) && focusTarget) focusTarget.focus({ preventScroll: true });
    }
    window.addEventListener('hashchange', run);
    window.addEventListener('DOMContentLoaded', run);
  }

  root.Router = { bump, currentToken, isCurrent, parseHash, start };
})(typeof window !== 'undefined' ? window : globalThis);
