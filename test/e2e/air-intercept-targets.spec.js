// Wizard de Asignación de Objetivos BVR y retirada previa
// (#/wizard/air-intercept-targets; roadmap Fase 11, Decision Book
// §7.16.1-§7.16.2). La mecánica se prueba en test/air-intercept-targets-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function fillUnit(page, side, n, { name, ev, detected, nonAirToAir, transport }) {
  await fillField(page, `${side} · unidad ${n}: nombre`, name);
  await fillField(page, `${side} · unidad ${n}: Valor Electrónico`, String(ev));
  if (detected) await chooseOption(page, `${side} · unidad ${n}: ¿detectada por el enemigo?`, 'Sí');
  if (nonAirToAir) await chooseOption(page, `${side} · unidad ${n}: ¿en misión aire-aire`, 'No');
  if (transport) await chooseOption(page, `${side} · unidad ${n}: ¿grupo de Transporte Aéreo`, 'Sí');
}

test('prioridad: no detectadas y Valor Electrónico mayor eligen primero; renunciar pasa el turno; se guarda y se repite', async ({ page }) => {
  await page.goto('/#/wizard/air-intercept-targets');
  await expect(page.getByText('Paso 1 de 3: Participantes')).toBeVisible();
  await chooseOption(page, '¿Qué bando inició el combate aéreo?', 'Bando A');
  await fillUnit(page, 'A', 1, { name: 'F-15J', ev: 2, detected: true });
  await page.getByRole('button', { name: '+ Añadir unidad a Bando A' }).click();
  await fillUnit(page, 'A', 2, { name: 'F-35A', ev: 3 });
  await fillUnit(page, 'B', 1, { name: 'J-20', ev: 3 });
  await page.getByRole('button', { name: '+ Añadir unidad a Bando B' }).click();
  await fillUnit(page, 'B', 2, { name: 'J-16', ev: 4, detected: true });
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 2 de 3: Selección de objetivos')).toBeVisible();
  await expect(page.getByText('1. F-35A (Bando A, V.E. 3, no detectada)')).toBeVisible();
  await expect(page.getByText('2. J-20 (Bando B, V.E. 3, no detectada)')).toBeVisible();
  await expect(page.getByText('3. J-16 (Bando B, V.E. 4, detectada)')).toBeVisible();
  await expect(page.getByText('Elige F-35A (Bando A):')).toBeVisible();
  await page.getByRole('button', { name: 'Renunciar' }).click();
  await expect(page.getByText('Elige J-20 (Bando B):')).toBeVisible();
  await page.getByRole('button', { name: 'Elegir F-15J' }).click();
  await expect(page.getByText('Elige J-16 (Bando B):')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Elegir F-15J' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Elegir F-35A' }).click();
  await expect(page.getByText('Asignación terminada.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver duelos →' }).click();

  await expect(page.getByText('Paso 3 de 3: Duelos BVR y retirada')).toBeVisible();
  await expect(page.getByText('Duelo 1: J-20 (Bando B) contra F-15J (Bando A).')).toBeVisible();
  await expect(page.getByText('Duelo 2: J-16 (Bando B) contra F-35A (Bando A).')).toBeVisible();
  await expect(page.getByText('Resultado: 2 duelo(s) BVR')).toBeVisible();

  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/air-intercept-targets$/);
  await expect(page.getByText('Resultado: 2 duelo(s) BVR')).toBeVisible();
  await page.getByRole('button', { name: 'Resolver un duelo en el wizard BVR →' }).click();
  await expect(page).toHaveURL(/#\/wizard\/air-combat-bvr$/);
});

