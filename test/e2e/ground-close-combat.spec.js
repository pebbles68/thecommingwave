// Caso E2E del wizard de Combate Cercano Terrestre (roadmap Fase 9, primer
// vertical slice de ataques terrestres). A diferencia del wizard de ataque
// guiado a superficie (Fase 7), no existe una "hoja de ayuda" oficial con un
// ejemplo resuelto para este dominio: este caso reproduce en su lugar el
// ejemplo textual del propio Decision Book §8.7.7 (unidad Clase B, Tamaño de
// Fuerza 6: 2 puntos de daño da la opción de "Derrotada", 3 la fuerza),
// verificado ya contra los datos reales de data/tables/page-02.json en
// test/ground-close-combat-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

test('combate pasivo: valor de ataque 6, tirada 5 y ventaja de guerra electrónica reproducen el cálculo esperado, y el umbral de Derrota Clase B/Tamaño 6 reproduce el ejemplo del Decision Book §8.7.7', async ({ page }) => {
  await page.goto('/#/wizard/ground-close-combat');

  // Paso 1 de 5: Comprobar elegibilidad — combate pasivo (columna "Pasivo").
  await expect(page.getByRole('heading', { name: 'Comprobar elegibilidad' })).toBeVisible();
  await chooseOption(page, '¿El bando está iniciando el combate de forma activa?', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 2 de 5: Calcular fuerza de combate.
  await expect(page.getByRole('heading', { name: 'Calcular fuerza de combate' })).toBeVisible();
  await expect(page.getByText('Columna de resolución: Pasivo')).toBeVisible();
  await fillField(page, 'Introduce el valor total de ataque de las unidades participantes.', '4');
  await fillField(page, 'Introduce el apoyo de combate aplicable.', '2');
  await page.getByLabel('Tirada (1d10)').selectOption('5');
  await expect(page.getByText('Puntos de Impacto (antes de guerra electrónica): 2')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 3 de 5: Guerra electrónica — diferencia 4 a favor de "tu bando", tirada 6 concede ventaja (x2).
  await expect(page.getByRole('heading', { name: 'Guerra electrónica' })).toBeVisible();
  await fillField(page, 'Valor Electrónico más alto de tu bando.', '5');
  await fillField(page, 'Valor Electrónico más alto del bando rival.', '1');
  await expect(page.getByText('Diferencia electrónica: 4 (a favor de tu bando')).toBeVisible();
  await page.getByLabel('Tirada (1d10)').selectOption('6');
  await expect(page.getByText('Ventaja concedida: tu bando duplica')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 4 de 5: Aplicar bajas — Clase B, Tamaño de Fuerza 6 -> umbral "2~3" (Decision Book §8.7.7).
  await expect(page.getByRole('heading', { name: 'Aplicar bajas' })).toBeVisible();
  await chooseOption(page, 'Nivel de reacción de la unidad (A, B, C o D).', 'B');
  await fillField(page, 'Tamaño de Fuerza antes del combate.', '6');
  await expect(page.getByText('Valor Mínimo de Derrota: 2 (opcional) · Valor Máximo de Derrota: 3 (forzosa)')).toBeVisible();
  await fillField(page, 'Daño ya sufrido en este combate por la unidad que estás comprobando (Tamaño de Fuerza).', '2');
  await expect(page.getByText('¿Declaras esta unidad "Derrotada" ahora?')).toBeVisible();
  await chooseOption(page, '¿Declaras esta unidad "Derrotada" ahora?', 'No, sigue combatiendo');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  // Paso 5 de 5: Resultado — 2 Puntos de Impacto x2 (ventaja EW) = 4.
  await expect(page.getByRole('heading', { name: 'Resultado', exact: true })).toBeVisible();
  await expect(page.getByText('Resultado: 4 Punto(s) de Impacto')).toBeVisible();
});

test('unidad Clase B/Tamaño 6 con 3 puntos de daño fuerza la Derrota, sin ofrecer elección (Decision Book §8.7.7)', async ({ page }) => {
  await page.goto('/#/wizard/ground-close-combat');
  await chooseOption(page, '¿El bando está iniciando el combate de forma activa?', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await fillField(page, 'Introduce el valor total de ataque de las unidades participantes.', '4');
  await fillField(page, 'Introduce el apoyo de combate aplicable.', '2');
  await page.getByLabel('Tirada (1d10)').selectOption('5');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await fillField(page, 'Valor Electrónico más alto de tu bando.', '1');
  await fillField(page, 'Valor Electrónico más alto del bando rival.', '1');
  await expect(page.getByText('Valores Electrónicos iguales')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await chooseOption(page, 'Nivel de reacción de la unidad (A, B, C o D).', 'B');
  await fillField(page, 'Tamaño de Fuerza antes del combate.', '6');
  await fillField(page, 'Daño ya sufrido en este combate por la unidad que estás comprobando (Tamaño de Fuerza).', '3');
  await expect(page.getByText('Derrotada forzosamente')).toBeVisible();
  // Al ser forzosa no se pregunta: el botón "Ver resultado" ya está disponible.
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('unidad "Derrotada"')).toBeVisible();
});

test('una unidad fuera de suministro no puede iniciar combate activo: bloquea el avance con el motivo (Decision Book §8.7.2)', async ({ page }) => {
  await page.goto('/#/wizard/ground-close-combat');
  await chooseOption(page, '¿El bando está iniciando el combate de forma activa?', 'Sí');
  await chooseOption(page, 'Si es combate activo: ¿alguna unidad principal que inicia el combate está fuera de suministro?', 'Sí');
  await expect(page.getByText('no se puede continuar con este combate')).toBeVisible();

  let dialogMessage = '';
  page.once('dialog', (dialog) => { dialogMessage = dialog.message(); dialog.accept(); });
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  expect(dialogMessage).toContain('fuera de suministro no puede iniciar combate');

  // No debería haber avanzado de paso.
  await expect(page.getByRole('heading', { name: 'Comprobar elegibilidad' })).toBeVisible();
});
