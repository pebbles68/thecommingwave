// Wizard de Búsqueda Aérea ASW (#/wizard/asw-air-search; roadmap Fase 13,
// Decision Book §9.15.4). Valores esperados leídos de la página 34 impresa de
// Tablas-de-combate 5.pdf; la mecánica del motor se prueba en
// test/asw-air-search-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function fillTarget(page, { event, cap, depth, signature, moving }) {
  await chooseOption(page, 'Momento de la búsqueda.', event);
  await chooseOption(page, 'Zona de Patrulla Aérea enemiga', cap);
  await chooseOption(page, 'Profundidad del océano', depth);
  await fillField(page, 'Valor de Firma (SIG) impreso del submarino objetivo.', signature);
  await chooseOption(page, '¿El submarino objetivo está en su lado "En Movimiento"?', moving);
}

test('rutina, P.3, Firma 5, unidades 4, 3 (Alta Velocidad, excluida) y 8: total 12 -> "6+"; tirada 6 -> éxito; se guarda y se repite', async ({ page }) => {
  await page.goto('/#/wizard/asw-air-search');
  await expect(page.getByText('Paso 1 de 4: Evento y objetivo')).toBeVisible();
  await fillTarget(page, { event: 'Búsqueda de rutina', cap: 'No', depth: 'P.3 — Aguas semi-profundas', signature: '5', moving: 'No' });
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 2 de 4: Unidades que buscan')).toBeVisible();
  await fillField(page, 'Unidad 1: Valor de Detección Aérea (ASW) de la unidad', '4');
  await page.getByRole('button', { name: '+ Añadir otra unidad' }).click();
  await fillField(page, 'Unidad 2: Valor de Detección Aérea (ASW) de la unidad', '3');
  await chooseOption(page, 'Unidad 2: Formación de superficie a Alta Velocidad', 'Sí');
  await page.getByRole('button', { name: '+ Añadir otra unidad' }).click();
  await fillField(page, 'Unidad 3: Valor de Detección Aérea (ASW) de la unidad', '8');
  await expect(page.getByText(/Unidad 2 \(3\): no suma — Las formaciones de superficie en estado de "Alta Velocidad"/)).toBeVisible();
  await expect(page.getByText('Valor de Detección Aérea total: 12')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 3 de 4: Tirada')).toBeVisible();
  await page.getByLabel('Tirada (1d10)').selectOption('6');
  await expect(page.getByText(/Rango de descubrimiento \(columna «12~13», fila «5»\): 6\+\. Tirada 6 → la búsqueda tiene éxito/)).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByText(/Resultado: la búsqueda tiene éxito — el submarino queda Expuesto/)).toBeVisible();
  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/asw-air-search$/);
  await expect(page.getByText(/Resultado: la búsqueda tiene éxito/)).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await expect(page.getByText('Paso 1 de 4: Evento y objetivo')).toBeVisible();
});

test('una búsqueda de rutina contra un submarino en aguas profundas, o con el objetivo en zona de patrulla enemiga, bloquea el avance con el motivo', async ({ page }) => {
  await page.goto('/#/wizard/asw-air-search');
  await fillTarget(page, { event: 'Búsqueda de rutina', cap: 'Sí', depth: 'P.4 — Aguas profundas', signature: '5', moving: 'No' });
  await expect(page.getByText(/No se puede realizar esta búsqueda: No se puede realizar Búsqueda Aérea ASW contra unidades submarinas enemigas ubicadas dentro de una Zona de Patrulla Aérea enemiga/)).toBeVisible();
  await expect(page.getByText(/Durante una Búsqueda de "Rutina", la Búsqueda Aérea ASW no puede detectar unidades submarinas en Aguas Profundas/)).toBeVisible();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 1 de 4: Evento y objetivo')).toBeVisible();
});

test('después del ataque (tabla propia), P.2, Firma 6, Valor 9 -> "1+": la tirada 0 falla y la 1 tiene éxito', async ({ page }) => {
  await page.goto('/#/wizard/asw-air-search');
  await fillTarget(page, { event: 'Después del ataque', cap: 'No', depth: 'P.2 — Aguas poco profundas', signature: '6', moving: 'No' });
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await fillField(page, 'Unidad 1: Valor de Detección Aérea (ASW) de la unidad', '9');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByLabel('Tirada (1d10)').selectOption('0');
  await expect(page.getByText(/columna «9~10», fila «5\+»\): 1\+\. Tirada 0 → la búsqueda falla/)).toBeVisible();
  await page.getByLabel('Tirada (1d10)').selectOption('1');
  await expect(page.getByText(/Tirada 1 → la búsqueda tiene éxito/)).toBeVisible();
});

test('"Antes de la emboscada": la unidad a Alta Velocidad no suma (no puede buscar)', async ({ page }) => {
  await page.goto('/#/wizard/asw-air-search');
  await fillTarget(page, { event: 'Antes de emboscada', cap: 'No', depth: 'P.3 — Aguas semi-profundas', signature: '4', moving: 'Sí' });
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await fillField(page, 'Unidad 1: Valor de Detección Aérea (ASW) de la unidad', '4');
  await page.getByRole('button', { name: '+ Añadir otra unidad' }).click();
  await fillField(page, 'Unidad 2: Valor de Detección Aérea (ASW) de la unidad', '3');
  await chooseOption(page, 'Unidad 2: Formación de superficie a Alta Velocidad', 'Sí');
  await expect(page.getByText('Valor de Detección Aérea total: 4')).toBeVisible();
  await expect(page.getByText("Unidad 2 (3): no suma", { exact: false })).toBeVisible();
  await expect(page.getByText(/Discrepancia entre fuentes/)).toHaveCount(0);
});
