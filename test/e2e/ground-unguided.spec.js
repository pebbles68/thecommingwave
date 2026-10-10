// Wizard de Ataque Terrestre No Guiado (#/wizard/ground-unguided; roadmap Fase 9, Decision
// Book §5.13). Valores esperados leídos de la página 9 impresa de Tablas-de-combate 5.pdf
// y del ejemplo textual de §5.13.6; la mecánica del motor se prueba en
// test/ground-unguided-attack.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function reachBase(page) {
  await page.goto('/#/wizard/ground-unguided');
  await expect(page.getByText('Paso 1 de 5: Intercepción final')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 2 de 5: Datos base del ataque')).toBeVisible();
}

async function fillBase(page, { value, light, pursuit }) {
  await reachBase(page);
  await fillField(page, 'Valor de Ataque base del plan de ataque no guiado', String(value));
  await chooseOption(page, 'Tipo de ataque:', light);
  await chooseOption(page, 'Tipo de munición:', pursuit);
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 3 de 5: Interceptación de munición')).toBeVisible();
  await chooseOption(page, '¿Objetivo y atacante están en el mismo hex o Zona Central?', 'Sí');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 4 de 5: Modificación de la Fuerza de Ataque y tirada')).toBeVisible();
}

async function mobile(page, { distance, guidance }) {
  await chooseOption(page, '¿El objetivo es una unidad móvil?', 'Sí');
  await fillField(page, 'Distancia de ataque (hexágonos, contada desde el hexágono que ocupas)', distance);
  await chooseOption(page, '¿Es Misión de Área?', 'No');
  await fillField(page, 'Tamaño de fuerza impreso total de las unidades terrestres propias en el hexágono objetivo', '20');
  await fillField(page, 'Corrección de designación aplicable', String(guidance));
}

test('ejemplo del reglamento (§5.13.6): Convencional - Estándar, instalación fija, columna "26~35", tirada 6 -> 9 impactos; se guarda y se repite', async ({ page }) => {
  await fillBase(page, { value: 30, light: 'No', pursuit: 'Normal' });
  await chooseOption(page, '¿El objetivo es una unidad móvil?', 'No');
  await expect(page.getByText('Contra instalaciones fijas el ataque no guiado no recibe modificaciones de Fuerza de Ataque')).toBeVisible();
  await expect(page.getByLabel('Distancia de ataque (hexágonos, contada desde el hexágono que ocupas)')).toHaveCount(0);
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('6');
  await expect(page.getByText('Columna de la tabla: «26~35» (Normal (plan no ligero, munición Normal)), fila «6» (Fijo) → 9 Punto(s) de Impacto.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByRole('heading', { name: 'Resultado', exact: true })).toBeVisible();
  await expect(page.getByText('Resultado: 9 Punto(s) de Impacto')).toBeVisible();
  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/ground-unguided$/);
  await expect(page.getByText('Resultado: 9 Punto(s) de Impacto')).toBeVisible();
  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await expect(page.getByText('Paso 1 de 5: Intercepción final')).toBeVisible();
});

test('plan Ligero con munición Normal usa las etiquetas 3~5, 6~8…: Valor 25 con distancia 0 (-2) -> columna "12~16", tirada 7 móvil -> 2', async ({ page }) => {
  await fillBase(page, { value: 25, light: 'Sí', pursuit: 'Normal' });
  await mobile(page, { distance: '0', guidance: 0 });
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('7');
  await expect(page.getByText('Columna de la tabla: «12~16» ([L] Normal (plan Ligero, munición Normal)), fila «7» (Móvil) → 2 Punto(s) de Impacto.')).toBeVisible();
});

test('munición de Persecución con plan no ligero usa las etiquetas canónicas: Valor 8, distancia 0 (-2) + designación 2 (neto 0), tirada 5 -> columna "6~8" -> 3', async ({ page }) => {
  await fillBase(page, { value: 8, light: 'No', pursuit: 'Persecución' });
  await mobile(page, { distance: '0', guidance: 2 });
  await expect(page.getByText('Modificación de Fuerza de Ataque: +0')).toBeVisible();
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('5');
  await expect(page.getByText('Columna de la tabla: «6~8» (Persecución (plan no ligero, munición Persecución)), fila «5» (Móvil) → 3 Punto(s) de Impacto.')).toBeVisible();
});

test('tirada 9 cancela la modificación: Valor 12 [L] Normal con distancia 1 (-5) -> columna "3~5" sin impactos; con tirada 9 -> columna "12~16" -> 4', async ({ page }) => {
  await fillBase(page, { value: 12, light: 'Sí', pursuit: 'Normal' });
  await mobile(page, { distance: '1', guidance: 0 });
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('4');
  await expect(page.getByText('Columna de la tabla: «3~5» ([L] Normal (plan Ligero, munición Normal)), fila «4» (Móvil) → sin impactos.')).toBeVisible();
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('9');
  await expect(page.getByText(/Tirada 9: se cancelan todas las modificaciones/)).toBeVisible();
  await expect(page.getByText('Columna de la tabla: «12~16» ([L] Normal (plan Ligero, munición Normal)), fila «9*» (Móvil) → 4 Punto(s) de Impacto.')).toBeVisible();
});

test('la Intercepción Final suma los impactos de consumo Bajo y Alto; el plan Ligero se deriva sin volver a preguntarlo en la Interceptación de Munición', async ({ page }) => {
  await page.goto('/#/wizard/ground-unguided');
  await fillField(page, 'Valor de Defensa Aérea agrupado de las unidades de consumo Bajo (opcional)', '4');
  await page.getByLabel('Tirada de la Intercepción Final (1d10)').selectOption('9');
  await expect(page.getByText(/Consumo Bajo \(A\.A\.=4\):/)).toBeVisible();
  await expect(page.getByText(/Impactos de Intercepción Final: \d+/)).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await fillField(page, 'Valor de Ataque base del plan de ataque no guiado', '10');
  await chooseOption(page, 'Tipo de ataque:', 'Sí');
  await chooseOption(page, 'Tipo de munición:', 'Normal');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Derivado del tipo de ataque del paso anterior: Sí (plan Ligero: -3 a la tirada).')).toBeVisible();
});

test('"Combate por tipo" ofrece el wizard de ataque terrestre no guiado', async ({ page }) => {
  await page.goto('/#/ayuda/combate/ground_unguided');
  await page.getByRole('button', { name: /Resolver con el wizard de combate/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/ground-unguided$/);
});
