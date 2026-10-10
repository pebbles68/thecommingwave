// Grupo de misión aéreo compartido (#/wizard/air-mission-group; roadmap Fase 11). La lógica pura se prueba en
// test/air-mission-group.test.js; aquí, que se guarda en el navegador y que lo cargan los dos asistentes.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function buildGroup(page) {
  await page.goto('/#/wizard/air-mission-group');
  await page.getByRole('button', { name: /\+ Añadir unidad a Bando A/ }).click();
  await fillField(page, 'A · unidad 1: nombre', 'F-16 Alfa');
  await fillField(page, 'A · unidad 1: Valor de Combate Aéreo (vacío si no tiene)', '5');
  await fillField(page, 'A · unidad 1: Valor de Protección', '3');
  await fillField(page, 'A · unidad 1: Valor Electrónico', '2');
  await page.getByRole('button', { name: /\+ Añadir unidad a Bando B/ }).click();
  await fillField(page, 'B · unidad 1: nombre', 'Su-35 Bravo');
  await fillField(page, 'B · unidad 1: Valor de Combate Aéreo (vacío si no tiene)', '6');
  await fillField(page, 'B · unidad 1: Valor de Protección', '4');
  await fillField(page, 'B · unidad 1: Valor Electrónico', '4');
}

test('el grupo de misión se guarda en el navegador y sobrevive a una recarga', async ({ page }) => {
  await buildGroup(page);
  await expect(page.getByText('1 unidad(es): 1 en combate, 0 retirada(s), 0 fuera de combate, 0 eliminada(s).').first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('A · unidad 1: nombre')).toHaveValue('F-16 Alfa');
  await expect(page.getByLabel('B · unidad 1: Valor Electrónico')).toHaveValue('4');
});

test('el combate cercano WVR carga el grupo; una unidad retirada entra como salida del BVR', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await buildGroup(page);
  await chooseOption(page, 'A · unidad 1: estado', 'Retirada');
  await page.goto('/#/wizard/air-combat-wvr');
  await page.getByRole('button', { name: 'Cargar el grupo de misión' }).click();
  await expect(page.getByLabel('A: nombre (opcional)')).toHaveValue('Bando A');
  await expect(page.getByLabel('A · unidad 1: nombre')).toHaveValue('F-16 Alfa');
  await expect(page.getByLabel('A · unidad 1: Valor de Protección')).toHaveValue('3');
  await expect(page.locator('.wizard-question', { hasText: 'A · unidad 1: ¿se retiró o salió de combate' }).locator('.is-active')).toHaveText('Sí');
  await expect(page.locator('.wizard-question', { hasText: 'B · unidad 1: ¿se retiró o salió de combate' }).locator('.is-active')).toHaveText('No');
});

test('la asignación de objetivos carga solo las unidades en combate y guarda sus datos de vuelta', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await buildGroup(page);
  await page.goto('/#/wizard/air-intercept-targets');
  await page.getByRole('button', { name: 'Cargar el grupo de misión' }).click();
  await expect(page.getByLabel('A · unidad 1: nombre')).toHaveValue('F-16 Alfa');
  await expect(page.getByLabel('B · unidad 1: nombre')).toHaveValue('Su-35 Bravo');
  await expect(page.getByLabel('B · unidad 1: Valor Electrónico')).toHaveValue('4');
  await fillField(page, 'A · unidad 1: Valor Electrónico', '7');
  await page.getByRole('button', { name: 'Guardar estos participantes en el grupo de misión' }).click();
  await page.goto('/#/wizard/air-mission-group');
  await expect(page.getByLabel('A · unidad 1: Valor Electrónico')).toHaveValue('7');
});

test('un grupo vacío avisa al cargarlo y no cambia el asistente', async ({ page }) => {
  let message = '';
  page.on('dialog', (d) => { message = d.message(); d.accept(); });
  await page.goto('/#/wizard/air-combat-wvr');
  await page.getByRole('button', { name: 'Cargar el grupo de misión' }).click();
  expect(message).toContain('El grupo de misión está vacío');
});
