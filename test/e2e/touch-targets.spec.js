// AJ-009: todo control interactivo mide al menos 48×48 px en tablet (el
// mínimo del producto, --touch-min), con emulación táctil.
const { test, expect } = require('./fixtures');

const MIN = 48;
const TOLERANCE = 0.5; // redondeos de subpíxel

const ROUTES = [
  '/#/', '/#/turno', '/#/turno/fase/1', '/#/turno/fase/0', '/#/turno/fase/1/air-1',
  '/#/turno/fase/1/air-1/salidas_combate', '/#/turno/fase/1/ground/combate_terrestre',
  '/#/ayuda', '/#/ayuda/secuencia', '/#/ayuda/deteccion', '/#/ayuda/deteccion/resolver', '/#/ayuda/combate', '/#/ayuda/combate/air_combat',
  '/#/ayuda/tablas', '/#/ayuda/tablas/router', '/#/ayuda/tablas/page-33.json', '/#/ayuda/tablas/page-05.json/ground-precision-attack-damage',
  '/#/ayuda/municion', '/#/ayuda/municion/iconos', '/#/ayuda/municion/jp', '/#/ayuda/counters', '/#/ayuda/counters/air', '/#/ayuda/counters/air/aircraft-combat-tactical', '/#/ayuda/counters/naval/ship-combat',
  '/#/ayuda/counters/ground/ground-main', '/#/ayuda/municion/jp/attack-plans', '/#/ayuda/municion/jp/attack-plans/jp-f-2ab',
  '/#/turno/fase/1/air-1/preparacion_aerodromo',
  '/#/ayuda/reglas', '/#/ayuda/buscar', '/#/unidades', '/#/historial',
  '/#/wizard/antiship-guided', '/#/wizard/antiship-unguided', '/#/wizard/ground-close-combat', '/#/wizard/ground-guided',
  '/#/wizard/ground-unguided', '/#/wizard/ground-attack-result', '/#/wizard/torpedo-surface', '/#/wizard/asw-surface-air',
  '/#/wizard/asw-submarine', '/#/wizard/asw-air-search', '/#/wizard/asw-signature-search', '/#/wizard/air-intercept-targets',
  '/#/wizard/air-combat-bvr', '/#/wizard/air-combat-wvr', '/#/wizard/anti-radiation', '/#/wizard/ship-impact-effects',
  '/#/wizard/army-resupply', '/#/wizard/logistics-guarantee', '/#/wizard/submarine-ambush', '/#/wizard/port-logistics', '/#/wizard/cyber-attack', '/#/wizard/space-war', '/#/wizard/air-mission-group', '/#/perfil-reglas', '/#/wizard/ground-reaction'
];

const SELECTOR = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [tabindex]:not([tabindex="-1"])';

async function undersized(page) {
  return page.evaluate(({ selector, min, tol }) => {
    const out = [];
    const INTERACTIVE = selector;
    // Elementos que responden al toque sin ser controles semánticos (cursor:pointer
    // sin botón/enlace/rol/tabindex): deben ser controles reales.
    const nodes = new Set(document.querySelectorAll(selector));
    document.querySelectorAll('#app-content *, #help-panel *').forEach((n) => {
      if (n.matches(INTERACTIVE) || n.closest(INTERACTIVE)) return;
      const parentCursor = n.parentElement ? getComputedStyle(n.parentElement).cursor : '';
      if (getComputedStyle(n).cursor === 'pointer' && parentCursor !== 'pointer') { out.push(`no semántico: ${n.tagName.toLowerCase()}.${(n.className || '').toString().trim().split(/s+/).join('.')} (usa <button> o role/tabindex)`); }
    });
    nodes.forEach((node) => {
      if (node.closest('[hidden], [inert]')) return;
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      // Un input dentro de una etiqueta cuenta con el área de la etiqueta.
      let target = node;
      if (node.matches('input, select, textarea')) {
        const label = node.closest('label');
        if (label) target = label;
      }
      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.width < min - tol || r.height < min - tol) {
        out.push(`${node.tagName.toLowerCase()}${node.id ? '#' + node.id : ''}${node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\s+/).join('.') : ''} ${Math.round(r.width)}x${Math.round(r.height)} «${(node.textContent || node.getAttribute('aria-label') || '').trim().slice(0, 30)}»`);
      }
    });
    return out;
  }, { selector: SELECTOR, min: MIN, tol: TOLERANCE });
}

test.use({ hasTouch: true });

for (const route of ROUTES) {
  test(`objetivos táctiles de al menos 48 px: ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('#view-root')).not.toContainText('Cargando', { timeout: 10000 });
    await page.waitForTimeout(150);
    expect(await undersized(page)).toEqual([]);
  });
}

test('los recuadros-botón de factor de ficha y el zoom de iconos cumplen 48 px, también dentro de la ayuda «¿Dónde se lee este valor?»', async ({ page }) => {
  const { chooseOption, fillField } = require('./wizard-helpers');
  await page.goto('/#/wizard/ground-attack-result');
  await fillField(page, 'Puntos de Impacto finales', '10');
  await chooseOption(page, '¿Qué se ataca?', 'Unidad terrestre (principal o técnica)');
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.locator('label.table-viewer__field', { hasText: 'Valor de Protección de la unidad' }).locator('xpath=following-sibling::div[1][contains(@class,"visual-ref")]').getByRole('button').click();
  const help = page.locator('#visual-help-panel');
  await expect(help.locator('.ihv__hit').first()).toBeVisible();
  // El visor ajusta el área táctil (48 px) tras medir su tamaño renderizado: se espera a que termine antes de medir.
  await page.waitForTimeout(300);
  expect(await undersized(page)).toEqual([]);
});

test('el zoom de iconos se abre y cierra con toque, teclado y Escape y expone su estado', async ({ page }) => {
  await page.goto('/#/ayuda/municion/iconos');
  const btn = page.locator('.ammo-icon-card__btn').first();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await btn.tap();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await btn.tap();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
});

test('el botón «Saltar fase» de las fases opcionales existe y mide al menos 48 px', async ({ page }) => {
  await page.goto('/#/turno/fase/0');
  const skip = page.locator('.phase-card__skip').first();
  await expect(skip).toBeVisible();
  const box = await skip.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(47.5);
  expect(box.width).toBeGreaterThanOrEqual(47.5);
});
