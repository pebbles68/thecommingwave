// Wizard de Ataque con Torpedos a superficie (#/wizard/torpedo-surface; roadmap
// Fase 12, Decision Book §9.13.1). Valores esperados leídos de la página 27
// impresa de Tablas-de-combate 5.pdf; la mecánica del motor se prueba en
// test/torpedo-attack-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

const ASW_CONTEXT = 'Hay unidad de superficie capaz de búsqueda por diferencia de firma o Zona Central de MPA';

test('torpedo de círculo, Expuesto con contexto ASW, Valor 10, tirada 7 ("2*" en la 3ª columna de datos) y segundo dado 1 -> 1 Punto de Impacto; se guarda y se repite desde el historial', async ({ page }) => {
  await page.goto('/#/wizard/torpedo-surface');
  await expect(page.getByText('Paso 1 de 4: Emboscada (opcional)')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 2 de 4: Datos del ataque')).toBeVisible();
  await chooseOption(page, 'velocidad impresa de todos los buques', 'No');
  await chooseOption(page, 'Situación ASW en el hex objetivo.', ASW_CONTEXT);
  await chooseOption(page, 'Estado del submarino atacante.', 'Expuesto');
  await chooseOption(page, 'Tipo de torpedo', 'Círculo (torpedo moderno)');
  await fillField(page, 'Valor de ataque del torpedo.', '10');
  await expect(page.getByText('Columna de la tabla: «10+» (fila Expuesto).')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 3 de 4: Tirada')).toBeVisible();
  await page.getByLabel('Tirada (1d10)').selectOption('7');
  await expect(page.getByText(/columna «10\+»\): 2\*/)).toBeVisible();
  await page.getByLabel('Segundo dado (1d10)').selectOption('1');
  await expect(page.getByText('Puntos de Impacto finales: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByRole('heading', { name: 'Resultado', exact: true })).toBeVisible();
  await expect(page.getByText('Resultado: 1 Punto(s) de Impacto')).toBeVisible();
  await expect(page.getByText(/Segundo dado 1 frente a 2 Punto\(s\) de Impacto originales → se toma el menor: 1/)).toBeVisible();

  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await expect(page.getByText('Resultado: 1 Punto(s) de Impacto')).toBeVisible();
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/torpedo-surface$/);
  await expect(page.getByText('Resultado: 1 Punto(s) de Impacto')).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await expect(page.getByText('Paso 1 de 4: Emboscada (opcional)')).toBeVisible();
});

test('velocidad ≤ 3 con torpedo de hexágono: el dado se ignora (tirada 9), pide segundo dado y toma el menor', async ({ page }) => {
  await page.goto('/#/wizard/torpedo-surface');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, 'velocidad impresa de todos los buques', 'Sí');
  await chooseOption(page, 'Situación ASW en el hex objetivo.', 'Ninguna de las anteriores');
  await chooseOption(page, 'Tipo de torpedo', 'Hexágono (torpedo antiguo)');
  await fillField(page, 'Valor de ataque del torpedo.', '3');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Velocidad impresa ≤ 3: el dado se ignora; la tirada es 9.')).toBeVisible();
  await expect(page.getByLabel('Tirada (1d10)')).toHaveCount(0);
  await page.getByLabel('Segundo dado (1d10)').selectOption('2');
  await expect(page.getByText('Puntos de Impacto finales: 2')).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: 2 Punto(s) de Impacto')).toBeVisible();
});

test('tirada 0 o 1 es "NO ATACÓ": se informa de que no se consume munición', async ({ page }) => {
  await page.goto('/#/wizard/torpedo-surface');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, 'velocidad impresa de todos los buques', 'No');
  await chooseOption(page, 'Situación ASW en el hex objetivo.', 'Ninguna de las anteriores');
  await chooseOption(page, 'Tipo de torpedo', 'Círculo (torpedo moderno)');
  await fillField(page, 'Valor de ataque del torpedo.', '5');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByLabel('Tirada (1d10)').selectOption('1');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: No atacó (sin consumo de munición ni búsqueda posterior)')).toBeVisible();
});
