// Wizard de Ataque ASW de submarinos (#/wizard/asw-submarine; roadmap Fase 13,
// Decision Book §9.13.2). Valores esperados leídos de la página 30 impresa de
// Tablas-de-combate 5.pdf; la mecánica del motor se prueba en
// test/asw-submarine-attack.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function fillData(page, { depth, signature, moving, type, value, protection }) {
  await chooseOption(page, 'Profundidad del océano', depth);
  await fillField(page, 'Valor de Firma (SIG) impreso del submarino objetivo.', signature);
  await chooseOption(page, '¿El submarino objetivo está en su lado "En Movimiento"?', moving);
  await chooseOption(page, 'Tipo de torpedo', type);
  await fillField(page, 'Valor de Ataque con Torpedos.', value);
  if (protection) await fillField(page, 'Valor de Protección (PRO) del submarino objetivo (opcional, para saber si se hunde).', protection);
}

test('P.4, Firma 8, torpedo de círculo, Valor 8, tirada 9 -> 3* = 3 impactos, Protección 3 -> hundido; se guarda y se repite', async ({ page }) => {
  await page.goto('/#/wizard/asw-submarine');
  await expect(page.getByText('Paso 1 de 3: Datos del ataque')).toBeVisible();
  await fillData(page, { depth: 'P.4 — Aguas profundas', signature: '8', moving: 'No', type: 'Círculo (torpedo moderno)', value: '8', protection: '3' });
  await expect(page.getByText('Firma efectiva 8 → banda 3 de la cabecera (rango de Firma «7+»).')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 2 de 3: Tirada')).toBeVisible();
  await page.getByLabel('Tirada (1d10)').selectOption('9');
  await expect(page.getByText(/banda 3, columna «8\+», tirada 9\): 3\*/)).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByText('Resultado: 3 Punto(s) de Impacto — submarino hundido')).toBeVisible();
  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/asw-submarine$/);
  await expect(page.getByText('Resultado: 3 Punto(s) de Impacto — submarino hundido')).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await expect(page.getByText('Paso 1 de 3: Datos del ataque')).toBeVisible();
});

test('torpedo de hexágono con resultado sin asterisco no tiene efecto; el de círculo con la misma celda sí', async ({ page }) => {
  await page.goto('/#/wizard/asw-submarine');
  await fillData(page, { depth: 'P.4 — Aguas profundas', signature: '8', moving: 'No', type: 'Hexágono (torpedo antiguo)', value: '8' });
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByLabel('Tirada (1d10)').selectOption('5');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: 0 Punto(s) de Impacto — el ataque no tiene efecto')).toBeVisible();
  await expect(page.getByText(/solo tiene efecto cuando el resultado de la tabla contiene "\*"/).first()).toBeVisible();

  await page.getByRole('button', { name: '← Anterior' }).first().click();
  await page.getByRole('button', { name: '← Anterior' }).first().click();
  await chooseOption(page, 'Tipo de torpedo', 'Círculo (torpedo moderno)');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: 1 Punto(s) de Impacto')).toBeVisible();
});

test('tirada 0-3 es "NO DISPARAR"', async ({ page }) => {
  await page.goto('/#/wizard/asw-submarine');
  await fillData(page, { depth: 'P.3 — Aguas semi-profundas', signature: '3', moving: 'No', type: 'Círculo (torpedo moderno)', value: '2' });
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByLabel('Tirada (1d10)').selectOption('2');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: NO DISPARAR (sin búsqueda posterior al ataque)')).toBeVisible();
});

test('la profundidad cambia la banda con la misma Firma (Firma 4: P.4 -> banda 2; P.2/P.1 -> banda 3)', async ({ page }) => {
  await page.goto('/#/wizard/asw-submarine');
  await chooseOption(page, 'Profundidad del océano', 'P.4 — Aguas profundas');
  await fillField(page, 'Valor de Firma (SIG) impreso del submarino objetivo.', '4');
  await chooseOption(page, '¿El submarino objetivo está en su lado "En Movimiento"?', 'No');
  await expect(page.getByText('Firma efectiva 4 → banda 2 de la cabecera (rango de Firma «4~6»).')).toBeVisible();
  await chooseOption(page, 'Profundidad del océano', 'P.2 / P.1 — Aguas poco profundas o muy poco profundas');
  await expect(page.getByText('Firma efectiva 4 → banda 3 de la cabecera (rango de Firma «4+»).')).toBeVisible();
});
