// Configuración de Playwright para las pruebas E2E reales de navegador
// (roadmap Fase 18/19, correcciones.md COR-004). Deliberadamente SEPARADA de
// `npm test` (node --test, motores puros/integridad de datos/smoke HTTP):
// estas pruebas arrancan un Chromium real y usan la interfaz servida por
// `server/server.js`, algo que `node --test` no hace. Se ejecutan con
// `npm run test:e2e`.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  // En CI (máquinas Linux más lentas) algún clic puede adelantarse al redibujado de un campo recién rellenado; un único
  // reintento evita falsos fallos sin ocultar los reales (el reporte «github» marca las pruebas intermitentes).
  retries: process.env.CI ? 1 : 0,
  // En CI el reporte «github» publica cada fallo como anotación de la ejecución (legible sin descargar logs).
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure'
  },
  // AGENTS.md §4: tablet horizontal es la plataforma de uso prioritaria y el
  // proyecto principal (1024×768). El proyecto `tablet-touch-smoke` repite los
  // gestos básicos solo con toque (hasTouch, AJ-010): la emulación no sustituye a
  // una tablet física, pero detecta controles que solo funcionan con ratón.
  projects: [
    {
      name: 'tablet-landscape',
      testIgnore: /touch-smoke.spec.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } }
    },
    {
      name: 'tablet-touch-smoke',
      testMatch: /touch-smoke.spec.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 }, hasTouch: true }
    }
  ],
  // Arranca el servidor real (server/server.js) antes de las pruebas y lo
  // reutiliza si ya está corriendo (p.ej. `npm start` en otra terminal).
  // Nunca depende de servicios externos (COR-004, diseño punto 4).
  webServer: {
    command: 'node server/server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30000
  }
});
