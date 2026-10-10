const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, relPath), 'utf8'));
}

test('turn-template.json: cada paso de la Fase 0 y cada tipo de segmento referencian fases que existen en phases', () => {
  const data = readJson('phases/turn-template.json');
  for (const phaseId of data.band.strategic.phases) {
    assert.ok(data.phases[phaseId], `paso de la Fase 0 "${phaseId}" no existe en phases`);
  }
  for (const [kindId, kind] of Object.entries(data.segmentKinds)) {
    if (kind.consultable) assert.ok(data.band.consultables[kind.consultable], `segmento "${kindId}" referencia el nodo consultable inexistente "${kind.consultable}"`);
    else assert.ok(data.phases[kind.phaseRef], `segmento "${kindId}" referencia la fase inexistente "${kind.phaseRef}"`);
  }
});

test('turn-template.json: cada subfase referenciada por una fase existe en subphases', () => {
  const data = readJson('phases/turn-template.json');
  for (const [phaseId, phase] of Object.entries(data.phases)) {
    for (const subId of phase.subphases || []) {
      assert.ok(data.subphases[subId], `subfase referenciada "${subId}" no existe en subphases (fase ${phaseId})`);
    }
  }
});

test('turn-template.json: toda fase tiene endCondition, ruleReference y sourceRefs', () => {
  const data = readJson('phases/turn-template.json');
  for (const [id, phase] of Object.entries(data.phases)) {
    assert.ok(phase.endCondition, `fase "${id}" sin endCondition`);
    assert.ok(phase.ruleReference, `fase "${id}" sin ruleReference`);
    assert.ok(Array.isArray(phase.sourceRefs) && phase.sourceRefs.length > 0, `fase "${id}" sin sourceRefs`);
  }
});

test('turn-template.json: toda subfase tiene sourceRefs', () => {
  const data = readJson('phases/turn-template.json');
  for (const [id, sub] of Object.entries(data.subphases)) {
    assert.ok(Array.isArray(sub.sourceRefs) && sub.sourceRefs.length > 0, `subfase "${id}" sin sourceRefs`);
  }
});

test('turn-template.json: relatedWorkflowIds de cada subfase existen en el índice de workflows', () => {
  const data = readJson('phases/turn-template.json');
  const workflowIndex = readJson('workflows/index.json');
  const validIds = new Set(workflowIndex.files.map((f) => f.id));
  for (const [id, sub] of Object.entries(data.subphases)) {
    for (const wfId of sub.relatedWorkflowIds || []) {
      assert.ok(validIds.has(wfId), `subfase "${id}" referencia relatedWorkflowIds "${wfId}", que no existe en data/workflows/index.json`);
    }
  }
});

test('tables/page-05.json, page-09.json: attackRowGroupSchemeRule/diceRowSchemeRule citan fuente y sus schemes existen', () => {
  for (const file of ['tables/page-05.json', 'tables/page-09.json']) {
    const data = readJson(file);
    for (const table of data.tables) {
      if (!table.attackRowGroupSchemeRule) continue;
      const rule = table.attackRowGroupSchemeRule;
      assert.ok(rule.sourceRefs && rule.sourceRefs.length, `${file}#${table.id}: attackRowGroupSchemeRule sin sourceRefs`);
      const validColumnSchemes = new Set(Object.keys(table.columnAxis.alternateLabelSets || {}));
      for (const c of rule.cases) {
        // `scheme: null` = etiquetas canónicas (`columnAxis.values`), como la fila
        // "Persecución" de la página 9 (resuelta el 2026-10-05).
        if (c.scheme === null) {
          assert.ok(Array.isArray(table.columnAxis.values) && table.columnAxis.values.length, `${file}#${table.id}: scheme null sin columnAxis.values`);
          continue;
        }
        assert.ok(validColumnSchemes.has(c.scheme),`${file}#${table.id}: attackRowGroupSchemeRule.cases referencia scheme "${c.scheme}" ausente de columnAxis.alternateLabelSets`);
      }
      const diceRule = table.diceRowSchemeRule;
      assert.ok(diceRule && diceRule.sourceRefs && diceRule.sourceRefs.length, `${file}#${table.id}: diceRowSchemeRule sin sourceRefs`);
      const validRowSchemes = new Set(Object.keys(table.rowAxis.alternateLabels || {}));
      for (const c of diceRule.cases) {
        assert.ok(validRowSchemes.has(c.scheme), `${file}#${table.id}: diceRowSchemeRule.cases referencia scheme "${c.scheme}" ausente de rowAxis.alternateLabels`);
      }
    }
  }
});

test('tables/page-03.json: resolutionMechanic y rowAxis.correctedLabel citan fuente', () => {
  const data = readJson('tables/page-03.json');
  const table = data.tables.find((t) => t.id === 'ground-guided-area-air-defense');
  assert.ok(table, 'no se encontró la tabla ground-guided-area-air-defense');
  assert.ok(table.resolutionMechanic && table.resolutionMechanic.sourceRefs && table.resolutionMechanic.sourceRefs.length, 'resolutionMechanic sin sourceRefs');
  assert.ok(table.rowAxis.correctedLabel && table.rowAxis.correctedLabel.was && table.rowAxis.correctedLabel.reason, 'rowAxis.correctedLabel incompleto');
});

test('units/registry-index.json: sincronizado con las 264 unidades reales de data/ammunition/{attack-plans,naval-plans,special-unit-plans}/ y data/units/ (regenerar con scripts/build-unit-registry.js si falla)', () => {
  const SOURCES = [
    { dir: 'ammunition/attack-plans', keys: [{ key: 'units', domain: 'attack-plan' }] },
    { dir: 'ammunition/naval-plans', keys: [{ key: 'surfaceShips', domain: 'naval-surface' }, { key: 'submarines', domain: 'naval-submarine' }] },
    { dir: 'ammunition/special-unit-plans', keys: [{ key: 'units', domain: 'special-unit' }] },
    { dir: 'units', keys: [{ key: 'groundFormations', domain: 'ground-formation' }, { key: 'supportSystems', domain: 'support-system' }] }
  ];
  const expectedIds = new Set();
  SOURCES.forEach(({ dir, keys }) => {
    fs.readdirSync(path.join(DATA_DIR, dir)).filter((f) => f.endsWith('.json')).forEach((file) => {
      const data = readJson(`${dir}/${file}`);
      keys.forEach(({ key }) => (data[key] || []).forEach((u) => expectedIds.add(u.id)));
    });
  });
  const registry = readJson('units/registry-index.json');
  const registryIds = new Set(registry.entries.map((e) => e.id));
  assert.equal(registry.entries.length, expectedIds.size, 'el número de entradas del registro no coincide con el de unidades reales');
  assert.deepEqual([...registryIds].sort(), [...expectedIds].sort(), 'registry-index.json desincronizado con las unidades reales');
  for (const entry of registry.entries) {
    assert.ok(fs.existsSync(path.join(DATA_DIR, '..', entry.file)), `registry-index.json referencia un archivo inexistente: ${entry.file}`);
  }
});

test('phases/source-images/index.json: 17 páginas de puertos y 15 de aeródromos, todas presentes en disco', () => {
  const data = readJson('phases/source-images/index.json');
  assert.equal(data.puertos.length, 17, 'deberían ser 17 páginas de "Aeródromos y puertos 1.pdf" (puertos)');
  assert.equal(data.aerodromos.length, 15, 'deberían ser 15 páginas de "Aeródromos y puertos 2.pdf" (aeródromos)');
  for (const entry of [...data.puertos, ...data.aerodromos]) {
    const filePath = path.join(DATA_DIR, 'phases', 'source-images', entry.image);
    assert.ok(fs.existsSync(filePath), `falta la imagen "${entry.image}" referenciada en el índice`);
  }
});

test('sources.json: sin IDs duplicados', () => {
  const data = readJson('sources/sources.json');
  const ids = data.sources.map((s) => s.id);
  assert.equal(ids.length, new Set(ids).size, 'hay IDs de fuente duplicados');
});

// --- Planes de ataque (data/ammunition/attack-plans/) ---

const PLANS_DIR = path.join(DATA_DIR, 'ammunition', 'attack-plans');

function attackPlanFiles() {
  if (!fs.existsSync(PLANS_DIR)) return [];
  return fs.readdirSync(PLANS_DIR).filter((f) => f.endsWith('.json'));
}

