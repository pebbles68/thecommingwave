// AJ-006: el texto principal que ve el jugador no menciona fases de roadmap,
// códigos de incidencia, archivos JSON ni rutas de documentación; eso vive
// dentro del bloque plegable «Fuente y trazabilidad».
const { test, expect } = require('./fixtures');

const JARGON = /roadmap|\bCOR0?\d*-\d+|\.json|known-ambiguities|needsReview|needs_review|needs review|Vertical slice|golden test|\bworkflow\b|data\/|docs\//i;

const ROUTES = [
  '/#/',
  '/#/turno',
  '/#/turno/fase/1/ground',
  '/#/turno/fase/1/ground/combate_terrestre',
  '/#/ayuda',
  '/#/ayuda/secuencia',
  '/#/ayuda/deteccion',
  '/#/ayuda/deteccion/resolver',
  '/#/ayuda/combate',
  '/#/ayuda/tablas',
  '/#/ayuda/tablas/router',
  '/#/ayuda/tablas/page-33.json',
  '/#/ayuda/tablas/page-16.json/air-combat-bvr-damage',
  '/#/ayuda/municion',
  '/#/ayuda/counters',
  '/#/ayuda/reglas',
  '/#/unidades',
  '/#/historial',
  '/#/wizard/antiship-guided',
  '/#/wizard/antiship-unguided',
  '/#/wizard/ground-close-combat',
  '/#/wizard/ground-guided',
  '/#/wizard/ground-unguided',
  '/#/wizard/ground-attack-result',
  '/#/wizard/torpedo-surface',
  '/#/wizard/asw-surface-air',
  '/#/wizard/asw-submarine',
  '/#/wizard/asw-air-search',
  '/#/wizard/asw-signature-search',
  '/#/wizard/air-intercept-targets',
  '/#/wizard/air-combat-bvr',
  '/#/wizard/air-combat-wvr',
  '/#/wizard/anti-radiation',
  '/#/wizard/ship-impact-effects',
  '/#/wizard/army-resupply',
  '/#/wizard/logistics-guarantee',
  '/#/wizard/submarine-ambush',
  '/#/wizard/port-logistics',
  '/#/wizard/cyber-attack',
  '/#/wizard/space-war',
  '/#/wizard/air-mission-group',
  '/#/perfil-reglas',
  '/#/wizard/ground-reaction'
];

for (const route of ROUTES) {
  test(`sin lenguaje de desarrollo en el texto principal: ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('#view-root')).not.toContainText('Cargando', { timeout: 10000 });
    // El texto de jugador se aplica en el siguiente fotograma tras renderizar: se espera a que termine antes de leer.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const text = await page.evaluate(() => {
      const clone = document.getElementById('view-root').cloneNode(true);
      clone.querySelectorAll('details.trace-note, [hidden]').forEach((d) => d.remove());
      return clone.innerText;
    });
    const hit = text.match(JARGON);
    expect(hit, hit ? `«${hit[0]}» en: …${text.slice(Math.max(0, hit.index - 80), hit.index + 80)}…` : '').toBeNull();
  });
}

test('Inicio ofrece tres entradas principales y el listado de combates se despliega', async ({ page }) => {
  await page.goto('/#/');
  for (const name of ['Seguir turno', 'Resolver combate', 'Consultar ayuda']) {
    await expect(page.locator('.home__actions').first().getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /^Combate aéreo BVR/ })).toBeHidden();
  await page.getByRole('button', { name: /^Resolver combate/ }).click();
  await page.getByRole('button', { name: /^Combate aéreo BVR/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/air-combat-bvr$/);
});
