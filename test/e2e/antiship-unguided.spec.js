// Caso E2E de COR02-010 (correcciones.02.md, roadmap Fase 8): el wizard de
// Ataque Antibuque No Guiado reutiliza módulos defensivos ya construidos
// (Interceptación Final, sin ningún consumidor hasta este wizard;
// Interceptación de Munición, hasta ahora solo consumida por antiship_guided;
// CombatModifierEngine.resolveAttackValueColumnShift, sin consumidor hasta
// ahora) contra las tablas propias de este workflow (page-07/08/25.json).
// Sin "hoja de ayuda" oficial para este dominio: los valores reproducen
// exactamente el escenario ya verificado en
// test/combat-wizard-engine.test.js ("Escenario Ataque Antibuque No
// Guiado").
//
// Ampliado por COR03-005 (correcciones03.md, 2026-09-28): "Disparo en Área"
// (Defensa Aérea de Área, workflow 06/página 18) gana su segundo consumidor
// real, promovida de views/antiship-guided-wizard.js a
// public/js/core.js#renderWizardStepAreaAirDefense; "Contraataque a Baja
// Altura" (página 26, reutiliza page-22.json) gana su primer consumidor
// real.
const { test, expect } = require('./fixtures');
const { chooseOption, fillField } = require('./wizard-helpers');

test('Ataque antibuque no guiado: Intercepción Final + Interceptación de Munición + Modificación de Intensidad -> 1 impacto, con asignación de daño', async ({ page }) => {
  await page.goto('/#/wizard/antiship-unguided');

  // Paso 1 de 5: Disparo en Área (workflow 06, página 18) — COR03-005
  // (correcciones03.md): "Defensa Aérea de Área" pasa a tener un segundo
  // consumidor real (antes solo antiship_guided), promovida a
  // public/js/core.js#renderWizardStepAreaAirDefense. Mismos valores
  // mínimos que ya usa fillGoldenWizardThroughResult para no alterar
  // ningún resultado posterior de este test.
  await expect(page.getByRole('heading', { name: 'Defensa aérea de área contra aeronaves' })).toBeVisible();
  await chooseOption(page, 'Tipo de objetivo.', 'Convencional');
  await chooseOption(page, '¿El sistema está marcado como defensa de Gran Altitud exclusivamente?', 'No');
  await chooseOption(page, 'Consumo AA.', 'Alto');
  await fillField(page, 'Valor total de Defensa Aérea / Combate Aéreo concentrado.', '6');
  await chooseOption(page, '¿El grupo objetivo incluye escolta electrónica con protección prioritaria?', 'No');
  await page.getByLabel('Tirada (1d10)').selectOption('4');
  await fillField(page, 'Protección del avión atacante (para interpretar el resultado)', '4');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 2 de 5: Intercepción Final.
  await expect(page.getByRole('heading', { name: 'Intercepción final' })).toBeVisible();
  await fillField(page, 'Valor AA total de los buques con consumo bajo.', '5');
  await page.getByLabel('Tirada (1d10)').selectOption('4');
  await expect(page.getByText('Consumo Bajo (A.A.=5): 1 impacto(s)')).toBeVisible();
  await expect(page.getByText('Impactos de Intercepción Final: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 3 de 5: Datos base del ataque.
  await expect(page.getByRole('heading', { name: 'Datos base del ataque' })).toBeVisible();
  await fillField(page, 'Valor de Ataque base', '20');
  await fillField(page, 'Distancia de ataque (hexágonos)', '2');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 4 de 5: Interceptación de Munición.
  await expect(page.getByRole('heading', { name: 'Interceptación de munición' })).toBeVisible();
  await chooseOption(page, '¿Objetivo y atacante están en el mismo hex o Zona Central?', 'No');
  await chooseOption(page, 'Rendimiento del sistema que intercepta.', 'Alto');
  await chooseOption(page, '¿Qué ha detectado el defensor?', 'Atacante detectado');
  // Distancia 2 hex: caso ambiguo de short_range_restriction (COR02-004,
  // mismo diseño reutilizado aquí) -> pregunta "¿Es Misión de Área?".
  await chooseOption(page, '¿Es Misión de Área?', 'No');
  await chooseOption(page, 'Munición Ligera', 'No');
  await fillField(page, 'Disparo 1: Valor de Defensa Aérea propio', '4');
  await page.getByLabel('Disparo 1: Tirada (1d10)').selectOption('4');
  await expect(page.getByText('Valor de Ataque tras Interceptación de Munición: 20 + (-2) = 18')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  // Paso 5 de 5: Modificación de Intensidad y Resultado.
  await expect(page.getByRole('heading', { name: 'Modificación de intensidad' })).toBeVisible();
  await expect(page.getByText('≥2 / Área ≥3 → modificador -8')).toBeVisible();
  await page.getByLabel('Tirada de resolución (1d10)').selectOption('8');
  await expect(page.getByText('columna "1~2"')).toBeVisible();
  await expect(page.getByText('Resultado: 1 impacto(s)')).toBeVisible();

  // Asignación de impactos y daño (mismo mecanismo que antiship_guided).
  await fillField(page, 'Buque 1: identificador', 'BS-Test');
  await fillField(page, 'Buque 1: Protección', '1');
  await page.getByLabel('Tirada de asignación (1d10)').selectOption('0');
  await expect(page.getByText('Impacta a BS-Test (posición 1 de 1 supervivientes).')).toBeVisible();
  await page.getByLabel('Tirada de hundimiento (1d10)').selectOption('5');
  await page.getByRole('button', { name: 'Confirmar este impacto' }).click();
  await expect(page.getByText('Dañada: absorbe 1 impacto(s) (Protección 1). Impactos restantes: 0.')).toBeVisible();
  await expect(page.getByText('Todos los impactos han sido asignados.')).toBeVisible();

  // Contraataque a Baja Altura (COR03-005, correcciones03.md): primer
  // consumidor real de resolveLowAltitudeCounterattackShot. Reproduce un
  // caso del propio ejemplo textual del Decision Book §6.6.2 (A.A.=4,
  // tirada 6 -> 3 impactos, destruye una unidad con Protección 3), ya
  // verificado en test/combat-wizard-engine.test.js.
  await expect(page.getByRole('heading', { name: 'Contraataque a Baja Altura (opcional)' })).toBeVisible();
  await fillField(page, 'Valor de Artillería Naval total de la flota superviviente', '4');
  await fillField(page, 'Atacante 1: Valor de Protección', '3');
  await page.getByLabel('Atacante 1: Tirada (1d10)').selectOption('6');
  await expect(page.getByText('Atacante 1 (Protección 3, tirada 6): 3 impacto(s) — destruida.')).toBeVisible();
});

test('Ataque antibuque no guiado: enlazado desde "Combate por tipo" (WORKFLOW_WIZARD_HASHES)', async ({ page }) => {
  await page.goto('/#/ayuda/combate/antiship_unguided');
  await expect(page.getByRole('heading', { name: 'Ataque antibuque no guiado' })).toBeVisible();
  await page.getByRole('button', { name: '▶ Resolver con el wizard de combate' }).click();
  await expect(page).toHaveURL(/#\/wizard\/antiship-unguided/);
  await expect(page.getByText('Paso 1 de 5')).toBeVisible();
});
