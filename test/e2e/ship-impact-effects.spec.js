// Wizard de Efectos del impacto antibuque (#/wizard/ship-impact-effects;
// roadmap Fase 12, Decision Book §5.9). La lógica del motor se prueba en
// test/ship-impact-effects-engine.test.js; aquí, los recorridos de la vista.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

test('buque único sin escudo, portaeronaves: verificación crítica con tirada <= Resistencia -> hundido, pierde las aeronaves de su ficha; se guarda y se repite', async ({ page }) => {
  await page.goto('/#/wizard/ship-impact-effects');
  await expect(page.getByText('Paso 1 de 3: Unidad objetivo')).toBeVisible();
  await chooseOption(page, 'Tipo de casco', 'Buque único (sin marcador numérico)');
  await chooseOption(page, '¿El reverso de la ficha tiene contenido', 'Sí');
  await chooseOption(page, '¿La unidad ya estaba en su lado dañado', 'No');
  await chooseOption(page, '¿Es un Buque de Asalto Anfibio?', 'No');
  await chooseOption(page, 'símbolo de escudo', 'No');
  await chooseOption(page, 'unidad portaeronaves', 'Sí');
  await chooseOption(page, 'unidad de transporte', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 2 de 3: Verificación por daño crítico')).toBeVisible();
  // Con la tirada antes que la Resistencia, la vista no rechaza la entrada a medias.
  await page.getByLabel('Tirada de daño crítico (1d10)').selectOption('4');
  await fillField(page, 'Valor de Resistencia al Hundimiento de la unidad', '5');
  await page.getByLabel('Tirada de daño crítico (1d10)').selectOption('4');
  await expect(page.getByText('Tirada 4 ≤ Resistencia 5 → la unidad es hundida inmediatamente.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByText('Resultado: Hundida')).toBeVisible();
  await expect(page.getByText(/todas las unidades aéreas o de baja altitud de su Ficha de Aeródromo son eliminadas/)).toBeVisible();

  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/ship-impact-effects$/);
  await expect(page.getByText('Resultado: Hundida')).toBeVisible();

  await page.getByRole('button', { name: 'Nueva unidad' }).click();
  await expect(page.getByText('Paso 1 de 3: Unidad objetivo')).toBeVisible();
});

test('multi-buque con 3 barcos y transporte: reduce la flota a 2 y avisa de la pérdida de capacidad', async ({ page }) => {
  await page.goto('/#/wizard/ship-impact-effects');
  await chooseOption(page, 'Tipo de casco', 'Multi-buque (marcas x3, x4, x5 junto a la silueta)');
  await fillField(page, 'Barcos que le quedaban a la unidad antes del impacto', '3');
  await chooseOption(page, 'unidad portaeronaves', 'No');
  await chooseOption(page, 'unidad de transporte', 'Sí');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Para esta unidad no hay verificación por daño crítico')).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: Tamaño de flota reducido en 1')).toBeVisible();
  await expect(page.getByText('Tamaño de flota: 3 → 2.')).toBeVisible();
  await expect(page.getByText(/hay que eliminar tropas \(o suministros\) equivalentes a la capacidad perdida/)).toBeVisible();
});

test('Buque de Asalto Anfibio: hundido inmediatamente, sin tirada; buque único con escudo: solo se da la vuelta', async ({ page }) => {
  await page.goto('/#/wizard/ship-impact-effects');
  await chooseOption(page, 'Tipo de casco', 'Buque único (sin marcador numérico)');
  await chooseOption(page, '¿El reverso de la ficha tiene contenido', 'Sí');
  await chooseOption(page, '¿La unidad ya estaba en su lado dañado', 'No');
  await chooseOption(page, '¿Es un Buque de Asalto Anfibio?', 'Sí');
  await chooseOption(page, 'símbolo de escudo', 'No');
  await chooseOption(page, 'unidad portaeronaves', 'No');
  await chooseOption(page, 'unidad de transporte', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: Hundida')).toBeVisible();

  await page.getByRole('button', { name: 'Nueva unidad' }).click();
  await chooseOption(page, 'Tipo de casco', 'Buque único (sin marcador numérico)');
  await chooseOption(page, '¿El reverso de la ficha tiene contenido', 'Sí');
  await chooseOption(page, '¿La unidad ya estaba en su lado dañado', 'No');
  await chooseOption(page, '¿Es un Buque de Asalto Anfibio?', 'No');
  await chooseOption(page, 'símbolo de escudo', 'Sí');
  await chooseOption(page, 'unidad portaeronaves', 'No');
  await chooseOption(page, 'unidad de transporte', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: Dañada (se da la vuelta; sigue en juego)')).toBeVisible();
});
