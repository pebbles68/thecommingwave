// Fixture compartida por todas las pruebas E2E (correcciones.md COR-004,
// criterio de aceptación "los errores de consola y de red hacen fallar la
// prueba"): en vez de repetir esta comprobación en cada archivo, se extiende
// `page` una sola vez aquí y el resto de specs importan este `test`/`expect`.
const base = require('@playwright/test');

const test = base.test.extend({
  page: async ({ page }, use) => {
    const consoleErrors = [];
    const failedRequests = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });
    // Las pruebas ven la web como la versión pública: sin las imágenes reales de images/ (fuera del repositorio,
    // roadmap Fase 25), aunque estén en el equipo de quien las ejecuta.
    await page.route('**/images/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false }) }));
    page.on('response', (res) => {
      if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
    });

    await use(page);

    if (consoleErrors.length) {
      throw new Error(`Errores de consola inesperados durante la prueba:\n- ${consoleErrors.join('\n- ')}`);
    }
    if (failedRequests.length) {
      throw new Error(`Peticiones de red fallidas durante la prueba:\n- ${failedRequests.join('\n- ')}`);
    }
  }
});

module.exports = { test, expect: base.expect };
