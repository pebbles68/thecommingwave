// Humo táctil (ajuste AJ-010): recorre los gestos principales SOLO con toque
// (tap) en el proyecto Playwright `tablet-touch-smoke` (hasTouch). La
// emulación no sustituye a una pasada en una tablet física, pero detecta
// controles que solo funcionan con ratón.
const { test, expect } = require('./fixtures');

test('con toque: Inicio → Resolver combate → wizard → opciones → siguiente paso', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: /^Resolver combate/ }).tap();
  await page.getByRole('button', { name: /^Ataque terrestre guiado/ }).tap();
  await expect(page).toHaveURL(/#\/wizard\/ground-guided$/);
  await page.getByLabel('Valor de Ataque base del plan de ataque').fill('4');
  await page.getByLabel('Valor de Ataque base del plan de ataque').press('Tab');
  await page.locator('.wizard-question', { hasText: 'Tipo de ataque:' }).getByRole('button', { name: 'No', exact: true }).tap();
  await page.locator('.wizard-question', { hasText: 'Tipo de munición:' }).getByRole('button', { name: 'Persecución' }).tap();
  await page.getByRole('button', { name: 'Siguiente →' }).tap();
  await expect(page.getByText('Distancia de ataque (hexágonos)')).toBeVisible();
});

test('con toque: panel de ayuda, categorías y ayuda «¿Dónde se lee este valor?»', async ({ page }) => {
  await page.goto('/#/wizard/ground-attack-result');
  await page.getByLabel('Puntos de Impacto finales').fill('10');
  await page.getByLabel('Puntos de Impacto finales').press('Tab');
  await page.locator('.wizard-question', { hasText: '¿Qué se ataca?' }).getByRole('button', { name: 'Unidad terrestre (principal o técnica)' }).tap();
  await page.getByRole('button', { name: 'Siguiente →' }).tap();
  const help = page.locator('#visual-help-panel');
  await page.locator('label.table-viewer__field', { hasText: 'Valor de Protección de la unidad' }).locator('xpath=following-sibling::div[1][contains(@class,"visual-ref")]').getByRole('button').tap();
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

test('con toque: el primer toque en «Siguiente» tras escribir un número no se pierde', async ({ page }) => {
  await page.goto('/#/wizard/ground-guided');
  await page.locator('.wizard-question', { hasText: 'Tipo de ataque:' }).getByRole('button', { name: 'No', exact: true }).tap();
  await page.locator('.wizard-question', { hasText: 'Tipo de munición:' }).getByRole('button', { name: 'Persecución' }).tap();
  await page.getByLabel('Valor de Ataque base del plan de ataque').fill('4');
  await page.getByRole('button', { name: 'Siguiente →' }).tap();
  await expect(page.getByText('Distancia de ataque (hexágonos)')).toBeVisible({ timeout: 3000 });
});
