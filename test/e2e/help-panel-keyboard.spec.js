// Caso E2E obligatorio 4 (correcciones.md COR-004): apertura y cierre del
// panel de ayuda flotante solo con teclado, sin ningún clic de ratón.
//
// Desde COR-008 (2026-09-27), el panel es un diálogo modal accesible: nombre
// y rol (`role="dialog"`/`aria-modal`/`aria-labelledby`), el foco entra en él
// al abrirse, Tab/Shift+Tab quedan confinados dentro (con salto de vuelta al
// primer/último control, no solo "no entrar en el fondo"), el contenido de
// fondo queda `inert` (no puede activarse ni recibir foco) y el foco vuelve
// al control de origen al cerrar por cualquier mecanismo.
//
// El botón "? Ayuda rápida" se enfoca directamente (`locator.focus()`) en vez
// de recorrer la secuencia de Tab desde el principio del documento: en este
// entorno de navegador sin foco de ventana real, `Tab` desde `document.body`
// se comporta de forma inconsistente entre una página recién cargada y un
// script standalone, algo ajeno a esta funcionalidad de la app.
const { test, expect } = require('./fixtures');

test('el panel de ayuda rápida se abre y se cierra usando solo el teclado, como diálogo modal accesible', async ({ page }) => {
  await page.goto('/#/');

  const helpPanel = page.locator('#help-panel');
  await expect(helpPanel).toBeHidden();
  await expect(helpPanel).toHaveAttribute('role', 'dialog');
  await expect(helpPanel).toHaveAttribute('aria-modal', 'true');
  await expect(helpPanel).toHaveAttribute('aria-labelledby', 'help-panel-title');

  await page.locator('#btn-help').focus();
  await expect(page.locator('#btn-help')).toBeFocused();

  // Activar el botón con el teclado (Enter), no con un clic.
  await page.keyboard.press('Enter');
  await expect(helpPanel).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ayuda rápida' })).toBeVisible();

  // El foco entra en el panel (al botón de cierre) sin ninguna acción extra.
  await expect(page.locator('#btn-help-close')).toBeFocused();

  // El contenido de fondo queda inert: no puede recibir foco mientras el panel esté abierto.
  await expect(page.locator('#app-content')).toHaveJSProperty('inert', true);
  await page.locator('#btn-home').evaluate((el) => el.focus());
  await expect(page.locator('#btn-home')).not.toBeFocused();

  // Tab/Shift+Tab quedan confinados dentro del panel (envuelven, no solo "no salen").
  const lastItem = page.getByRole('button', { name: 'Reglas y extractos' });
  await lastItem.focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#btn-help-close')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(lastItem).toBeFocused();

  // Escape cierra el panel (roadmap Fase 17) y devuelve el foco a "? Ayuda rápida".
  await page.keyboard.press('Escape');
  await expect(helpPanel).toBeHidden();
  await expect(page.locator('#app-content')).toHaveJSProperty('inert', false);
  await expect(page.locator('#btn-help')).toBeFocused();

  // También se puede abrir y volver a cerrar con el botón de cierre propio
  // del panel, llegando a él con Tab (dentro del panel ya abierto) y
  // activándolo con Enter — sin clics — y el foco vuelve igualmente a "? Ayuda rápida".
  await page.keyboard.press('Enter');
  await expect(helpPanel).toBeVisible();
  await expect(page.locator('#btn-help-close')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(helpPanel).toBeHidden();
  await expect(page.locator('#btn-help')).toBeFocused();
});
