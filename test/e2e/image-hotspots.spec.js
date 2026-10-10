// Componente común de ayudas sobre imágenes (ajuste_imagenes.md, IMG-007/IMG-008): la misma
// información con puntero, foco, toque y lista textual; Escape cierra; popover dentro del
// contenedor; área táctil mínima.
const { test, expect } = require('./fixtures');

const ROUTE = '/#/ayuda/counters/air/aircraft-combat-tactical';

async function open(page) {
  await page.goto(ROUTE);
  await expect(page.locator('.ihv__svg')).toBeVisible();
}

const zone = (page, label) => page.locator(`.ihv__hit[aria-label="${label}"]`);

test('hover, foco y lista textual muestran el mismo nombre y resumen', async ({ page }) => {
  await open(page);
  const popover = page.locator('.ihv__popover');
  await expect(popover).toBeHidden();

  await zone(page, 'Protección').hover();
  await expect(popover).toBeVisible();
  await expect(popover.locator('.ihv__title')).toHaveText('Protección');
  const summary = await popover.locator('.ihv__summary').innerText();
  expect(summary).toContain('Puntos de impacto');

  await page.mouse.move(2, 2);
  await expect(popover).toBeHidden();

  await zone(page, 'Protección').focus();
  await expect(popover.locator('.ihv__title')).toHaveText('Protección');
  expect(await popover.locator('.ihv__summary').innerText()).toBe(summary);

  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();

  await page.locator('.ihv__list-btn', { hasText: 'Protección' }).click();
  await expect(popover.locator('.ihv__title')).toHaveText('Protección');
  expect(await popover.locator('.ihv__summary').innerText()).toBe(summary);
  await expect(page.locator('.ihv__list-btn.is-active')).toHaveText('Protección');
});

test('Enter fija la zona, solo hay una zona activa y un segundo Enter la cierra', async ({ page }) => {
  await open(page);
  const popover = page.locator('.ihv__popover');
  await zone(page, 'Protección').focus();
  await page.keyboard.press('Enter');
  await expect(zone(page, 'Protección')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.ihv__list-btn').nth(1).click();
  await expect(page.locator('.ihv__zone.is-active')).toHaveCount(1);
  await page.locator('.ihv__list-btn').nth(1).click();
  await expect(popover).toBeHidden();
});

test('el popover enseña la fuente plegable y el estado de revisión, y queda dentro de la ventana', async ({ page }) => {
  await open(page);
  await zone(page, 'Protección').click();
  const popover = page.locator('.ihv__popover');
  await expect(popover.locator('.ihv__badge--review')).toBeVisible();
  const source = popover.locator('.ihv__source');
  await expect(source.locator('summary')).toHaveText('Fuente y trazabilidad');
  await source.locator('summary').click();
  await expect(source.locator('p')).toBeVisible();

  const stage = await page.locator('.ihv__stage').boundingBox();
  const box = await popover.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
});

test('una zona sin calibrar sale como pendiente de validar (discontinua), no como calibrada', async ({ page }) => {
  // Simula una ficha sin calibrar quitando las cajas de esa plantilla en la respuesta del servidor.
  await page.route('**/data/image-hotspots/counters.json', async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    json.instances.find((i) => i.id === 'aircraft-transport-tactical').hotspots.forEach((h) => { h.rect = null; h.reviewStatus = 'needs_review'; });
    await route.fulfill({ response: res, json });
  });
  await page.goto('/#/ayuda/counters/air/aircraft-transport-tactical');
  await expect(page.locator('.ihv__svg')).toBeVisible();
  const first = page.locator('.ihv__zone').first();
  await expect(first).toHaveClass(/is-needs_review/);
  const dash = await first.locator('.ihv__mark').evaluate((n) => getComputedStyle(n).strokeDasharray);
  expect(dash).not.toBe('none');
  await first.locator('.ihv__hit').click();
  await expect(page.locator('.ihv__popover')).toContainText('Zona aproximada');
});

test('borde con grosor y esquinas redondeadas; la zona activa es más gruesa', async ({ page }) => {
  await open(page);
  const mark = page.locator('.ihv__zone', { has: zone(page, 'Protección') }).locator('.ihv__mark');
  const base = await mark.evaluate((n) => ({ w: parseFloat(getComputedStyle(n).strokeWidth), rx: Number(n.getAttribute('rx')) }));
  expect(base.w).toBeGreaterThanOrEqual(2);
  expect(base.rx).toBeGreaterThan(0);
  await zone(page, 'Protección').click();
  await expect.poll(() => mark.evaluate((n) => parseFloat(getComputedStyle(n).strokeWidth))).toBeGreaterThan(base.w);
});

test('toda zona mide al menos 48×48 px en tablet y en móvil, sin desbordar', async ({ page }) => {
  await open(page);
  for (const size of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(250);
    const boxes = await page.locator('.ihv__hit').evaluateAll((nodes) => nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)];
    }));
    expect(boxes.length).toBeGreaterThan(5);
    boxes.forEach(([w, h]) => { expect(w).toBeGreaterThanOrEqual(47); expect(h).toBeGreaterThanOrEqual(47); });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

