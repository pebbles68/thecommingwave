// Wizard de Logística de puerto y munición (#/wizard/port-logistics; roadmap Fase 14,
// Decision Book §9.9.4, §9.9.5, §11.6). La mecánica se prueba en test/port-logistics-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

test('reabastecimiento: el puerto limita las unidades reabastecidas; se guarda y se repite', async ({ page }) => {
  await page.goto('/#/wizard/port-logistics');
  await expect(page.getByText('Paso 1 de 3: Operación')).toBeVisible();
  await chooseOption(page, '¿Qué quieres comprobar?', 'Reabastecer munición en puerto');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 2 de 3: Datos')).toBeVisible();
  await fillField(page, 'Unidades que quieres reabastecer', '5');
  await fillField(page, 'Valor de Reabastecimiento de Munición del puerto', '3');
  await chooseOption(page, '¿Todas esas unidades están en el área', 'Sí');
  await expect(page.getByText(/no puede reabastecer más unidades que su valor/)).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByText('Resultado: se reabastecen 3 de 5 unidades')).toBeVisible();
  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/port-logistics$/);
  await expect(page.getByText('Resultado: se reabastecen 3 de 5 unidades')).toBeVisible();
  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await expect(page.getByText('Paso 1 de 3: Operación')).toBeVisible();
});

test('reparación de un buque: éxito con tirada menor que REP y bloqueo si es multi-barco', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tcw-rule-profile', JSON.stringify({ expansion: false, optionalRules: true })));
  await page.goto('/#/wizard/port-logistics');
  await chooseOption(page, '¿Qué quieres comprobar?', 'Reparar un buque dañado (opcional)');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, '¿El buque está dentro de un puerto?', 'Sí');
  await chooseOption(page, '¿El buque está en su lado Dañado?', 'Sí');
  await chooseOption(page, '¿Es una unidad de superficie multi-barco', 'Sí');
  await expect(page.getByText(/multi-barco \(marca X2, X3, etc\.\) no pueden ser reparadas/)).toBeVisible();
  await chooseOption(page, '¿Es una unidad de superficie multi-barco', 'No');
  await chooseOption(page, '¿Ya ha intentado repararse', 'No');
  await fillField(page, 'Buques en el Dique Seco (contando este)', '1');
  await fillField(page, 'Número de Diques (DOCK) del puerto', '2');
  await fillField(page, 'Valor de Reparación de Buques (REP) del puerto', '6');
  await fillField(page, 'Tirada de 1d10', '5');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: reparación con éxito')).toBeVisible();

  await page.getByRole('button', { name: '← Anterior' }).click();
  await fillField(page, 'Tirada de 1d10', '6');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: reparación fallida')).toBeVisible();
});

test('reparaciones de emergencia y agotamiento de munición', async ({ page }) => {
  await page.goto('/#/wizard/port-logistics');
  await chooseOption(page, '¿Qué quieres comprobar?', 'Reparaciones de emergencia del puerto');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await fillField(page, 'Valor de Reparación Rápida (RR) del puerto', '4');
  await fillField(page, 'Marcadores de «Instalaciones Inutilizadas» del puerto', '1');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: se eliminan 1 marcadores y quedan 0')).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await chooseOption(page, '¿Qué quieres comprobar?', 'Agotamiento de munición');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await fillField(page, 'Munición restante de ese tipo', '2');
  await fillField(page, 'Valor de ataque del plan de ataque', '5');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: valor de ataque efectivo 2')).toBeVisible();
});

test('desde el turno, la Fase 0 ofrece el atajo a la logística de puerto', async ({ page }) => {
  await page.goto('/#/wizard/port-logistics');
  await expect(page.getByRole('heading', { name: 'Logística de puerto y munición' })).toBeVisible();
});

test('desgaste de un Nodo de Suministro Ordinario al final de la Fase de Logística', async ({ page }) => {
  await page.goto('/#/wizard/port-logistics');
  await chooseOption(page, '¿Qué quieres comprobar?', 'Desgaste de un Nodo de Suministro Ordinario');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await fillField(page, 'Marcadores de nivel del Nodo de Suministro Ordinario', '1');
  await chooseOption(page, '¿Ha dado garantía logística a alguna unidad', 'Sí');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: el Nodo se elimina (nivel 0)')).toBeVisible();
  await page.getByRole('button', { name: '← Anterior' }).click();
  await fillField(page, 'Marcadores de nivel del Nodo de Suministro Ordinario', '3');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: el Nodo queda en nivel 2')).toBeVisible();
});
