// Wizard del Reabastecimiento de Campo del Ejército (#/wizard/army-resupply; roadmap
// Fase 14, Decision Book §8.11.3 y página 32). Valores esperados leídos de la página
// 32 impresa de Tablas-de-combate 5.pdf; la mecánica del motor se prueba en
// test/army-resupply-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function fillUnit(page, { acted, supply, enemy, level, current, limit }) {
  await chooseOption(page, '¿La unidad principal está en su cara de "No Actuada"?', acted);
  await chooseOption(page, '¿La unidad tiene la Línea de Suministro sin cortar', supply);
  await chooseOption(page, '¿La unidad comparte hexágono con una unidad principal enemiga?', enemy);
  await chooseOption(page, 'Nivel de Iniciativa de la unidad principal', level);
  await fillField(page, 'Tamaño de fuerza actual de la unidad', String(current));
  await fillField(page, 'Límite impreso original de fuerza de la unidad', String(limit));
}

test('Nivel B, tirada 6: éxito, la fuerza sube de 3 a 4; se guarda y se repite', async ({ page }) => {
  await page.goto('/#/wizard/army-resupply');
  await expect(page.getByText('Paso 1 de 3: Unidad y condiciones')).toBeVisible();
  await fillUnit(page, { acted: 'Sí', supply: 'Sí', enemy: 'No', level: 'B', current: 3, limit: 6 });
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 2 de 3: Tirada')).toBeVisible();
  await page.getByLabel('Tirada (1d10)').selectOption('5');
  await expect(page.getByText('Nivel B, tirada 5 → fila «5»: sin éxito (·).')).toBeVisible();
  await page.getByLabel('Tirada (1d10)').selectOption('6');
  await expect(page.getByText('Nivel B, tirada 6 → fila «6»: Éxito.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByText('Paso 3 de 3: Resultado')).toBeVisible();
  await expect(page.getByText('Resultado: éxito: la fuerza sube de 3 a 4')).toBeVisible();
  await expect(page.getByText(/la unidad debe voltearse a su cara de "Acción Realizada"/)).toBeVisible();
  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/army-resupply$/);
  await expect(page.getByText('Resultado: éxito: la fuerza sube de 3 a 4')).toBeVisible();
  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await expect(page.getByText('Paso 1 de 3: Unidad y condiciones')).toBeVisible();
});

test('éxito con la unidad ya en su límite impreso: no aumenta; Nivel D con tirada 7: sin éxito', async ({ page }) => {
  await page.goto('/#/wizard/army-resupply');
  await fillUnit(page, { acted: 'Sí', supply: 'Sí', enemy: 'No', level: 'A', current: 6, limit: 6 });
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByLabel('Tirada (1d10)').selectOption('9');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: éxito, pero la unidad ya está en su límite impreso (6): no aumenta')).toBeVisible();

  await page.getByRole('button', { name: '← Anterior' }).click();
  await page.getByRole('button', { name: '← Anterior' }).click();
  await chooseOption(page, 'Nivel de Iniciativa de la unidad principal', 'D');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByLabel('Tirada (1d10)').selectOption('7');
  await expect(page.getByText('Nivel D, tirada 7 → fila «7»: sin éxito (·).')).toBeVisible();
});

test('condiciones: sin Línea de Suministro, ya Actuada o con unidad principal enemiga en el hexágono no se puede reabastecer', async ({ page }) => {
  await page.goto('/#/wizard/army-resupply');
  await chooseOption(page, '¿La unidad principal está en su cara de "No Actuada"?', 'No');
  await expect(page.getByText(/No se puede realizar el reabastecimiento: Solo una unidad principal en su cara de "No Actuada"/)).toBeVisible();
  await chooseOption(page, '¿La unidad tiene la Línea de Suministro sin cortar', 'No');
  await expect(page.getByText(/condición previa 1 de la tabla es no tener la Línea de Suministro cortada/)).toBeVisible();
  await chooseOption(page, '¿La unidad comparte hexágono con una unidad principal enemiga?', 'Sí');
  await expect(page.getByText(/No se puede reabastecer una unidad que comparte hexágono con unidades principales enemigas/)).toBeVisible();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 1 de 3: Unidad y condiciones')).toBeVisible();
});

test('el router de tablas "Estratégico > Logística" ofrece el wizard', async ({ page }) => {
  await page.goto('/#/ayuda/tablas/router/estrategico/logistica');
  await page.getByRole('button', { name: /Resolver con el wizard/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/army-resupply$/);
});
