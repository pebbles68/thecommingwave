// AJ-004: «Combate por tipo» distingue resultado calculado, aplicación manual pendiente y regla no validada.
const { test, expect } = require('./fixtures');

test('el índice de Combate por tipo muestra el estado de cada tipo de combate', async ({ page }) => {
  await page.goto('/#/ayuda/combate');
  await expect(page.locator('.help-card', { hasText: 'Combate cercano terrestre' })).toContainText('Cálculo detenido en un punto por falta de dato');
  await expect(page.locator('.help-card', { hasText: 'Ataque ASW por unidades de superficie y aéreas' })).toContainText('Resultado calculado y reglas validadas');
  await expect(page.locator('.help-card', { hasText: 'Acciones estratégicas de ataque' })).toContainText('Resultado calculado, con reglas pendientes de validar');
});

test('el detalle separa resultado calculado, aplicación manual pendiente y regla no validada', async ({ page }) => {
  await page.goto('/#/ayuda/combate/air_combat');
  const box = page.locator('.coverage-box');
  await expect(box).toContainText('Estado en la aplicación: Resultado calculado, con reglas pendientes de validar');
  await expect(box).toContainText('Regla no validada: Misión de un bando con grupos distintos');
  await expect(box).toContainText('Aplicación manual pendiente: La composición del grupo de misión');
});

test('un tipo sin wizard propio lo dice explícitamente', async ({ page }) => {
  await page.goto('/#/ayuda/combate/area_air_defense');
  const box = page.locator('.coverage-box');
  await expect(box).toContainText('Parcial: parte del flujo sigue pendiente');
  await expect(box).toContainText('No tiene un wizard propio');
});
