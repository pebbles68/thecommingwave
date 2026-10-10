// Helpers compartidos por las pruebas E2E que exercitan el wizard de ataque
// guiado a superficie (#/wizard/antiship-guided) con los valores exactos de
// data/scenarios/golden-antiship-guided.json (correcciones.md COR-004, casos
// obligatorios 2 y 3).
async function chooseOption(page, prompt, optionLabel) {
  await page.locator('.wizard-question', { hasText: prompt }).getByRole('button', { name: optionLabel, exact: true }).click();
}

// `makeNumberField`/`makeTextField` (public/js/app.js) solo re-renderizan el
// resumen derivado bajo el campo cuando el input dispara 'change' (su
// `onCommit`), no con el 'input' que `locator.fill()` dispara por sí solo.
// Sacar el foco del campo tras rellenarlo fuerza ese 'change', igual que
// haría una persona tabulando al siguiente campo.
async function fillField(page, label, value) {
  await page.getByLabel(label).fill(value);
  await page.getByLabel(label).press('Tab');
}

// Recorre los pasos 1-5 del wizard con los valores exactos del golden test
// (data/scenarios/golden-antiship-guided.json) y se detiene justo cuando el
// paso 6 "Resultado" muestra "Resultado: 3 impacto(s)" — sin rellenar todavía
// la flota/asignación de impactos, que cada prueba llamante decide si
// necesita. Asume que `page` ya está en '/#/wizard/antiship-guided'.
async function fillGoldenWizardThroughResult(page, expect) {
  // Paso 1 de 6: Disparo en Área (workflow 06, página 18).
  await expect(page.getByRole('heading', { name: 'Defensa aérea de área contra aeronaves' })).toBeVisible();
  await chooseOption(page, 'Tipo de objetivo.', 'Convencional');
  await chooseOption(page, '¿El sistema está marcado como defensa de Gran Altitud exclusivamente?', 'No');
  await chooseOption(page, 'Consumo AA.', 'Alto');
  await fillField(page, 'Valor total de Defensa Aérea / Combate Aéreo concentrado.', '6');
  await chooseOption(page, '¿El grupo objetivo incluye escolta electrónica con protección prioritaria?', 'No');
  await page.getByLabel('Tirada (1d10)').selectOption('4');
  await fillField(page, 'Protección del avión atacante (para interpretar el resultado)', '4');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 2 de 6: Datos base del ataque.
  await expect(page.getByRole('heading', { name: 'Datos base del ataque' })).toBeVisible();
  await fillField(page, 'Valor de Ataque base de la munición', '6');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 3 de 6: Defensa Aérea de Área (no aplica, munición no es CM/BM) e Interceptación de Munición.
  await expect(page.getByRole('heading', { name: 'Defensa aérea de área' })).toBeVisible();
  await chooseOption(page, '¿La munición de este ataque está marcada CM (Misil de Crucero) o BM (Misil Balístico)?', 'No');
  await chooseOption(page, '¿El atacante ha sido detectado por el defensor?', 'No');
  await chooseOption(page, '¿La munición usa trayectoria de espacio cercano?', 'No');
  await chooseOption(page, '¿Objetivo y atacante están en el mismo hex o Zona Central?', 'No');
  await chooseOption(page, 'alerta temprana', 'No');
  await chooseOption(page, 'Rendimiento del sistema que intercepta.', 'Bajo');
  await chooseOption(page, '¿Qué ha detectado el defensor?', 'Atacante detectado');
  await fillField(page, 'Distancia de ataque (hexágonos)', '3');
  await page.getByRole('button', { name: '+ Añadir otro disparo de interceptación' }).click();
  await fillField(page, 'Disparo 1: Valor de Defensa Aérea propio', '2');
  await page.getByLabel('Disparo 1: Tirada (1d10)').selectOption('4');
  await fillField(page, 'Disparo 2: Valor de Defensa Aérea propio', '4');
  await page.getByLabel('Disparo 2: Tirada (1d10)').selectOption('4');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 4 de 6: Resistencia electrónica de la flota (V.E.F.).
  await expect(page.getByRole('heading', { name: 'Resistencia electrónica de la flota' })).toBeVisible();
  await chooseOption(page, 'Distancia de ataque / equivalente de Misión de Área.', '0-2 / Área 0-3');
  await chooseOption(page, 'Estado de detección del atacante y guía/designador.', 'Atacante detectado');
  await fillField(page, 'Valor Electrónico más alto de la flota.', '3');
  await page.getByLabel('Tirada V.E.F. (1d10)').selectOption('4');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 5 de 6: Método de ataque y tirada.
  await expect(page.getByRole('heading', { name: 'Método de ataque y tirada' })).toBeVisible();
  await chooseOption(page, 'Método de ataque.', 'Subsónico');
  await page.getByLabel('Tirada 1 (elige de la fila de la tabla final)').selectOption('4');
  await page.getByLabel('Tirada 2 (elige de la fila de la tabla final)').selectOption('6');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  // Paso 6 de 6: Resultado.
  await expect(page.getByRole('heading', { name: 'Resultado', exact: true })).toBeVisible();
  await expect(page.getByText('Resultado: 3 impacto(s)')).toBeVisible();
}

module.exports = { chooseOption, fillField, fillGoldenWizardThroughResult };
