// Wizard de Combate Aéreo Cercano WVR (#/wizard/air-combat-wvr; roadmap Fase 11,
// Decision Book §7.16.4). Valores esperados leídos de la página 17 impresa de
// Tablas-de-combate 5.pdf; la mecánica del motor se prueba en
// test/air-combat-wvr-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function fillUnit(page, side, idx, { name, ca, protection, network }) {
  await fillField(page, `${side} · unidad ${idx}: nombre`, name);
  if (ca !== undefined) await fillField(page, `${side} · unidad ${idx}: Valor de Combate Aéreo`, String(ca));
  await fillField(page, `${side} · unidad ${idx}: Valor de Protección`, String(protection));
  if (network) await page.locator('.wizard-unit', { hasText: `${side} · unidad ${idx}: nombre` }).locator('.wizard-question', { hasText: 'patrulla CAPs en red' }).getByRole('button', { name: 'Sí', exact: true }).click();
}

test('duelo de CAPs: la escolta EW retrasa la patrulla en red; ronda sin daño da +1; los CAPs dañados salen; se guarda y se repite', async ({ page }) => {
  await page.goto('/#/wizard/air-combat-wvr');
  await expect(page.getByText('Paso 1 de 3: Fuerzas de cada bando')).toBeVisible();
  await chooseOption(page, 'A: misión del grupo', 'Patrulla Aérea (CAPs)');
  await chooseOption(page, 'A: ¿hay un avión de guerra electrónica', 'Sí');
  await fillUnit(page, 'A', 1, { name: 'F-15J', ca: 3, protection: 2 });
  await page.getByRole('button', { name: '+ Añadir unidad a Bando A' }).click();
  await fillUnit(page, 'A', 2, { name: 'EA-18G', ca: 2, protection: 3 });
  await chooseOption(page, 'B: misión del grupo', 'Patrulla Aérea (CAPs)');
  await fillUnit(page, 'B', 1, { name: 'J-16', ca: 4, protection: 2 });
  await page.getByRole('button', { name: '+ Añadir unidad a Bando B' }).click();
  await fillUnit(page, 'B', 2, { name: 'J-11', ca: 3, protection: 2, network: true });
  await expect(page.getByText('Bando A tiene escolta electrónica: la patrulla en red de Bando B solo se une en la segunda ronda.')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Ronda 1: A CA 5 («3~6»), tirada 0 -> 1; B CA 4 sin el J-11 («3~6»), tirada 0 -> 1. Nadie alcanza Protección 2.
  await expect(page.getByText('Paso 2 de 3: Rondas de combate cercano')).toBeVisible();
  await expect(page.getByText(/Todavía no se unen \(escolta electrónica enemiga\): J-11/)).toBeVisible();
  await page.getByLabel('A: tirada WVR (1d10)').selectOption('0');
  await page.getByLabel('B: tirada WVR (1d10)').selectOption('0');
  await expect(page.getByText('Bando A: CA 5, tirada 0 · columna «3~6» → 1 Punto(s) de Impacto.')).toBeVisible();
  await expect(page.getByText('Bando B: CA 4, tirada 0 · columna «3~6» → 1 Punto(s) de Impacto.')).toBeVisible();
  await expect(page.getByText(/La siguiente tendrá \+1 \(ronda sin daño\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Otra ronda →' }).click();

  // Ronda 2: entra el J-11 (B CA 7, «7~12»); +1: A 4+1=5 -> 3; B 3+1=4 -> 4.
  await expect(page.getByRole('heading', { name: 'Ronda 2' })).toBeVisible();
  await page.getByLabel('A: tirada WVR (1d10)').selectOption('4');
  await page.getByLabel('B: tirada WVR (1d10)').selectOption('3');
  await expect(page.getByText('Bando A: CA 5, tirada 4 + 1 (rondas sin daño) = 5 · columna «3~6» → 3 Punto(s) de Impacto.')).toBeVisible();
  await expect(page.getByText('Bando B: CA 7, tirada 3 + 1 (rondas sin daño) = 4 · columna «7~12» → 4 Punto(s) de Impacto.')).toBeVisible();
  await fillField(page, 'A · EA-18G (Protección 3): puntos de daño', '1');
  await fillField(page, 'B · J-16 (Protección 2): puntos de daño', '1');
  await expect(page.getByText(/Bando A: fuera de combate o eliminadas: EA-18G\./)).toBeVisible();
  await expect(page.getByText(/Bando B: fuera de combate o eliminadas: J-16\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Otra ronda →' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByText('Paso 3 de 3: Resultado')).toBeVisible();
  const result = 'Resultado: 2 ronda(s) · Bando A: 1 de 2 unidad(es) siguen en combate · Bando B: 1 de 2 unidad(es) siguen en combate';
  await expect(page.getByText(result)).toBeVisible();
  await expect(page.locator('.table-viewer__grid-wrap, table').first()).toBeVisible();

  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/air-combat-wvr$/);
  await expect(page.getByText(result)).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await expect(page.getByText('Paso 1 de 3: Fuerzas de cada bando')).toBeVisible();
});

test('INK contra CAPs: el CAPs dañado y eliminado deja a su grupo Derrotado y no hay otra ronda', async ({ page }) => {
  await page.goto('/#/wizard/air-combat-wvr');
  await chooseOption(page, 'A: misión del grupo', 'Intercepción Aérea (INK) / Despegue de Emergencia');
  await fillUnit(page, 'A', 1, { name: 'F-2A', ca: 6, protection: 2 });
  await chooseOption(page, 'B: misión del grupo', 'Patrulla Aérea (CAPs)');
  await fillUnit(page, 'B', 1, { name: 'J-10', ca: 1, protection: 2 });
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // A: INK CA 6 («4~6»), tirada 9 -> 6. B: CAPs CA 1 («1»), tirada 0 -> sin impactos.
  await page.getByLabel('A: tirada WVR (1d10)').selectOption('9');
  await page.getByLabel('B: tirada WVR (1d10)').selectOption('0');
  await expect(page.getByText('Bando A: CA 6, tirada 9 · columna «4~6» → 6 Punto(s) de Impacto.')).toBeVisible();
  await expect(page.getByText('Bando B: CA 1, tirada 0 · columna «1» → 0 Punto(s) de Impacto.')).toBeVisible();
  await fillField(page, 'B · J-10 (Protección 2): puntos de daño', '1');
  await expect(page.getByText(/la regla obliga a seguir absorbiendo/)).toBeVisible();
  await chooseOption(page, 'B · J-10: ¿queda eliminada?', 'Sí');
  await expect(page.getByText(/la regla obliga a seguir absorbiendo/)).toHaveCount(0);
  await expect(page.getByText('Reparto de impactos de la ronda: revísalo antes de continuar')).toBeVisible();
  await expect(page.getByText(/Bando B recibe 6 Punto\(s\) de Impacto y los absorben: J-10: 1 punto\(s\), eliminada/)).toBeVisible();
  await expect(page.getByText('Bando A no recibe Puntos de Impacto.')).toBeVisible();
  await expect(page.getByText(/Bando B: "Derrotado"\./)).toBeVisible();
  await expect(page.getByText('No hay más rondas: solo continúan dos grupos CAPs que no estén derrotados.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Otra ronda →' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText(/Resultado: 1 ronda\(s\) · Bando A: 1 de 1 unidad\(es\) siguen en combate · Bando B "Derrotado": 0 de 1/)).toBeVisible();
  await expect(page.getByText(/INK\/DdE: si el oponente no es el objetivo de intercepción original/)).toBeVisible();
});

test('misión sin fila en la tabla con CA > 0: el ataque queda pendiente y no se puede ver el resultado', async ({ page }) => {
  await page.goto('/#/wizard/air-combat-wvr');
  await chooseOption(page, 'A: misión del grupo', 'Otra misión (no aire-aire)');
  await expect(page.getByText(/El Decision Book solo asigna fila a los grupos CAPs y INK\/DdE/)).toBeVisible();
  await fillUnit(page, 'A', 1, { name: 'F-16', ca: 4, protection: 2 });
  await chooseOption(page, 'B: misión del grupo', 'Patrulla Aérea (CAPs)');
  await fillUnit(page, 'B', 1, { name: 'MiG-29', ca: 4, protection: 2 });
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByLabel('A: tirada WVR (1d10)')).toHaveCount(0);
  await expect(page.getByText('Bando A: su misión no tiene fila en la tabla y su CA es 4; el ataque queda pendiente.')).toBeVisible();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Paso 2 de 3: Rondas de combate cercano')).toBeVisible();
});

test('"Combate por tipo" de combate aéreo ofrece también el wizard WVR', async ({ page }) => {
  await page.goto('/#/ayuda/combate/air_combat');
  await page.getByRole('button', { name: /Resolver el combate aéreo cercano \(WVR\)/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/air-combat-wvr$/);
});

test('una unidad que se retiró o salió de combate en el BVR no participa en el WVR ni cuenta para el CA', async ({ page }) => {
  await page.goto('/#/wizard/air-combat-wvr');
  await chooseOption(page, 'A: misión del grupo', 'Patrulla Aérea (CAPs)');
  await fillUnit(page, 'A', 1, { name: 'F-15J', ca: 3, protection: 2 });
  await page.getByRole('button', { name: '+ Añadir unidad a Bando A' }).click();
  await fillUnit(page, 'A', 2, { name: 'F-35A', ca: 2, protection: 2 });
  await page.locator('.wizard-unit', { hasText: 'A · unidad 2: nombre' }).locator('.wizard-question', { hasText: 'se retiró o salió de combate en el BVR' }).getByRole('button', { name: 'Sí', exact: true }).click();
  await chooseOption(page, 'B: misión del grupo', 'Patrulla Aérea (CAPs)');
  await fillUnit(page, 'B', 1, { name: 'J-16', ca: 4, protection: 2 });
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  // A solo combate con el F-15J: CA 3 (caps «3~6»), tirada 0 -> 1 impacto (no con CA 5).
  await page.getByLabel('A: tirada WVR (1d10)').selectOption('0');
  await page.getByLabel('B: tirada WVR (1d10)').selectOption('0');
  await expect(page.getByText('Bando A: CA 3, tirada 0 · columna «3~6» → 1 Punto(s) de Impacto.')).toBeVisible();
  await expect(page.getByText(/En combate: F-15J \(CA 3\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText(/Bando A: Patrulla Aérea \(CAPs\); 1 unidad\(es\) en combate \(1 fuera desde el BVR\)\./)).toBeVisible();
});
