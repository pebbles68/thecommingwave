// AJ-005: el visor distingue «transcripción verificada» de «regla pendiente».
const { test, expect } = require('./fixtures');

test('el índice de tablas separa transcripción verificada y regla pendiente', async ({ page }) => {
  await page.goto('/#/ayuda/tablas');
  const p13 = page.locator('.help-card', { hasText: 'Pág. 13 —' });
  await expect(p13).toContainText('transcripción verificada · regla validada');
  const p16 = page.locator('.help-card', { hasText: 'Pág. 16 —' });
  await expect(p16).toContainText('transcripción verificada · regla validada');
  const p22 = page.locator('.help-card', { hasText: 'Pág. 22 —' });
  await expect(p22).toContainText('transcripción verificada · regla pendiente de validar');
  await expect(page.getByText('needs review')).toHaveCount(0);
});

test('la página 33 lista los motivos de la regla pendiente y la 13 no muestra aviso', async ({ page }) => {
  await page.goto('/#/ayuda/tablas/page-33.json');
  await expect(page.getByText(/Los datos de la tabla coinciden con el PDF; lo pendiente es una regla de uso/)).toBeVisible();
  await expect(page.getByText(/Si cada icono de la tabla representa a la vez el marco cerrado y el abierto/)).toBeVisible();
  await page.goto('/#/ayuda/tablas/page-13.json');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Pág. 13');
  await expect(page.getByText(/regla pendiente/)).toHaveCount(0);
});
