// Panel lateral de ayuda visual (ajustes_de_turno.md TUR-009/010/011): las menciones a entidades del turno son
// botones accesibles que abren un panel acoplado sin perder el contexto; selección por tipo; teclado y toque.
const { test, expect } = require('./fixtures');

const PLANNING = '/#/turno/fase/1/air-1/planificacion_misiones';
const panel = (page) => page.locator('#visual-help-panel');

test('una mención genérica («fichas de aeródromo») abre el panel sin cambiar la ruta ni perder el texto', async ({ page }) => {
  await page.goto(PLANNING);
  const heading = page.getByRole('heading', { name: 'Planificación de misiones' });
  await expect(heading).toBeVisible();
  await expect(panel(page)).toBeHidden();

  await page.getByRole('button', { name: 'fichas de aeródromo: abrir ayuda visual' }).click();
  await expect(panel(page)).toBeVisible();
  await expect(page).toHaveURL(/#\/turno\/fase\/1\/air-1\/planificacion_misiones$/);
  await expect(heading).toBeVisible();
  await expect(page.locator('.subphase-view__desc')).toContainText('Ambos bandos planifican simultáneamente');
  await expect(panel(page).locator('.vh-panel__title')).toHaveText('Fichas de aeródromo');
  await expect(panel(page).getByText(/Ejemplo genérico/)).toBeVisible();
  // La tarjeta del aeródromo se muestra con sus zonas explicadas (mismo componente que las fichas).
  await expect(panel(page).locator('.ihv__svg')).toBeVisible();
  await expect(panel(page).locator('.ihv__zone').first()).toBeAttached();
  // El panel se acopla a la derecha y el contenido sigue visible a su izquierda.
  const p = await panel(page).boundingBox();
  const h = await heading.boundingBox();
  expect(h.x + h.width).toBeLessThanOrEqual(p.x + 1);
});

test('una referencia genérica a «unidades aéreas» ofrece todos los tipos aéreos, sin escoger el primero', async ({ page }) => {
  await page.goto(PLANNING);
  await page.getByRole('button', { name: 'unidades aéreas: abrir ayuda visual' }).click();
  const tabs = panel(page).getByRole('tab');
  await expect(tabs).toHaveCount(5);
  await expect(panel(page).getByText(/Ejemplo genérico/)).toBeVisible();
  const labels = await tabs.allInnerTexts();
  expect(labels).toEqual(expect.arrayContaining(['Avión táctico: combate', 'Avión táctico: transporte', 'Especial: AWACS', 'Especial: volando']));
  // Todos alcanzables sin cerrar el panel.
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect(panel(page).getByText('Aviones especiales (operando) — AWACS', { exact: false }).first()).toBeVisible();
  await expect(panel(page).locator('.ihv__svg')).toBeVisible();
});

test('Escape cierra el panel y devuelve el foco a la mención; el botón de cierre también', async ({ page }) => {
  await page.goto(PLANNING);
  const trigger = page.getByRole('button', { name: 'fichas de aeródromo: abrir ayuda visual' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).locator('.vh-panel__title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Cerrar la ayuda visual' }).click();
  await expect(panel(page)).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('el panel conserva la posición de la pantalla y no usa un fondo modal (el contenido sigue interactivo)', async ({ page }) => {
  await page.goto('/#/turno/fase/1/air-1/preparacion_aerodromo');
  await page.evaluate(() => window.scrollTo(0, 200));
  const before = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', { name: 'aeródromos: abrir ayuda visual' }).click();
  await expect(panel(page)).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  expect(await page.evaluate(() => document.getElementById('app-content').inert)).toBe(false);
  // Otra mención del contenido se puede activar con el panel abierto.
  await page.getByRole('button', { name: 'Terminar subfase' }).isVisible();
  await expect(panel(page).locator('.ihv__svg')).toBeVisible();
});

test('cambiar de ruta cierra el panel y el botón «ayuda completa» lleva a la ayuda de la entidad', async ({ page }) => {
  await page.goto(PLANNING);
  await page.getByRole('button', { name: 'fichas de aeródromo: abrir ayuda visual' }).click();
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Abrir la ayuda completa' }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page).toHaveURL(/#\/turno\/fase\/1\/air-1\/preparacion_aerodromo$/);
  await page.goto('/#/turno');
  await expect(panel(page)).toBeHidden();
});

test('otras entidades del turno: puertos, unidades terrestres, superficie y submarinas abren sus fichas', async ({ page }) => {
  const cases = [
    ['/#/turno/fase/1/surface/logistica_transporte_superficie', 'puertos: abrir ayuda visual', 'Fichas de puerto', 1],
    ['/#/turno/fase/1/ground/maniobras_terrestres', 'unidades terrestres: abrir ayuda visual', 'Unidades terrestres', 6],
    ['/#/turno/fase/1/surface/combate_superficie', 'superficie: abrir ayuda visual', 'Unidades de superficie', 4],
    ['/#/turno/fase/1/submarine/combate_submarino', 'submarinas: abrir ayuda visual', 'Submarinos', 2]
  ];
  for (const [route, name, title, tabCount] of cases) {
    await page.goto(route);
    await page.getByRole('button', { name }).click();
    await expect(panel(page).locator('.vh-panel__title')).toHaveText(title);
    await expect(panel(page).getByRole('tab')).toHaveCount(tabCount > 1 ? tabCount : 0);
    await expect(panel(page).locator('.ihv__svg').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
  }
});

test('el panel se muestra como panel inferior en móvil, sin desbordar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PLANNING);
  await page.getByRole('button', { name: 'fichas de aeródromo: abrir ayuda visual' }).click();
  await expect(panel(page)).toBeVisible();
  const box = await panel(page).boundingBox();
  expect(box.y).toBeGreaterThan(200);
  expect(box.width).toBeGreaterThanOrEqual(385);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await panel(page).getByRole('button', { name: 'Cerrar la ayuda visual' }).click();
  await expect(panel(page)).toBeHidden();
});

test('TUR-004: el Nivel de Reacción de cada fase terrestre abre las fichas con la letra resaltada', async ({ page }) => {
  await page.goto('/#/turno/fase/4/ground');
  await expect(page.getByText('Nivel de Reacción (Iniciativa) A, B, C, D')).toBeVisible();
  await page.getByRole('button', { name: 'Nivel de Reacción (Iniciativa): abrir ayuda visual' }).click();
  await expect(panel(page).locator('.vh-panel__title')).toHaveText('Unidades terrestres');
  const tabs = panel(page).getByRole('tab');
  expect(await tabs.count()).toBeGreaterThanOrEqual(3);
  // Unidad principal: la letra se llama Iniciativa; en las técnicas, Móvil / Fijo. Siempre resaltada.
  await expect(panel(page).locator('.ihv__popover .ihv__title')).toHaveText('Iniciativa');
  await expect(panel(page).locator('.ihv__zone.is-active')).toHaveCount(1);
  await tabs.nth(1).click();
  await expect(panel(page).locator('.ihv__popover .ihv__title')).toHaveText('Móvil / Fijo');
  await expect(panel(page).locator('.ihv__zone.is-active')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();

  // También desde la pantalla de la fase y con los niveles de esa fase.
  await page.goto('/#/turno/fase/3');
  await expect(page.getByText('Nivel de Reacción (Iniciativa) A, B.')).toBeVisible();
  await page.getByRole('button', { name: 'Nivel de Reacción (Iniciativa): abrir ayuda visual' }).click();
  await expect(panel(page).locator('.ihv__zone.is-active')).toHaveCount(1);
  // Una fase sin Tierra no ofrece esa ayuda.
  await page.goto('/#/turno/fase/2');
  await expect(page.getByRole('button', { name: 'Nivel de Reacción (Iniciativa): abrir ayuda visual' })).toHaveCount(0);
});
