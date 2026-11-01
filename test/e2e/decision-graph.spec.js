// Asistente de combate por árbol de decisión (Fase 25): una pregunta por pantalla, respuestas cambiables, efectos
// acumulados y, en el resultado, acceso al cálculo existente.
const { test, expect } = require('./fixtures');

test('Resolver combate ofrece el asistente y se recorre hasta el resultado con su cálculo', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: /^Resolver combate/ }).click();
  await page.getByRole('button', { name: /^Asistente de combate/ }).click();
  await expect(page).toHaveURL(/#\/decision$/);
  await expect(page.getByText('Pregunta 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Acción estratégica, ciberespacial, espacial o logística' }).click();
  await expect(page.getByText('Pregunta 2', { exact: true })).toBeVisible();
  await expect(page.locator('.decision-graph__answer')).toHaveCount(1);
  await page.locator('.decision-graph__option').nth(2).click();
  await page.locator('.decision-graph__option').nth(1).click();
  await page.locator('.decision-graph__option').nth(1).click();
  await page.locator('.decision-graph__option').nth(0).click();
  await expect(page.getByRole('heading', { name: 'Reabastecimiento resuelto' })).toBeVisible();
  await page.getByRole('button', { name: /^Reabastecimiento de Campo del Ejército/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/army-resupply$/);
});

test('cambiar una respuesta anterior descarta lo posterior', async ({ page }) => {
  await page.goto('/#/decision/land.guided.fixed_ecm');
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect(page.locator('.decision-graph__effects')).toContainText('-10 columnas');
  await page.getByRole('button', { name: /^Cambiar la respuesta/ }).click();
  await expect(page.locator('.decision-graph__answer')).toHaveCount(0);
  await expect(page.locator('.decision-graph__effects')).toHaveCount(0);
  await page.getByRole('button', { name: '1', exact: true }).click();
  await expect(page.locator('.decision-graph__effects')).toContainText('-1 columna');
});

test('una página de tablas abre el asistente a mitad del árbol con sus respuestas cambiables', async ({ page }) => {
  await page.goto('/#/ayuda/tablas/page-05.json');
  await page.getByRole('button', { name: /Resolver con el asistente de combate/ }).click();
  await expect(page).toHaveURL(/#\/decision\/e\/land-guided$/);
  await expect(page.getByRole('heading', { name: '¿Qué clase de objetivo recibe el ataque terrestre guiado?' })).toBeVisible();
  await expect(page.locator('.decision-graph__answer')).toHaveCount(2);
  await expect(page.locator('.decision-graph__answer').first()).toContainText('dada por la página');
  await page.getByRole('button', { name: /^Cambiar la respuesta: ¿Qué procedimiento terrestre/ }).click();
  await expect(page.getByRole('heading', { name: '¿Qué procedimiento terrestre estás resolviendo?' })).toBeVisible();
});

test('una subfase del turno abre el asistente en su punto del árbol', async ({ page }) => {
  await page.goto('/#/turno/fase/1/ground/combate_terrestre');
  await page.getByRole('button', { name: /Resolver con el asistente de combate/ }).click();
  await expect(page).toHaveURL(/#\/decision\/e\/land-close$/);
  await expect(page.getByRole('heading', { name: /¿La unidad principal inicia el combate/ })).toBeVisible();
});

test('cada ronda WVR ofrece resolverla con la tabla y el cálculo antes de seguir', async ({ page }) => {
  await page.goto('/#/decision/air.intercept.round');
  await expect(page.getByRole('heading', { name: 'Resolver este paso' })).toBeVisible();
  await page.getByRole('button', { name: 'Sí', exact: true }).click();
  await expect(page.locator('.decision-graph__round')).toContainText('Ronda 2');
  await expect(page.getByRole('heading', { name: 'Resolver la ronda 2' })).toBeVisible();
  await expect(page.locator('.decision-graph__table').first()).toHaveAttribute('open', '');
  await expect(page.locator('.decision-graph__answer-question').first()).toContainText('Ronda 1:');
  await page.getByRole('button', { name: /^Combate aéreo cercano WVR/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/air-combat-wvr$/);
});

test('la ronda WVR pide los factores de cada bando y marca su columna en la tabla real', async ({ page }) => {
  await page.goto('/#/decision/air.intercept.round');
  await page.getByLabel('Bando azul: Misión del grupo').selectOption('cap');
  await page.getByLabel('Bando azul: Suma del Combate aéreo (CA) de sus aviones en el combate cercano').fill('9');
  await page.getByLabel('Bando azul: Tirada 1d10 (0 a 9)').fill('4');
  await expect(page.locator('.decision-graph__side-result').first()).toContainText('4 punto(s) de impacto');
  await expect(page.locator('.decision-graph__side-result').nth(1)).toContainText('Faltan datos');
  await expect(page.getByRole('button', { name: 'Ver en la ficha: Combate aéreo' }).first()).toBeVisible();
  // La página real solo existe en local (images/ fuera del repositorio): sin ella, el marcado igualmente se dibuja.
  await expect(page.locator('.decision-graph__marked-table rect')).not.toHaveCount(0);
});

test('el combate cercano terrestre pide papel, ataque, electrónica y tirada de cada bando', async ({ page }) => {
  await page.goto('/#/decision/land.close.roll');
  await page.getByLabel('Bando azul: Papel en el combate').selectOption('activo');
  await page.getByLabel('Bando azul: Valor de Ataque + Apoyo de Combate de sus unidades').fill('7');
  await page.getByLabel('Bando azul: Valor Electrónico más alto de sus unidades').fill('4');
  await page.getByLabel('Bando azul: Tirada 1d10 (0 a 9)').fill('6');
  await page.getByLabel('Bando rojo: Valor Electrónico más alto de sus unidades').fill('1');
  await expect(page.locator('.decision-graph__side-result').first()).toContainText('impactos x2 = 10');
  await expect(page.locator('.decision-graph__figure--extra')).toHaveCount(1);
});
