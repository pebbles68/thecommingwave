// AJ-002: la misión aérea como contexto inicial de los ataques que parten de
// ella. La derivación se prueba en test/mission-context-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

const MISSION_PROMPT = '¿Qué misión aérea ejecuta el grupo que ataca?';

test('entrada directa: la misión es lo primero y su tarjeta sale de los datos de misiones', async ({ page }) => {
  await page.goto('/#/wizard/antiship-guided');
  await expect(page.getByText(MISSION_PROMPT)).toBeVisible();
  await expect(page.locator('.mission-context')).toBeVisible();
  await chooseOption(page, MISSION_PROMPT, 'Ataque Dinámico (ON CALL)');
  const card = page.locator('.mission-context');
  await expect(card).toContainText('Aire-superficie');
  await expect(card).toContainText('Misión de Área');
  await expect(card).toContainText('Sí: tras llegar, el grupo obtiene una Zona Central');
  await expect(card).toContainText('x1 el Alcance (ALC)');
  await expect(card).toContainText('la distancia 2 cuenta como 1');
  await expect(card).toContainText('1 Punto(s) de Mando');

  await chooseOption(page, MISSION_PROMPT, 'Ataque Aéreo (Air Strike)');
  await expect(card).toContainText('No: la unidad se considera solo en el hexágono de su marcador.');
  await expect(card).toContainText('Misión de Punto');
});

test('un ataque que no procede de una misión aérea no se fuerza a elegir una', async ({ page }) => {
  await page.goto('/#/wizard/antiship-unguided');
  await chooseOption(page, MISSION_PROMPT, 'No procede de una misión aérea (artillería, ataque naval o submarino)');
  await expect(page.locator('.mission-context')).toContainText('Sin misión aérea');
  // Se puede seguir con el wizard sin misión.
  await expect(page.getByText('Paso 1 de 5')).toBeVisible();
});

async function fillStep1(page) {
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
  await page.getByLabel('Plan de ataque').selectOption('B');
  await page.getByRole('button', { name: 'Ligera', exact: true }).click();
  await fillField(page, 'Distancia de ataque (hexágonos)', '2');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByRole('heading', { name: 'Defensa aérea de área' })).toBeVisible();
}

test('con distancia 2 la misión elegida fija Área/Punto y no se vuelve a preguntar', async ({ page }) => {
  await page.goto('/#/wizard/antiship-guided');
  await chooseOption(page, MISSION_PROMPT, 'Ataque Dinámico (ON CALL)');
  await fillStep1(page);
  await expect(page.getByText('¿Es Misión de Área?')).toHaveCount(0);
  await expect(page.getByText('Derivado de la distancia de ataque introducida en "Datos base" (2 hex.) y de la misión elegida (Misión de Área): Sí.')).toBeVisible();

  // Cambiar la misión invalida la respuesta derivada y la recalcula.
  await page.getByRole('button', { name: '← Anterior' }).click();
  await page.getByRole('button', { name: '← Anterior' }).click();
  await chooseOption(page, MISSION_PROMPT, 'Ataque Aéreo (Air Strike)');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Derivado de la distancia de ataque introducida en "Datos base" (2 hex.) y de la misión elegida (Misión de Punto): No.')).toBeVisible();
});

test('sin misión elegida, con distancia 2 se sigue preguntando si es Misión de Área', async ({ page }) => {
  await page.goto('/#/wizard/antiship-guided');
  await fillStep1(page);
  await expect(page.getByText('¿Es Misión de Área?')).toBeVisible();
});

for (const hash of ['#/turno/fase/1/ground/combate_terrestre', '#/turno/fase/1/surface/combate_superficie']) {
  test(`desde ${hash.split('/').pop()} solo se resuelve ON CALL y queda preseleccionada`, async ({ page }) => {
    await page.goto('/#/');
    await page.evaluate((h) => { location.hash = h; }, hash);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => { location.hash = '#/wizard/ground-guided'; });
    const block = page.locator('.mission-context');
    await expect(block).toContainText('la única misión aérea que se resuelve es el Ataque Dinámico (ON CALL)');
    await expect(block).toContainText('Misión de Área');
    const group = page.locator('.wizard-question', { hasText: MISSION_PROMPT });
    await expect(group.getByRole('button', { name: 'Ataque Dinámico (ON CALL)', exact: true })).toBeVisible();
    await expect(group.getByRole('button', { name: 'Ataque Aéreo (Air Strike)', exact: true })).toHaveCount(0);
    await expect(group.getByRole('button', { name: /^No procede de una misión aérea/ })).toBeVisible();
    // Se puede declarar que el ataque no es aéreo (artillería, buques…).
    await group.getByRole('button', { name: /^No procede de una misión aérea/ }).click();
    await expect(block).toContainText('Sin misión aérea');
  });
}