for (const size of [{ width: 1226, height: 800 }, { width: 390, height: 844 }]) test(`el popover no tapa la zona consultada, sea cual sea la zona ni la imagen (${size.width} px)`, async ({ page }) => {
  await page.setViewportSize(size);
  for (const route of [ROUTE, '/#/ayuda/counters/naval/ship-combat', '/#/ayuda/counters/ground/ground-main']) {
    await page.goto(route);
    await expect(page.locator('.ihv__svg')).toBeVisible();
    const count = await page.locator('.ihv__list-btn').count();
    for (let i = 0; i < count; i += 1) {
      await page.locator('.ihv__list-btn').nth(i).click();
      const id = await page.locator('.ihv__list-btn').nth(i).getAttribute('data-id');
      const m = await page.locator('.ihv__svg').boundingBox(); // toda la imagen, no solo la zona
      const p = await page.locator('.ihv__popover').boundingBox();
      const overlapX = Math.min(m.x + m.width, p.x + p.width) - Math.max(m.x, p.x);
      const overlapY = Math.min(m.y + m.height, p.y + p.height) - Math.max(m.y, p.y);
      expect(overlapX > 1 && overlapY > 1, `${route} ${id} tapado por el popover`).toBe(false);
    }
  }
});

// ---- Explorador de tarjetas de aeródromos y puertos (IMG-003/IMG-004) ----
const BOARDS_ROUTE = '/#/turno/fase/1/air-1/preparacion_aerodromo';

test('explorador de tarjetas: elegir una tarjeta de la página abre sus zonas con nombre, resumen y fuente', async ({ page }) => {
  await page.goto(BOARDS_ROUTE);
  const explorer = page.locator('.board-explorer');
  await expect(explorer).toBeVisible();
  await expect(explorer.locator('.board-explorer__page-btn')).toHaveCount(15);

  // Nivel página: pasar el ratón por una tarjeta no la abre; pulsarla, sí.
  const cardZone = explorer.locator('.board-explorer__page .ihv__hit').first();
  await cardZone.hover();
  await expect(explorer.locator('.board-explorer__card .ihv')).toHaveCount(0);
  await cardZone.click();
  const card = explorer.locator('.board-explorer__card');
  await expect(card.locator('.board-explorer__card-title')).toContainText('Aeródromo 1 de la página 1');

  // Nivel tarjeta: las 21 zonas del aeródromo, con el mismo comportamiento que las fichas.
  await expect(card.locator('.ihv__zone')).toHaveCount(21);
  await card.locator('.ihv__list-btn', { hasText: 'Salidas' }).click();
  const popover = card.locator('.ihv__popover');
  await expect(popover.locator('.ihv__title')).toHaveText('Salidas');
  await expect(popover.locator('.ihv__summary')).toContainText('Valor de Lanzamiento');
  await expect(popover.locator('.ihv__badge--review')).toBeVisible();
  await popover.locator('.ihv__source summary').click();
  await expect(popover.locator('.ihv__source p')).toContainText('Aeródromos y puertos');
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
});

test('explorador de tarjetas: los tipos de tarjeta y las páginas cargan sin errores y sin desbordar', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BOARDS_ROUTE);
  const explorer = page.locator('.board-explorer');
  await expect(explorer).toBeVisible();
  for (const n of [1, 5, 12]) {
    await explorer.locator(`.board-explorer__page-btn[data-key$="page-${String(n).padStart(2, '0')}.png"]`).click();
    await expect(explorer.locator('.board-explorer__page .ihv__zone').first()).toBeVisible();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('explorador de tarjetas: el popover de una zona de tarjeta no tapa la imagen de la tarjeta', async ({ page }) => {
  await page.goto(BOARDS_ROUTE);
  const explorer = page.locator('.board-explorer');
  await explorer.locator('.board-explorer__page .ihv__hit').first().click();
  const card = explorer.locator('.board-explorer__card');
  await expect(card.locator('.ihv__zone').first()).toBeVisible();
  for (const label of ['Salidas', 'Listas para salir', 'Casilla de misión: Ataque Aéreo']) {
    await card.locator('.ihv__list-btn', { hasText: label }).click();
    const svg = await card.locator('.ihv__svg').boundingBox();
    const p = await card.locator('.ihv__popover').boundingBox();
    const ox = Math.min(svg.x + svg.width, p.x + p.width) - Math.max(svg.x, p.x);
    const oy = Math.min(svg.y + svg.height, p.y + p.height) - Math.max(svg.y, p.y);
    expect(ox > 1 && oy > 1, `${label} tapa la imagen`).toBe(false);
  }
});

// ---- Subzonas de los planes de ataque (IMG-006) ----
test('plan de ataque calibrado: las zonas explican el plan con los valores de los datos, no de la imagen', async ({ page }) => {
  await page.goto('/#/ayuda/municion/ru/aviones/ru-su-30sm');
  const viewer = page.locator('.ihv');
  await expect(viewer).toBeVisible();
  const list = viewer.locator('.ihv__list-wrap');
  await list.locator('summary').click();
  await list.locator('.ihv__list-btn', { hasText: 'Unidad completa, plan C · Antibuque' }).click();
  const popover = viewer.locator('.ihv__popover');
  await expect(popover.locator('.ihv__summary')).toHaveText('Valores de la unidad completa: pesada 4, ligera 6, alcance 4.');
  await list.locator('.ihv__list-btn', { hasText: 'Iconos del plan A · Antibuque' }).click();
  await expect(popover.locator('.ihv__summary')).toContainText('.');
  await expect(page.getByText('Ver la hoja completa del PDF de origen')).toBeVisible();
});

test('unidad sin filas calibradas: sigue mostrándose el recorte plano de siempre', async ({ page }) => {
  await page.goto('/#/ayuda/municion/ru/aviones/ru-tu-22m');
  await expect(page.locator('.ammo-unit-crop')).toBeVisible();
  await expect(page.locator('.ihv')).toHaveCount(0);
});
