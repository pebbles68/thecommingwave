// Wizard de Ataque cibernético (#/wizard/cyber-attack; roadmap Fase 14, Decision Book §14.2-§14.4,
// regla opcional). La aritmética se prueba en test/cyber-attack-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

test('ataque a un puerto con defensa: tiradas ajustadas, éxito final y efecto; se guarda y se repite', async ({ page }) => {
  await page.goto('/#/wizard/cyber-attack');
  await expect(page.getByText('Paso 1 de 4: Objetivo')).toBeVisible();
  await expect(page.getByText(/tu perfil de reglas no la tiene activada/)).toBeVisible();
  await chooseOption(page, '¿Qué sistema es el objetivo del ciberataque?', 'Sistema de Instalaciones (aeródromo o puerto)');
  await chooseOption(page, '¿El objetivo es una base aérea móvil', 'No');
  await fillField(page, 'Puntos de Capacidad de Guerra Cibernética que gasta el atacante', '2');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await chooseOption(page, '¿El defensor invierte Capacidad', 'Sí');
  await fillField(page, 'Puntos de Capacidad de Guerra Cibernética que gasta el defensor', '1');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 3 de 4: Tiradas')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Defensa: 3 tiradas de 1d10' })).toBeVisible();
  await fillField(page, 'Resultados de los d10 de defensa', '7 0 3');
  await expect(page.getByText('Defensa: 1 Éxito, 1 Fallo, 1 sin efecto.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ataque: 6 tiradas de 1d10' })).toBeVisible();
  await fillField(page, 'Resultados de los d10 de ataque', '8 9 1 4 7 3');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByText('Resultado: ataque cibernético con éxito')).toBeVisible();
  await expect(page.getByText(/Parálisis de Red/).first()).toBeVisible();
  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/cyber-attack$/);
  await expect(page.getByText('Resultado: ataque cibernético con éxito')).toBeVisible();
});

test('un portaaviones no admite el ataque; sin éxitos finales el ataque falla', async ({ page }) => {
  await page.goto('/#/wizard/cyber-attack');
  await chooseOption(page, '¿Qué sistema es el objetivo del ciberataque?', 'Sistema de Instalaciones (aeródromo o puerto)');
  await chooseOption(page, '¿El objetivo es una base aérea móvil', 'Sí');
  await expect(page.getByText(/No se pueden realizar ataques cibernéticos contra bases aéreas móviles/).first()).toBeVisible();
  await fillField(page, 'Puntos de Capacidad de Guerra Cibernética que gasta el atacante', '1');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Resultado: no se puede realizar el ataque cibernético')).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await chooseOption(page, '¿Qué sistema es el objetivo del ciberataque?', 'Activos Espaciales (antes de una acción espacial enemiga)');
  await fillField(page, 'Puntos de Capacidad de Guerra Cibernética que gasta el atacante', '1');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, '¿El defensor invierte Capacidad', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await fillField(page, 'Resultados de los d10 de ataque', '6 0 2');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: ataque cibernético sin éxito')).toBeVisible();
});

test('no deja declarar más resultados que tiradas disponibles', async ({ page }) => {
  await page.goto('/#/wizard/cyber-attack');
  await chooseOption(page, '¿Qué sistema es el objetivo del ciberataque?', 'Red Táctica (hexágono con combate terrestre)');
  await fillField(page, 'Puntos de Capacidad de Guerra Cibernética que gasta el atacante', '1');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, '¿El defensor invierte Capacidad', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await fillField(page, 'Resultados de los d10 de ataque', '1 2 3 4');
  await expect(page.getByText('Introduce exactamente un resultado de d10 por cada tirada de ataque.')).toBeVisible();
  await fillField(page, 'Resultados de los d10 de ataque', '1 x');
  await expect(page.getByText('Escribe solo cifras del 0 al 9 separadas por espacios.')).toBeVisible();
});
