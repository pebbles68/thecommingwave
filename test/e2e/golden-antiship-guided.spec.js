// Caso E2E obligatorio 2 (correcciones.md COR-004): el golden test de ataque
// guiado contra superficie, introducido desde los controles VISIBLES del
// wizard (#/wizard/antiship-guided) — no llamando a combat-wizard-engine.js
// directamente, que es lo que hace test/golden-antiship-guided.test.js (ese
// test ya prueba el MOTOR; este prueba que la INTERFAZ conectada al motor
// reproduce exactamente el mismo resultado oficial).
//
// Valores idénticos a data/scenarios/golden-antiship-guided.json. Las
// preguntas booleanas que la hoja no fija explícitamente (p.ej. "¿escolta
// electrónica?", "¿atacante detectado?" en la etapa de Defensa de Área) se
// responden con la opción que no introduce ningún modificador o efecto
// (confirmado leyendo data/workflows/06_defensa_aerea_area.json y
// 07_ataque_antibuque_guiado.json antes de escribir este test), para no
// alterar el resultado numérico esperado.
const { test, expect } = require('./fixtures');
const { fillField, fillGoldenWizardThroughResult } = require('./wizard-helpers');

test('golden test del ataque guiado contra superficie, resuelto desde el wizard: llega a "3 impacto(s)" y al hundimiento de BS-20381', async ({ page }) => {
  await page.goto('/#/wizard/antiship-guided');
  await fillGoldenWizardThroughResult(page, expect);

  // Asignación de impactos y daño: flota BS-1155/BS-20381/BS-1164.
  await fillField(page, 'Buque 1: identificador', 'BS-1155');
  await fillField(page, 'Buque 1: Protección', '5');
  await page.getByRole('button', { name: '+ Añadir otro buque a la flota' }).click();
  await fillField(page, 'Buque 2: identificador', 'BS-20381');
  await fillField(page, 'Buque 2: Protección', '2');
  await fillField(page, 'Buque 2: Valor de Hundimiento (≤N)', '4');
  await page.getByRole('button', { name: '+ Añadir otro buque a la flota' }).click();
  await fillField(page, 'Buque 3: identificador', 'BS-1164');
  await fillField(page, 'Buque 3: Protección', '3');

  await page.getByLabel('Tirada de asignación (1d10)').selectOption('4');
  await expect(page.getByText('Impacta a BS-20381 (posición 2 de 3 supervivientes).')).toBeVisible();
  await page.getByLabel('Tirada de hundimiento (1d10)').selectOption('4');
  await page.getByRole('button', { name: 'Confirmar este impacto' }).click();

  await expect(page.getByText('Impacto 1: tirada 4 → BS-20381 (posición 2)')).toBeVisible();
  await expect(page.getByText('Dañada: absorbe 2 impacto(s) (Protección 2). Impactos restantes: 1.')).toBeVisible();
  await expect(page.getByText('Tirada de hundimiento: 4 ≤ 4 → se hunde y se retira de la flota.')).toBeVisible();
  await expect(page.getByText('Impactos restantes: 1 — insuficientes para dañar a ninguna unidad superviviente (Protección mínima 3): se desprecian.')).toBeVisible();
});
