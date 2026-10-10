// Pantalla «Perfil de reglas» (#/perfil-reglas; roadmap Fase 14). La lógica se prueba en
// test/rule-profile-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption } = require('./wizard-helpers');

test('por defecto solo reglas básicas: la reparación de buques está oculta; al activar las reglas opcionales aparece y se recuerda', async ({ page }) => {
  await page.goto('/#/wizard/port-logistics');
  const group = page.locator('.wizard-question', { hasText: '¿Qué quieres comprobar?' });
  await expect(group.getByRole('button', { name: 'Reabastecer munición en puerto', exact: true })).toBeVisible();
  await expect(group.getByRole('button', { name: /Reparar un buque dañado/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cambiar el perfil de reglas' }).click();

  await expect(page).toHaveURL(/#\/perfil-reglas$/);
  await expect(page.getByText('Perfil actual: reglas básicas, sin reglas opcionales')).toBeVisible();
  await chooseOption(page, '¿Juegas con las reglas opcionales del Decision Book?', 'Sí');
  await expect(page.getByText('Perfil actual: reglas básicas, con reglas opcionales')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Perfil actual: reglas básicas, con reglas opcionales')).toBeVisible();
  await page.goto('/#/wizard/port-logistics');
  await expect(page.locator('.wizard-question', { hasText: '¿Qué quieres comprobar?' }).getByRole('button', { name: /Reparar un buque dañado/ })).toBeVisible();

  await page.goto('/#/perfil-reglas');
  await chooseOption(page, '¿Juegas con el contenido de la expansión?', 'Sí');
  await expect(page.getByText('Perfil actual: con expansión, con reglas opcionales')).toBeVisible();
});

test('la ayuda de reglas marca como desactivada en tu perfil una regla opcional', async ({ page }) => {
  await page.goto('/#/ayuda/reglas');
  await expect(page.getByText(/regla opcional \(desactivada en tu perfil\)/).first()).toBeVisible();
});
