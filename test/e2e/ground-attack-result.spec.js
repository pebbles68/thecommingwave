// Wizard de Resolución del Resultado del Ataque Terrestre (#/wizard/ground-attack-result;
// roadmap Fase 9, Decision Book §5.15). La aritmética se prueba en
// test/ground-attack-result-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

async function start(page, { impacts, target }) {
  await page.goto('/#/wizard/ground-attack-result');
  await expect(page.getByText('Paso 1 de 3: Impactos y objetivo')).toBeVisible();
  await fillField(page, 'Puntos de Impacto finales', String(impacts));
  await chooseOption(page, '¿Qué se ataca?', target);
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 2 de 3: Datos del objetivo')).toBeVisible();
}

test('ejemplo del reglamento: Protección 7 + Terreno 3 = 10; con 10 impactos 1 punto de daño y -1 de fuerza; con 9, sin daño; se guarda y se repite', async ({ page }) => {
  await start(page, { impacts: 10, target: 'Unidad terrestre (principal o técnica)' });
  await fillField(page, 'Valor de Protección de la unidad', '7');
  await fillField(page, 'Valor de Terreno del hexágono', '3');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Paso 3 de 3: Resultado')).toBeVisible();
  await expect(page.getByText('Resultado: 1 punto de daño y -1 de tamaño de fuerza')).toBeVisible();
  await expect(page.getByText(/10 Punto\(s\) de Impacto contra Protección 7 \+ Terreno 3 = 10\./)).toBeVisible();
  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
  await page.goto('/#/historial');
  await page.getByRole('button', { name: '↻ Repetir (cargar en el wizard)' }).click();
  await expect(page).toHaveURL(/#\/wizard\/ground-attack-result$/);
  await expect(page.getByText('Resultado: 1 punto de daño y -1 de tamaño de fuerza')).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar wizard' }).click();
  await start(page, { impacts: 9, target: 'Unidad terrestre (principal o técnica)' });
  await fillField(page, 'Valor de Protección de la unidad', '7');
  await fillField(page, 'Valor de Terreno del hexágono', '3');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: sin daño (9 < 10)')).toBeVisible();
});

test('Persecución Aérea: 17 impactos contra Protección 5 -> 3 puntos de daño, sin terreno ni límite', async ({ page }) => {
  await start(page, { impacts: 17, target: 'Unidad terrestre (principal o técnica)' });
  await chooseOption(page, 'Tipo de ataque', 'Persecución Aérea');
  await expect(page.getByLabel('Valor de Terreno del hexágono')).toHaveCount(0);
  await fillField(page, 'Valor de Protección de la unidad', '5');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: 3 punto(s) de daño y 3 de tamaño de fuerza (17 ÷ 5, redondeado hacia abajo)')).toBeVisible();
});

test('puerto: Instalaciones Paralizadas por Protección, buque de superficie con daño, submarino destruido y no se puede asignar de más', async ({ page }) => {
  await start(page, { impacts: 10, target: 'Puerto (instalación fija)' });
  await fillField(page, 'Puntos de Impacto asignados al puerto', '3');
  await fillField(page, 'Valor de Protección del puerto', '3');
  await fillField(page, 'Buque 1: Puntos de Impacto que absorbe', '2');
  await page.getByRole('button', { name: '+ Añadir buque' }).click();
  await chooseOption(page, 'Buque 2: tipo', 'Unidad submarina');
  await fillField(page, 'Buque 2: Puntos de Impacto que absorbe', '1');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText(/Puerto \(Protección 3\): 1 efecto\(s\) de Instalación Paralizada; Munición y Combustible -1 cada uno\./)).toBeVisible();
  await expect(page.getByText(/Buque 1 \(superficie\): 2 punto\(s\) de daño/)).toBeVisible();
  await expect(page.getByText('Buque 2 (submarino): destruido y eliminado.')).toBeVisible();
  await expect(page.getByText('Puerto: 10 impactos; 6 asignados, 4 sin asignar.')).toBeVisible();

  await page.getByRole('button', { name: '← Anterior' }).click();
  await fillField(page, 'Puntos de Impacto asignados al puerto', '9');
  await expect(page.getByText('Has asignado 12 impactos y solo hay 10.')).toBeVisible();
});