function eachPlan(data, visit) {
  for (const unit of data.units) {
    for (const domain of ['antiShip', 'landAttack']) {
      for (const [letter, plan] of Object.entries(unit.plans[domain] || {})) {
        visit(plan, `${unit.id}/${domain}/${letter}`);
      }
    }
  }
}

function iconCatalogIds() {
  const xml = fs.readFileSync(
    path.join(DATA_DIR, 'sources', 'tcw_attack_workflows', 'index.xml'),
    'utf8'
  );
  return new Set([...xml.matchAll(/<icon id="([^"]+)"/g)].map((m) => m[1]));
}

test('attack-plans: IDs de unidad únicos dentro de cada país', () => {
  for (const file of attackPlanFiles()) {
    const data = readJson(path.join('ammunition', 'attack-plans', file));
    const ids = data.units.map((u) => u.id);
    assert.equal(ids.length, new Set(ids).size, `${file}: hay IDs de unidad duplicados`);
  }
});

test('attack-plans: loadFormat coherente con los valores transcritos', () => {
  for (const file of attackPlanFiles()) {
    const data = readJson(path.join('ammunition', 'attack-plans', file));
    eachPlan(data, (plan, where) => {
      assert.ok(['single', 'dual'].includes(plan.loadFormat), `${file} ${where}: loadFormat inválido`);
      for (const state of ['full', 'damaged']) {
        const v = plan[state];
        assert.ok(v, `${file} ${where}: falta "${state}"`);
        if (plan.loadFormat === 'dual') {
          // heavy puede ser null: significa que esa unidad no tiene variante de carga
          // pesada para esa munición (visto como "-/X" en la hoja), no que valga 0.
          assert.ok((v.heavy === null || typeof v.heavy === 'number') && typeof v.light === 'number',
            `${file} ${where}.${state}: loadFormat "dual" exige heavy (número o null) y light numérico`);
          assert.equal(v.damage, undefined, `${file} ${where}.${state}: "dual" no debe llevar damage`);
        } else {
          assert.ok(typeof v.damage === 'number',
            `${file} ${where}.${state}: loadFormat "single" exige damage numérico`);
          assert.equal(v.heavy, undefined, `${file} ${where}.${state}: "single" no debe llevar heavy`);
        }
      }
    });
  }
});

test('attack-plans: todo plan declara rango en completa y dañada', () => {
  // El superíndice de la tabla es el rango; su ausencia se transcribe como 0,
  // nunca se omite, para poder distinguir "rango 0" de "sin transcribir".
  for (const file of attackPlanFiles()) {
    const data = readJson(path.join('ammunition', 'attack-plans', file));
    eachPlan(data, (plan, where) => {
      for (const state of ['full', 'damaged']) {
        assert.ok(Number.isInteger(plan[state].range) && plan[state].range >= 0,
          `${file} ${where}.${state}: range ausente o inválido`);
      }
    });
  }
});

test('attack-plans: todo plan tiene munición e iconos del catálogo', () => {
  const catalog = iconCatalogIds();
  for (const file of attackPlanFiles()) {
    const data = readJson(path.join('ammunition', 'attack-plans', file));
    eachPlan(data, (plan, where) => {
      assert.ok(plan.munition && plan.munition.length > 0, `${file} ${where}: sin nombre de munición`);
      assert.ok(Array.isArray(plan.icons) && plan.icons.length > 0, `${file} ${where}: sin iconos`);
      for (const icon of plan.icons) {
        assert.ok(catalog.has(icon), `${file} ${where}: icono "${icon}" no existe en el catálogo`);
      }
    });
  }
});

test('attack-plans: cada archivo declara sourceRefs y estado de transcripción', () => {
  for (const file of attackPlanFiles()) {
    const data = readJson(path.join('ammunition', 'attack-plans', file));
    assert.ok(Array.isArray(data.sourceRefs) && data.sourceRefs.length > 0, `${file}: sin sourceRefs`);
    assert.ok(['partial', 'complete'].includes(data.status), `${file}: status inválido`);
    if (data.status === 'partial') {
      assert.ok(Array.isArray(data.pendingSheets) && data.pendingSheets.length > 0,
        `${file}: status "partial" exige pendingSheets no vacío`);
    }
    for (const unit of data.units) {
      assert.ok(unit.sourceSheet, `${file}: unidad "${unit.id}" sin sourceSheet`);
    }
  }
});

// --- Planes de unidad especial: sin fila danada (data/ammunition/special-unit-plans/) ---

const SPECIAL_DIR = path.join(DATA_DIR, 'ammunition', 'special-unit-plans');

function specialPlanFiles() {
  if (!fs.existsSync(SPECIAL_DIR)) return [];
  return fs.readdirSync(SPECIAL_DIR).filter((f) => f.endsWith('.json'));
}

function eachSpecialPlan(data, visit) {
  for (const unit of data.units) {
    if (unit.domainSplit) {
      for (const domain of ['antiShip', 'landAttack']) {
        for (const [letter, plan] of Object.entries(unit.plans[domain] || {})) {
          visit(plan, `${unit.id}/${domain}/${letter}`);
        }
      }
    } else {
      for (const [letter, plan] of Object.entries(unit.plans || {})) {
        visit(plan, `${unit.id}/${letter}`);
      }
    }
  }
}

test('special-unit-plans: IDs de unidad únicos dentro de cada país', () => {
  for (const file of specialPlanFiles()) {
    const data = readJson(path.join('ammunition', 'special-unit-plans', file));
    const ids = data.units.map((u) => u.id);
    assert.equal(ids.length, new Set(ids).size, `${file}: hay IDs de unidad duplicados`);
  }
});

test('special-unit-plans: ningún plan declara estado "damaged" (esa es la razón de ser del archivo)', () => {
  for (const file of specialPlanFiles()) {
    const data = readJson(path.join('ammunition', 'special-unit-plans', file));
    eachSpecialPlan(data, (plan, where) => {
      assert.equal(plan.damaged, undefined,
        `${file} ${where}: tiene "damaged"; pertenece a data/ammunition/attack-plans/, no aquí`);
      assert.ok(plan.full, `${file} ${where}: falta "full"`);
    });
  }
});

test('special-unit-plans: loadFormat coherente, y solo celdas explícitamente vacías carecen de munición', () => {
  for (const file of specialPlanFiles()) {
    const data = readJson(path.join('ammunition', 'special-unit-plans', file));
    eachSpecialPlan(data, (plan, where) => {
      assert.ok(['single', 'dual'].includes(plan.loadFormat), `${file} ${where}: loadFormat inválido`);
      if (plan.munition === null) {
        assert.ok(Array.isArray(plan.icons) && plan.icons.length === 0,
          `${file} ${where}: munición nula debe declarar icons: [] explícitamente`);
        return;
      }
      assert.ok(plan.munition && plan.munition.length > 0, `${file} ${where}: sin nombre de munición`);
      if (plan.loadFormat === 'dual') {
        assert.ok(typeof plan.full.heavy === 'number' && typeof plan.full.light === 'number',
          `${file} ${where}: loadFormat "dual" exige heavy y light numéricos`);
      } else {
        assert.ok(typeof plan.full.damage === 'number',
          `${file} ${where}: loadFormat "single" exige damage numérico`);
      }
      assert.ok(Number.isInteger(plan.full.range) && plan.full.range >= 0, `${file} ${where}: range ausente o inválido`);
    });
  }
});

test('special-unit-plans: iconos usados existen en el catálogo', () => {
  const catalog = iconCatalogIds();
  for (const file of specialPlanFiles()) {
    const data = readJson(path.join('ammunition', 'special-unit-plans', file));
    eachSpecialPlan(data, (plan, where) => {
      for (const icon of plan.icons || []) {
        assert.ok(catalog.has(icon), `${file} ${where}: icono "${icon}" no existe en el catálogo`);
      }
    });
  }
});

test('special-unit-plans: cada archivo declara sourceRefs y estado de transcripción', () => {
  for (const file of specialPlanFiles()) {
    const data = readJson(path.join('ammunition', 'special-unit-plans', file));
    assert.ok(Array.isArray(data.sourceRefs) && data.sourceRefs.length > 0, `${file}: sin sourceRefs`);
    assert.ok(['partial', 'complete'].includes(data.status), `${file}: status inválido`);
    if (data.status === 'partial') {
      assert.ok(Array.isArray(data.pendingSheets) && data.pendingSheets.length > 0,
        `${file}: status "partial" exige pendingSheets no vacío`);
    }
    for (const unit of data.units) {
      assert.ok(unit.sourceSheet, `${file}: unidad "${unit.id}" sin sourceSheet`);
      assert.equal(typeof unit.domainSplit, 'boolean', `${file}: unidad "${unit.id}" sin domainSplit`);
    }
  }
});

// --- Planes navales (data/ammunition/naval-plans/) ---

const NAVAL_DIR = path.join(DATA_DIR, 'ammunition', 'naval-plans');

function navalPlanFiles() {
  if (!fs.existsSync(NAVAL_DIR)) return [];
  return fs.readdirSync(NAVAL_DIR).filter((f) => f.endsWith('.json'));
}

function eachNavalUnit(data, visit) {
  for (const unit of data.surfaceShips || []) visit(unit, 'surfaceShips');
  for (const unit of data.submarines || []) visit(unit, 'submarines');
}

test('naval-plans: IDs de unidad únicos dentro de cada país', () => {
  for (const file of navalPlanFiles()) {
    const data = readJson(path.join('ammunition', 'naval-plans', file));
    const ids = [];
    eachNavalUnit(data, (u) => ids.push(u.id));
    assert.equal(ids.length, new Set(ids).size, `${file}: hay IDs de unidad duplicados`);
  }
});

test('naval-plans: hasFullDamagedRows coherente con los valores transcritos', () => {
  const catalog = iconCatalogIds();
  for (const file of navalPlanFiles()) {
    const data = readJson(path.join('ammunition', 'naval-plans', file));
    eachNavalUnit(data, (unit, group) => {
      assert.equal(typeof unit.hasFullDamagedRows, 'boolean', `${file} ${group}/${unit.id}: falta hasFullDamagedRows`);
      for (const domain of ['antiShip', 'landAttack']) {
        for (const [letter, plan] of Object.entries(unit.plans[domain] || {})) {
          const where = `${file} ${group}/${unit.id}/${domain}/${letter}`;
          assert.ok(plan.munition && plan.icons, `${where}: falta munición o icons`);
          for (const icon of plan.icons) {
            assert.ok(catalog.has(icon), `${where}: icono "${icon}" no existe en el catálogo`);
          }
          assert.ok(typeof plan.full.damage === 'number', `${where}: full.damage no numérico`);
          if (unit.hasFullDamagedRows) {
            assert.ok(plan.damaged && typeof plan.damaged.damage === 'number',
              `${where}: hasFullDamagedRows=true exige "damaged" numérico`);
          } else {
            assert.equal(plan.damaged, undefined, `${where}: hasFullDamagedRows=false no debe llevar "damaged"`);
          }
        }
      }
    });
  }
});

test('naval-plans: cada archivo declara sourceRefs y estado de transcripción', () => {
  for (const file of navalPlanFiles()) {
    const data = readJson(path.join('ammunition', 'naval-plans', file));
    assert.ok(Array.isArray(data.sourceRefs) && data.sourceRefs.length > 0, `${file}: sin sourceRefs`);
    assert.ok(['partial', 'complete'].includes(data.status), `${file}: status inválido`);
    if (data.status === 'partial') {
      assert.ok(Array.isArray(data.pendingSheets) && data.pendingSheets.length > 0,
        `${file}: status "partial" exige pendingSheets no vacío`);
    }
  }
});

// --- Factores base de ficha, sin plan de ataque (data/units/) ---

const UNITS_DIR = path.join(DATA_DIR, 'units');

function unitFiles() {
  if (!fs.existsSync(UNITS_DIR)) return [];
  // registry-index.json es un índice generado (scripts/build-unit-registry.js),
  // no un archivo de datos por país: tiene su propio test de integridad más abajo.
  return fs.readdirSync(UNITS_DIR).filter((f) => f.endsWith('.json') && f !== 'registry-index.json');
}

test('units: formaciones y sistemas de apoyo tienen IDs únicos y valores numéricos', () => {
  for (const file of unitFiles()) {
    const data = readJson(path.join('units', file));
    const ids = [
      ...(data.groundFormations || []).map((f) => f.id),
      ...(data.supportSystems || []).map((s) => s.id),
    ];
    assert.equal(ids.length, new Set(ids).size, `${file}: hay IDs duplicados`);
    for (const formation of data.groundFormations || []) {
      assert.ok(typeof formation.attack === 'number' && typeof formation.defense === 'number',
        `${file}: formación "${formation.id}" con attack/defense no numéricos`);
    }
    for (const system of data.supportSystems || []) {
      assert.ok(typeof system.value === 'number', `${file}: sistema "${system.id}" con value no numérico`);
    }
  }
});

test('units: cada archivo declara sourceRefs y estado de transcripción', () => {
  for (const file of unitFiles()) {
    const data = readJson(path.join('units', file));
    assert.ok(Array.isArray(data.sourceRefs) && data.sourceRefs.length > 0, `${file}: sin sourceRefs`);
    assert.ok(['partial', 'complete'].includes(data.status), `${file}: status inválido`);
    if (data.status === 'partial') {
      assert.ok(Array.isArray(data.pendingSheets) && data.pendingSheets.length > 0,
        `${file}: status "partial" exige pendingSheets no vacío`);
    }
  }
});

// --- Mapa de factores de ficha (data/counters/factor-map.json) ---

test('factor-map.json: cada factor referenciado en un counterTemplate existe en factorVocabulary', () => {
  const data = readJson('counters/factor-map.json');
  for (const tmpl of data.counterTemplates) {
    for (const entry of tmpl.factors) {
      assert.ok(data.factorVocabulary[entry.factor],
        `${tmpl.id}: factor "${entry.factor}" no está en factorVocabulary`);
    }
  }
});

test('factor-map.json: IDs de counterTemplate únicos y con sourceRefs', () => {
  const data = readJson('counters/factor-map.json');
  const ids = data.counterTemplates.map((t) => t.id);
  assert.equal(ids.length, new Set(ids).size, 'hay IDs de counterTemplate duplicados');
  for (const tmpl of data.counterTemplates) {
    assert.ok(Array.isArray(tmpl.sourceRefs) && tmpl.sourceRefs.length > 0, `${tmpl.id}: sin sourceRefs`);
    assert.ok(Array.isArray(tmpl.factors) && tmpl.factors.length > 0, `${tmpl.id}: sin factors`);
  }
});

test('factor-map.json: los factores con roleBands declaran banda para atacante y objetivo', () => {
  const data = readJson('counters/factor-map.json');
  for (const tmpl of data.counterTemplates) {
    for (const entry of tmpl.factors) {
      if (entry.roleBands) {
        assert.ok(Array.isArray(entry.roleBands.attacker) && entry.roleBands.attacker.length > 0,
          `${tmpl.id}.${entry.factor}: roleBands sin banda de atacante`);
        assert.ok(Array.isArray(entry.roleBands.target) && entry.roleBands.target.length > 0,
          `${tmpl.id}.${entry.factor}: roleBands sin banda de objetivo`);
      }
    }
  }
});

test('factor-map.json: cada counterTemplate declara un region valido dentro de una imagen de counters existente', () => {
  const data = readJson('counters/factor-map.json');
  const validImages = new Set(['counters-aereos.jpg', 'resto-counters.jpg']);
  for (const tmpl of data.counterTemplates) {
    assert.ok(tmpl.region, `${tmpl.id}: sin region`);
    assert.ok(validImages.has(tmpl.region.sourceImage), `${tmpl.id}: region.sourceImage desconocido "${tmpl.region.sourceImage}"`);
    for (const key of ['xPct', 'yPct', 'wPct', 'hPct']) {
      const v = tmpl.region[key];
      assert.ok(typeof v === 'number' && v >= 0 && v <= 100, `${tmpl.id}: region.${key} fuera de rango [0,100]`);
    }
    assert.ok(tmpl.region.xPct + tmpl.region.wPct <= 100.5, `${tmpl.id}: region se sale del ancho de la imagen`);
    assert.ok(tmpl.region.yPct + tmpl.region.hPct <= 100.5, `${tmpl.id}: region se sale del alto de la imagen`);
  }
});

test('factor-map.json: todo factor.position usado tiene una entrada en positionBoxes', () => {
  const data = readJson('counters/factor-map.json');
  for (const tmpl of data.counterTemplates) {
    for (const entry of tmpl.factors) {
      assert.ok(data.positionBoxes[entry.position],
        `${tmpl.id}.${entry.factor}: position "${entry.position}" no está en positionBoxes`);
    }
  }
});

test('factor-map.json: crossReferences apuntan a un counterTemplate existente', () => {
  const data = readJson('counters/factor-map.json');
  const templateIds = new Set(data.counterTemplates.map((t) => t.id));
  for (const ref of data.crossReferences) {
    assert.ok(Array.isArray(ref.counterTemplateIds) && ref.counterTemplateIds.length > 0,
      `crossReference "${ref.ambiguity}" sin counterTemplateIds`);
    for (const tid of ref.counterTemplateIds) {
      assert.ok(templateIds.has(tid), `crossReference "${ref.ambiguity}" apunta a counterTemplate inexistente "${tid}"`);
    }
  }
});

// --- Ficha de misiones aereas (data/missions/air-missions.json) ---

const VALID_DURATION_TYPES = ['short', 'long'];
const VALID_MISSION_TYPES = ['point', 'area'];
const VALID_RANGE_MULTIPLIERS = [1, 2, 5];

test('air-missions.json: IDs de mision (y de variantes/subtipos) unicos', () => {
  const data = readJson('missions/air-missions.json');
  const ids = [];
  for (const mission of data.missions) {
    ids.push(mission.id);
    for (const variant of mission.variants || []) ids.push(variant.id);
    for (const subtype of mission.subtypes || []) ids.push(subtype.id);
  }
  assert.equal(ids.length, new Set(ids).size, 'hay IDs de mision/variante/subtipo duplicados');
});

test('air-missions.json: cada mision (o su variante) tiene rangeMultiplier valido y sourceRefs', () => {
  const data = readJson('missions/air-missions.json');
  for (const mission of data.missions) {
    assert.ok(Array.isArray(mission.sourceRefs) && mission.sourceRefs.length > 0,
      `mision "${mission.id}" sin sourceRefs`);
    if (mission.variants) {
      for (const variant of mission.variants) {
        assert.ok(VALID_RANGE_MULTIPLIERS.includes(variant.rangeMultiplier),
          `variante "${variant.id}" con rangeMultiplier invalido`);
        assert.ok(VALID_DURATION_TYPES.includes(variant.durationType),
          `variante "${variant.id}" con durationType invalido`);
      }
    } else if (!mission.isProcedure && !mission.isAdditionalState) {
      assert.ok(VALID_RANGE_MULTIPLIERS.includes(mission.rangeMultiplier),
        `mision "${mission.id}" con rangeMultiplier invalido`);
    }
    if (mission.durationType) {
      assert.ok(VALID_DURATION_TYPES.includes(mission.durationType),
        `mision "${mission.id}" con durationType invalido`);
    }
    if (mission.missionType) {
      assert.ok(VALID_MISSION_TYPES.includes(mission.missionType),
        `mision "${mission.id}" con missionType invalido`);
    }
  }
});

test('air-missions.json: los subtipos de reaccion de on-call estan marcados isReaction', () => {
  const data = readJson('missions/air-missions.json');
  const onCall = data.missions.find((m) => m.id === 'on-call');
  assert.ok(onCall && Array.isArray(onCall.subtypes) && onCall.subtypes.length > 0, 'no se encontro on-call con subtypes');
  const reactionIds = onCall.subtypes.filter((s) => s.isReaction).map((s) => s.id);
  assert.deepEqual(reactionIds.sort(), ['as', 'bai', 'cf', 'kb'], 'los subtipos de reaccion de on-call no coinciden con CF/BAI/KB/AS de AGENTS.md');
});

// --- Workflows de combate convertidos de XML (data/workflows/) ---

const WORKFLOWS_DIR = path.join(DATA_DIR, 'workflows');

function workflowFiles() {
  return fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
}

function allQuestionIdsByStage(wf) {
  const map = {};
  for (const st of wf.stages) map[st.id] = st.questions.map((q) => q.id);
  return map;
}

test('workflows: index.json lista exactamente los mismos archivos que existen en el directorio', () => {
  const index = readJson('workflows/index.json');
  const filesOnDisk = workflowFiles().sort();
  const filesInIndex = index.files.map((f) => f.file).sort();
  assert.deepEqual(filesInIndex, filesOnDisk, 'index.json desincronizado con los archivos de data/workflows/');
});

test('workflows: cada archivo referencia un sourceXml existente en data/sources/tcw_attack_workflows/', () => {
  const REPO_ROOT = path.join(__dirname, '..');
  for (const file of workflowFiles()) {
    const wf = readJson(path.join('workflows', file));
    assert.ok(wf.sourceXml, `${file}: sin sourceXml`);
    assert.ok(fs.existsSync(path.join(REPO_ROOT, wf.sourceXml)), `${file}: sourceXml "${wf.sourceXml}" no existe`);
  }
});

test('workflows: IDs de pregunta únicos dentro de cada stage', () => {
  for (const file of workflowFiles()) {
    const wf = readJson(path.join('workflows', file));
    for (const st of wf.stages) {
      const ids = st.questions.map((q) => q.id);
      assert.equal(ids.length, new Set(ids).size, `${file}: stage "${st.id}" con IDs de pregunta duplicados`);
    }
  }
});

test('workflows: showIf referencia una pregunta existente en el mismo stage', () => {
  for (const file of workflowFiles()) {
    const wf = readJson(path.join('workflows', file));
    for (const st of wf.stages) {
      const idsInStage = new Set(st.questions.map((q) => q.id));
      for (const question of st.questions) {
        if (question.showIf) {
          assert.ok(idsInStage.has(question.showIf.questionId),
            `${file}: showIf de "${question.id}" referencia "${question.showIf.questionId}", inexistente en stage "${st.id}"`);
          assert.notEqual(question.showIf.questionId, question.id, `${file}: showIf de "${question.id}" se referencia a sí misma`);
        }
      }
    }
  }
});

test('workflows: parallelGroups solo referencian IDs de pregunta existentes en el stage, sin duplicados entre grupos', () => {
  for (const file of workflowFiles()) {
    const wf = readJson(path.join('workflows', file));
    for (const st of wf.stages) {
      if (!st.parallelGroups) continue;
      const idsInStage = new Set(st.questions.map((q) => q.id));
      const seen = new Set();
      for (const group of st.parallelGroups) {
        for (const qid of group) {
          assert.ok(idsInStage.has(qid), `${file}: parallelGroups de stage "${st.id}" referencia "${qid}", inexistente`);
          assert.ok(!seen.has(qid), `${file}: "${qid}" aparece en más de un parallelGroup del stage "${st.id}"`);
          seen.add(qid);
        }
      }
    }
  }
});

test('workflows: flowCuts y diceRules referencian un stage (y pregunta, si la indican) existentes', () => {
  for (const file of workflowFiles()) {
    const wf = readJson(path.join('workflows', file));
    const stageMap = allQuestionIdsByStage(wf);
    const stageIds = new Set(Object.keys(stageMap));
    for (const cut of wf.flowCuts || []) {
      assert.ok(stageIds.has(cut.stage), `${file}: flowCut referencia stage inexistente "${cut.stage}"`);
      if (cut.question) assert.ok(stageMap[cut.stage].includes(cut.question),
        `${file}: flowCut referencia pregunta inexistente "${cut.question}" en stage "${cut.stage}"`);
    }
    for (const dr of wf.diceRules || []) {
      assert.ok(stageIds.has(dr.stage), `${file}: diceRule referencia stage inexistente "${dr.stage}"`);
      if (dr.question) assert.ok(stageMap[dr.stage].includes(dr.question),
        `${file}: diceRule referencia pregunta inexistente "${dr.question}" en stage "${dr.stage}"`);
    }
    for (const rr of wf.rollDependentRules || []) {
      assert.ok(stageIds.has(rr.stage), `${file}: rollDependentRule referencia stage inexistente "${rr.stage}"`);
    }
  }
});

test('table-routing.json: cada hoja del árbol referencia un workflowFile existente cuyo id coincide', () => {
  const REPO_ROOT = path.join(__dirname, '..');
  const routing = readJson('routing/table-routing.json');
  const referencedIds = new Set();

  function walk(node) {
    for (const option of node.options) {
      if (option.leaf) {
        for (const key of ['workflowId', 'attackWorkflowId']) {
          const id = option.leaf[key];
          if (!id) continue;
          const fileKey = key === 'workflowId' ? 'workflowFile' : 'attackWorkflowFile';
          const filePath = option.leaf[fileKey];
          assert.ok(filePath, `hoja "${option.value}": tiene ${key} pero no ${fileKey}`);
          assert.ok(fs.existsSync(path.join(REPO_ROOT, filePath)), `hoja "${option.value}": ${fileKey} "${filePath}" no existe`);
          const wf = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, filePath), 'utf8'));
          assert.equal(wf.id, id, `hoja "${option.value}": ${key} "${id}" no coincide con el id real de ${filePath} ("${wf.id}")`);
          referencedIds.add(id);
        }
      } else if (option.leaf === undefined && !option.next) {
        assert.fail(`hoja "${option.value}" no tiene ni "leaf" ni "next"`);
      }
      if (option.next) walk(option.next);
    }
  }
  walk(routing.root);

  const workflowIds = workflowFiles().map((f) => readJson(path.join('workflows', f)).id);
  for (const id of workflowIds) {
    assert.ok(referencedIds.has(id), `el workflow "${id}" no está referenciado por ninguna hoja de table-routing.json`);
  }
});

