// Caso E2E obligatorio 3 (correcciones.md COR-004): guardar una resolución, recargar la página (page.reload real, para
// probar la persistencia en localStorage) y repetirla desde el historial (#/historial). Fase 25: con el asistente.
const { test, expect } = require('./fixtures');

test('guardar una resolución del asistente, recargar la página y repetirla desde el historial', async ({ page }) => {
  await page.goto('/#/decision/surface.close.same_hex');
  await page.getByRole('button', { name: 'Sí', exact: true }).click();
  await page.getByLabel('Flota atacante: Valor de Artillería Naval sumado de la flota atacante').fill('12');
  await page.getByLabel('Flota atacante: Tirada 1d10 (0 a 9)').fill('0');
  await expect(page.getByText('Resultado: 2 impacto(s), que el atacante reparte entre las unidades de la flota enemiga.')).toBeVisible();
  await page.getByRole('button', { name: 'Protección: 1 daño por impacto' }).click();
  await page.getByRole('button', { name: '💾 Guardar en el historial' }).click();
  await expect(page.getByText('Guardada en el historial.')).toBeVisible();

  await page.reload();
  await page.goto('/#/historial');
  await expect(page.locator('.phase-card__title', { hasText: 'Asistente de combate: Combate naval cercano resuelto' })).toBeVisible();
  await expect(page.getByText(/Resultado: 2 impacto\(s\)/)).toBeVisible();

  await page.getByRole('button', { name: '↻ Repetir (abrir en el asistente)' }).click();
  await expect(page).toHaveURL(/#\/decision\/surface\.close\.same_hex$/);
  await expect(page.getByRole('heading', { name: 'Combate naval cercano resuelto' })).toBeVisible();
  await page.getByRole('button', { name: /^Cambiar la respuesta: ¿Qué clase de unidad/ }).click();
  await expect(page.getByLabel('Flota atacante: Valor de Artillería Naval sumado de la flota atacante')).toHaveValue('12');
});

test('una ruta antigua de wizard abre el punto del asistente que lo sustituye', async ({ page }) => {
  await page.goto('/#/wizard/ground-close-combat');
  await expect(page).toHaveURL(/#\/decision\/e\/land-close$/);
  await page.goto('/#/wizard/ship-impact-effects');
  await expect(page).toHaveURL(/#\/decision\/ext\.impact\.hull$/);
});
