// Regresión del hallazgo del humo táctil (AJ-010): escribir en un campo
// numérico y pulsar justo después un botón NO debe perder el primer toque,
// aunque el campo redibuje la vista al perder el foco.
const { test, expect } = require('./fixtures');
const { chooseOption } = require('./wizard-helpers');

async function fillBaseWithoutBlur(page) {
  await page.goto('/#/wizard/ground-guided');
  await chooseOption(page, 'Tipo de ataque:', 'No');
  await chooseOption(page, 'Tipo de munición:', 'Persecución');
  // Último dato: el número, SIN pulsar Tab ni salir del campo antes de pulsar el botón.
  await page.getByLabel('Valor de Ataque base del plan de ataque').fill('4');
}

test('con ratón: el primer clic en «Siguiente» tras escribir en un campo numérico avanza de paso', async ({ page }) => {
  await fillBaseWithoutBlur(page);
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Distancia de ataque (hexágonos)')).toBeVisible({ timeout: 3000 });
});

test('el valor escrito se conserva y la vista se refresca tras el gesto', async ({ page }) => {
  await fillBaseWithoutBlur(page);
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 2 de 4')).toBeVisible();
  await page.getByRole('button', { name: '← Anterior' }).click();
  await expect(page.getByLabel('Valor de Ataque base del plan de ataque')).toHaveValue('4');
});

test('si el gesto no termina en clic, la confirmación se aplica igualmente', async ({ page }) => {
  await page.goto('/#/wizard/ground-guided');
  await chooseOption(page, 'Tipo de ataque:', 'No');
  await chooseOption(page, 'Tipo de munición:', 'Persecución');
  const field = page.getByLabel('Valor de Ataque base del plan de ataque');
  await field.fill('6');
  // Pulsar fuera sobre texto no interactivo: blur + gesto de puntero sin botón.
  await page.getByRole('heading', { level: 2 }).first().click();
  await expect(page.getByText(/Fila de la tabla:/)).toBeVisible();
  await expect(field).toHaveValue('6');
});
