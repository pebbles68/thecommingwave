// Wizard de Ataques de Reacción terrestres (#/wizard/ground-reaction; roadmap
// Fase 10, Decision Book §5.16, §8.5.6, §8.7.8). La lógica se prueba en
// test/ground-reaction-engine.test.js.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

const KB_TRIGGER = 'Una unidad principal queda «Derrotada»';
const DETECTED = '¿Las unidades de detección han detectado al objetivo';

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);

// Los hechos desencadenantes tienen etiquetas largas: se elige por el comienzo.
async function pickTrigger(page, start) {
  const group = page.locator('.wizard-question', { hasText: '¿Qué hecho ha dejado a una unidad Brevemente Detectable?' });
  await group.getByRole('button', { name: new RegExp('^' + escapeRegExp(start)) }).click();
}

async function toAttackers(page, trigger) {
  await page.goto('/#/wizard/ground-reaction');
  await expect(page.getByText('Paso 1 de 4: Qué ha ocurrido')).toBeVisible();
  await pickTrigger(page, trigger);
  await chooseOption(page, DETECTED, 'Sí');
  await fillField(page, 'Objetivo 1 (nombre)', 'Brigada X');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Paso 2 de 4: Unidades de ataque')).toBeVisible();
}

test('Persecución Aérea: reacción deducida, atacante elegible, plan completo y ajustes de la reacción', async ({ page }) => {
  await page.goto('/#/wizard/ground-reaction');
  await pickTrigger(page, KB_TRIGGER);
  await expect(page.getByText('Reacción que procede: Persecución Aérea (KB)')).toBeVisible();
  await expect(page.getByText('Se usa la fila «Persecución» de la tabla de resolución.')).toBeVisible();
  await chooseOption(page, DETECTED, 'No');
  await expect(page.getByText(/Sin detección no hay ataque de reacción/)).toBeVisible();
  await chooseOption(page, DETECTED, 'Sí');
  await fillField(page, 'Objetivo 1 (nombre)', 'Brigada X');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await fillField(page, 'Unidad 1: nombre (opcional)', 'F-16 ON CALL');
  await chooseOption(page, 'Unidad 1: ¿qué tipo de unidad es?', 'Unidad aérea en Ataque Dinámico (ON CALL)');
  await chooseOption(page, 'Unidad 1: ¿Se cumple la condición de posición de esta unidad?', 'Sí');
  await chooseOption(page, 'Unidad 1: ¿Ya ha ejecutado un ataque dinámico', 'No');
  await expect(page.getByText('✓ Puede atacar')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByText('Paso 3 de 4: Objetivos y orden')).toBeVisible();
  await expect(page.getByText('F-16 ON CALL: falta el objetivo.')).toBeVisible();
  await chooseOption(page, 'F-16 ON CALL: ¿contra qué objetivo ataca?', 'Brigada X');
  await page.getByLabel('F-16 ON CALL: orden de resolución').selectOption('1');
  await expect(page.getByText(/Todo queda decidido antes del primer ataque/)).toBeVisible();
  await page.getByRole('button', { name: 'Ver resolución →' }).click();

  await expect(page.getByText('Paso 4 de 4: Resolución y consecuencias')).toBeVisible();
  await expect(page.getByText('El objetivo NO recibe la bonificación de Valor de Protección del terreno', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('El objetivo no puede iniciar un Contraataque a Baja Altura.')).toBeVisible();
  await expect(page.getByText('1. F-16 ON CALL → Brigada X')).toBeVisible();
  await expect(page.getByText(/Las unidades aéreas que ejecutaron la persecución regresan inmediatamente/)).toBeVisible();

  // Cerrar el estado y guardar en el historial.
  await chooseOption(page, 'Brigada X: ¿han terminado todas las reacciones aplicables', 'Sí');
  await expect(page.getByText('Estado cerrado: ningún objetivo sigue Brevemente Detectable.')).toBeVisible();
  await page.getByRole('button', { name: '💾 Guardar en historial' }).click();
  await expect(page.getByRole('button', { name: '✓ Guardado' })).toBeVisible();
});

test('el ataque de Persecución se abre en el wizard terrestre con la fila Persecución y la misión ON CALL ya elegidas', async ({ page }) => {
  await toAttackers(page, KB_TRIGGER);
  await chooseOption(page, 'Unidad 1: ¿qué tipo de unidad es?', 'Unidad aérea en Ataque Dinámico (ON CALL)');
  await chooseOption(page, 'Unidad 1: ¿Se cumple la condición de posición de esta unidad?', 'Sí');
  await chooseOption(page, 'Unidad 1: ¿Ya ha ejecutado un ataque dinámico', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, 'Unidad 1: ¿contra qué objetivo ataca?', 'Brigada X');
  await page.getByLabel('Unidad 1: orden de resolución').selectOption('1');
  await page.getByRole('button', { name: 'Ver resolución →' }).click();
  await page.getByRole('button', { name: 'Resolver: ataque terrestre guiado' }).click();

  await expect(page).toHaveURL(/#\/wizard\/ground-guided$/);
  await expect(page.locator('.mission-context')).toContainText('Ataque Dinámico (ON CALL)');
  await expect(page.locator('.wizard-question', { hasText: 'Tipo de munición:' }).getByRole('button', { name: 'Persecución' })).toHaveClass(/is-active/);
});

test('Contrabatería: la artillería con CAS, sin munición o que ya contraatacó se descarta con su motivo', async ({ page }) => {
  await toAttackers(page, 'Una unidad de artillería (fuego) con Valor de Apoyo de Combate lo asigna');
  await chooseOption(page, 'Unidad 1: ¿qué tipo de unidad es?', 'Unidad de artillería (fuego)');
  await chooseOption(page, 'Unidad 1: ¿Se cumple la condición de posición de esta unidad?', 'Sí');
  await chooseOption(page, 'Unidad 1: ¿Esta artillería está realizando Apoyo de Fuego Cercano (CAS)?', 'Sí');
  await expect(page.getByText('✗ La artillería que realiza Apoyo de Fuego Cercano (CAS) no puede realizar Contrabatería.')).toBeVisible();
  await chooseOption(page, 'Unidad 1: ¿Esta artillería está realizando Apoyo de Fuego Cercano (CAS)?', 'No');
  await chooseOption(page, 'Unidad 1: ¿Tiene al menos 1 punto de munición?', 'No');
  await expect(page.getByText('✗ La artillería necesita al menos 1 punto de munición.')).toBeVisible();
  await chooseOption(page, 'Unidad 1: ¿Tiene al menos 1 punto de munición?', 'Sí');
  await chooseOption(page, 'Unidad 1: ¿Ya ha realizado una Operación de Contrabatería en este enfrentamiento terrestre?', 'Sí');
  await expect(page.getByText(/solo puede realizar una Operación de Contrabatería por enfrentamiento/)).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click().catch(() => {});
  // Sin unidades elegibles no se puede avanzar.
  await expect(page.getByText('Paso 2 de 4: Unidades de ataque')).toBeVisible();
});

test('Contrafuegos solo admite aire ON CALL y baja altitud: la artillería no aparece como opción', async ({ page }) => {
  await toAttackers(page, 'Una unidad de artillería ejecuta un ataque, o una unidad de defensa aérea');
  const kinds = page.locator('.wizard-question', { hasText: 'Unidad 1: ¿qué tipo de unidad es?' });
  await expect(kinds.getByRole('button', { name: 'Unidad aérea en Ataque Dinámico (ON CALL)' })).toBeVisible();
  await expect(kinds.getByRole('button', { name: 'Unidad de baja altitud en estado Operativo' })).toBeVisible();
  await expect(kinds.getByRole('button', { name: 'Unidad de artillería (fuego)' })).toHaveCount(0);
});

test('Interdicción de Batalla: muestra las decisiones posteriores de la unidad atacada', async ({ page }) => {
  await toAttackers(page, 'Una unidad terrestre se mueve');
  await chooseOption(page, 'Unidad 1: ¿qué tipo de unidad es?', 'Unidad de baja altitud en estado Operativo');
  await chooseOption(page, 'Unidad 1: ¿Se cumple la condición de posición de esta unidad?', 'Sí');
  await chooseOption(page, 'Unidad 1: ¿Ya ha ejecutado un ataque dinámico', 'No');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await chooseOption(page, 'Unidad 1: ¿contra qué objetivo ataca?', 'Brigada X');
  await page.getByLabel('Unidad 1: orden de resolución').selectOption('1');
  await page.getByRole('button', { name: 'Ver resolución →' }).click();
  await expect(page.getByText(/Atacante de aviación del ejército: tras el ataque, las unidades atacadas que sobrevivan realizan un Contraataque a Baja Altura/)).toBeVisible();
  await expect(page.getByText(/Las unidades de aviación del ejército permanecen en el hexágono hasta ser recuperadas/)).toBeVisible();
});

test('una recarga a mitad del wizard recupera el paso y las respuestas', async ({ page }) => {
  await toAttackers(page, KB_TRIGGER);
  await fillField(page, 'Unidad 1: nombre (opcional)', 'Escuadrón A');
  await page.reload();
  await expect(page.getByText('Paso 2 de 4: Unidades de ataque')).toBeVisible();
  await expect(page.getByLabel('Unidad 1: nombre (opcional)')).toHaveValue('Escuadrón A');
});