test('table-routing.json: gaps referencian una ruta real del árbol (leaf null)', () => {
  const routing = readJson('routing/table-routing.json');
  for (const gap of routing.gaps || []) {
    let container = routing.root;
    let option;
    for (const step of gap.path) {
      option = container.options.find((o) => o.value === step);
      assert.ok(option, `gap con path ${JSON.stringify(gap.path)}: paso "${step}" no existe en el árbol`);
      container = option.next;
    }
    assert.equal(option.leaf, null, `gap con path ${JSON.stringify(gap.path)} no apunta a una hoja con leaf: null`);
  }
});

test('workflows: cada efecto usa un type reconocido (modifier, rule, dice, range)', () => {
  const VALID_EFFECT_TYPES = ['modifier', 'rule', 'dice', 'range'];
  for (const file of workflowFiles()) {
    const wf = readJson(path.join('workflows', file));
    for (const st of wf.stages) {
      for (const question of st.questions) {
        for (const option of question.options || []) {
          for (const effect of option.effects || []) {
            assert.ok(VALID_EFFECT_TYPES.includes(effect.type),
              `${file}: efecto con type desconocido "${effect.type}" en ${st.id}.${question.id}.${option.value}`);
          }
        }
      }
    }
  }
});

// --- Tablas de combate transcritas de Tablas-de-combate 5.pdf (data/tables/) ---

