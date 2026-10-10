// Caso E2E de COR-007 (correcciones.md): el modo "Seleccionar unidad y plan"
// del wizard de ataque guiado reproduce EXACTAMENTE el golden test
// (data/scenarios/golden-antiship-guided.json) seleccionando la unidad real
// (F-2A/B, Japón) y su plan real (B — Type 93) en vez de introducir el
// Valor de Ataque/método a mano — la garantía central de esta incidencia.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

test('modo validado: F-2A/B + Plan B (Type 93) + carga ligera + distancia 2 hex reproduce "3 impacto(s)"', async ({ page }) => {
  await page.goto('/#/wizard/antiship-guided');

  // Paso 1 de 6: Disparo en Área (igual que en el golden test).
  await chooseOption(page, 'Tipo de objetivo.', 'Convencional');
  await chooseOption(page, '¿El sistema está marcado como defensa de Gran Altitud exclusivamente?', 'No');
  await chooseOption(page, 'Consumo AA.', 'Alto');
  await fillField(page, 'Valor total de Defensa Aérea / Combate Aéreo concentrado.', '6');
  await chooseOption(page, '¿El grupo objetivo incluye escolta electrónica con protección prioritaria?', 'No');
  await page.getByLabel('Tirada (1d10)').selectOption('4');
  await fillField(page, 'Protección del avión atacante (para interpretar el resultado)', '4');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 2 de 6: modo validado — sin introducir ningún Valor de Ataque a mano.
  await expect(page.getByRole('button', { name: 'Seleccionar unidad y plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Seleccionar unidad y plan' }).click();
  await page.getByLabel('País').selectOption('jp');
  await expect(page.getByLabel('Unidad atacante')).toBeVisible();
  await page.getByLabel('Unidad atacante').selectOption('jp-f-2ab');
  await expect(page.getByLabel('Plan de ataque')).toBeVisible();

  // Solo se ofrecen planes con método guiado: A (GPB, no guiado) NO aparece.
  const planOptions = await page.getByLabel('Plan de ataque').locator('option').allTextContents();
  expect(planOptions.some((t) => t.startsWith('A —'))).toBe(false);
  expect(planOptions.some((t) => t.startsWith('B —'))).toBe(true);

  await page.getByLabel('Plan de ataque').selectOption('B');
  await page.getByRole('button', { name: 'Ligera', exact: true }).click();
  await fillField(page, 'Distancia de ataque (hexágonos)', '2');
  await expect(page.getByText('Valor de Ataque derivado: 6 (método: subsonic)')).toBeVisible();
  await expect(page.getByText('dentro de alcance')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 3 de 6: Defensa Aérea de Área (no aplica) e Interceptación de Munición.
  // correcciones.02.md COR02-004 (alcance reducido tras COR02-005): en modo
  // validado, "¿La munición está marcada CM/BM?" ya no se pregunta — se
  // deriva del plan elegido (Plan B, Type 93: sin marcador -> No).
  await expect(page.getByRole('heading', { name: 'Defensa aérea de área' })).toBeVisible();
  await expect(page.getByText('Derivado del plan de ataque elegido (Plan B, Type 93): No.')).toBeVisible();
  await chooseOption(page, '¿El atacante ha sido detectado por el defensor?', 'No');
  await chooseOption(page, '¿La munición usa trayectoria de espacio cercano?', 'No');
  await chooseOption(page, '¿Objetivo y atacante están en el mismo hex o Zona Central?', 'No');
  await chooseOption(page, 'alerta temprana', 'No');
  await chooseOption(page, 'Rendimiento del sistema que intercepta.', 'Bajo');
  await chooseOption(page, '¿Qué ha detectado el defensor?', 'Atacante detectado');
  // "¿La distancia de ataque es 1 (o 2 en Misión de Área)?" tampoco se
  // pregunta literalmente: con distancia 2 (el único caso ambiguo, ya que
  // distancia 1 o > 2 se derivan sin ambigüedad) el wizard solo pide el
  // contexto realmente desconocido, "¿Es Misión de Área?".
  await chooseOption(page, '¿Es Misión de Área?', 'No');
  await expect(page.getByText('Derivado de la distancia de ataque introducida en "Datos base" (2 hex.): No.')).toBeVisible();
  await page.getByRole('button', { name: '+ Añadir otro disparo de interceptación' }).click();
  await fillField(page, 'Disparo 1: Valor de Defensa Aérea propio', '2');
  await page.getByLabel('Disparo 1: Tirada (1d10)').selectOption('4');
  await fillField(page, 'Disparo 2: Valor de Defensa Aérea propio', '4');
  await page.getByLabel('Disparo 2: Tirada (1d10)').selectOption('4');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 4 de 6: V.E.F. — la distancia de ataque YA NO se pregunta: se
  // deriva del hexágono introducido en el paso 2 (COR-007, diseño punto 6).
  await expect(page.getByRole('heading', { name: 'Resistencia electrónica de la flota' })).toBeVisible();
  await expect(page.getByText('Derivado de la distancia de ataque introducida en "Datos base" (2 hex.): 0-2 / Área 0-3.')).toBeVisible();
  await chooseOption(page, 'Estado de detección del atacante y guía/designador.', 'Atacante detectado');
  await fillField(page, 'Valor Electrónico más alto de la flota.', '3');
  await page.getByLabel('Tirada V.E.F. (1d10)').selectOption('4');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 5 de 6: el método YA NO se pregunta: se deriva del icono del plan.
  await expect(page.getByRole('heading', { name: 'Método de ataque y tirada' })).toBeVisible();
  await expect(page.getByText('Derivado del plan de ataque elegido (Plan B, Type 93): Subsónico.')).toBeVisible();
  await page.getByLabel('Tirada 1 (elige de la fila de la tabla final)').selectOption('4');
  await page.getByLabel('Tirada 2 (elige de la fila de la tabla final)').selectOption('6');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  // Paso 6 de 6: reproduce EXACTAMENTE el resultado del golden test.
  await expect(page.getByRole('heading', { name: 'Resultado', exact: true })).toBeVisible();
  await expect(page.getByText('Resultado: 3 impacto(s)')).toBeVisible();
});

test('modo validado: una distancia fuera del alcance del plan impide continuar y explica el motivo', async ({ page }) => {
  await page.goto('/#/wizard/antiship-guided');
  await chooseOption(page, 'Tipo de objetivo.', 'Convencional');
  await chooseOption(page, '¿El sistema está marcado como defensa de Gran Altitud exclusivamente?', 'No');
  await chooseOption(page, 'Consumo AA.', 'Alto');
  await fillField(page, 'Valor total de Defensa Aérea / Combate Aéreo concentrado.', '6');
  await chooseOption(page, '¿El grupo objetivo incluye escolta electrónica con protección prioritaria?', 'No');
  await page.getByLabel('Tirada (1d10)').selectOption('4');
  await fillField(page, 'Protección del avión atacante (para interpretar el resultado)', '4');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await page.getByRole('button', { name: 'Seleccionar unidad y plan' }).click();
  await page.getByLabel('País').selectOption('jp');
  await page.getByLabel('Unidad atacante').selectOption('jp-f-2ab');
  await page.getByLabel('Plan de ataque').selectOption('B'); // alcance 3
  await page.getByRole('button', { name: 'Ligera', exact: true }).click();
  await fillField(page, 'Distancia de ataque (hexágonos)', '4'); // fuera de alcance (3)
  await expect(page.getByText('FUERA de alcance')).toBeVisible();

  let dialogMessage = '';
  page.once('dialog', (dialog) => { dialogMessage = dialog.message(); dialog.accept(); });
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  expect(dialogMessage).toContain('supera el alcance del plan');

  // No debería haber avanzado de paso.
  await expect(page.getByRole('button', { name: 'Seleccionar unidad y plan' })).toBeVisible();
});

// Caso E2E de COR02-005 (correcciones.02.md): un plan con método guiado
// (balístico o de espacio cercano) cuyo daño final depende de la "marca de
// Escudo" (dato sin transcribir) no debe ofrecerse como resoluble aunque
// tenga método reconocido — debe excluirse del <select> y explicarse en una
// nota, en vez de dejar que el usuario lo resuelva con un cálculo incompleto.
test('modo validado: un plan balístico sin daño transcrito (marca de Escudo) se excluye del selector y se explica en una nota', async ({ page }) => {
  await page.goto('/#/wizard/antiship-guided');
  await chooseOption(page, 'Tipo de objetivo.', 'Convencional');
  await chooseOption(page, '¿El sistema está marcado como defensa de Gran Altitud exclusivamente?', 'No');
  await chooseOption(page, 'Consumo AA.', 'Alto');
  await fillField(page, 'Valor total de Defensa Aérea / Combate Aéreo concentrado.', '6');
  await chooseOption(page, '¿El grupo objetivo incluye escolta electrónica con protección prioritaria?', 'No');
  await page.getByLabel('Tirada (1d10)').selectOption('4');
  await fillField(page, 'Protección del avión atacante (para interpretar el resultado)', '4');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await page.getByRole('button', { name: 'Seleccionar unidad y plan' }).click();
  await page.getByLabel('País').selectOption('ch');
  await page.getByLabel('Unidad atacante').selectOption('ch-bs-055');

  // Plan C (YJ-21, balístico) NO debe aparecer entre las opciones.
  const planOptions = await page.getByLabel('Plan de ataque').locator('option').allTextContents();
  expect(planOptions.some((t) => t.startsWith('C —'))).toBe(false);
  expect(planOptions.some((t) => t.startsWith('A —'))).toBe(true);
  expect(planOptions.some((t) => t.startsWith('B —'))).toBe(true);

  // La nota debe nombrar el plan excluido y explicar el motivo.
  await expect(page.getByText('plan(es) adicional(es) no disponible(s) para resolución')).toBeVisible();
  await expect(page.getByText('C (YJ-21, Trayectoria balística)')).toBeVisible();
  await expect(page.getByText('marca de Escudo')).toBeVisible();
});
