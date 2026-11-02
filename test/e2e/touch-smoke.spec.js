// Humo táctil (ajuste AJ-010): recorre los gestos principales SOLO con toque
// (tap) en el proyecto Playwright `tablet-touch-smoke` (hasTouch). La
// emulación no sustituye a una pasada en una tablet física, pero detecta
// controles que solo funcionan con ratón.
const { test, expect } = require('./fixtures');

test('con toque: Inicio → Resolver combate → asistente → respuesta → pregunta siguiente', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: /^Resolver combate/ }).tap();
  await page.getByRole('button', { name: /^Ataque terrestre guiado/ }).tap();
  await expect(page).toHaveURL(/#\/decision\/e\/land-guided$/);
  await page.getByRole('button', { name: 'Instalación fija' }).tap();
  await expect(page.getByRole('heading', { name: '¿Cuál es el Valor Electrónico de la instalación fija?' })).toBeVisible();
  await page.getByRole('button', { name: /^Cambiar la respuesta: ¿Qué clase de objetivo/ }).tap();
  await expect(page.getByRole('heading', { name: '¿Qué clase de objetivo recibe el ataque terrestre guiado?' })).toBeVisible();
});

test('con toque: panel de ayuda, categorías y ayuda «¿Dónde se lee este valor?»', async ({ page }) => {
  await page.goto('/#/decision/location.mobile.cover');
  const help = page.locator('#visual-help-panel');
  await page.getByRole('button', { name: /^Ver en la ficha: Protección/ }).first().tap();
  await expect(help.locator('.ihv__hit').first()).toBeVisible();
  await help.locator('.ihv__list-btn').first().tap();
  await expect(help.locator('.ihv__popover')).toBeVisible();
  await help.getByRole('button', { name: 'Cerrar la ayuda visual' }).tap();
  await expect(help).toBeHidden();

  await page.getByRole('button', { name: /Ayuda/ }).first().tap();
  await expect(page.locator('#help-panel')).toBeVisible();
});

test('con toque: zoom de iconos, «Volver arriba» y navegación de turno', async ({ page }) => {
  await page.goto('/#/ayuda/municion/iconos');
  const icon = page.locator('.ammo-icon-card__btn').first();
  await icon.tap();
  await expect(icon).toHaveAttribute('aria-pressed', 'true');
  await icon.tap();
  await expect(icon).toHaveAttribute('aria-pressed', 'false');

  await page.goto('/#/ayuda/deteccion');
  await page.evaluate(() => { (document.scrollingElement || document.documentElement).scrollTop = 900; });
  const up = page.locator('#btn-scroll-top');
  await expect(up).toBeVisible();
  await up.tap();
  await expect.poll(() => page.evaluate(() => (document.scrollingElement || document.documentElement).scrollTop)).toBe(0);

  await page.goto('/#/turno');
  await page.locator('.phase-card, .help-card, .action-card').first().tap();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('con toque: el primer toque en una respuesta tras escribir un número no se pierde', async ({ page }) => {
  await page.goto('/#/decision/surface.guided.vef');
  await page.getByLabel('Defensa: Valor Electrónico más alto de los buques de la flota').fill('4');
  await page.getByRole('button', { name: '1-8', exact: true }).tap();
  await expect(page.getByRole('heading', { name: '¿El atacante está a baja altura y algún buque elegible puede contraatacar?' })).toBeVisible({ timeout: 3000 });
});