const TABLES_DIR = path.join(DATA_DIR, 'tables');

function tablePageFiles() {
  return fs.readdirSync(TABLES_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
}

function tableColumnCount(table) {
  if (Array.isArray(table.columnAxis.values)) return table.columnAxis.values.length;
  if (table.columnAxis.variants) return Object.values(table.columnAxis.variants)[0].length;
  return null;
}

test('data/tables: index.json lista exactamente los mismos archivos que existen en el directorio', () => {
  const index = readJson('tables/index.json');
  const filesOnDisk = tablePageFiles().sort();
  const filesInIndex = index.pages.map((p) => p.file).sort();
  assert.deepEqual(filesInIndex, filesOnDisk, 'index.json desincronizado con los archivos de data/tables/');
});

test('data/tables: cada sub-tabla tiene cells con las dimensiones de rowAxis/columnAxis', () => {
  for (const file of tablePageFiles()) {
    const page = readJson(path.join('tables', file));
    for (const table of page.tables || []) {
      const cols = tableColumnCount(table);
      assert.ok(Array.isArray(table.cells), `${file}: tabla "${table.id}" sin cells`);
      assert.equal(table.cells.length, table.rowAxis.values.length,
        `${file}: tabla "${table.id}" tiene ${table.cells.length} filas, rowAxis declara ${table.rowAxis.values.length}`);
      if (cols !== null) {
        table.cells.forEach((row, i) => {
          assert.equal(row.length, cols, `${file}: tabla "${table.id}" fila ${i} tiene ${row.length} columnas, se esperaban ${cols}`);
        });
      }
    }
  }
});

test('data/tables: cada sub-tabla y cada página declaran sourceRefs', () => {
  for (const file of tablePageFiles()) {
    const page = readJson(path.join('tables', file));
    assert.ok(Array.isArray(page.sourceRefs) && page.sourceRefs.length > 0, `${file}: página sin sourceRefs`);
    for (const table of page.tables || []) {
      assert.ok(Array.isArray(table.sourceRefs) && table.sourceRefs.length > 0, `${file}: tabla "${table.id}" sin sourceRefs`);
    }
  }
});

test('data/tables: reusesTable referencia un id de tabla que existe en otra página', () => {
  const allTableIds = new Set();
  for (const file of tablePageFiles()) {
    const page = readJson(path.join('tables', file));
    for (const table of page.tables || []) allTableIds.add(table.id);
  }
  for (const file of tablePageFiles()) {
    const page = readJson(path.join('tables', file));
    if (page.reusesTable) {
      assert.ok(allTableIds.has(page.reusesTable.id),
        `${file}: reusesTable.id "${page.reusesTable.id}" no existe como tabla real en ningún data/tables/*.json`);
    }
  }
});

test('data/tables: IDs de tabla únicos en todo el directorio', () => {
  const ids = [];
  for (const file of tablePageFiles()) {
    const page = readJson(path.join('tables', file));
    for (const table of page.tables || []) ids.push(table.id);
  }
  assert.equal(ids.length, new Set(ids).size, 'hay IDs de tabla duplicados entre distintas páginas de data/tables/');
});

test('detection/help-sheet.json: unitStates y exposureStates tienen IDs únicos y sourceRefs', () => {
  const data = readJson('detection/help-sheet.json');
  const stateIds = data.unitStates.states.map((s) => s.id);
  assert.equal(stateIds.length, new Set(stateIds).size, 'IDs de unitStates.states duplicados');
  assert.ok(data.unitStates.sourceRefs && data.unitStates.sourceRefs.length, 'unitStates sin sourceRefs');
  const exposureIds = data.exposureStates.states.map((s) => s.id);
  assert.equal(exposureIds.length, new Set(exposureIds).size, 'IDs de exposureStates.states duplicados');
  assert.ok(data.exposureStates.sourceRefs && data.exposureStates.sourceRefs.length, 'exposureStates sin sourceRefs');
});

test('detection/help-sheet.json: cada sección de dominio (air/naval/ground/electronic) declara sourceRefs', () => {
  const data = readJson('detection/help-sheet.json');
  for (const key of ['airDetection', 'navalDetection', 'groundDetection', 'electronicDetection']) {
    assert.ok(data[key] && data[key].sourceRefs && data[key].sourceRefs.length, `${key} sin sourceRefs`);
  }
});

test('detection/help-sheet.json: summaryMatrix tiene celdas cuadradas con las dimensiones de rowAxis/columnAxis', () => {
  const data = readJson('detection/help-sheet.json');
  const { rowAxis, columnAxis, cells, labels } = data.summaryMatrix;
  assert.equal(cells.length, rowAxis.values.length, 'summaryMatrix.cells no tiene una fila por cada valor de rowAxis');
  for (const row of cells) {
    assert.equal(row.length, columnAxis.values.length, 'una fila de summaryMatrix.cells no tiene una celda por cada valor de columnAxis');
  }
  for (const v of [...rowAxis.values, ...columnAxis.values]) {
    assert.ok(labels[v], `summaryMatrix.labels no tiene etiqueta para el valor "${v}"`);
  }
});

test('detection/help-sheet.json#electronicDetection: detectorTypes/targetTypes/armException declaran sourceRefs propios (COR03-004, correcciones03.md)', () => {
  const data = readJson('detection/help-sheet.json');
  const elec = data.electronicDetection;
  assert.equal(elec.detectorTypes.types.length, 2, 'se esperan exactamente RADCM y CCD');
  assert.ok(elec.detectorTypes.sourceRefs && elec.detectorTypes.sourceRefs.length, 'detectorTypes sin sourceRefs');
  assert.ok(elec.targetTypes.types.length >= 4, 'se esperan al menos los 4 tipos de objetivo de la imagen transcrita');
  assert.ok(elec.targetTypes.sourceRefs && elec.targetTypes.sourceRefs.length, 'targetTypes sin sourceRefs');
  const surfaceShip = elec.targetTypes.types.find((t) => t.id === 'surface-ship');
  assert.ok(surfaceShip && surfaceShip.alwaysRadarOn === true, 'el tipo "surface-ship" debería declarar alwaysRadarOn');
  assert.ok(elec.armException && elec.armException.sourceRefs && elec.armException.sourceRefs.length, 'armException sin sourceRefs');
  const needsReviewTargets = elec.targetTypes.types.filter((t) => t.needsReview);
  needsReviewTargets.forEach((t) => assert.ok(t.needsReviewNote, `${t.id}: needsReview sin needsReviewNote explicando el motivo`));
});

test('detection/help-sheet.json: el ejemplo de CAPs tiene un caso por unidad de firma declarada y sourceRefs', () => {
  const data = readJson('detection/help-sheet.json');
  const example = data.airDetection.workedExample;
  assert.equal(example.units.length, 2, 'el ejemplo de CAPs debería comparar exactamente 2 unidades');
  for (const u of example.units) {
    assert.equal(typeof u.airSignature, 'number', `unidad "${u.id}" sin airSignature numérico`);
  }
  assert.ok(example.cases.length >= 3, 'el ejemplo de CAPs debería declarar los 3 casos (mutuo/unilateral/ninguno) de la hoja de ayuda');
  assert.ok(example.sourceRefs && example.sourceRefs.length, 'workedExample sin sourceRefs');
});

// COR02-006 (correcciones.02.md): los valores/listas fijos que antes vivían
// incrustados en public/js/detection-engine.js ahora viven aquí — estos
// tests protegen su esquema (tipos, ids únicos) para que public/js/views/help.js
// y detection-engine.js puedan seguir leyéndolos sin comprobar cada campo.
test('detection/help-sheet.json: lowAltitudeFixedRangeHex y terrainMultiplier son números positivos (antes constantes fijas en detection-engine.js)', () => {
  const data = readJson('detection/help-sheet.json');
  assert.equal(typeof data.airDetection.lowAltitudeFixedRangeHex, 'number');
  assert.ok(data.airDetection.lowAltitudeFixedRangeHex > 0);
  assert.equal(typeof data.groundDetection.mobileUnitDetectability.terrainMultiplier, 'number');
  assert.ok(data.groundDetection.mobileUnitDetectability.terrainMultiplier > 0);
});

test('detection/help-sheet.json: brieflyDetectableTriggers.actions tiene id+label únicos, e incluye las 4 acciones que detection-engine.js espera', () => {
  const data = readJson('detection/help-sheet.json');
  const actions = data.groundDetection.brieflyDetectableTriggers.actions;
  actions.forEach((a) => {
    assert.equal(typeof a.id, 'string');
    assert.equal(typeof a.label, 'string');
  });
  assert.deepEqual(actions.map((a) => a.id).sort(), ['fire', 'movement', 'retreat', 'support'].sort());
});

test('detection/help-sheet.json: whoCanDetect.capableTypes + cannotDetect no comparten ningún id (resolveGroundDetectorEligibility distingue por id, no por posición)', () => {
  const data = readJson('detection/help-sheet.json');
  const { capableTypes, cannotDetect } = data.groundDetection.whoCanDetect;
  [...capableTypes, ...cannotDetect].forEach((t) => {
    assert.equal(typeof t.id, 'string');
    assert.equal(typeof t.label, 'string');
  });
  const allIds = [...capableTypes, ...cannotDetect].map((t) => t.id);
  assert.equal(allIds.length, new Set(allIds).size, 'capableTypes y cannotDetect comparten al menos un id');
});

test('detection/help-sheet.json: navalDetection.detectedBy tiene ids únicos, y conditionLabel es null si y solo si alwaysCapable', () => {
  const data = readJson('detection/help-sheet.json');
  const rules = data.navalDetection.detectedBy;
  const ids = rules.map((r) => r.id);
  assert.equal(ids.length, new Set(ids).size, 'ids de navalDetection.detectedBy duplicados');
  rules.forEach((r) => {
    assert.equal(typeof r.alwaysCapable, 'boolean', `${r.id}: alwaysCapable debería ser boolean`);
    if (r.alwaysCapable) {
      assert.equal(r.conditionLabel, null, `${r.id}: alwaysCapable=true debería tener conditionLabel null`);
    } else {
      assert.equal(typeof r.conditionLabel, 'string', `${r.id}: alwaysCapable=false debería tener conditionLabel de texto`);
    }
  });
});

test('turn-template.json#sheet: las 14 bandas de día tienen índice único y consecutivo', () => {
  const data = readJson('phases/turn-template.json');
  const indices = data.sheet.dayBands.bands.map((b) => b.index);
  assert.equal(indices.length, 14, 'deberían ser 14 bandas de día (28 días / 2)');
  assert.deepEqual(indices, Array.from({ length: 14 }, (_, i) => i + 1), 'los índices de dayBands.bands deben ser 1..14 consecutivos');
});

test('turn-template.json: cada segmento de cada fase declara sheetSteps o sheetStepsNotPrinted explícitamente (nunca ambas cosas ni ninguna)', () => {
  const data = readJson('phases/turn-template.json');
  for (const impulse of Object.values(data.impulses)) {
    for (const seg of impulse.segments) {
      const hasSteps = Array.isArray(seg.sheetSteps);
      const hasFlag = seg.sheetStepsNotPrinted === true;
      assert.notEqual(hasSteps, hasFlag, `${impulse.id}/${seg.id}: debe declarar "sheetSteps" (transcritos) o "sheetStepsNotPrinted: true" (en blanco en la hoja), no ambas ni ninguna`);
    }
  }
});

test('rules/decision-book-excerpts.json: cada extracto tiene ID único, secciones citadas y al menos un punto o cita', () => {
  const data = readJson('rules/decision-book-excerpts.json');
  const ids = data.verifiedExcerpts.map((e) => e.id);
  assert.equal(ids.length, new Set(ids).size, 'IDs de verifiedExcerpts duplicados');
  for (const excerpt of data.verifiedExcerpts) {
    assert.ok(excerpt.sections, `${excerpt.id}: sin sección citada del Decision Book`);
    const hasContent = (excerpt.points && excerpt.points.length) || (excerpt.quotes && excerpt.quotes.length);
    assert.ok(hasContent, `${excerpt.id}: sin points ni quotes (extracto vacío)`);
  }
});

test('rules/decision-book-excerpts.json: los workflows referenciados en relatedWorkflow existen realmente', () => {
  const data = readJson('rules/decision-book-excerpts.json');
  const workflowsIndex = readJson('workflows/index.json');
  const validFiles = new Set(workflowsIndex.files.map((f) => f.file));
  for (const excerpt of data.verifiedExcerpts) {
    if (excerpt.relatedWorkflow) {
      assert.ok(validFiles.has(excerpt.relatedWorkflow.file), `${excerpt.id}: relatedWorkflow.file "${excerpt.relatedWorkflow.file}" no existe en data/workflows/index.json`);
    }
  }
});

// --- Imágenes de hoja completa de armamento (data/ammunition/source-pages/) ---

test('ammunition/source-pages/index.json: las 6 categorías de país tienen al menos una hoja, y el archivo de imagen existe', () => {
  const data = readJson('ammunition/source-pages/index.json');
  const expectedCountries = ['us', 'ch', 'jp', 'kr', 'kp', 'ru'];
  for (const country of expectedCountries) {
    const pages = data.byCountry[country];
    assert.ok(Array.isArray(pages) && pages.length > 0, `byCountry.${country}: sin hojas`);
    for (const page of pages) {
      const imgPath = path.join(DATA_DIR, 'ammunition', 'source-pages', page.image);
      assert.ok(fs.existsSync(imgPath), `byCountry.${country}: imagen "${page.image}" no existe en disco`);
      assert.ok(page.sourceDocument, `byCountry.${country}/${page.image}: sin sourceDocument`);
    }
  }
});

// --- Identificación visual en el Wizard (AGENTS.md §9.2) ---

test('public/js/**/*.js: cada appendFactorIdentificationHint(...) apunta a un template/factor real de factor-map.json', () => {
  // COR-005 paso 4: appendFactorIdentificationHint vive en core.js, pero sus
  // llamadas están en las vistas que lo consumen (hoy solo el wizard de
  // ataque guiado) — se recorre todo public/js/ en vez de solo app.js para
  // no perder cobertura cuando una llamada cambia de archivo.
  const jsDir = path.join(__dirname, '..', 'public', 'js');
  const jsFiles = fs.readdirSync(jsDir, { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(jsDir, f));
  const calls = [];
  jsFiles.forEach((filePath) => {
    const src = fs.readFileSync(filePath, 'utf8');
    for (const m of src.matchAll(/appendFactorIdentificationHint\(\s*\w+\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)) {
      calls.push(m);
    }
  });
  assert.ok(calls.length > 0, 'no se encontró ninguna llamada a appendFactorIdentificationHint en public/js/');
  const data = readJson('counters/factor-map.json');
  for (const [, templateId, factorId] of calls) {
    const tpl = data.counterTemplates.find((t) => t.id === templateId);
    assert.ok(tpl, `appendFactorIdentificationHint: template "${templateId}" no existe en factor-map.json`);
    assert.ok(tpl.factors.some((f) => f.factor === factorId), `appendFactorIdentificationHint: template "${templateId}" no tiene el factor "${factorId}"`);
  }
});

// --- Recorte por unidad de armamento (data/ammunition/source-pages/unit-regions.json) ---

test('ammunition/source-pages/unit-regions.json: cada region referencia una unidad real, una imagen existente, y no se sale de los limites', () => {
  const regionsData = readJson('ammunition/source-pages/unit-regions.json');
  const validImages = new Set(['ch-1.png', 'ch-2.png', 'ch-3.png', 'ch-4.png', 'us-1.png', 'us-2.png', 'us-3.png', 'us-4.png', 'jp-1.png', 'jp-2.png', 'kp-1.png', 'kp-2.png', 'kr-1.png', 'kr-2.png', 'ru-1.png', 'ru-2.png', 'ru-3.png']);

  const allUnitIds = new Set();
  for (const country of ['us', 'ch', 'jp', 'kr', 'kp', 'ru']) {
    const ap = readJson(`ammunition/attack-plans/${country}.json`);
    ap.units.forEach((u) => allUnitIds.add(u.id));
    const sp = readJson(`ammunition/special-unit-plans/${country}.json`);
    sp.units.forEach((u) => allUnitIds.add(u.id));
    const nv = readJson(`ammunition/naval-plans/${country}.json`);
    (nv.surfaceShips || []).forEach((u) => allUnitIds.add(u.id));
    (nv.submarines || []).forEach((u) => allUnitIds.add(u.id));
  }

  for (const [unitId, region] of Object.entries(regionsData.units)) {
    assert.ok(allUnitIds.has(unitId), `unit-regions.json: la unidad "${unitId}" no existe en ningún archivo de ammunition/`);
    assert.ok(validImages.has(region.sourceImage), `unit-regions.json: sourceImage desconocido "${region.sourceImage}" para "${unitId}"`);
    for (const key of ['xPct', 'yPct', 'wPct', 'hPct']) {
      const v = region[key];
      assert.ok(typeof v === 'number' && v >= 0 && v <= 100, `unit-regions.json: ${unitId}.${key} fuera de rango [0,100]`);
    }
    assert.ok(region.xPct + region.wPct <= 100.5, `unit-regions.json: ${unitId} region se sale del ancho de la imagen`);
    assert.ok(region.yPct + region.hPct <= 100.5, `unit-regions.json: ${unitId} region se sale del alto de la imagen`);
  }
});

// COR02-009 (correcciones.02.md): la comprobación de arriba solo verifica el
// sentido "cada región apunta a una unidad real" — nunca el inverso ("cada
// unidad de armamento ya transcrita tiene su región"), así que una unidad
// eliminada por accidente de unit-regions.json (o nunca añadida) pasaba
// desapercibida mientras la afirmación "cobertura completa 198/198" (ver
// unit-regions.json#coverage y AGENTS.md §3.5) no estuviera protegida contra
// regresiones. Este test compara ambos conjuntos por igualdad exacta.
test('ammunition/source-pages/unit-regions.json: cobertura 198/198 — cada unidad de attack-plans/special-unit-plans/naval-plans tiene EXACTAMENTE una región, sin huecos ni sobrantes', () => {
  const regionsData = readJson('ammunition/source-pages/unit-regions.json');

  const expectedUnitIds = new Set();
  for (const country of ['us', 'ch', 'jp', 'kr', 'kp', 'ru']) {
    const ap = readJson(`ammunition/attack-plans/${country}.json`);
    ap.units.forEach((u) => expectedUnitIds.add(u.id));
    const sp = readJson(`ammunition/special-unit-plans/${country}.json`);
    sp.units.forEach((u) => expectedUnitIds.add(u.id));
    const nv = readJson(`ammunition/naval-plans/${country}.json`);
    (nv.surfaceShips || []).forEach((u) => expectedUnitIds.add(u.id));
    (nv.submarines || []).forEach((u) => expectedUnitIds.add(u.id));
  }

  const regionUnitIds = new Set(Object.keys(regionsData.units));

  const missing = [...expectedUnitIds].filter((id) => !regionUnitIds.has(id)).sort();
  const extra = [...regionUnitIds].filter((id) => !expectedUnitIds.has(id)).sort();

  assert.deepEqual(missing, [], `unit-regions.json: faltan ${missing.length} unidad(es) ya transcrita(s) sin región: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `unit-regions.json: ${extra.length} región(es) sobrante(s) sin unidad correspondiente en ammunition/: ${extra.join(', ')}`);
  assert.equal(regionUnitIds.size, expectedUnitIds.size, 'unit-regions.json: el número de regiones no coincide con el número de unidades esperadas (posible clave JSON duplicada, silenciosamente colapsada por JSON.parse)');
  assert.equal(expectedUnitIds.size, 198, `el conjunto de unidades esperadas ya no tiene 198 elementos (tiene ${expectedUnitIds.size}) — revisar también la afirmación de unit-regions.json#coverage y AGENTS.md/development_status.md si cambia legítimamente`);
});

// --- Trazabilidad de fuentes (COR02-007, correcciones.02.md) ---

// Fuentes cuyo `filename` es una descripción agregada (no un único archivo
// resoluble en disco tal cual) o cuya ubicación real no es la raíz del
// repositorio — se excluyen de la comprobación de existencia en disco de
// más abajo, pero SÍ participan en la resolución de sourceId/document de
// cualquier sourceRef que las cite por su id.
const AGGREGATE_OR_NON_ROOT_SOURCE_IDS = new Set(['tablas-armamento', 'attack-workflows-xml', 'attack-workflows-json', 'phase-help-xml', 'indicaciones-mantenedor']);

function collectSourceReferences(dataDir) {
  const found = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.json') || full === path.join(dataDir, 'sources', 'sources.json')) continue;
      const rel = path.relative(dataDir, full);
      let parsed;
      try { parsed = JSON.parse(fs.readFileSync(full, 'utf8')); } catch (e) { continue; }
      (function visit(obj) {
        if (Array.isArray(obj)) { obj.forEach(visit); return; }
        if (!obj || typeof obj !== 'object') return;
        if (obj.document || obj.sourceDocument || obj.sourceId) {
          found.push({ file: rel, document: obj.document, sourceDocument: obj.sourceDocument, sourceId: obj.sourceId });
        }
        for (const k in obj) visit(obj[k]);
      })(parsed);
    }
  }
  walk(dataDir);
  return found;
}

test('data/**/*.json: todo sourceRef (document/sourceDocument/sourceId) resuelve contra una fuente registrada en sources.json', () => {
  const sourcesData = readJson('sources/sources.json');
  const validFilenames = new Set();
  const validSourceIds = new Set();
  sourcesData.sources.forEach((s) => {
    validSourceIds.add(s.id);
    validFilenames.add(s.filename);
    (s.files || []).forEach((f) => validFilenames.add(f));
  });

  const refs = collectSourceReferences(DATA_DIR);
  assert.ok(refs.length > 0, 'no se encontró ningún sourceRef en data/ — el recorrido puede estar roto');

  for (const ref of refs) {
    if (ref.document) {
      assert.ok(validFilenames.has(ref.document), `${ref.file}: document "${ref.document}" no resuelve contra ninguna fuente de sources.json (filename ni files[])`);
    }
    if (ref.sourceDocument) {
      assert.ok(validFilenames.has(ref.sourceDocument), `${ref.file}: sourceDocument "${ref.sourceDocument}" no resuelve contra ninguna fuente de sources.json (filename ni files[])`);
    }
    if (ref.sourceId) {
      assert.ok(validSourceIds.has(ref.sourceId), `${ref.file}: sourceId "${ref.sourceId}" no existe en sources.json`);
    }
  }
});

test('sources.json: cada fuente registrada en la raíz del repositorio (salvo PDF/DOCX de terceros) existe realmente en disco', () => {
  const sourcesData = readJson('sources/sources.json');
  const REPO_ROOT = path.join(__dirname, '..');
  for (const s of sourcesData.sources) {
    if (AGGREGATE_OR_NON_ROOT_SOURCE_IDS.has(s.id)) continue;
    // PDF y DOCX de terceros: no se publican en el repositorio (solo se comprueba donde se conservan en local).
    if (/.(pdf|docx)$/i.test(s.filename)) continue;
    assert.ok(fs.existsSync(path.join(REPO_ROOT, s.filename)), `sources.json: la fuente "${s.id}" apunta a "${s.filename}", que no existe en la raíz del repositorio`);
  }
  // tablas-armamento no se comprueba por su `filename` (descripción agregada),
  // sino por cada entrada de su `files[]` (COR02-007: esquema formal de
  // subdocumentos dentro de la fuente agregada).
  const tablasArmamento = sourcesData.sources.find((s) => s.id === 'tablas-armamento');
  assert.ok(tablasArmamento && Array.isArray(tablasArmamento.files) && tablasArmamento.files.length === 17, 'sources.json: tablas-armamento debería declarar sus 17 subdocumentos en `files`');
  // Los PDF de terceros ya no se publican en el repositorio: solo se comprueba su existencia donde se conservan en local.
  if (fs.existsSync(path.join(REPO_ROOT, 'Tablas de Armamento'))) {
    for (const f of tablasArmamento.files) {
      assert.ok(fs.existsSync(path.join(REPO_ROOT, f)), `sources.json: tablas-armamento.files incluye "${f}", que no existe en la raíz del repositorio`);
    }
  }
});

test('sources.json: ningún archivo entregado en la raíz del repositorio (PDF/DOCX/TXT/JPG/PNG) queda fuera del inventario', () => {
  const sourcesData = readJson('sources/sources.json');
  const REPO_ROOT = path.join(__dirname, '..');
  const registered = new Set();
  sourcesData.sources.forEach((s) => {
    registered.add(s.filename);
    (s.files || []).forEach((f) => registered.add(f));
  });
  const extensions = new Set(['.pdf', '.docx', '.txt', '.jpg', '.jpeg', '.png']);
  const rootArtifacts = fs.readdirSync(REPO_ROOT, { withFileTypes: true })
    .filter((e) => e.isFile() && extensions.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name);
  const unregistered = rootArtifacts.filter((name) => !registered.has(name)).sort();
  assert.deepEqual(unregistered, [], `Archivo(s) en la raíz del repositorio sin entrada en sources.json (ni como fuente propia ni dentro de un \`files[]\`): ${unregistered.join(', ')}`);
});

// COR02-008 (correcciones.02.md): reconciliación puntual de descripciones de
// sources.json que afirmaban como pendiente/roto algo ya resuelto en el
// código (contador de banda de día, gap de Logística, "Disparo en Área" sin
// automatizar). Guarda de regresión: no re-verifica la funcionalidad en sí
// (eso ya lo cubren otros tests), solo que esas frases concretas, ya
// corregidas, no vuelvan a aparecer sin querer.
test('sources.json: las descripciones ya reconciliadas (COR02-008) no vuelven a afirmar algo ya resuelto como pendiente', () => {
  const sourcesData = readJson('sources/sources.json');
  const byId = (id) => sourcesData.sources.find((s) => s.id === id);

  const hojaTurnos = byId('hoja-turnos');
  assert.ok(hojaTurnos, 'falta la fuente hoja-turnos');
  assert.doesNotMatch(hojaTurnos.description, /todavía pendiente|sigue pendiente.*contador de banda|Ninguna de las dos todavía modela/i, 'hoja-turnos vuelve a afirmar que el contador de banda de día no existe');

  const mapaUsoTablas = byId('mapa-uso-tablas');
  assert.ok(mapaUsoTablas, 'falta la fuente mapa-uso-tablas');
  assert.doesNotMatch(mapaUsoTablas.description, /queda marcado como gap explícito/i, 'mapa-uso-tablas vuelve a presentar el gap de Logística como sin cerrar');

  const hojaAtaque = byId('hoja-ataque-guiado-superficie');
  assert.ok(hojaAtaque, 'falta la fuente hoja-ataque-guiado-superficie');
  assert.doesNotMatch(hojaAtaque.description, /no automatizada en el wizard/i, 'hoja-ataque-guiado-superficie vuelve a decir que "Disparo en Área" no está automatizado');

  const decisionBook = byId('decision-book');
  assert.ok(decisionBook, 'falta la fuente decision-book');
  const pending = decisionBook.pendingSections.join(' ');
  assert.doesNotMatch(pending, /cap\. 1-6 completos/i, 'decision-book.pendingSections vuelve a incluir el capítulo 6 entre lo pendiente, aunque está íntegro');
});

// --- Esquema de consumo Bajo de la Interceptación de Munición (páginas 4 y 8; known-ambiguities.md, 2026-10-04) ---

test('page-04/page-08: columnAxis.alternateLabelSets.low tiene una etiqueta por columna de datos y coincide con lowConsumptionGrouping', () => {
  for (const [file, tableId] of [['tables/page-04.json', 'munition-interception-standard'], ['tables/page-08.json', 'munition-interception-unguided']]) {
    const table = readJson(file).tables.find((t) => t.id === tableId);
    const low = table.columnAxis.alternateLabelSets.low;
    assert.equal(low.length, table.columnAxis.values.length, `${file}: \`low\` debe tener una etiqueta (o null) por columna de datos`);
    const buckets = table.columnAxis.lowConsumptionGrouping.buckets.map((b) => b.label);
    assert.deepEqual(low.slice(0, buckets.length), buckets, `${file}: las etiquetas Bajo deben coincidir con lowConsumptionGrouping.buckets`);
    assert.ok(low.slice(buckets.length).every((l) => l === null), `${file}: las columnas sin equivalente Bajo deben ser null`);
  }
});

// AJ-005: el índice de tablas, el archivo de cada página y el registro de
// fuentes no deben contradecirse sobre qué páginas siguen en revisión, y
// «transcripción verificada» y «regla pendiente» son estados distintos.
test('data/tables: índice, páginas y sources.json coinciden en needsReview y en los estados de transcripción/regla', () => {
  const index = readJson('tables/index.json');
  const sources = readJson('sources/sources.json');
  const tablasCombate = sources.sources.find((s) => s.id === 'tablas-combate');
  const flagged = [];
  for (const entry of index.pages) {
    const page = readJson(path.join('tables', entry.file));
    const pageNeeds = page.needsReview === true;
    assert.equal(entry.needsReview, pageNeeds, `${entry.file}: needsReview del índice (${entry.needsReview}) distinto del de la página (${pageNeeds})`);
    for (const table of page.tables || []) {
      if (table.needsReview === true) assert.ok(pageNeeds, `${entry.file}: la tabla "${table.id}" tiene needsReview pero la página no`);
    }
    for (const key of ['transcriptionStatus', 'ruleStatus', 'blockingIssues']) {
      assert.deepEqual(entry[key], page[key], `${entry.file}: ${key} distinto entre el índice y la página`);
    }
    if (entry.ruleStatus !== undefined) {
      assert.ok(['verified', 'fast_pass'].includes(entry.transcriptionStatus), `${entry.file}: transcriptionStatus inválido`);
      assert.ok(['resolved', 'needs_review'].includes(entry.ruleStatus), `${entry.file}: ruleStatus inválido`);
      assert.ok(Array.isArray(entry.blockingIssues), `${entry.file}: blockingIssues debe ser una lista`);
      const open = entry.ruleStatus === 'needs_review' || entry.transcriptionStatus !== 'verified';
      assert.equal(entry.needsReview, open, `${entry.file}: needsReview no coincide con los estados de transcripción/regla`);
      assert.equal(entry.blockingIssues.length > 0, entry.ruleStatus === 'needs_review', `${entry.file}: blockingIssues debe listar los motivos si y solo si la regla está pendiente`);
    }
    if (entry.needsReview) flagged.push(entry.page);
  }
  assert.deepEqual(tablasCombate.needsReviewPages, flagged, 'sources.json#needsReviewPages desincronizado con data/tables/index.json');
});
