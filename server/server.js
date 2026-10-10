const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Evita que una ruta con ".." escape del directorio base servido.
function resolveSafePath(baseDir, requestPath) {
  const normalized = path.normalize(requestPath).replace(/^([/\\]|\.\.[/\\])+/, '');
  const resolved = path.join(baseDir, normalized);
  if (!resolved.startsWith(baseDir)) return null;
  return resolved;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error');
      }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      // El juego cambia con frecuencia durante el desarrollo (datos y cliente);
      // evita que el navegador sirva una versión obsoleta sin recargar.
      'Cache-Control': 'no-store'
    });
    res.end(content);
  });
}

// Analiza la URL de la petición y decodifica su ruta. Tanto el constructor de
// `URL` como `decodeURIComponent` deben tratar la entrada como no confiable:
// una ruta con codificación porcentual inválida (p.ej. `/%E0%A4%A`) hace que
// `decodeURIComponent` lance `URIError`, y sin capturarlo el proceso Node.js
// se cae entero ante una única petición malformada (correcciones.md, COR-003).
// Devuelve `null` cuando la URL no puede analizarse; el llamador decide la
// respuesta 400, dejando separado este caso de los errores 404/500 de `serveFile`.
function parseRequestPath(rawUrl, host) {
  let url;
  try {
    url = new URL(rawUrl, `http://${host}`);
  } catch (err) {
    return null;
  }
  try {
    return decodeURIComponent(url.pathname);
  } catch (err) {
    return null;
  }
}

const server = http.createServer((req, res) => {
  let pathname = parseRequestPath(req.url, req.headers.host);
  if (pathname === null) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }

  if (pathname.startsWith('/data/')) {
    const filePath = resolveSafePath(DATA_DIR, pathname.slice('/data/'.length));
    if (!filePath) { res.writeHead(400); res.end('Bad request'); return; }
    serveFile(res, filePath);
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  const filePath = resolveSafePath(PUBLIC_DIR, pathname);
  if (!filePath) { res.writeHead(400); res.end('Bad request'); return; }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      serveFile(res, filePath);
      return;
    }
    // Enrutado por hash en el cliente: cualquier ruta desconocida sirve index.html.
    serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
  });
});

// `require.main === module` distingue "ejecutado directamente" (`npm start`,
// arranca a escuchar) de "importado" (test de humo de roadmap Fase 16: crea
// el servidor en un puerto propio sin tocar el PORT real de desarrollo).
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`TCW Assistant escuchando en http://localhost:${PORT}`);
  });
}

module.exports = server;
