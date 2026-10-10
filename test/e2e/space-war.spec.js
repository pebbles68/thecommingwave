// Wizard de Guerra espacial (#/wizard/space-war; roadmap Fase 14, Decision Book §14.5-§14.9, regla opcional).
// La mecánica se prueba en test/strategic-actions-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

test('orden de acciones: con empate total decide el d10; se guarda y se repite', async ({ page }) => {
  await page.goto('/#/wizard/space-war');
  await expect(page.getByText('Paso 1 de 3: Acción')).toBeVisible();
  await expect(page.getByText(/tu perfil de reglas no la tiene activada/)).toBeVisible();
  await chooseOption(page, '¿Qué quieres comprobar?', 'Orden de las acciones activas');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await fillField(page, 'Recursos de Lanzamiento disponibles de tu bando', '3');
  await fillField(page, 'Recursos de Lanzamiento disponibles del bando rival', '3');
  await fillField(page, 'Recursos Orbitales disponibles de tu bando', '4');
  await fillField(page, 'Recursos Orbitales disponibles del bando rival', '4');
  await expect(page.getByText(/Empate en Lanzamiento y en Orbitales/)).toBeVisible();
  await fillField(page, 'Tirada de 1d10 de tu bando (0-9)', '5');
  await fillField(page, 'Tirada de 1d10 del bando rival (0-9)', '5');
  await expect(page.getByText('Los dados han empatado: se vuelve a tirar hasta que uno saque más.')).toBeVisible();
  await fillField(page, 'Tirada de 1d10 del bando rival (0-9)', '2');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: tu bando elige si actuar primero o segundo')).toBeVisible();
  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/space-war$/);
  await expect(page.getByText('Resultado: tu bando elige si actuar primero o segundo')).toBeVisible();
});

test('Ataque Duro: 3 d10 clasificados con la tabla; con Maniobra Orbital solo 1 tirada', async ({ page }) => {
  await page.goto('/#/wizard/space-war');
  await chooseOption(page, '¿Qué quieres comprobar?', 'Destrucción espacial');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, '¿Qué ataque de Destrucción Espacial?', 'Ataque Duro');
  await chooseOption(page, '¿El objetivo hace una Maniobra Orbital', 'No');
  await fillField(page, 'Recursos Orbitales disponibles del enemigo', '5');
  await expect(page.getByRole('heading', { name: '3 tiradas de 1d10' })).toBeVisible();
  await fillField(page, 'Resultados de los d10 de destrucción', '8 0 4');
  await expect(page.getByText('1 Éxito, 1 Fallo, 1 sin efecto.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: 1 Recurso(s) Orbital(es) enemigo(s) y 3 escombro(s)')).toBeVisible();
  await expect(page.getByText('Destruyes 1 de tus Recursos de Lanzamiento.')).toBeVisible();

  await page.getByRole('button', { name: '← Anterior' }).click();
  await chooseOption(page, '¿El objetivo hace una Maniobra Orbital', 'Sí');
  await expect(page.getByRole('heading', { name: '1 tirada de 1d10' })).toBeVisible();
  await fillField(page, 'Resultados de los d10 de destrucción', '9');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: 1 Recurso(s) Orbital(es) enemigo(s) y 2 escombro(s)')).toBeVisible();
});

test('Tormenta de Escombros, desaparición de escombros y apoyo espacial informativo', async ({ page }) => {
  await page.goto('/#/wizard/space-war');
  await chooseOption(page, '¿Qué quieres comprobar?', 'Tormenta de Escombros');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await fillField(page, 'Escombros Espaciales presentes', '5');
  await fillField(page, 'Tirada de 1d10 de la Tormenta de Escombros (0-9)', '4');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: Colisión')).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await chooseOption(page, '¿Qué quieres comprobar?', 'Desaparición de escombros');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await fillField(page, 'Escombros Espaciales presentes', '4');
  await fillField(page, 'Tirada de 1d10 de desaparición de escombros (0-9)', '3');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: desaparecen 3 escombros, quedan 1')).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await chooseOption(page, '¿Qué quieres comprobar?', 'Apoyo espacial');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, '¿Qué acción de Apoyo Espacial?', 'Soporte de Comunicaciones Satelitales');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText(/sube temporalmente su Valor de Electrónica a 7/)).toBeVisible();
});
