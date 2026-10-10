// Caso E2E obligatorio 3 (correcciones.md COR-004): guardar una resolución,
// recargar la página (page.reload real, no solo navegación por hash — para
// probar de verdad la persistencia en localStorage, no solo el estado en
// memoria de la SPA) y repetirla desde el historial (#/historial).
const { test, expect } = require('./fixtures');
const { fillGoldenWizardThroughResult } = require('./wizard-helpers');

test('guardar una resolución del wizard, recargar la página y repetirla desde el historial', async ({ page }) => {
  await page.goto('/#/wizard/antiship-guided');
  await fillGoldenWizardThroughResult(page, expect);

  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();

  // Recarga real de la página (no solo cambio de hash): confirma que la
  // entrada sobrevive en localStorage, no solo en el estado en memoria de la SPA.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ataque antibuque guiado' })).toBeVisible();

  await page.goto('/#/historial');
  await expect(page.getByRole('heading', { name: 'Historial de resoluciones' })).toBeVisible();
  await expect(page.locator('.phase-card__title', { hasText: 'Ataque antibuque guiado' })).toBeVisible();
  await expect(page.getByText('Resultado: 3 impacto(s)')).toBeVisible();

  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();

  // Repetir carga el snapshot guardado y salta directamente al paso 6
  // "Resultado", reproduciendo el mismo cálculo sin volver a introducir datos.
  await expect(page).toHaveURL(/#\/wizard\/antiship-guided$/);
  await expect(page.getByRole('heading', { name: 'Resultado', exact: true })).toBeVisible();
  await expect(page.getByText('Resultado: 3 impacto(s)')).toBeVisible();
});

// COR03-006: tras dividir el wizard guiado en modelo/pasos/resultado/
// controlador, "Reiniciar wizard" (callback del controlador, no del paso
// Resultado) debe volver al primer paso con el estado limpio.
test('Reiniciar wizard desde el Resultado vuelve al primer paso con el estado limpio', async ({ page }) => {
  await page.goto('/#/wizard/antiship-guided');
  await fillGoldenWizardThroughResult(page, expect);
  await expect(page.getByText('Resultado: 3 impacto(s)')).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();

  await expect(page.getByText(/^Paso 1 de 6:/)).toBeVisible();
  await expect(page.getByText('Resultado: 3 impacto(s)')).toHaveCount(0);
});
