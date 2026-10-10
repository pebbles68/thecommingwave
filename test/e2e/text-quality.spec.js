// Pasada de calidad: ninguna pantalla de los wizards de las Fases 11, 13 y 14 ni del perfil de reglas muestra
// restos de programación («undefined», «NaN», «[object», «null»).
const { test, expect } = require('./fixtures');

const ROUTES = [
  '/#/wizard/submarine-ambush',
  '/#/wizard/port-logistics',
  '/#/wizard/cyber-attack',
  '/#/wizard/space-war',
  '/#/wizard/air-mission-group',
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
