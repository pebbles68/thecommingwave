// AJ-007: el renderizador común de etapas interpreta showIf, parallelGroups e
// invalida respuestas dependientes sin que el wizard lo programe a mano.
const { test, expect } = require('./fixtures');
const { chooseOption } = require('./wizard-helpers');

test('showIf: una pregunta dependiente aparece al contestar la principal y su respuesta se limpia al cambiarla', async ({ page }) => {
  await page.goto('/#/wizard/antiship-guided');
  const dependent = '¿La unidad antiaérea (rendimiento Medio o Alto) tiene el símbolo especial';
  await expect(page.getByText(dependent)).toHaveCount(0);
  await chooseOption(page, '¿El objetivo es un ataque balístico', 'Sí');
  await expect(page.getByText(dependent)).toBeVisible();
  await chooseOption(page, dependent, 'Sí');
  await expect(page.locator('.wizard-question', { hasText: dependent }).getByRole('button', { name: 'Sí', exact: true })).toHaveClass(/selected|active|is-selected/);

  // Cambiar la principal oculta la dependiente y borra su respuesta.
  await chooseOption(page, '¿El objetivo es un ataque balístico', 'No');
  await expect(page.getByText(dependent)).toHaveCount(0);
  await chooseOption(page, '¿El objetivo es un ataque balístico', 'Sí');
  await expect(page.locator('.wizard-question', { hasText: dependent }).getByRole('button', { name: 'Sí', exact: true })).not.toHaveClass(/selected|active|is-selected/);
});

test('parallelGroups: las preguntas independientes de una etapa se presentan juntas', async ({ page }) => {
  await page.goto('/#/wizard/antiship-guided');
  const group = page.locator('.wizard-parallel').first();
  await expect(group).toBeVisible();
  await expect(group).toContainText('Estas preguntas son independientes: contéstalas en el orden que quieras.');
  await expect(group.locator('.wizard-question').first()).toBeVisible();
});

test('flowCuts: contestar «mismo hex o Zona Central» = Sí muestra el corte de la etapa, tomado del workflow', async ({ page }) => {
  const { fillField } = require('./wizard-helpers');
  await page.goto('/#/wizard/ground-guided');
  await fillField(page, 'Valor de Ataque base del plan de ataque', '4');
  await chooseOption(page, 'Tipo de ataque:', 'No');
  await chooseOption(page, 'Tipo de munición:', 'Persecución');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText(/Se corta esta etapa:/)).toHaveCount(0);
  await chooseOption(page, '¿Objetivo y atacante están en el mismo hex o Zona Central?', 'Sí');
  await expect(page.getByText(/Se corta esta etapa: ¿Objetivo y atacante están en el mismo hex o Zona Central\? Sí -> no_interception/)).toBeVisible();
  await chooseOption(page, '¿Objetivo y atacante están en el mismo hex o Zona Central?', 'No');
  await expect(page.getByText(/Se corta esta etapa:/)).toHaveCount(0);
});
