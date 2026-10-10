// Caso E2E obligatorio 5 (correcciones.md COR-004): navegación rápida entre
// rutas para detectar renderizados obsoletos. `page.goto()` a una URL que
// solo difiere en el fragmento (#...) es una navegación dentro del mismo
// documento: se resuelve en cuanto Chromium dispara el cambio de hash, SIN
// esperar a que el `router()` async de public/js/app.js termine de resolver
// sus propios `fetch`/`await` internos. Encadenar varias `goto` seguidas es,
// por tanto, una forma real (no artificial) de navegar más rápido de lo que
// tarda cada vista en asentarse.
//
// Este mismo caso encontró una carrera real de renderizados asíncronos
// (varias vistas `async` limpiaban `viewRoot` y reconstruían su contenido
// DESPUÉS de un `await`, sin comprobar si mientras tanto ya había empezado
// una navegación más reciente) — documentada y corregida en COR-005
// (public/js/router.js#Router.currentToken/isCurrent, aplicado a cada vista
// afectada en public/js/app.js). La prueba de abajo usa ahora rutas con y sin
// `await` interno indistintamente; antes de COR-005 solo podía usar rutas
// síncronas para no depender de una corrección todavía pendiente.
const { test, expect } = require('./fixtures');

test('navegar rápidamente entre varias rutas de Ayuda rápida no deja contenido duplicado ni obsoleto', async ({ page }) => {
  const routes = ['/#/', '/#/ayuda', '/#/ayuda/tablas', '/#/ayuda/counters', '/#/ayuda/municion', '/#/ayuda/combate', '/#/'];
  for (const route of routes) {
    await page.goto(route);
  }

  // Tras la ráfaga, la ruta final (Inicio) debe quedar limpia: exactamente
  // un <h1>, sin restos de las vistas intermedias.
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('main#view-root h1')).toHaveCount(1);
  await expect(page.locator('main#view-root h1')).toHaveText('THE COMING WAVE');
  await expect(page.getByText('Seguir turno')).toBeVisible();
});

test('navegar rápidamente entre una fase y varias subfases del turno guiado no deja vistas superpuestas', async ({ page }) => {
  // Mismo principio que el caso anterior, pero sobre las vistas que sí tienen
  // un `await` interno entre limpiar `viewRoot` y su `appendChild` final
  // (renderPhase/renderSubphase → `await renderContextualHelpLinks(...)`,
  // ver public/js/app.js) — el punto exacto donde una ráfaga de navegación
  // podría, en principio, dejar dos vistas coexistiendo.
  const routes = [
    '/#/turno/fase/1/air-1',
    '/#/turno/fase/1/air-1/planificacion_misiones',
    '/#/turno/fase/1/air-1/mantenimiento_cap',
    '/#/turno/fase/1/air-1/recuperacion_largas',
    '/#/turno/fase/1/air-1'
  ];
  for (const route of routes) {
    await page.goto(route);
  }

  await expect(page).toHaveURL(/fase\/1\/air-1$/);
  await expect(page.locator('main#view-root h1')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Aire I — Primera Fase' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Terminar fase' })).toHaveCount(1);
});

test('regresión COR-005: la repro exacta que sobrescribía Inicio con "Combate por tipo" ya no ocurre', async ({ page }) => {
  // Repro original (antes de COR-005, ver git log): encadenar exactamente
  // estas rutas reproducía, de forma intermitente (~40% de las repeticiones
  // en pruebas locales), el renderizado tardío de "Combate por tipo"
  // sobrescribiendo el "Inicio" ya renderizado. Repetido varias veces en la
  // misma prueba para no depender de una única ejecución con suerte.
  for (let i = 0; i < 8; i++) {
    await page.goto('/#/ayuda/combate');
    await page.goto('/#/');
    await expect(page.locator('main#view-root h1')).toHaveCount(1);
    await expect(page.locator('main#view-root h1')).toHaveText('THE COMING WAVE');
  }
});
