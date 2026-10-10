// Wizard de Verificación de Garantía Logística (#/wizard/logistics-guarantee; roadmap
// Fase 14, Decision Book §11.2-§11.5). La mecánica se prueba en
// test/logistics-guarantee-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption } = require('./wizard-helpers');

test('línea despejada desde un Nodo Avanzado: la unidad terrestre principal tiene garantía; se guarda y se repite', async ({ page }) => {
  await page.goto('/#/wizard/logistics-guarantee');
  await expect(page.getByText('Paso 1 de 3: Unidad')).toBeVisible();
  await chooseOption(page, '¿Qué unidad o instalación necesita garantía logística?', 'Unidad terrestre principal');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 2 de 3: Línea de Comunicación')).toBeVisible();
  await chooseOption(page, 'Nodo de Suministro del que parte la Línea de Comunicación.', 'Nodo de Suministro Avanzado');
  await chooseOption(page, '¿El hexágono del Nodo de Suministro está controlado por el enemigo?', 'No');
  await chooseOption(page, '¿La Línea de Comunicación atraviesa un borde', 'No');
  await chooseOption(page, '¿La línea tendría que pasar a través de un hexágono con unidades enemigas', 'No');
  await chooseOption(page, '¿La línea tendría que pasar a través de un hexágono controlado por el enemigo', 'No');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByText('Paso 3 de 3: Resultado')).toBeVisible();
  await expect(page.getByText('Resultado: con suministros (tiene garantía logística)')).toBeVisible();
  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/logistics-guarantee$/);
  await expect(page.getByText('Resultado: con suministros (tiene garantía logística)')).toBeVisible();
  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await expect(page.getByText('Paso 1 de 3: Unidad')).toBeVisible();
});

test('unidades enemigas en el camino: bloquean sin Contención Táctica y se permite con ella; el puerto sin garantía muestra sus consecuencias', async ({ page }) => {
  await page.goto('/#/wizard/logistics-guarantee');
  await chooseOption(page, '¿Qué unidad o instalación necesita garantía logística?', 'Puerto');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, 'Nodo de Suministro del que parte la Línea de Comunicación.', 'Nodo de Suministro Ordinario (nivel 1 o más)');
  await chooseOption(page, '¿El hexágono del Nodo de Suministro está controlado por el enemigo?', 'No');
  await chooseOption(page, '¿La Línea de Comunicación atraviesa un borde', 'No');
  await chooseOption(page, '¿La línea tendría que pasar a través de un hexágono con unidades enemigas', 'Sí');
  await chooseOption(page, '¿Una unidad aliada puede realizar Contención Táctica', 'No');
  await expect(page.getByText(/La Línea de Comunicación pasa por un hexágono con unidades enemigas y no hay Contención Táctica/)).toBeVisible();
  await chooseOption(page, '¿Una unidad aliada puede realizar Contención Táctica', 'Sí');
  await expect(page.getByText(/La Línea de Comunicación pasa por un hexágono con unidades enemigas y no hay Contención Táctica/)).toHaveCount(0);
  await chooseOption(page, '¿La línea tendría que pasar a través de un hexágono controlado por el enemigo', 'Sí');
  await expect(page.getByText(/La Línea de Comunicación pasa por un hexágono controlado por el enemigo/)).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByText('Resultado: sin suministros (no tiene garantía logística)')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Consecuencias para: Puerto' })).toBeVisible();
  await expect(page.getByText(/No puede realizar reabastecimiento de munición, ni de combustible, ni reparaciones de emergencia/)).toBeVisible();
});

test('sin Nodo de Suministro: sin garantía de inmediato; aeródromo de portaaviones: exento y salta la línea', async ({ page }) => {
  await page.goto('/#/wizard/logistics-guarantee');
  await chooseOption(page, '¿Qué unidad o instalación necesita garantía logística?', 'Aeródromo / Base Aérea');
  await chooseOption(page, '¿Es el aeródromo de un portaaviones o buque de asalto anfibio?', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, 'Nodo de Suministro del que parte la Línea de Comunicación.', 'Ninguno (o Ordinario de nivel 0 / eliminado)');
  await expect(page.getByText('No hay un Nodo de Suministro del que parta la Línea de Comunicación.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: sin suministros (no tiene garantía logística)')).toBeVisible();
  await expect(page.getByText(/No puede reacondicionar unidades; las unidades de vuelo a baja altura no pueden despegar en misión/)).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await chooseOption(page, '¿Qué unidad o instalación necesita garantía logística?', 'Aeródromo / Base Aérea');
  await chooseOption(page, '¿Es el aeródromo de un portaaviones o buque de asalto anfibio?', 'Sí');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 3 de 3: Resultado')).toBeVisible();
  await expect(page.getByText('Resultado: con suministros (tiene garantía logística)')).toBeVisible();
});

test('desde el wizard de reabastecimiento se puede ir a comprobar la garantía logística', async ({ page }) => {
  await page.goto('/#/wizard/army-resupply');
  await page.getByRole('button', { name: /Comprobar la garantía logística/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/logistics-guarantee$/);
});