test('aeródromo: la pista baja 1 nivel por cada 2 impactos y el apron daña o elimina las unidades según su Protección efectiva', async ({ page }) => {
  await start(page, { impacts: 14, target: 'Aeródromo (instalación fija)' });
  await fillField(page, 'Puntos de Impacto asignados a la pista', '5');
  await chooseOption(page, 'Calidad actual de la pista', 'B');
  await fillField(page, 'Puntos de Impacto asignados al apron', '9');
  await fillField(page, 'Valor de Protección del aeródromo', '4');
  await fillField(page, 'Capacidad de Hangares', '5');
  await fillField(page, 'Unidad aérea 1: nombre', 'F-16');
  await chooseOption(page, 'Unidad aérea 1: ¿usa el Valor de Protección del aeródromo?', 'Sí');
  await page.getByRole('button', { name: /\+ Añadir unidad aérea/ }).click();
  await fillField(page, 'Unidad aérea 2: nombre', 'MiG-29');
  await chooseOption(page, 'Unidad aérea 2: ¿usa el Valor de Protección del aeródromo?', 'Sí');
  await chooseOption(page, 'Unidad aérea 2: ¿ya está dañada', 'Sí');
  await page.getByRole('button', { name: /\+ Añadir unidad aérea/ }).click();
  await fillField(page, 'Unidad aérea 3: nombre', 'Su-27');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();

  await expect(page.getByText('Pista: 5 impactos → baja 2 nivel(es): de B a D; 1 impacto(s) sobrante(s) ignorado(s).')).toBeVisible();
  await expect(page.getByText('F-16 (Protección 4): absorbe 4 y se da la vuelta a su lado dañado.')).toBeVisible();
  await expect(page.getByText('MiG-29 (Protección 4): absorbe 4 y es eliminada.')).toBeVisible();
  await expect(page.getByText('Su-27 (Protección 1): absorbe 1 y se da la vuelta a su lado dañado.')).toBeVisible();
  await expect(page.getByText('Resultado: pista B → D · apron: 1 eliminada(s), 2 dañada(s)')).toBeVisible();
});

test('desde el wizard de ataque terrestre guiado se trasladan los impactos al wizard de resultado', async ({ page }) => {
  await page.goto('/#/wizard/ground-guided');
  await fillField(page, 'Valor de Ataque base del plan de ataque', '4');
  await chooseOption(page, 'Tipo de ataque:', 'No');
  await chooseOption(page, 'Tipo de munición:', 'Persecución');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, '¿La munición de este ataque está marcada CM (Misil de Crucero) o BM (Misil Balístico)?', 'No');
  await chooseOption(page, '¿Objetivo y atacante están en el mismo hex o Zona Central?', 'Sí');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, 'Tipo de objetivo.', 'Unidad móvil principal');
  await fillField(page, 'Distancia de ataque (hexágonos, contada desde el hexágono que ocupas)', '0');
  await chooseOption(page, '¿Es Misión de Área?', 'No');
  await chooseOption(page, '¿La munición es de alta penetración y supersónica?', 'Sí');
  await fillField(page, 'Tamaño de fuerza impreso total de las unidades terrestres propias en el hexágono objetivo', '20');
  await fillField(page, 'Corrección de designación aplicable', '0');
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('4');
  await page.getByRole('button', { name: 'Ver resultado →' }).click();
  await expect(page.getByText('Resultado: 11 Punto(s) de Impacto')).toBeVisible();
  await page.getByRole('button', { name: /Aplicar los impactos al objetivo/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/ground-attack-result$/);
  await expect(page.getByLabel('Puntos de Impacto finales')).toHaveValue('11');
});
