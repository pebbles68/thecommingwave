// Wizard de Ataque ASW por unidades de superficie y aéreas
// (#/wizard/asw-surface-air; roadmap Fase 13, Decision Book §9.17). Valores
// esperados leídos de la página 29 impresa de Tablas-de-combate 5.pdf; la
// mecánica del motor se prueba en test/asw-attack-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

test('unidad aérea contra un objetivo dentro de una zona de patrulla aérea enemiga: bloquea el avance con el motivo', async ({ page }) => {
  await page.goto('/#/wizard/asw-surface-air');
  await expect(page.getByText('Paso 1 de 4: Elegibilidad y alcance')).toBeVisible();
  await chooseOption(page, 'Tipo de atacante.', 'Unidad aérea');
  await chooseOption(page, '¿El objetivo está dentro de una zona de patrulla aérea enemiga?', 'Sí');
  await expect(page.getByText(/No se puede continuar con este ataque: Una unidad aérea no puede atacar/)).toBeVisible();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 1 de 4: Elegibilidad y alcance')).toBeVisible();
});

test('superficie contra objetivo adyacente sin capacidad ASW aérea: bloqueado; con capacidad y fuera de zona enemiga: permitido', async ({ page }) => {
  await page.goto('/#/wizard/asw-surface-air');
  await chooseOption(page, 'Tipo de atacante.', 'Unidad de superficie');
  await chooseOption(page, '¿El objetivo está dentro de una zona de patrulla aérea enemiga?', 'No');
  await chooseOption(page, '¿El objetivo está en un hex adyacente?', 'Sí');
  await chooseOption(page, 'Capacidad de ataque ASW a objetivo adyacente', 'Ninguna de las dos');
  await chooseOption(page, '¿La unidad atacante está dentro de una zona de patrulla aérea enemiga?', 'No');
  await expect(page.getByText(/necesita Valor de Detección Aérea \(ASW\) ≥ 1/)).toBeVisible();
  await chooseOption(page, 'Capacidad de ataque ASW a objetivo adyacente', 'Valor de Detección Aérea (ASW) ≥ 1');
  await expect(page.getByText('Ataque permitido por las condiciones de alcance.')).toBeVisible();
});

test('P.4, Firma 3 en movimiento (=4, banda 2), Valor ASW 5, tirada 7, Protección 2 -> 2 impactos, submarino hundido; se guarda y se repite', async ({ page }) => {
  await page.goto('/#/wizard/asw-surface-air');
  await chooseOption(page, 'Tipo de atacante.', 'Unidad aérea');
  await chooseOption(page, '¿El objetivo está dentro de una zona de patrulla aérea enemiga?', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 2 de 4: Datos del objetivo')).toBeVisible();
  await chooseOption(page, 'Profundidad del océano', 'P.4 — Aguas profundas');
  await fillField(page, 'Valor de Firma (SIG) impreso del submarino objetivo.', '3');
  await chooseOption(page, '¿El submarino objetivo está en su lado "En Movimiento"?', 'Sí');
  await fillField(page, 'Valor de Ataque ASW.', '5');
  await fillField(page, 'Valor de Protección (PRO) del submarino objetivo (opcional, para saber si se hunde).', '2');
  await expect(page.getByText('Firma efectiva 4 → banda 2 de la cabecera (rango de Firma «4~6»).')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 3 de 4: Tirada')).toBeVisible();
  await page.getByLabel('Tirada (1d10)').selectOption('7');
  await expect(page.getByText(/banda 2, columna «5», tirada 7\): 2/)).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByRole('heading', { name: 'Resultado', exact: true })).toBeVisible();
  await expect(page.getByText('Resultado: 2 Punto(s) de Impacto — submarino hundido')).toBeVisible();

  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/asw-surface-air$/);
  await expect(page.getByText('Resultado: 2 Punto(s) de Impacto — submarino hundido')).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await expect(page.getByText('Paso 1 de 4: Elegibilidad y alcance')).toBeVisible();
});