test('desde la Fase de acciones submarinas solo se resuelve el ataque de los MPA', async ({ page }) => {
  await page.goto('/#/turno/fase/1/submarine/combate_submarino');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => { location.hash = '#/wizard/antiship-guided'; });
  const group = page.locator('.wizard-question', { hasText: MISSION_PROMPT });
  await expect(page.locator('.mission-context')).toContainText('la única misión aérea que se resuelve es');
  await expect(group.getByRole('button', { name: /^Patrulla Marítima/ })).toBeVisible();
  await expect(group.getByRole('button', { name: 'Ataque Dinámico (ON CALL)', exact: true })).toHaveCount(0);
});

test('desde «Salidas de combate» (Fase de acciones aéreas) se ofrecen todas las misiones compatibles', async ({ page }) => {
  await page.goto('/#/turno/fase/1/air-1/salidas_combate');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => { location.hash = '#/wizard/antiship-guided'; });
  const group = page.locator('.wizard-question', { hasText: MISSION_PROMPT });
  await expect(group.getByRole('button', { name: 'Ataque Dinámico (ON CALL)', exact: true })).toBeVisible();
  await expect(group.getByRole('button', { name: 'Ataque Aéreo (Air Strike)', exact: true })).toBeVisible();
  await expect(page.locator('.mission-context')).not.toContainText('la única misión aérea que se resuelve');
});

for (const route of ['antiship-guided', 'antiship-unguided', 'ground-guided', 'ground-unguided', 'anti-radiation']) {
  test(`las misiones aire-aire (CAPs, intercepción) no se ofrecen en un ataque contra buques o terrestre: ${route}`, async ({ page }) => {
    await page.goto(`/#/wizard/${route}`);
    const group = page.locator('.wizard-question', { hasText: MISSION_PROMPT });
    await expect(group).toBeVisible();
    await expect(group.getByRole('button', { name: 'Ataque Dinámico (ON CALL)', exact: true })).toBeVisible();
    await expect(group.getByRole('button', { name: 'Patrulla Aérea (CAPs)', exact: true })).toHaveCount(0);
    await expect(group.getByRole('button', { name: 'Intercepción Aérea (INK)', exact: true })).toHaveCount(0);
  });
}

async function groundGuidedToDefenses(page) {
  await fillField(page, 'Valor de Ataque base del plan de ataque', '4');
  await chooseOption(page, 'Tipo de ataque:', 'No');
  await chooseOption(page, 'Tipo de munición:', 'Persecución');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Distancia de ataque (hexágonos)')).toBeVisible();
}

test('ataque terrestre: se pregunta la distancia y la misión decide el caso de distancia 2', async ({ page }) => {
  await page.goto('/#/wizard/ground-guided');
  await chooseOption(page, MISSION_PROMPT, 'Ataque Dinámico (ON CALL)');
  await groundGuidedToDefenses(page);
  await fillField(page, 'Distancia de ataque (hexágonos)', '2');
  await expect(page.getByText('¿Es Misión de Área?')).toHaveCount(0);
  await expect(page.getByText('Derivado de la distancia de ataque (2 hex.) y de la misión elegida (Misión de Área): Sí.')).toBeVisible();
  await expect(page.getByText(/Solo las unidades en el mismo hex que el objetivo|only_same_hex_defenders/).first()).toBeVisible();

  await fillField(page, 'Distancia de ataque (hexágonos)', '1');
  await expect(page.getByText('Derivado de la distancia de ataque (1 hex.): Sí.')).toBeVisible();
  await fillField(page, 'Distancia de ataque (hexágonos)', '4');
  await expect(page.getByText('Derivado de la distancia de ataque (4 hex.): No.')).toBeVisible();
});

