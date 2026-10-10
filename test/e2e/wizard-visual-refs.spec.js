// AJ-008: «¿Dónde se lee este valor?» bajo los campos numéricos de los wizards.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function toResultWizardStep2(page, target) {
  await page.goto('/#/wizard/ground-attack-result');
  await fillField(page, 'Puntos de Impacto finales', '10');
  await chooseOption(page, '¿Qué se ataca?', target);
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 2 de 3: Datos del objetivo')).toBeVisible();
}

const panel = (page) => page.locator('#visual-help-panel');
const helpButton = (page, fieldText) => page.locator('label.table-viewer__field', { hasText: fieldText }).locator('xpath=following-sibling::div[1][contains(@class,"visual-ref")]').getByRole('button', { name: '¿Dónde se lee este valor?' });

test('un factor de ficha abre el panel lateral con el factor resaltado en todas las fichas compatibles, también con teclado', async ({ page }) => {
  await toResultWizardStep2(page, 'Unidad terrestre (principal o técnica)');
  const btn = helpButton(page, 'Valor de Protección de la unidad');
  await expect(btn).toBeVisible();
  await expect(panel(page)).toBeHidden();

  // Teclado: foco en el botón y Enter abre el panel sin cambiar de ruta.
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
  await expect(page).toHaveURL(/#\/wizard\/ground-attack-result$/);
  await expect(page.getByText('Paso 2 de 3: Datos del objetivo')).toBeVisible();
  await expect(panel(page).locator('.vh-panel__title')).toHaveText('Unidades terrestres');
  await expect(panel(page).getByText('Campo: Valor de Protección de la unidad.')).toBeVisible();
  // Varias fichas terrestres tienen Protección: se ofrecen todas, con el mismo factor ya resaltado.
  const tabs = panel(page).getByRole('tab');
  expect(await tabs.count()).toBeGreaterThanOrEqual(2);
  await expect(panel(page).locator('.ihv__popover .ihv__title')).toHaveText('Protección');
  await tabs.nth(1).click();
  await expect(panel(page).locator('.ihv__popover .ihv__title')).toHaveText('Protección');
  await expect(panel(page).locator('.ihv__zone.is-active')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(btn).toBeFocused();
});

test('los datos de una hoja de aeródromo o puerto indican el documento de origen', async ({ page }) => {
  await toResultWizardStep2(page, 'Aeródromo (instalación fija)');
  await helpButton(page, 'Capacidad de Hangares').click();
  await expect(panel(page)).toContainText('Aeródromos y puertos');
});

test('los campos que no son una lectura física (tiradas, impactos ya calculados) no llevan ayuda', async ({ page }) => {
  await page.goto('/#/wizard/ground-attack-result');
  const field = page.locator('label.table-viewer__field', { hasText: 'Puntos de Impacto finales' });
  await expect(field).toBeVisible();
  await expect(field.locator('xpath=following-sibling::*[1][contains(@class,"visual-ref")]')).toHaveCount(0);
});

test('la tabla relacionada se abre sin perder el estado del wizard', async ({ page }) => {
  await page.goto('/#/wizard/ground-guided');
  await fillField(page, 'Valor de Ataque base del plan de ataque', '4');
  await chooseOption(page, 'Tipo de ataque:', 'No');
  await chooseOption(page, 'Tipo de munición:', 'Persecución');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, '¿La munición de este ataque está marcada CM (Misil de Crucero) o BM (Misil Balístico)?', 'Sí');
  const field = page.locator('label.table-viewer__field', { hasText: 'Valor de Defensa Aérea agrupado' });
  await expect(field).toBeVisible();
  const help = field.locator('xpath=following-sibling::details[1]');
  await help.locator('summary').click();
  await help.getByRole('button', { name: 'Ver la tabla relacionada' }).click();
  await expect(page).toHaveURL(/#\/ayuda\/tablas\/page-03\.json\/ground-guided-area-air-defense/);
  await page.goBack();
  await expect(page.getByText('Paso 2 de 4')).toBeVisible();
  await expect(page.getByLabel('Distancia de ataque (hexágonos)')).toBeVisible();
});

test('IMG-003/004: la ayuda de aeródromo y puerto abre la tarjeta con la zona pedida seleccionada', async ({ page }) => {
  await toResultWizardStep2(page, 'Aeródromo (instalación fija)');
  await helpButton(page, 'Capacidad de Hangares').click();
  await expect(panel(page).locator('.vh-panel__title')).toHaveText('Fichas de aeródromo');
  await expect(panel(page).locator('.ihv__popover .ihv__title')).toHaveText('Capacidad');
  await expect(panel(page).locator('.ihv__zone.is-active')).toHaveCount(1);

  await helpButton(page, 'Valor de Protección del aeródromo').click();
  await expect(panel(page).locator('.ihv__popover .ihv__title')).toHaveText('Protección');

  // «Preparación» no está validada como zona concreta: se enseña la tarjeta sin zona preseleccionada.
  await chooseOption(page, '¿Se usa la regla opcional de ataque a instalaciones logísticas?', 'Sí');
  await helpButton(page, 'Valor de Preparación actual').click();
  await expect(panel(page).locator('.ihv__svg')).toBeVisible();
  await expect(panel(page).locator('.ihv__zone.is-active')).toHaveCount(0);
});

test('IMG-004: el puerto abre una tarjeta de puerto con su Protección seleccionada', async ({ page }) => {
  await toResultWizardStep2(page, 'Puerto (instalación fija)');
  await helpButton(page, 'Valor de Protección del puerto').click();
  await expect(panel(page).locator('.vh-panel__title')).toHaveText('Fichas de puerto');
  await expect(panel(page).locator('.ihv__popover .ihv__title')).toHaveText('Protección');
  await expect(panel(page).locator('.ihv__svg')).toBeVisible();
});

test('TUR-012: un valor del plan de ataque abre un plan de ejemplo con sus zonas explicadas', async ({ page }) => {
  await page.goto('/#/wizard/ground-guided');
  const btn = helpButton(page, 'Valor de Ataque base del plan de ataque');
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(panel(page).locator('.vh-panel__title')).toHaveText('Planes de ataque');
  await expect(panel(page).getByRole('tab')).toHaveCount(2);
  await expect(panel(page).locator('.ihv__svg')).toBeVisible();
});

test('TUR-012: la ayuda de un wizard no depende de la ruta ni descarta lo respondido', async ({ page }) => {
  await page.goto('/#/wizard/ground-guided');
  await fillField(page, 'Valor de Ataque base del plan de ataque', '4');
  await helpButton(page, 'Valor de Ataque base del plan de ataque').click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByLabel('Valor de Ataque base del plan de ataque')).toHaveValue('4');
  await panel(page).getByRole('button', { name: 'Cerrar la ayuda visual' }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page.getByLabel('Valor de Ataque base del plan de ataque')).toHaveValue('4');
});
test('TUR-012: el campo declara su ayuda por ID estable (data-visual-ref)', async ({ page }) => {
  await toResultWizardStep2(page, 'Unidad terrestre (principal o técnica)');
  await expect(page.locator('label.table-viewer__field', { hasText: 'Valor de Protección de la unidad' })).toHaveAttribute('data-visual-ref', 'ground-protection');
  await expect(page.locator('label.table-viewer__field[data-visual-ref="ground-protection"] + .visual-ref').getByRole('button', { name: '¿Dónde se lee este valor?' })).toBeVisible();
});
