// Consumo Bajo en la Interceptación de Munición (Decision Book §6.5.1;
// Tablas-de-combate 5.pdf p.4): cada disparo elige consumo Alto/Bajo. Con Bajo la
// columna es el grupo 2~3/4~5/6~7/8+ y un A.A. de 1 no puede interceptar.
// Valores esperados leídos de la tabla impresa (fila 9: Bajo "2~3" = -1).
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function reachInterceptionStep(page) {
  await page.goto('/#/wizard/antiship-guided');
  await chooseOption(page, 'Tipo de objetivo.', 'Convencional');
  await chooseOption(page, '¿El sistema está marcado como defensa de Gran Altitud exclusivamente?', 'No');
  await chooseOption(page, 'Consumo AA.', 'Alto');
  await fillField(page, 'Valor total de Defensa Aérea / Combate Aéreo concentrado.', '6');
  await chooseOption(page, '¿El grupo objetivo incluye escolta electrónica con protección prioritaria?', 'No');
  await page.getByLabel('Tirada (1d10)').selectOption('4');
  await fillField(page, 'Protección del avión atacante (para interpretar el resultado)', '4');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await fillField(page, 'Valor de Ataque base de la munición', '6');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, '¿La munición de este ataque está marcada CM (Misil de Crucero) o BM (Misil Balístico)?', 'No');
  await chooseOption(page, '¿Objetivo y atacante están en el mismo hex o Zona Central?', 'No');
  await chooseOption(page, 'alerta temprana', 'No');
  await chooseOption(page, 'Rendimiento del sistema que intercepta.', 'Alto');
  await chooseOption(page, '¿Qué ha detectado el defensor?', 'Atacante detectado');
  await fillField(page, 'Distancia de ataque (hexágonos)', '3');
}

test('consumo Bajo: A.A.=3 con tirada 9 cae en la columna "2~3" (-1) y A.A.=1 no puede interceptar', async ({ page }) => {
  await reachInterceptionStep(page);
  await expect(page.getByText('Solo pueden usar consumo Bajo')).toBeVisible();

  await fillField(page, 'Disparo 1: Valor de Defensa Aérea propio', '3');
  await page.getByLabel('Disparo 1: Tirada (1d10)').selectOption('9');
  await page.getByLabel('Disparo 1: Consumo').selectOption('low');
  await expect(page.getByText('Disparo 1 (A.A.=3, consumo Bajo, tirada modificada=9): -1')).toBeVisible();
  await expect(page.getByText('Reducción total de Interceptación de Munición: -1')).toBeVisible();

  await fillField(page, 'Disparo 1: Valor de Defensa Aérea propio', '1');
  await expect(page.getByText(/Disparo 1 \(A\.A\.=1, consumo Bajo\): no puede interceptar/)).toBeVisible();
  await expect(page.getByText('Reducción total de Interceptación de Munición: 0')).toBeVisible();

  // Con consumo Alto el mismo A.A.=1 sí tiene columna: sin reducción con tirada 9? (fila 9, Alto 1 = -1).
  await page.getByLabel('Disparo 1: Consumo').selectOption('high');
  await expect(page.getByText('Reducción total de Interceptación de Munición: -1')).toBeVisible();
});
