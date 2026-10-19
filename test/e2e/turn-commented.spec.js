// Turno Comentado (Fase 24, TC-001 a TC-003): Inicio con cuatro entradas y la hoja de turnos interactiva.
const { test, expect } = require('./fixtures');

const zone = (page, label) => page.locator(`.ihv__hit[aria-label="${label}"]`);

test('Inicio abre el Turno Comentado y muestra la hoja con sus zonas', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: /^Turno Comentado/ }).click();
  await expect(page).toHaveURL(/#\/turno-comentado$/);
  await expect(page.locator('.ihv__svg')).toBeVisible();
  await expect(page.locator('.ihv__hit')).toHaveCount(41);
});

test('un clic en Aire I de la 1.ª fase muestra el cuadro con sus fases, Refuerzos y Recuperación de Mando', async ({ page }) => {
  await page.goto('/#/turno-comentado');
  await expect(page.locator('.ihv__svg')).toBeVisible();
  await zone(page, 'Aire I · Primera Fase').click();
  const box = page.locator('.turn-commented__toolbox');
  await expect(box).toBeVisible();
  await expect(box.getByRole('button', { name: /Planificación de misiones/ })).toBeVisible();
  await expect(box.getByRole('button', { name: /^Refuerzos/ })).toBeVisible();
  await expect(box.getByRole('button', { name: /^Recuperación de Mando/ })).toBeVisible();
  await expect(page.locator('.turn-commented__crop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.turn-commented__focus')).toBeHidden();
});

test('la lista de fases queda siempre a la derecha del recorte ampliado, en cualquier zona', async ({ page }) => {
  await page.goto('/#/turno-comentado');
  await expect(page.locator('.ihv__svg')).toBeVisible();
  for (const label of ['Aire I · Primera Fase', 'Estrategia · Crisis', 'Recuperación de Mando · Día impar', 'Refuerzos · Segunda Fase', 'Submarino · Sexta Fase']) {
    await zone(page, label).click();
    await expect(page.locator('.turn-commented__focus.is-ready')).toBeVisible();
    const crop = await page.locator('.turn-commented__crop').boundingBox();
    const side = await page.locator('.turn-commented__toolbox').boundingBox();
    expect(side.x, label).toBeGreaterThanOrEqual(crop.x + crop.width - 1);
    expect(Math.abs(side.y - crop.y), label).toBeLessThan(60);
    await page.keyboard.press('Escape');
  }
});

test('el segundo clic abre la página de la fase elegida', async ({ page }) => {
  await page.goto('/#/turno-comentado');
  await expect(page.locator('.ihv__svg')).toBeVisible();
  await zone(page, 'Aire I · Primera Fase').click();
  await page.locator('.turn-commented__toolbox').getByRole('button', { name: /Planificación de misiones/ }).click();
  await expect(page).toHaveURL(/#\/turno-comentado\/fase\/1\/air-1\/planificacion_misiones$/);
  await expect(page.getByRole('heading', { name: /Aire I — Primera Fase/ })).toBeVisible();
  await expect(page.locator('#sub-planificacion_misiones .ihv__svg')).toBeVisible();
  await expect(page.locator('#sub-planificacion_misiones .ihv__list-btn')).toHaveCount(8);
  await expect(page.getByRole('button', { name: /^Refuerzos/ })).toBeVisible();
});

test('el segmento Tierra de la 2.ª fase no existe y Estrategia incluye Logística', async ({ page }) => {
  await page.goto('/#/turno-comentado');
  await expect(page.locator('.ihv__svg')).toBeVisible();
  await expect(zone(page, 'Tierra · Segunda Fase')).toHaveCount(0);
  await expect(zone(page, 'Estrategia · Logística')).toHaveCount(1);
});

test('con teclado: foco en una zona y Enter abre el cuadro', async ({ page }) => {
  await page.goto('/#/turno-comentado');
  await expect(page.locator('.ihv__svg')).toBeVisible();
  await zone(page, 'Estrategia · Crisis').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.turn-commented__panel')).toContainText('Estrategia · Crisis');
});

test('Salidas de combate ofrece la guía del ataque aéreo', async ({ page }) => {
  await page.goto('/#/turno-comentado/fase/1/air-1/salidas_combate');
  await page.getByRole('button', { name: /Guía: ataque aéreo paso a paso/ }).click();
  await expect(page).toHaveURL(/#\/guia\/air-attack$/);
});
