// Un buque que ya estaba dañado y sufre otro punto de daño es eliminado
// directamente, sin verificación por daño crítico (Decision Book §5.9), en la
// asignación de impactos de los wizards antibuque. Con los valores del golden
// test el ataque guiado da 3 impactos.
const { test, expect } = require('./fixtures');
const { fillField, fillGoldenWizardThroughResult } = require('./wizard-helpers');

test('un buque dañado en un impacto anterior y alcanzado otra vez es eliminado directamente, sin tirada de hundimiento', async ({ page }) => {
  await page.goto('/#/wizard/antiship-guided');
  await fillGoldenWizardThroughResult(page, expect);
  await fillField(page, 'Buque 1: identificador', 'BS-A');
  await fillField(page, 'Buque 1: Protección', '1');
  await fillField(page, 'Buque 1: Valor de Hundimiento (≤N)', '0');

  // Impacto 1: daña a BS-A (Protección 1); tirada de hundimiento 9 > 0: sobrevive dañado.
  await page.getByLabel('Tirada de asignación (1d10)').selectOption('0');
  await page.getByLabel('Tirada de hundimiento (1d10)').selectOption('9');
  await page.getByRole('button', { name: 'Confirmar este impacto' }).click();
  await expect(page.getByText('Tirada de hundimiento: 9 > 0 → sobrevive dañada.')).toBeVisible();

  // Impacto 2: el mismo buque, ya dañado -> eliminado directamente, sin pedir tirada de hundimiento.
  await page.getByLabel('Tirada de asignación (1d10)').selectOption('0');
  await expect(page.getByText(/BS-A ya estaba dañado: al sufrir otro punto de daño es eliminado directamente, sin tirada de hundimiento/)).toBeVisible();
  await expect(page.getByLabel('Tirada de hundimiento (1d10)')).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirmar este impacto' }).click();
  await expect(page.getByText('Ya estaba dañado: al sufrir otro punto de daño es eliminado directamente, sin verificación por daño crítico (Decision Book §5.9).')).toBeVisible();
});

test('un buque marcado como ya dañado antes del ataque es eliminado con el primer daño', async ({ page }) => {
  await page.goto('/#/wizard/antiship-guided');
  await fillGoldenWizardThroughResult(page, expect);
  await fillField(page, 'Buque 1: identificador', 'BS-B');
  await fillField(page, 'Buque 1: Protección', '1');
  await fillField(page, 'Buque 1: Valor de Hundimiento (≤N)', '9');
  await page.getByLabel('Buque 1: ¿ya estaba dañado antes del ataque?').selectOption('Sí');
  await page.getByLabel('Tirada de asignación (1d10)').selectOption('0');
  await expect(page.getByLabel('Tirada de hundimiento (1d10)')).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirmar este impacto' }).click();
  await expect(page.getByText('Ya estaba dañado: al sufrir otro punto de daño es eliminado directamente, sin verificación por daño crítico (Decision Book §5.9).')).toBeVisible();
});

test('el golden test no cambia: un buque sano con Valor de Hundimiento 4 y tirada 4 se hunde con la verificación crítica', async ({ page }) => {
  await page.goto('/#/wizard/antiship-guided');
  await fillGoldenWizardThroughResult(page, expect);
  await fillField(page, 'Buque 1: identificador', 'BS-C');
  await fillField(page, 'Buque 1: Protección', '1');
  await fillField(page, 'Buque 1: Valor de Hundimiento (≤N)', '4');
  await page.getByLabel('Tirada de asignación (1d10)').selectOption('0');
  await page.getByLabel('Tirada de hundimiento (1d10)').selectOption('4');
  await page.getByRole('button', { name: 'Confirmar este impacto' }).click();
  await expect(page.getByText('Tirada de hundimiento: 4 ≤ 4 → se hunde y se retira de la flota.')).toBeVisible();
});
