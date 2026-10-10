// Prioridad de absorción del avión de guerra electrónica con escolta ante un
// disparo de defensa aérea (Decision Book §7.10.4; roadmap Fase 11 "Caso crítico:
// escolta EW"), en el paso "Disparo en Área" del wizard de ataque guiado a
// superficie. Con los valores del golden test (A.A. 6, tirada 4) la tabla da
// 3 puntos de daño; la mecánica se prueba en test/ew-escort-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function openAreaFire(page, { escort }) {
  await page.goto('/#/wizard/antiship-guided');
  await expect(page.getByRole('heading', { name: 'Defensa aérea de área contra aeronaves' })).toBeVisible();
  await chooseOption(page, 'Tipo de objetivo.', 'Convencional');
  await chooseOption(page, '¿El sistema está marcado como defensa de Gran Altitud exclusivamente?', 'No');
  await chooseOption(page, 'Consumo AA.', 'Alto');
  await fillField(page, 'Valor total de Defensa Aérea / Combate Aéreo concentrado.', '6');
  await chooseOption(page, '¿El grupo objetivo incluye escolta electrónica con protección prioritaria?', escort);
  await page.getByLabel('Tirada (1d10)').selectOption('4');
}

test('con escolta EW: el avión EW absorbe primero y el remanente pasa a la otra unidad', async ({ page }) => {
  await openAreaFire(page, { escort: 'Sí' });
  await fillField(page, 'Protección de la otra unidad del grupo atacante, sin contar el avión EW (para interpretar el resultado)', '4');
  await fillField(page, 'Protección del avión de guerra electrónica con escolta', '2');
  await expect(page.getByText('Puntos de daño: 3')).toBeVisible();
  await expect(page.getByText('3 ≥ Protección del avión EW (2): el avión EW absorbe primero 2 punto(s) y sufre 1 punto de daño; quedan 1 punto(s) de impacto para las demás unidades del grupo.')).toBeVisible();
  await expect(page.getByText('1 < Protección de la siguiente unidad (4): no sufre daño.')).toBeVisible();
  await expect(page.getByText(/Confirmado por el mantenedor \(2026-10-07\): el avión EW absorbe impactos hasta sufrir 1 punto de daño/)).toBeVisible();
});

test('con escolta EW: el remanente que alcanza la Protección de la siguiente unidad le causa 1 punto de daño', async ({ page }) => {
  await openAreaFire(page, { escort: 'Sí' });
  await fillField(page, 'Protección de la otra unidad del grupo atacante, sin contar el avión EW (para interpretar el resultado)', '1');
  await fillField(page, 'Protección del avión de guerra electrónica con escolta', '2');
  await expect(page.getByText('La siguiente unidad (Protección 1) absorbe 1 y sufre 1 punto de daño.')).toBeVisible();
});

test('con escolta EW: puntos menores que su Protección -> el ataque no tiene efecto', async ({ page }) => {
  await openAreaFire(page, { escort: 'Sí' });
  await fillField(page, 'Protección del avión de guerra electrónica con escolta', '4');
  await expect(page.getByText('Si los puntos de impacto son menores que el Valor de Protección del avión de guerra electrónica, el ataque no tiene efecto. Aquí: 3 < 4 (§7.10.4).')).toBeVisible();
  await expect(page.getByText(/el avión EW absorbe primero/)).toHaveCount(0);
});

test('sin escolta EW el paso sigue igual que en el golden test (3 < Protección 4: sin daño)', async ({ page }) => {
  await openAreaFire(page, { escort: 'No' });
  await fillField(page, 'Protección del avión atacante (para interpretar el resultado)', '4');
  await expect(page.getByText('3 < Protección (4): el avión no sufre daño.')).toBeVisible();
  await expect(page.getByLabel('Protección del avión de guerra electrónica con escolta')).toHaveCount(0);
});