test('ataque terrestre con misión de Punto: la distancia 2 no activa la restricción', async ({ page }) => {
  await page.goto('/#/wizard/ground-guided');
  await chooseOption(page, MISSION_PROMPT, 'Ataque Aéreo (Air Strike)');
  await groundGuidedToDefenses(page);
  await fillField(page, 'Distancia de ataque (hexágonos)', '2');
  await expect(page.getByText('Derivado de la distancia de ataque (2 hex.) y de la misión elegida (Misión de Punto): No.')).toBeVisible();
});

test('ataque terrestre sin misión aérea: con distancia 2 se pregunta si es Misión de Área', async ({ page }) => {
  await page.goto('/#/wizard/ground-guided');
  await chooseOption(page, MISSION_PROMPT, 'No procede de una misión aérea (artillería, ataque naval o submarino)');
  await groundGuidedToDefenses(page);
  await fillField(page, 'Distancia de ataque (hexágonos)', '2');
  await expect(page.getByText('¿Es Misión de Área?')).toBeVisible();
  await chooseOption(page, '¿Es Misión de Área?', 'Sí');
  await expect(page.getByText('Derivado de la distancia de ataque (2 hex.): Sí.')).toBeVisible();
});

async function groundGuidedToIntensity(page) {
  await groundGuidedToDefenses(page);
  await chooseOption(page, '¿La munición de este ataque está marcada CM (Misil de Crucero) o BM (Misil Balístico)?', 'No');
  await chooseOption(page, '¿Objetivo y atacante están en el mismo hex o Zona Central?', 'Sí');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, 'Tipo de objetivo.', 'Unidad móvil principal');
}

test('B.11: la banda de distancia del ataque terrestre sale de la distancia y de la misión (Área = un hexágono menos)', async ({ page }) => {
  await page.goto('/#/wizard/ground-guided');
  await chooseOption(page, MISSION_PROMPT, 'Ataque Dinámico (ON CALL)');
  await groundGuidedToIntensity(page);
  const label = 'Distancia de ataque (hexágonos, contada desde el hexágono que ocupas)';
  await expect(page.getByText('La distancia de ataque se cuenta siempre desde el hexágono que ocupas')).toBeVisible();
  await fillField(page, label, '2');
  await expect(page.getByText(/Banda de distancia: 1 \/ Área ≤2 \(Misión de Área: se cuenta hasta un hexágono adyacente al de destino\)/)).toBeVisible();
  await expect(page.getByText(/Distancia de ataque \(hexágonos, contada/)).toBeVisible();
  await fillField(page, label, '3');
  await expect(page.getByText(/Banda de distancia: ≥2 \/ Área ≥3/)).toBeVisible();
  await fillField(page, label, '1');
  await expect(page.getByText(/Banda de distancia: 0 \/ Área ≤1/)).toBeVisible();
});

test('B.11: con una misión de Punto la misma distancia 2 cae en la banda ≥2', async ({ page }) => {
  await page.goto('/#/wizard/ground-guided');
  await chooseOption(page, MISSION_PROMPT, 'Ataque Aéreo (Air Strike)');
  await groundGuidedToIntensity(page);
  const label = 'Distancia de ataque (hexágonos, contada desde el hexágono que ocupas)';
  await fillField(page, label, '2');
  await expect(page.getByText(/Banda de distancia: ≥2 \/ Área ≥3\./)).toBeVisible();

});

test('B.11: sin misión aérea, con distancia 2 se pregunta si es Misión de Área y eso decide la banda', async ({ page }) => {
  await page.goto('/#/wizard/ground-guided');
  await chooseOption(page, MISSION_PROMPT, 'No procede de una misión aérea (artillería, ataque naval o submarino)');
  await groundGuidedToIntensity(page);
  const label = 'Distancia de ataque (hexágonos, contada desde el hexágono que ocupas)';
  await fillField(page, label, '2');
  await expect(page.getByText(/Banda de distancia/)).toHaveCount(0);
  await chooseOption(page, '¿Es Misión de Área?', 'Sí');
  await expect(page.getByText("Banda de distancia: 1 / Área ≤2", { exact: false })).toBeVisible();
  await chooseOption(page, '¿Es Misión de Área?', 'No');
  await expect(page.getByText("Banda de distancia: ≥2 / Área ≥3.", { exact: false })).toBeVisible();
});
