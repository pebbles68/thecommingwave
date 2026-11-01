// Revisión de fichas y tablas (Fase 25): todas las zonas juntas, «Bien»/«Mal» con nota y descarga del resultado.
const { test, expect } = require('./fixtures');

test('se marcan las zonas, se recuerda el avance y se descarga la revisión', async ({ page }) => {
  await page.goto('/#/revision');
  await page.evaluate(() => localStorage.removeItem('tcw.imageReview'));
  await page.reload();
  await expect(page.locator('.image-review__status')).toContainText('Revisadas 0 de');
  const first = page.locator('.image-review__card').first().locator('.image-review__item').first();
  await first.getByRole('button', { name: 'Mal' }).click();
  await first.getByLabel('Nota de lo que está mal').fill('Recuadro corto');
  await expect(page.locator('.image-review__status')).toContainText('Revisadas 1 de');
  await expect(page.locator('.image-review__status')).toContainText('(1 mal)');
  await page.getByRole('button', { name: 'Marcar como «Bien» todo lo que falta' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar la revisión' }).click()]);
  expect(download.suggestedFilename()).toBe('image-review.json');
  const file = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));
  expect(file.review.by).toBe('Mantenedor (Pablo)');
  expect(file.counters['aircraft-combat-tactical'].air_combat).toEqual({ status: 'wrong', note: 'Recuadro corto' });
  expect(file.counters['aircraft-combat-tactical'].model.status).toBe('ok');
  expect(Object.keys(file.tables).length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('.image-review__status')).toContainText('(1 mal)');
});
