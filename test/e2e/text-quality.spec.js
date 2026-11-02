// Pasada de calidad: ninguna pantalla de los procedimientos de las Fases 11, 13 y 14 (ahora en el asistente) ni del perfil de reglas muestra
// restos de programación («undefined», «NaN», «[object», «null»).
const { test, expect } = require('./fixtures');

const ROUTES = [
  '/#/decision/ext.ambush.event',
  '/#/decision/ext.port.ship_repair',
  '/#/decision/strategic.cyber.compare',
  '/#/decision/strategic.space.type',
  '/#/decision/ext.air.organize',
  '/#/perfil-reglas',
  '/#/turno/fase/1/air-1/paralisis_red',
  '/#/turno/fase/0/logistica',
  '/#/ayuda/combate'
];

for (const route of ROUTES) {
  test(`sin restos de programación: ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('#view-root')).not.toContainText('Cargando', { timeout: 10000 });
    await page.waitForTimeout(200);
    const text = await page.locator('#view-root').innerText();
    expect(text).not.toMatch(/\bundefined\b|\bNaN\b|\[object|\bnull\b/);
  });
}
