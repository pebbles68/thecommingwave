// «Volver arriba» y paralaje del fondo (AGENTS.md §4; ajuste AJ-001): el
// scroll real debe ser el del documento, y botón y paralaje deben reaccionar.
const { test, expect } = require('./fixtures');

const SCROLLER = () => (document.scrollingElement || document.documentElement).scrollTop;

async function scrollDown(page, y) {
  await page.evaluate((top) => {
    (document.scrollingElement || document.documentElement).scrollTop = top;
  }, y);
}

for (const size of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
  test(`el botón aparece tras 400 px, el fondo se desplaza y se vuelve arriba (${size.width}x${size.height})`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/#/ayuda/deteccion');
    await expect(page.locator('#view-root')).toBeVisible();
    const btn = page.locator('#btn-scroll-top');
    await expect(btn).toBeHidden();

    // El documento (no <body>) es el elemento que desplaza la página.
    const info = await page.evaluate(() => ({
      docScrollable: document.documentElement.scrollHeight > window.innerHeight,
      bodyOverflowY: getComputedStyle(document.body).overflowY
    }));
    expect(info.docScrollable).toBe(true);
    expect(info.bodyOverflowY).toBe('visible');

    await scrollDown(page, 900);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
    await expect(btn).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getElementById('bg-logo').style.transform)).not.toBe('');
    const moved = await page.evaluate(() => document.getElementById('bg-logo').style.transform);
    expect(moved).toMatch(/translateY\(-/);

    await btn.click();
    await expect.poll(() => page.evaluate(SCROLLER)).toBe(0);
    await expect(btn).toBeHidden();
  });
}

test('con prefers-reduced-motion no hay paralaje y el retorno es inmediato', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  await page.goto('http://localhost:3000/#/ayuda/deteccion');
  await scrollDown(page, 900);
  await expect(page.locator('#btn-scroll-top')).toBeVisible();
  expect(await page.evaluate(() => document.getElementById('bg-logo').style.transform)).toBe('none');
  await page.locator('#btn-scroll-top').click();
  expect(await page.evaluate(SCROLLER)).toBe(0);
  await context.close();
});
