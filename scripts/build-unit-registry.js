// Genera data/units/registry-index.json: un índice de los 264 tipos de
// unidad ya transcritos (roadmap Fase 0), repartidos en 4 carpetas de datos
// distintas (data/ammunition/attack-plans, data/ammunition/naval-plans,
// data/ammunition/special-unit-plans, data/units) sin un id centralizado
// hasta ahora. No transcribe ni inventa ningún dato nuevo: solo indexa lo
// que ya existe, para que el modelo de unidades (roadmap Fase 2) pueda
// resolver un tipo de unidad por id sin saber en qué archivo vive.
//
// Regenerar tras añadir/editar unidades: `node scripts/build-unit-registry.js`
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const SOURCES = [
  { dir: 'ammunition/attack-plans', keys: [{ key: 'units', domain: 'attack-plan' }] },
  { dir: 'ammunition/naval-plans', keys: [
    { key: 'surfaceShips', domain: 'naval-surface' },
    { key: 'submarines', domain: 'naval-submarine' }
  ] },
  { dir: 'ammunition/special-unit-plans', keys: [{ key: 'units', domain: 'special-unit' }] },
  { dir: 'units', keys: [
    { key: 'groundFormations', domain: 'ground-formation' },
    { key: 'supportSystems', domain: 'support-system' }
  ] }
];

function build() {
  const entries = [];
  const seenIds = new Map();

  SOURCES.forEach(({ dir, keys }) => {
    const fullDir = path.join(DATA_DIR, dir);
    fs.readdirSync(fullDir)
      .filter((f) => f.endsWith('.json'))
      .forEach((file) => {
        const relFile = `data/${dir}/${file}`.replace(/\\/g, '/');
        const data = JSON.parse(fs.readFileSync(path.join(fullDir, file), 'utf8'));
        keys.forEach(({ key, domain }) => {
          (data[key] || []).forEach((unit) => {
            if (seenIds.has(unit.id)) {
              throw new Error(`id duplicado "${unit.id}" en ${relFile}#${key} (ya existe en ${seenIds.get(unit.id)})`);
            }
            seenIds.set(unit.id, `${relFile}#${key}`);
            entries.push({
              id: unit.id,
              name: unit.name,
              nameEn: unit.nameEn || null,
              country: data.country,
              domain,
              class: unit.class || unit.systemType || (domain === 'ground-formation' ? 'ground-formation' : null),
              file: relFile,
              arrayKey: key
            });
          });
        });
      });
  });

  entries.sort((a, b) => a.id.localeCompare(b.id));

  const output = {
    id: 'unit-registry-index',
    description: 'Índice generado (scripts/build-unit-registry.js) de los tipos de unidad ya transcritos en data/ammunition/{attack-plans,naval-plans,special-unit-plans}/ y data/units/. No sustituye a esos archivos (que siguen siendo la fuente de los datos completos, incluidos planes de ataque y sourceRefs): solo permite resolver un id de unidad al archivo/clave donde vive, sin tener que buscar en 24 archivos. Regenerar con `node scripts/build-unit-registry.js` tras transcribir unidades nuevas.',
    generatedBy: 'scripts/build-unit-registry.js',
    count: entries.length,
    entries
  };

  fs.writeFileSync(
    path.join(DATA_DIR, 'units', 'registry-index.json'),
    JSON.stringify(output, null, 2) + '\n',
    'utf8'
  );
  console.log(`Escritas ${entries.length} entradas en data/units/registry-index.json`);
}

build();
