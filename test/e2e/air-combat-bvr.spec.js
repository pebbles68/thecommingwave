// Wizard de Combate Aéreo BVR (#/wizard/air-combat-bvr; roadmap Fase 11,
// Decision Book §7.16.2-§7.16.3). Valores esperados leídos de las páginas 15-16
// impresas de Tablas-de-combate 5.pdf; la mecánica del motor se prueba en
// test/air-combat-bvr-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function fillInitiative(page, { context, a, b, awacsA }) {
  await chooseOption(page, 'Tipo de interceptación.', context);
  await fillField(page, 'A: Valor de Iniciativa (IN)', String(a));
  await fillField(page, 'B: Valor de Iniciativa (IN)', String(b));
  if (awacsA) await chooseOption(page, 'A: La unidad propia que ataca al objetivo está en red', 'Sí');
}

test('iniciativa 5 vs 3: diferencia 2 (DRM +5), tirada 3 -> total 8 -> BVR simultáneo; cada bando ataca; se guarda y se repite', async ({ page }) => {
  await page.goto('/#/wizard/air-combat-bvr');
  await expect(page.getByText('Paso 1 de 3: Iniciativa y tipo de combate BVR')).toBeVisible();
  await fillInitiative(page, { context: 'Interceptación de Combate Aéreo', a: 5, b: 3 });
  await expect(page.getByText(/diferencia 2 \(ventaja: Bando A\); DRM \+5\./)).toBeVisible();
  await page.getByLabel('Tirada de iniciativa (1d10)').selectOption('3');
  await expect(page.getByText('Total 3 + (5) = 8.')).toBeVisible();
  await expect(page.getByText(/BVR Simultáneo: ambos bandos realizan un ataque BVR simultáneamente/)).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 2 de 3: Ataques BVR')).toBeVisible();
  await fillField(page, 'A: Valor Electrónico', '2');
  await fillField(page, 'B: Valor Electrónico', '2');
  // A ataca a B con Intercepción/DdE (sin AWACS): fila «Intercepción/DdE», Valor 4, tirada 5 -> 1 impacto.
  await chooseOption(page, 'A: misión original de la unidad que ataca', 'Intercepción/DdE');
  await fillField(page, 'A: Valor de Combate Aéreo', '4');
  await page.getByLabel('A: Tirada BVR (1d10)').selectOption('5');
  await fillField(page, 'B: Valor de Protección de la unidad que recibe el ataque de A', '1');
  await chooseOption(page, 'B: ¿La unidad que recibe el ataque es de Patrulla Aérea (CAPs)?', 'No');
  await expect(page.getByText(/columna «4» → 1 Punto\(s\) de Impacto\./).first()).toBeVisible();
  // B ataca a A con CAPs: Valor 4, tirada 5 -> "." (0 impactos).
  await chooseOption(page, 'B: misión original de la unidad que ataca', 'CAP');
  await fillField(page, 'B: Valor de Combate Aéreo', '4');
  await page.getByLabel('B: Tirada BVR (1d10)').selectOption('5');
  await fillField(page, 'A: Valor de Protección de la unidad que recibe el ataque de B', '2');
  await chooseOption(page, 'A: ¿La unidad que recibe el ataque es de Patrulla Aérea (CAPs)?', 'Sí');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByText('Paso 3 de 3: Resultado')).toBeVisible();
  await expect(page.getByText('Resultado: Bando A → 1 punto(s) de daño a Bando B · Bando B → 0 punto(s) de daño a Bando A')).toBeVisible();

  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/air-combat-bvr$/);
  await expect(page.getByText(/Resultado: Bando A → 1 punto\(s\) de daño a Bando B/)).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await expect(page.getByText('Paso 1 de 3: Iniciativa y tipo de combate BVR')).toBeVisible();
});

