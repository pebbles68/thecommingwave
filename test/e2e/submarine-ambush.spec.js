// Wizard de Emboscada de submarino (#/wizard/submarine-ambush; roadmap Fase 13,
// Decision Book §9.16). La mecánica se prueba en test/submarine-ambush-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption } = require('./wizard-helpers');

test('submarino Oculto con la formación en su casilla: puede emboscar, enseña la secuencia, se guarda y se repite', async ({ page }) => {
  await page.goto('/#/wizard/submarine-ambush');
  await expect(page.getByText('Paso 1 de 3: Submarino')).toBeVisible();
  await chooseOption(page, '¿En qué estado está el submarino?', 'Oculto');
  await chooseOption(page, '¿Es un submarino convencional o nuclear?', 'Convencional');
  await chooseOption(page, '¿Ya ha hecho una Emboscada en esta Fase de Acciones de Superficie?', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 2 de 3: Formación objetivo')).toBeVisible();
  await chooseOption(page, '¿Dónde está la formación de superficie respecto del submarino?', 'En la misma casilla que el submarino');
  await chooseOption(page, '¿Qué hace la formación de superficie?', 'Entra en la zona');
  await chooseOption(page, '¿El submarino tiene munición correspondiente para atacar?', 'Sí');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByText('Paso 3 de 3: Resultado')).toBeVisible();
  await expect(page.getByText('Resultado: el submarino puede iniciar la Emboscada')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Secuencia de la Emboscada' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Torpedos contra superficie/ })).toBeVisible();
  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/submarine-ambush$/);
  await expect(page.getByText('Resultado: el submarino puede iniciar la Emboscada')).toBeVisible();
  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await expect(page.getByText('Paso 1 de 3: Submarino')).toBeVisible();
});

test('un submarino convencional no embosca a una formación adyacente; uno Expuesto no puede emboscar', async ({ page }) => {
  await page.goto('/#/wizard/submarine-ambush');
  await chooseOption(page, '¿En qué estado está el submarino?', 'Expuesto');
  await expect(page.getByText('Solo un submarino en estado Oculto puede iniciar una Emboscada.')).toBeVisible();
  await chooseOption(page, '¿En qué estado está el submarino?', 'Oculto');
  await chooseOption(page, '¿Es un submarino convencional o nuclear?', 'Convencional');
  await chooseOption(page, '¿Ya ha hecho una Emboscada en esta Fase de Acciones de Superficie?', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, '¿Dónde está la formación de superficie respecto del submarino?', 'En una casilla adyacente al submarino');
  await chooseOption(page, '¿Qué hace la formación de superficie?', 'Sale de la zona');
  await expect(page.getByText(/la de un submarino convencional es de 0 casillas/)).toBeVisible();
  await chooseOption(page, '¿El submarino tiene munición correspondiente para atacar?', 'Sí');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: el submarino no puede iniciar la Emboscada')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Secuencia de la Emboscada' })).toHaveCount(0);
});

test('sin munición el submarino nuclear emboscará a una formación adyacente, pero se avisa de que no puede atacar con munición', async ({ page }) => {
  await page.goto('/#/wizard/submarine-ambush');
  await chooseOption(page, '¿En qué estado está el submarino?', 'Oculto');
  await chooseOption(page, '¿Es un submarino convencional o nuclear?', 'Nuclear');
  await chooseOption(page, '¿Ya ha hecho una Emboscada en esta Fase de Acciones de Superficie?', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, '¿Dónde está la formación de superficie respecto del submarino?', 'En una casilla adyacente al submarino');
  await chooseOption(page, '¿Qué hace la formación de superficie?', 'Se mueve dentro de la zona');
  await chooseOption(page, '¿El submarino tiene munición correspondiente para atacar?', 'No');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: el submarino puede iniciar la Emboscada')).toBeVisible();
  await expect(page.getByText(/no puede realizar ataques que consuman munición/)).toBeVisible();
});

test('desde el Combate de Superficie del turno se llega al wizard de la Emboscada', async ({ page }) => {
  await page.goto('/#/turno/fase/1/surface/combate_superficie');
  await page.getByRole('button', { name: /▶ Emboscada de submarino/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/submarine-ambush$/);
  await expect(page.getByRole('heading', { name: 'Emboscada de submarino' })).toBeVisible();
});
