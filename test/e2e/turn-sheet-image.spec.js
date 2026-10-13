// «Secuencia de turno y fases» ofrece la hoja de turnos como imagen, que se abre en el visor a pantalla completa
// (como las demás imágenes de apoyo) y se puede ampliar a tamaño real con un toque.
const { test, expect } = require('./fixtures');

test('el botón de la hoja de turnos abre la imagen, se amplía con un toque y se cierra con Escape', async ({ page }) => {
  await page.goto('/#/ayuda/secuencia');
  const button = page.getByRole('button', { name: /Ver la hoja de turnos \(imagen\)/ });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(48);

  await button.click();
  const lightbox = page.locator('.image-lightbox');
  await expect(lightbox).toBeVisible();
  const img = lightbox.locator('.image-lightbox__img');
  await expect(img).toHaveAttribute('src', '/data/phases/source-images/hoja-de-turnos.jpg');
  await expect.poll(() => img.evaluate((i) => i.naturalWidth)).toBeGreaterThan(2000);

  const fitted = await img.boundingBox();
  await img.click();
  await expect(lightbox).toHaveClass(/is-zoomed/);
  const zoomed = await img.boundingBox();
  expect(zoomed.width).toBeGreaterThan(fitted.width * 1.5);
  await img.click();
  await expect(lightbox).not.toHaveClass(/is-zoomed/);

  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();
});

test('la miniatura de la hoja de turnos también abre el visor', async ({ page }) => {
  await page.goto('/#/ayuda/secuencia');
  await page.getByRole('button', { name: 'Ver la hoja de turnos completa' }).click();
  await expect(page.locator('.image-lightbox__img')).toHaveAttribute('src', '/data/phases/source-images/hoja-de-turnos.jpg');
});
