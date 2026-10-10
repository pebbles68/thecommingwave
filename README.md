# TCW Assistant — The Coming Wave Companion

Aplicación web de ayuda para el juego *The Coming Wave*. Ver `AGENTS.md` (propósito y reglas de trabajo) y `roadmap.md` (plan de desarrollo por fases).

Versión 1.0.0. Código bajo licencia MIT (`LICENSE`); el contenido del juego no está cubierto por ella (`NOTICE.md`). Cambios: `CHANGELOG.md`.

## Requisitos

- **Node.js >= 18** (versión mínima soportada) y **Node.js 22** (LTS vigente): ambas se ejecutan en la integración continua (`.github/workflows/ci.yml`). Desarrollado y probado en local con Node 24.
- **La web es estática**: en producción no hace falta Node.js, ni base de datos, ni dependencias. Node solo sirve para desarrollar, probar y generar el paquete a publicar (`npm run build`). Las dependencias de desarrollo (`@playwright/test`, `sharp`) solo hacen falta para las pruebas E2E y los scripts de preparación de imágenes.

## Arranque rápido (clon limpio)

```bash
git clone <repositorio> && cd <repositorio>
npm ci                              # instalación reproducible desde package-lock.json
npm start                           # http://localhost:3000  (PORT=8080 npm start para otro puerto)
```

## Validación

```bash
npm test                            # datos, motores de dominio y servidor HTTP (node --test, sin navegador)
npx playwright install chromium     # una sola vez: descarga el navegador de las pruebas E2E
npm run test:e2e -- --workers=1     # interfaz real en Chromium (ver abajo)
```

- `npm test` valida los datos de `data/` (IDs únicos, referencias resueltas, `sourceRefs` presentes, coherencia de estados de tablas y de la matriz de cobertura), cada motor de dominio y una prueba de humo del servidor. Incluye pruebas parametrizadas de **todas las tablas estructuradas** (cada celda de cada combinación de esquema) y de **cada modificador** declarado en los workflows.
- `npm run test:e2e` arranca `server/server.js` (o reutiliza el del puerto 3000) y ejecuta dos proyectos de Playwright: `tablet-landscape` (1024×768, la plataforma prioritaria, con todas las pruebas de interfaz) y `tablet-touch-smoke` (los gestos básicos solo con toque). Falla ante cualquier error de consola o petición de red con error. Se recomienda `--workers=1`: con varios trabajadores en paralelo aparecen esperas largas por carga de la máquina.
- La integración continua (`.github/workflows/ci.yml`) ejecuta lo anterior en Node 18 y 22 en cada `push` a `master` y en cada `pull request`.

## Limitaciones conocidas

- La compatibilidad con Node 18 la comprueba la integración continua; en local solo se ha ejecutado con Node 24.
- La emulación táctil de Playwright no sustituye a una tablet física: la pasada con un dispositivo real en horizontal y las decisiones sobre un modo oscuro se harán tras publicar esta primera versión.
- Hay reglas del reglamento pendientes de validar por el mantenedor (`docs/rules/known-ambiguities.md`) y capacidades parciales; el estado por tipo de combate está en «Ayuda rápida → Combate por tipo» y en `data/rules/workflow-coverage.json`.
- Los PDF y DOCX originales del juego no se incluyen en el repositorio (ver `NOTICE.md`); el inventario de fuentes está en `data/sources/sources.json`.

## Actualización

```bash
git pull
npm test   # confirma que las tablas/datos siguen siendo válidos tras el cambio
```

Reiniciar el proceso de `npm start` (o el servicio que lo ejecute) para que sirva la versión actualizada. No hay paso de compilación ni dependencias que instalar (sin dependencias externas en runtime).

## Despliegue (web estática)

La aplicación no necesita servidor: son archivos estáticos. Para publicarla:

```bash
npm ci
npm run build        # genera dist/ (public/ + data/ + cabeceras de caché), sin PDF ni DOCX
```

Sube **todo el contenido de `dist/`** a la raíz de un dominio o subdominio (`public/` queda en «/» y `data/` en «/data/»). Requisitos del alojamiento:

1. **Raíz de dominio o subdominio**: el código pide los datos con rutas absolutas (`/data/...`); no funciona en una subcarpeta.
2. **HTTPS**: imprescindible para el botón «Copiar resumen» (el portapapeles del navegador exige un contexto seguro).
3. **Tipos de contenido** correctos para `.html`, `.js`, `.css`, `.json`, `.png`, `.jpg`, `.svg`, `.ico`, con UTF-8 en texto.
4. **Espacio**: unos 95 MB. Cada usuario descarga solo lo que consulta; conviene caché para las imágenes y compresión para JSON y JS.
5. Sin base de datos, sesiones ni cookies: el progreso de cada usuario vive en el `localStorage` de su navegador.

`dist/` incluye las cabeceras de caché y seguridad para Netlify y Cloudflare Pages (`_headers`) y para Apache (`.htaccess`). Para nginx hay un ejemplo en `docs/despliegue/nginx.conf.ejemplo`. Navegadores: versiones actuales de Chrome, Edge, Safari o Firefox (probado en Chromium).

### Alternativa: servidor Node

`server/server.js` sirve `public/` y `data/` con módulos nativos de Node (`npm start`, puerto con `PORT`). Es útil para desarrollo y pruebas; para producción es preferible la web estática con caché y compresión.

## Estructura

```text
public/    recursos web: HTML, CSS y JS de cliente
server/    servidor Node.js (estático + datos)
data/      datos fijos del juego en JSON/texto (tablas, modificadores, routing, fases, munición, detección, fuentes)
docs/      documentación de reglas (ambigüedades, etc.) y de despliegue
scripts/   herramientas de desarrollo (build estático, calibradores de imágenes)
test/      pruebas: datos y motores (node --test) y E2E de navegador (test/e2e)
.github/   integración continua (workflows/ci.yml)
```

Estado actual del desarrollo: ver `development_status.md`.
