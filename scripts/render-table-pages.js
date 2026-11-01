// Genera las imágenes de las páginas reales de «Tablas-de-combate 5.pdf» que enseña el asistente de combate
// (roadmap Fase 25). Herramienta de desarrollo: necesita `pdftoppm` (Poppler) en el PATH. Las imágenes quedan en
// images/tablas/page-NN.png, que está en .gitignore: son material del editor y solo se usan en local y en el servidor
// privado de pruebas hasta su visto bueno. La web no calcula nada con ellas (AGENTS.md §3.4).
//
// Uso: node scripts/render-table-pages.js "<ruta a Tablas-de-combate 5.pdf>" [dpi]
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const pdf = process.argv[2];
const dpi = Number(process.argv[3] || 150);
if (!pdf || !fs.existsSync(pdf)) {
  console.error('Uso: node scripts/render-table-pages.js "<ruta a Tablas-de-combate 5.pdf>" [dpi]');
  process.exit(1);
}
const outDir = path.join(__dirname, '..', 'images', 'tablas');
fs.mkdirSync(outDir, { recursive: true });
execFileSync('pdftoppm', ['-png', '-r', String(dpi), pdf, path.join(outDir, 'page')], { stdio: 'inherit' });
// pdftoppm numera page-01.png, page-02.png…: es el mismo número que data/tables/page-NN.json.
const files = fs.readdirSync(outDir).filter((f) => /^page-\d+\.png$/.test(f));
// Señal para la web: en este servidor están las imágenes reales (en la versión pública no existe este archivo).
fs.writeFileSync(path.join(__dirname, '..', 'images', 'available.json'), JSON.stringify({ available: true }) + '\n');
console.log(`${files.length} páginas en ${outDir}`);
