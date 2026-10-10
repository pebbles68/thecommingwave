// Borradores de wizard (ajuste AJ-003): recarga, cancelación, esquema
// incompatible y marcas pendientes huérfanas. La lógica pura se prueba en
// test/wizard-drafts.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function openAndFillUntilStep2(page) {
  await page.goto('/#/wizard/ground-attack-result');
  await fillField(page, 'Puntos de Impacto finales', '10');
  await chooseOption(page, '¿Qué se ataca?', 'Unidad terrestre (principal o técnica)');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 2 de 3: Datos del objetivo')).toBeVisible();
  await fillField(page, 'Valor de Protección de la unidad', '7');
}

test('una recarga recupera el paso y las respuestas, avisa y permite descartar', async ({ page }) => {
  await openAndFillUntilStep2(page);
  await page.reload();
  await expect(page.getByText('Paso 2 de 3: Datos del objetivo')).toBeVisible();
  await expect(page.getByLabel('Valor de Protección de la unidad')).toHaveValue('7');
  await expect(page.getByText('↩ Resolución en curso recuperada')).toBeVisible();

  await page.getByRole('button', { name: '✕ Descartar y empezar de nuevo' }).click();
  await expect(page.getByText('Paso 1 de 3: Impactos y objetivo')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Paso 1 de 3: Impactos y objetivo')).toBeVisible();
  await expect(page.getByLabel('Puntos de Impacto finales')).toHaveValue('');
});

test('un wizard sin tocar no deja borrador y guardar en el historial lo elimina', async ({ page }) => {
  await page.goto('/#/wizard/ground-attack-result');
  await expect(page.getByText('Paso 1 de 3: Impactos y objetivo')).toBeVisible();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tcw-wizard-drafts') || '{}')))).toEqual([]);

  await openAndFillUntilStep2(page);
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tcw-wizard-drafts') || '{}')))).toContain('ground-attack-result');
  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tcw-wizard-drafts') || '{}')))).not.toContain('ground-attack-result');
});

test('un borrador con esquema incompatible o corrupto no rompe el wizard y se explica', async ({ page }) => {
  await page.goto('/#/wizard/ground-attack-result');
  await page.evaluate(() => {
    localStorage.setItem('tcw-wizard-drafts', JSON.stringify({
      'ground-attack-result': { schemaVersion: 99, pendingId: null, state: { step: 1, impacts: '8' } }
    }));
  });
  await page.reload();
  await expect(page.getByText('Paso 1 de 3: Impactos y objetivo')).toBeVisible();
  await expect(page.getByText('⚠ No se puede recuperar la resolución guardada')).toBeVisible();
  await expect(page.getByLabel('Puntos de Impacto finales')).toHaveValue('');

  await page.evaluate(() => localStorage.setItem('tcw-wizard-drafts', '{no es json'));
  await page.reload();
  await expect(page.getByText('Paso 1 de 3: Impactos y objetivo')).toBeVisible();
});

async function startFromSubphase(page) {
  await page.goto('/#/turno/fase/1/ground/combate_terrestre');
  await page.getByRole('button', { name: 'Combate cercano terrestre', exact: false }).click();
  await page.getByRole('button', { name: '▶ Resolver con el wizard de combate' }).click();
  await expect(page).toHaveURL(/#\/wizard\/ground-close-combat/);
  await expect(page.getByText('Paso 1 de 5')).toBeVisible();
}

test('«Volver a la resolución» tras recargar abre el wizard con sus respuestas; cancelar elimina marca y borrador', async ({ page }) => {
  await startFromSubphase(page);
  await page.reload();
  await expect(page.getByText('Paso 1 de 5')).toBeVisible();
  await expect(page.getByText('↩ Resolución en curso recuperada')).toBeVisible();
  await page.goto('/#/turno/fase/1/ground');
  await expect(page.getByText('⏳ Resolución activa: Combate cercano terrestre')).toBeVisible();
  await page.getByRole('button', { name: '↩ Volver a la resolución' }).click();
  await expect(page).toHaveURL(/#\/wizard\/ground-close-combat/);
  await expect(page.getByText("Paso 1 de 5")).toBeVisible();

  await page.goto('/#/turno/fase/1/ground');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '✕ Cancelar resolución' }).click();
  await expect(page.getByText('⏳ Resolución activa')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tcw-wizard-drafts') || '{}')))).not.toContain('ground-close-combat');
});

test('una marca pendiente sin borrador (huérfana) se retira y se explica', async ({ page }) => {
  await startFromSubphase(page);
  await page.evaluate(() => localStorage.removeItem('tcw-wizard-drafts'));
  await page.goto('/#/turno/fase/1/ground');
  await expect(page.getByText(/Se retiraron 1 marca\(s\) de resolución activa sin datos guardados/)).toBeVisible();
  await expect(page.getByText('⏳ Resolución activa')).toHaveCount(0);
});
