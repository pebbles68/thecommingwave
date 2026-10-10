// Wizard de Búsqueda por Diferencia de Firma (#/wizard/asw-signature-search; roadmap
// Fase 13, Decision Book §9.15.3). Valores esperados leídos de la página 33 impresa
// de Tablas-de-combate 5.pdf; la mecánica del motor se prueba en
// test/asw-signature-search-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

test('submarino con Firma 4 busca un objetivo de Firma 5 en Rutina (misma casilla): fila 4, rango 9; tirada 9 tiene éxito; se guarda y se repite', async ({ page }) => {
  await page.goto('/#/wizard/asw-signature-search');
  await expect(page.getByText('Paso 1 de 4: Buscador y activación')).toBeVisible();
  await chooseOption(page, '¿Quién realiza la búsqueda?', 'Unidad submarina');
  await chooseOption(page, '¿Qué activó la búsqueda ASW?', 'Rutina / Movimiento Submarino / Emboscada');
  await fillField(page, 'Valor de Firma (SIG) del submarino que busca.', '4');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 2 de 4: Objetivo y distancia')).toBeVisible();
  await chooseOption(page, 'Profundidad del océano en la casilla del objetivo', 'P.4 — Aguas profundas');
  await fillField(page, 'Valor de Firma (SIG) del submarino objetivo.', '5');
  await chooseOption(page, '¿El submarino objetivo está en su lado "En Movimiento"?', 'No');
  await chooseOption(page, 'Distancia entre el buscador y el objetivo.', 'En la misma casilla (HEX)');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 3 de 4: Tirada')).toBeVisible();
  await expect(page.getByText('Columna «sub-4»: Firma 5 → fila 4 (celda «5»); rango de descubrimiento «rango1-hex»: 9.')).toBeVisible();
  await page.getByLabel('Tirada (1d10)').selectOption('9');
  await expect(page.getByText('Tirada 9 → la búsqueda tiene éxito.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByText('Paso 4 de 4: Resultado')).toBeVisible();
  await expect(page.getByText('Resultado: la búsqueda tiene éxito — el submarino queda Expuesto (o falla su intento de Evasión)')).toBeVisible();
  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/asw-signature-search$/);
  await expect(page.getByText('Resultado: la búsqueda tiene éxito')).toBeVisible();
  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await expect(page.getByText('Paso 1 de 4: Buscador y activación')).toBeVisible();
});

test('unidad de superficie, marco 1, objetivo en P.4 con Firma 3 En Movimiento (=4): fila 3; Rutina "."; Después del ataque "6+" con tirada 5 falla', async ({ page }) => {
  await page.goto('/#/wizard/asw-signature-search');
  await chooseOption(page, '¿Quién realiza la búsqueda?', 'Unidad de superficie');
  await chooseOption(page, '¿Qué activó la búsqueda ASW?', 'Después del Ataque / Antes de la Evasión');
  await expect(page.locator('.frame-gallery__img')).toHaveCount(3);
  await chooseOption(page, 'Forma del marco que rodea el Valor ASW', 'Marco hexagonal');
  await chooseOption(page, '¿El marco del Valor ASW es cerrado', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, 'Profundidad del océano en la casilla del objetivo', 'P.4 — Aguas profundas');
  await fillField(page, 'Valor de Firma (SIG) del submarino objetivo.', '3');
  await chooseOption(page, '¿El submarino objetivo está en su lado "En Movimiento"?', 'Sí');
  await chooseOption(page, 'Distancia entre el buscador y el objetivo.', 'En la misma casilla (HEX)');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Columna «sup1-p4»: Firma 4 → fila 3 (celda «4»); rango de descubrimiento «rango2-hex»: 6+.')).toBeVisible();
  await page.getByLabel('Tirada (1d10)').selectOption('5');
  await expect(page.getByText('Tirada 5 → la búsqueda falla.')).toBeVisible();
  await page.getByLabel('Tirada (1d10)').selectOption('6');
  await expect(page.getByText('Tirada 6 → la búsqueda tiene éxito.')).toBeVisible();
});

test('restricciones: Alta Velocidad no puede hacer Rutina; la casilla adyacente exige aguas profundas y marco abierto', async ({ page }) => {
  await page.goto('/#/wizard/asw-signature-search');
  await chooseOption(page, '¿Quién realiza la búsqueda?', 'Unidad de superficie');
  await chooseOption(page, '¿Qué activó la búsqueda ASW?', 'Rutina / Movimiento Submarino / Emboscada');
  await chooseOption(page, 'Forma del marco que rodea el Valor ASW', 'Marco rectangular / cuadrado');
  await chooseOption(page, '¿El marco del Valor ASW es cerrado', 'Sí');
  await chooseOption(page, '¿La formación de superficie está en estado de Alta Velocidad?', 'Sí');
  await expect(page.getByText(/No se puede realizar esta búsqueda: Las formaciones de superficie en estado de "Alta Velocidad" NO PUEDEN realizar Búsquedas de Rutina\./)).toBeVisible();
  await chooseOption(page, '¿La formación de superficie está en estado de Alta Velocidad?', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await chooseOption(page, 'Profundidad del océano en la casilla del objetivo', 'P.3 — Aguas semi-profundas');
  await chooseOption(page, 'Distancia entre el buscador y el objetivo.', 'En una casilla adyacente (ADYAC)');
  await expect(page.getByText(/Si el marco del Valor ASW es cerrado \(p\.ej\. cuadrado sólido\), la unidad solo puede buscar en su propia casilla/)).toBeVisible();
  await expect(page.getByText(/El alcance es de 1 hex solo en Aguas Profundas/)).toBeVisible();
});

test('"Combate por tipo" de la búsqueda ASW ofrece también el wizard de Diferencia de Firma', async ({ page }) => {
  await page.goto('/#/ayuda/combate/asw_search_support');
  await page.getByRole('button', { name: /Resolver la Búsqueda por Diferencia de Firma/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/asw-signature-search$/);
});
