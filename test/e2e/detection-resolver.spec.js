// Caso E2E de COR02-006 (correcciones.02.md): las pantallas de "Resolver
// detección" pasan de síncronas (listas/valores fijos incrustados en
// public/js/detection-engine.js y public/js/views/help.js) a cargar
// data/detection/help-sheet.json antes de renderizar (mismo patrón que
// renderDeteccionHelp/renderSecuenciaHelp). Este test cubre que la carga
// asíncrona no deja la pantalla en blanco/rota y que los valores derivados
// de los datos (alcance fijo de baja altitud, multiplicador de terreno,
// tipos de detector) siguen dando el resultado correcto.
const { test, expect } = require('./fixtures');

test('Resolver detección > Naval contra aérea: el alcance fijo de baja altitud se deriva de help-sheet.json, no de un valor incrustado', async ({ page }) => {
  await page.goto('/#/ayuda/deteccion/resolver/surface-vs-air');
  await expect(page.getByRole('heading', { name: 'Naval contra aérea' })).toBeVisible();

  await page.getByLabel('Distancia (hexágonos)').fill('1');
  await page.getByLabel('Distancia (hexágonos)').press('Tab');
  await page.getByRole('button', { name: 'Sí', exact: true }).click();
  await expect(page.getByText(/dentro del alcance fijo de 1 hex/)).toBeVisible();

  await page.getByLabel('Distancia (hexágonos)').fill('2');
  await page.getByLabel('Distancia (hexágonos)').press('Tab');
  await expect(page.getByText(/fuera del alcance fijo de 1 hex/)).toBeVisible();
});

test('Resolver detección > Detectabilidad terrestre móvil: el multiplicador de terreno se deriva de help-sheet.json', async ({ page }) => {
  await page.goto('/#/ayuda/deteccion/resolver/ground-mobile');
  await expect(page.getByRole('heading', { name: 'Detectabilidad terrestre móvil' })).toBeVisible();
  await expect(page.getByText(/Terreno×4 \(1×4=4\)/)).toBeVisible();
});

test('Resolver detección > ¿Quién puede detectar terrestres?: las opciones y la explicación se leen de help-sheet.json', async ({ page }) => {
  await page.goto('/#/ayuda/deteccion/resolver/ground-detector-eligibility');
  await expect(page.getByRole('heading', { name: '¿Quién puede detectar terrestres?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unidad aérea en misión ISR' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unidades terrestres' })).toBeVisible();

  await page.getByRole('button', { name: 'Unidades terrestres' }).click();
  await expect(page.getByText('No puede detectar unidades terrestres')).toBeVisible();
});

test('Resolver detección > ¿Quién puede detectar unidades navales?: la pregunta de condición cambia según el tipo elegido', async ({ page }) => {
  await page.goto('/#/ayuda/deteccion/resolver/naval-detector-eligibility');
  await expect(page.getByRole('heading', { name: '¿Quién puede detectar unidades navales?' })).toBeVisible();
  await expect(page.getByText('Puede detectar a la unidad naval')).toBeVisible();

  await page.getByRole('button', { name: 'Unidades aéreas' }).click();
  await expect(page.getByText('¿Misión aérea especial o ISR?')).toBeVisible();
});

test('Resolver detección > Brevemente detectable: las 4 acciones se leen de help-sheet.json', async ({ page }) => {
  await page.goto('/#/ayuda/deteccion/resolver/briefly-detectable');
  await expect(page.getByRole('heading', { name: 'Brevemente detectable' })).toBeVisible();
  for (const label of ['Movimiento', 'Disparo', 'Apoyo', 'Retirada']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Otra acción' }).click();
  await expect(page.getByText('Sigue oculta', { exact: true })).toBeVisible();
});
