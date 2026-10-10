// Wizard de Ataque Terrestre Guiado (#/wizard/ground-guided; roadmap Fase 9, Decision
// Book §5.12). Valores esperados leídos de la página 5 impresa de Tablas-de-combate 5.pdf
// y del ejemplo textual de §5.12.10; la mecánica del motor se prueba en
// test/ground-guided-attack-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function fillBase(page, { value, light, pursuit }) {
  await page.goto('/#/wizard/ground-guided');
  await expect(page.getByText('Paso 1 de 4: Datos base del ataque')).toBeVisible();
  await fillField(page, 'Valor de Ataque base del plan de ataque', String(value));
  await chooseOption(page, 'Tipo de ataque:', light);
  await chooseOption(page, 'Tipo de munición:', pursuit);
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 2 de 4: Defensa aérea de área e interceptación de munición')).toBeVisible();
  await chooseOption(page, '¿La munición de este ataque está marcada CM (Misil de Crucero) o BM (Misil Balístico)?', 'No');
  await chooseOption(page, '¿Objetivo y atacante están en el mismo hex o Zona Central?', 'Sí');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 3 de 4: Modificación de la Fuerza de Ataque y tirada')).toBeVisible();
}

async function mobileMain(page, { distance, supersonic }) {
  await chooseOption(page, 'Tipo de objetivo.', 'Unidad móvil principal');
  await fillField(page, 'Distancia de ataque (hexágonos, contada desde el hexágono que ocupas)', distance);
  await chooseOption(page, '¿Es Misión de Área?', 'No');
  await chooseOption(page, '¿La munición es de alta penetración y supersónica?', supersonic);
  await fillField(page, 'Tamaño de fuerza impreso total de las unidades terrestres propias en el hexágono objetivo', '20');
  await fillField(page, 'Corrección de designación aplicable', '0');
}

test('ejemplo del reglamento (§5.12.10): Persecución, objetivo móvil, columna "4", tirada 4 -> 11 impactos; se guarda y se repite', async ({ page }) => {
  await fillBase(page, { value: 4, light: 'No', pursuit: 'Persecución' });
  // Distancia 0 (-2) + alta penetración supersónica (+2) = 0: la columna no se desplaza.
  await mobileMain(page, { distance: '0', supersonic: 'Sí' });
  await expect(page.getByText('Modificación de Fuerza de Ataque: +0')).toBeVisible();
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('4');
  await expect(page.getByText('Columna de la tabla: «4» (Persecución (plan no ligero, munición Persecución)), fila «4» (Móvil) → 11 Punto(s) de Impacto.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByRole('heading', { name: 'Resultado', exact: true })).toBeVisible();
  await expect(page.getByText('Resultado: 11 Punto(s) de Impacto')).toBeVisible();
  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/ground-guided$/);
  await expect(page.getByText('Resultado: 11 Punto(s) de Impacto')).toBeVisible();
  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await expect(page.getByText('Paso 1 de 4: Datos base del ataque')).toBeVisible();
});

test('plan no ligero y munición Normal usa las etiquetas 0.5, 1, ·, 2…: Valor 6, instalación fija con Electrónico 1 (-1), tirada 5 -> columna "5" -> 12', async ({ page }) => {
  await fillBase(page, { value: 6, light: 'No', pursuit: 'Normal' });
  await chooseOption(page, 'Tipo de objetivo.', 'Instalación fija');
  // Una instalación fija solo aplica el Valor Electrónico de instalación (§5.12.9).
  await expect(page.getByLabel('Distancia de ataque (hexágonos, contada desde el hexágono que ocupas)')).toHaveCount(0);
  await expect(page.getByText('¿La munición es de alta penetración y supersónica?')).toHaveCount(0);
  await chooseOption(page, 'Si el objetivo es instalación fija: Valor Electrónico.', '1');
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('5');
  await expect(page.getByText('Columna de la tabla: «5» (Normal (plan no ligero, munición Normal)), fila «5» (Fijo) → 12 Punto(s) de Impacto.')).toBeVisible();
});

test('plan Ligero con munición Normal usa las etiquetas 1, 2, 3…: Valor 5, sin desplazamiento, tirada 5 móvil -> 4 impactos', async ({ page }) => {
  await fillBase(page, { value: 5, light: 'Sí', pursuit: 'Normal' });
  await mobileMain(page, { distance: '0', supersonic: 'Sí' });
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('5');
  await expect(page.getByText('Columna de la tabla: «5» ([L] Normal (plan Ligero, munición Normal)), fila «5» (Móvil) → 4 Punto(s) de Impacto.')).toBeVisible();
});

test('tirada 9 cancela la modificación: Valor 8 Normal con distancia 1 (-5) -> columna "8" -> 24', async ({ page }) => {
  await fillBase(page, { value: 8, light: 'No', pursuit: 'Normal' });
  await mobileMain(page, { distance: '1', supersonic: 'No' });
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('4');
  await expect(page.getByText('Columna de la tabla: «3» (Normal (plan no ligero, munición Normal)), fila «4» (Móvil) → 4 Punto(s) de Impacto.')).toBeVisible();
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('9');
  await expect(page.getByText(/Tirada 9: se cancelan todas las modificaciones/)).toBeVisible();
  await expect(page.getByText('Columna de la tabla: «8» (Normal (plan no ligero, munición Normal)), fila «9*» (Móvil) → 24 Punto(s) de Impacto.')).toBeVisible();
});

test('unidad técnica suma las modificaciones de objetivo móvil y las suyas; las positivas solo compensan negativas', async ({ page }) => {
  await fillBase(page, { value: 6, light: 'No', pursuit: 'Normal' });
  await chooseOption(page, 'Tipo de objetivo.', 'Unidad técnica');
  await fillField(page, 'Distancia de ataque (hexágonos, contada desde el hexágono que ocupas)', '0');
  await chooseOption(page, '¿Es Misión de Área?', 'No');
  await chooseOption(page, '¿La munición es de alta penetración y supersónica?', 'Sí');
  await fillField(page, 'Tamaño de fuerza impreso total de las unidades terrestres propias en el hexágono objetivo', '45');
  await fillField(page, 'Corrección de designación aplicable', '0');
  await chooseOption(page, 'Si el objetivo es unidad técnica: Valor Electrónico.', '2');
  // -2 (distancia) +2 (supersónica) +6 (45 puntos: 3 bloques de 5 sobre 30 = +6) -4 (Electrónico 2) = +2 -> neto 0.
  await expect(page.getByText('Modificación de Fuerza de Ataque: +2 → neto 0 (las positivas solo compensan negativas)')).toBeVisible();
});

test('"Combate por tipo" y el router de tablas ofrecen el wizard de ataque terrestre guiado', async ({ page }) => {
  await page.goto('/#/ayuda/combate/ground_guided');
  await page.getByRole('button', { name: /Resolver con el wizard de combate/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/ground-guided$/);
});