test('iniciativas iguales: sin ventaja ni DRM; tirada 4 -> total 4 -> Sin BVR (no hay ataques)', async ({ page }) => {
  await page.goto('/#/wizard/air-combat-bvr');
  await fillInitiative(page, { context: 'Interceptación de Combate Aéreo', a: 4, b: 4 });
  await expect(page.getByText(/diferencia 0 \(sin ventaja\); DRM \+0\./)).toBeVisible();
  await page.getByLabel('Tirada de iniciativa (1d10)').selectOption('4');
  await expect(page.getByText(/Sin BVR: no se realiza combate BVR/)).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText(/No hay ataques BVR que resolver/)).toBeVisible();
});

test('duelo sigiloso (ambas unidades sigilosas): Sin BVR sin tirar iniciativa', async ({ page }) => {
  await page.goto('/#/wizard/air-combat-bvr');
  await fillInitiative(page, { context: 'Interceptación de Combate Aéreo', a: 6, b: 2 });
  await chooseOption(page, 'A: Unidad sigilosa', 'Sí');
  await chooseOption(page, 'B: Unidad sigilosa', 'Sí');
  await expect(page.getByText(/Duelo sigiloso: si ambas unidades del combate BVR son sigilosas/)).toBeVisible();
  await expect(page.getByText(/Sin BVR: no se realiza combate BVR/)).toBeVisible();
});

test('ventaja BVR: solo ataca el bando con ventaja; un avión de CAPs solo absorbe 1 punto de daño y la tirada electrónica > 9 se marca', async ({ page }) => {
  await page.goto('/#/wizard/air-combat-bvr');
  await fillInitiative(page, { context: 'Interceptación de Combate Aéreo', a: 8, b: 0 });
  await page.getByLabel('Tirada de iniciativa (1d10)').selectOption('2'); // 2 + DRM(+8) = 10 -> Ventaja BVR
  await expect(page.getByText(/Ventaja BVR: el bando con ventaja realiza un ataque BVR unilateral/)).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Ataque de Bando A contra Bando B')).toBeVisible();
  await expect(page.getByText('Ataque de Bando B contra Bando A')).toHaveCount(0);
  await fillField(page, 'A: Valor Electrónico', '3');
  await fillField(page, 'B: Valor Electrónico', '0');
  await chooseOption(page, 'A: misión original de la unidad que ataca', 'CAP');
  await fillField(page, 'A: Valor de Combate Aéreo', '12');
  await page.getByLabel('A: Tirada BVR (1d10)').selectOption('8'); // 8 + 3 = 11 -> última fila
  await fillField(page, 'B: Valor de Protección de la unidad que recibe el ataque de A', '1');
  await chooseOption(page, 'B: ¿La unidad que recibe el ataque es de Patrulla Aérea (CAPs)?', 'Sí');
  await expect(page.getByText(/última fila \(9\)/)).toBeVisible();
  await expect(page.getByText('Daño a Bando B: 1 punto(s) (CAPs: solo absorbe 1) — sale temporalmente de combate.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText(/Una tirada BVR modificada por el Valor Electrónico que supera 9 se lee en la última fila/)).toBeVisible();
});

test('interceptación de penetración con total 6~9: sigilosa si el que penetra es sigiloso, BVR simultáneo si no', async ({ page }) => {
  await page.goto('/#/wizard/air-combat-bvr');
  await fillInitiative(page, { context: 'Interceptación de Penetración', a: 3, b: 3 });
  await chooseOption(page, '¿Qué bando es el que penetra', 'Bando B');
  await chooseOption(page, 'B: Unidad sigilosa', 'Sí');
  await page.getByLabel('Tirada de iniciativa (1d10)').selectOption('7');
  await expect(page.getByText(/Penetración sigilosa: una unidad sigilosa obtiene "Penetración Exitosa"/)).toBeVisible();
  await chooseOption(page, 'B: Unidad sigilosa', 'No');
  await expect(page.getByText(/BVR Simultáneo: ambos bandos realizan un ataque BVR simultáneamente/)).toBeVisible();
});
