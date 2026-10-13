// Cada tabla transcrita (data/tables) se abre en el visor de «Ayuda rápida > Tablas» sin error, con su resultado y su
// cuadrícula. Detecta ejes con una forma que el visor no sabe pintar (p. ej. un eje con solo variantes, sin «values»).
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('./fixtures');

const dir = path.join(__dirname, '..', '..', 'data', 'tables');
const tables = [];
fs.readdirSync(dir).filter((f) => /^page-\d+\.json$/.test(f)).sort().forEach((f) => {
  const page = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  (page.tables || []).forEach((t) => tables.push({ file: f, id: t.id, title: t.title || t.id }));
});

test('hay tablas que abrir (la prueba no es vacía)', () => {
  expect(tables.length).toBeGreaterThanOrEqual(30);
});

for (const t of tables) {
  test(`se abre sin error: ${t.file} · ${t.id}`, async ({ page }) => {
    await page.goto(`/#/ayuda/tablas/${t.file}/${t.id}`);
    await expect(page.locator('#view-root h1')).toBeVisible();
    await expect(page.locator('#view-root')).not.toContainText('Error al cargar la vista');
    await expect(page.locator('#view-root .table-viewer__result')).toContainText('Resultado');
    await expect(page.locator('#view-root table, #view-root .table-grid').first()).toBeVisible();
  });
}
