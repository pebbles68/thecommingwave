// Genera `dist/`: la web lista para subir a cualquier alojamiento de archivos estáticos.
// La aplicación no necesita servidor: `public/` va en la raíz del dominio y `data/` en `/data/`.
// Uso: node scripts/build-static.js [carpeta-de-salida]   (por defecto, `dist/`)
//
// Además de copiar los archivos escribe las cabeceras de caché y seguridad para Netlify / Cloudflare Pages
// (`_headers`) y para Apache (`.htaccess`). El ejemplo de nginx está en docs/despliegue/nginx.conf.ejemplo.
// Nunca se copian PDF ni DOCX (material de terceros que no se publica).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EXCLUDED = /\.(pdf|docx)$/i;

function copyDir(from, to, stats) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dst, stats);
    } else if (entry.isFile() && !EXCLUDED.test(entry.name)) {
      fs.copyFileSync(src, dst);
      stats.files += 1;
      stats.bytes += fs.statSync(src).size;
    }
  }
}

const HEADERS_FILE = `# Cabeceras para Netlify y Cloudflare Pages.
# Las imágenes cambian poco: una semana de caché. El resto se revalida siempre (ETag), para ver las
# versiones nuevas sin recargar a la fuerza. Los nombres de archivo no llevan huella, por eso no se usa «immutable».
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
/*.png
  Cache-Control: public, max-age=604800
/*.jpg
  Cache-Control: public, max-age=604800
/*.svg
  Cache-Control: public, max-age=604800
/*.html
  Cache-Control: public, max-age=0, must-revalidate
/*.js
  Cache-Control: public, max-age=0, must-revalidate
/*.css
  Cache-Control: public, max-age=0, must-revalidate
/*.json
  Cache-Control: public, max-age=0, must-revalidate
`;

const HTACCESS_FILE = `# Apache / alojamiento compartido (necesita mod_headers, mod_expires y mod_deflate; si falta alguno, bórrese su bloque).
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript application/json image/svg+xml
</IfModule>
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set Referrer-Policy "no-referrer"
  Header set X-Frame-Options "DENY"
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/png "access plus 7 days"
  ExpiresByType image/jpeg "access plus 7 days"
  ExpiresByType image/svg+xml "access plus 7 days"
  ExpiresByType text/html "access plus 0 seconds"
  ExpiresByType text/css "access plus 0 seconds"
  ExpiresByType text/javascript "access plus 0 seconds"
  ExpiresByType application/javascript "access plus 0 seconds"
  ExpiresByType application/json "access plus 0 seconds"
</IfModule>
AddType application/json .json
AddType text/javascript .js
AddDefaultCharset UTF-8
`;

function build(outDir) {
  const out = path.resolve(outDir || path.join(ROOT, 'dist'));
  if (out === ROOT || out.startsWith(path.join(ROOT, 'public')) || out.startsWith(path.join(ROOT, 'data'))) {
    throw new Error(`Carpeta de salida no válida: ${out}`);
  }
  fs.rmSync(out, { recursive: true, force: true });
  const stats = { files: 0, bytes: 0 };
  copyDir(path.join(ROOT, 'public'), out, stats);
  copyDir(path.join(ROOT, 'data'), path.join(out, 'data'), stats);
  fs.writeFileSync(path.join(out, '_headers'), HEADERS_FILE);
  fs.writeFileSync(path.join(out, '.htaccess'), HTACCESS_FILE);
  return { out, ...stats };
}

if (require.main === module) {
  const r = build(process.argv[2]);
  console.log(`Web estática generada en ${r.out}: ${r.files} archivos, ${(r.bytes / 1048576).toFixed(1)} MB.`);
  console.log('Súbela entera a la raíz del dominio (public/ en «/», data/ en «/data/»). Ver README.md, «Despliegue».');
}

module.exports = { build };