test('escolta electrónica: solo elige ese bando; el bando más numeroso deja unidades fuera; retirada antes del BVR por unidad', async ({ page }) => {
  await page.goto('/#/wizard/air-intercept-targets');
  await chooseOption(page, '¿Qué bando inició el combate aéreo?', 'Bando B');
  await chooseOption(page, 'A: ¿tiene escolta electrónica (EEA)?', 'Sí');
  await fillUnit(page, 'A', 1, { name: 'F-15J', ev: 1 });
  await fillUnit(page, 'B', 1, { name: 'Y-20', ev: 3, nonAirToAir: true, transport: true });
  for (const [n, u] of [[2, { name: 'Y-9', ev: 2, nonAirToAir: true, transport: true }], [3, { name: 'KJ-500', ev: 4, nonAirToAir: true }], [4, { name: 'J-10', ev: 2 }]]) {
    await page.getByRole('button', { name: '+ Añadir unidad a Bando B' }).click();
    await fillUnit(page, 'B', n, u);
  }
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Solo Bando A tiene escolta electrónica: elige los objetivos de sus unidades.')).toBeVisible();
  await page.getByRole('button', { name: 'Elegir Y-20' }).click();
  await expect(page.getByText('Asignación terminada.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver duelos →' }).click();

  await expect(page.getByText('No participan en el BVR: Y-9, KJ-500, J-10.')).toBeVisible();
  await expect(page.getByText(/^Y-20: no puede retirarse antes del BVR \(A\. Las unidades seleccionadas como objetivo/)).toBeVisible();
  await expect(page.getByText(/^Y-9: no puede retirarse antes del BVR \(D\. En un grupo de Transporte Aéreo/)).toBeVisible();
  await expect(page.getByText('KJ-500: puede retirarse ahora y "Regresar".')).toBeVisible();
  await expect(page.getByText('J-10: misión aire-aire, la retirada inmediata no aplica.')).toBeVisible();
});

test('cambiar los participantes descarta de forma explícita las elecciones ya hechas', async ({ page }) => {
  await page.goto('/#/wizard/air-intercept-targets');
  await chooseOption(page, '¿Qué bando inició el combate aéreo?', 'Bando A');
  await fillUnit(page, 'A', 1, { name: 'F-2A', ev: 2 });
  await fillUnit(page, 'B', 1, { name: 'Su-35', ev: 1 });
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByRole('button', { name: 'Elegir Su-35' }).click();
  await page.getByRole('button', { name: '← Anterior' }).click();
  await chooseOption(page, 'B · unidad 1: ¿detectada por el enemigo?', 'Sí');
  await expect(page.getByText('Has cambiado los participantes: se han descartado las elecciones de objetivo que ya estaban hechas.')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Elige F-2A (Bando A):')).toBeVisible();
});

test('interceptación de penetración: el avión EW del que penetra elige primero (§7.10.4); sin EEA propia el interceptor no cambia el orden', async ({ page }) => {
  await page.goto('/#/wizard/air-intercept-targets');
  await chooseOption(page, 'Tipo de interceptación.', 'Interceptación de Penetración');
  await chooseOption(page, '¿Qué bando es el que penetra', 'Bando A');
  await chooseOption(page, '¿Qué bando inició el combate aéreo?', 'Bando B');
  await chooseOption(page, 'A: ¿tiene escolta electrónica (EEA)?', 'Sí');
  await fillUnit(page, 'A', 1, { name: 'F-16', ev: 1 });
  await page.getByRole('button', { name: '+ Añadir unidad a Bando A' }).click();
  await fillUnit(page, 'A', 2, { name: 'EA-18G', ev: 0, detected: true });
  await chooseOption(page, 'A · unidad 2: ¿es el avión de guerra electrónica con escolta?', 'Sí');
  await fillUnit(page, 'B', 1, { name: 'J-10', ev: 5 });
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Interceptación de penetración: el avión de guerra electrónica de Bando A elige primero; después se sigue la prioridad.')).toBeVisible();
  await expect(page.getByText('1. EA-18G (Bando A, V.E. 0)')).toBeVisible();
  await expect(page.getByText('Elige EA-18G (Bando A):')).toBeVisible();
  await page.getByRole('button', { name: 'Elegir J-10' }).click();
  await expect(page.getByText('Asignación terminada.')).toBeVisible();
});

test('interceptación de penetración sin quién penetra: no deja avanzar', async ({ page }) => {
  await page.goto('/#/wizard/air-intercept-targets');
  await chooseOption(page, 'Tipo de interceptación.', 'Interceptación de Penetración');
  await chooseOption(page, '¿Qué bando inició el combate aéreo?', 'Bando A');
  await fillUnit(page, 'A', 1, { name: 'F-2A', ev: 2 });
  await fillUnit(page, 'B', 1, { name: 'Su-35', ev: 1 });
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 1 de 3: Participantes')).toBeVisible();
});
