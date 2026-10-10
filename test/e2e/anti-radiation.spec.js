// Wizard de Ataque Anti-Radiación (#/wizard/anti-radiation; roadmap Fase 9,
// Decision Book §5.14). Valores esperados leídos de la página 13 impresa de
// Tablas-de-combate 5.pdf; la mecánica del motor se prueba en
// test/anti-radiation-attack-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function reachDefensesStep(page) {
  await page.goto('/#/wizard/anti-radiation');
  await expect(page.getByText('Paso 1 de 4: Datos base del ataque')).toBeVisible();
  await fillField(page, 'Valor de Ataque base del plan anti-radiación', '7');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 2 de 4: Defensa aérea de área e interceptación de munición')).toBeVisible();
}

test('Valor 7, sin defensas, sistema de detección activado (-5), fila Normal, tirada 5 -> columna "2" -> 3 Puntos de Impacto; se guarda y se repite', async ({ page }) => {
  await reachDefensesStep(page);
  await chooseOption(page, '¿La munición de este ataque está marcada CM (Misil de Crucero) o BM (Misil Balístico)?', 'No');
  await chooseOption(page, '¿El atacante ha sido detectado?', 'Sí');
  await chooseOption(page, '¿Objetivo y atacante están en el mismo hex o Zona Central?', 'Sí');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 3 de 4: Modificación de la Fuerza de Ataque y tirada')).toBeVisible();
  await chooseOption(page, 'sistema de detección del objetivo está activado', 'Sí');
  await chooseOption(page, 'marcado como Ligero', 'No (fila Normal)');
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('5');
  await expect(page.getByText('Columna de la tabla: «2» (fila Normal) → 3 Punto(s) de Impacto.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByRole('heading', { name: 'Resultado', exact: true })).toBeVisible();
  await expect(page.getByText('Resultado: 3 Punto(s) de Impacto')).toBeVisible();

  // Contraataque a baja altura (página 14): A.A. 2+, tirada 9 -> 3 impactos >= Protección 3 -> destruida.
  await fillField(page, 'Valor de Defensa Aérea del sistema que contraataca', '2');
  await fillField(page, 'Atacante 1: Valor de Protección', '3');
  await page.getByLabel('Atacante 1: Tirada (1d10)').selectOption('9');
  await expect(page.getByText('Atacante 1 (Protección 3, tirada 9): 3 impacto(s) — destruida.')).toBeVisible();

  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/anti-radiation$/);
  await expect(page.getByText('Resultado: 3 Punto(s) de Impacto')).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await expect(page.getByText('Paso 1 de 4: Datos base del ataque')).toBeVisible();
});

test('tirada 9 cancela la modificación -5: Valor 7 Normal -> columna "7" -> 21 Puntos de Impacto', async ({ page }) => {
  await reachDefensesStep(page);
  await chooseOption(page, '¿La munición de este ataque está marcada CM (Misil de Crucero) o BM (Misil Balístico)?', 'No');
  await chooseOption(page, '¿Objetivo y atacante están en el mismo hex o Zona Central?', 'Sí');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, 'sistema de detección del objetivo está activado', 'Sí');
  await chooseOption(page, 'marcado como Ligero', 'No (fila Normal)');
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('9');
  await expect(page.getByText(/Tirada 9: se cancelan todas las modificaciones/)).toBeVisible();
  await expect(page.getByText('Columna de la tabla: «7» (fila Normal) → 21 Punto(s) de Impacto.')).toBeVisible();
});

test('plan [L] Ligero usa la fila [L]: Valor 7, tirada 5, sin sistema activado -> columna "7" -> 6', async ({ page }) => {
  await reachDefensesStep(page);
  await chooseOption(page, '¿La munición de este ataque está marcada CM (Misil de Crucero) o BM (Misil Balístico)?', 'No');
  await chooseOption(page, '¿Objetivo y atacante están en el mismo hex o Zona Central?', 'Sí');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, 'sistema de detección del objetivo está activado', 'No');
  await chooseOption(page, 'marcado como Ligero', 'Sí (fila [L] Ligero)');
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('5');
  await expect(page.getByText('Columna de la tabla: «7» (fila [L] Ligero) → 6 Punto(s) de Impacto.')).toBeVisible();
});
