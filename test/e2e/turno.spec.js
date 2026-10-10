// Turno guiado sobre el modelo canónico (ajustes_de_turno.md, Fase 23): una banda de dos días con
// Fase 0 (una vez) y seis fases de campaña; todo se abre directamente y las marcas son voluntarias.
// Ejercita la interfaz real (clics, navegación por hash, diálogos). Las lecturas de
// data/phases/turn-template.json solo sirven para saber QUÉ visitar, nunca para calcular lo esperado.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('./fixtures');

const turnTemplate = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'phases', 'turn-template.json'), 'utf8')
);

const GROUND_LEVELS = { 1: 'A, B, C', 3: 'A, B', 4: 'A, B, C, D', 6: 'A' };

test('el índice muestra una banda de dos días con Fase 0 una vez y seis fases (nunca dos «campañas»)', async ({ page }) => {
  await page.goto('/#/turno');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Turno de juego');
  await expect(page.getByText('Campaña 1')).toHaveCount(0);
  await expect(page.locator('.phase-card', { hasText: 'Fase 0' })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: /Día 1 \(día impar\)/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Día 2 \(día par\)/ })).toBeVisible();
  await expect(page.locator('.phase-card', { hasText: /\d\.ª fase/ })).toHaveCount(6);
  await expect(page.locator('.phase-card', { hasText: '1.ª fase' })).toContainText('Mañana');
  await expect(page.locator('.phase-card', { hasText: '2.ª fase' })).toContainText('Tarde');
  await expect(page.locator('.phase-card', { hasText: '3.ª fase' })).toContainText('Noche');
  await expect(page.locator('.phase-card', { hasText: '2.ª fase' })).toContainText('sin Tierra');
  await expect(page.locator('.phase-card', { hasText: '4.ª fase' })).toContainText('Tierra A/B/C/D');
  // La banda 2 cambia los días reales.
  await page.getByRole('button', { name: 'Siguiente banda →' }).click();
  await expect(page.getByRole('heading', { name: /Día 3 \(día impar\)/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Día 4 \(día par\)/ })).toBeVisible();
});

test('acceso directo a cualquiera de las seis fases; Tierra solo donde corresponde, con su Nivel de Reacción', async ({ page }) => {
  for (let n = 1; n <= 6; n += 1) {
    await page.goto(`/#/turno/fase/${n}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`${['Primera', 'Segunda', 'Tercera', 'Cuarta', 'Quinta', 'Sexta'][n - 1]} Fase`);
    for (const title of ['Aire I', 'Superficie', 'Aire II', 'Submarino']) {
      await expect(page.locator('.phase-card__title', { hasText: new RegExp('^' + title + '$') })).toHaveCount(1);
    }
    const ground = page.locator('.phase-card__title', { hasText: /^Tierra$/ });
    if (GROUND_LEVELS[n]) {
      await expect(ground).toHaveCount(1);
      await expect(page.getByText(`Nivel de Reacción (Iniciativa) ${GROUND_LEVELS[n]}`)).toBeVisible();
    } else {
      await expect(ground).toHaveCount(0);
      await expect(page.getByText('Sin segmento terrestre en esta fase.')).toBeVisible();
    }
  }
  // Un segmento terrestre inexistente en la 2.ª fase no se inventa.
  await page.goto('/#/turno/fase/2/ground');
  await expect(page.getByText('no existe en la fase')).toBeVisible();
});

test('Aire I y Aire II comparten contenido pero no estado: terminar una subfase no marca la otra', async ({ page }) => {
  const sub = turnTemplate.subphases.planificacion_misiones;
  await page.goto('/#/turno/fase/1/air-1/planificacion_misiones');
  await expect(page.getByRole('heading', { name: sub.title })).toBeVisible();
  await page.getByRole('button', { name: 'Terminar subfase' }).click();
  await expect(page).toHaveURL(/#\/turno\/fase\/1\/air-1$/);
  await expect(page.locator('.subphase-card', { hasText: sub.title })).toContainText('✓');

  await page.goto('/#/turno/fase/1/air-2');
  await expect(page.locator('.subphase-card', { hasText: sub.title })).not.toContainText('✓');
  await page.goto('/#/turno/fase/4/air-1');
  await expect(page.locator('.subphase-card', { hasText: sub.title })).not.toContainText('✓');

  // Reabrir es reversible.
  await page.goto('/#/turno/fase/1/air-1/planificacion_misiones');
  await page.getByRole('button', { name: 'Reabrir subfase' }).click();
  await page.goto('/#/turno/fase/1/air-1');
  await expect(page.locator('.subphase-card', { hasText: sub.title })).not.toContainText('✓');
});

test('terminar una fase y un día es voluntario: no exige visitar subfases ni respetar el orden (TUR-008)', async ({ page }) => {
  // La 4.ª fase se termina sin tocar ninguna de sus subfases y sin haber hecho la 1.ª.
  await page.goto('/#/turno/fase/4');
  page.once('dialog', (dialog) => { expect(dialog.message()).not.toContain('fuera de secuencia'); dialog.accept(); });
  await page.getByRole('button', { name: 'Terminar fase' }).click();
  await expect(page).toHaveURL(/#\/turno$/);
  await expect(page.locator('.phase-card', { hasText: '4.ª fase' })).toContainText('Terminada');
  await expect(page.locator('.phase-card', { hasText: '1.ª fase' })).not.toContainText('Terminada');

  // El día par se marca terminado aunque su 5.ª y 6.ª fases no se hayan visitado.
  await page.getByRole('button', { name: 'Terminar día' }).nth(1).click();
  await expect(page.getByText('✓ Día terminado')).toBeVisible();
  await expect(page.locator('.phase-card', { hasText: '5.ª fase' })).not.toContainText('Terminada');

  // Reabrir la fase y el día.
  await page.goto('/#/turno/fase/4');
  await page.getByRole('button', { name: 'Reabrir' }).click();
  await page.goto('/#/turno');
  await expect(page.locator('.phase-card', { hasText: '4.ª fase' })).not.toContainText('Terminada');
});

test('Fase 0: saltar las opcionales y terminar Logística; el estado se guarda por nodo (esquema v4)', async ({ page }) => {
  await page.goto('/#/turno/fase/0');
  for (const id of turnTemplate.band.strategic.phases) {
    const phase = turnTemplate.phases[id];
    if (!phase.optional) continue;
    await page.locator('.phase-card-wrapper', { hasText: phase.title }).getByRole('button', { name: 'Saltar fase' }).click();
  }
  await page.getByRole('button', { name: 'Fase Logística' }).click();
  await expect(page).toHaveURL(/#\/turno\/fase\/0\/logistica$/);
  await expect(page.getByRole('heading', { name: 'Fase Logística' })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Terminar fase' }).click();
  await expect(page.locator('.phase-card', { hasText: 'Fase Logística' })).toContainText('Terminada');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tcw-progress')));
  expect(stored.schemaVersion).toBe(4);
  const band = stored.bands[stored.currentBand];
  expect(band.finished).toContain('phase-0/logistica');
  expect(band.skipped).toContain('phase-0/crisis');
});

test('cada banda conserva su propio progreso al cambiar de banda', async ({ page }) => {
  await page.goto('/#/turno/fase/0/crisis');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Terminar fase' }).click();

  await page.goto('/#/turno');
  await expect(page.getByText(/Banda 1 de 14/)).toBeVisible();
  await page.goto('/#/turno/fase/0');
  await expect(page.locator('.phase-card-wrapper', { hasText: 'Fase de Crisis' })).toContainText('Terminada');

  await page.goto('/#/turno');
  await page.getByRole('button', { name: 'Siguiente banda →' }).click();
  await expect(page.getByText(/Banda 2 de 14/)).toBeVisible();
  await page.goto('/#/turno/fase/0');
  await expect(page.locator('.phase-card-wrapper', { hasText: 'Fase de Crisis' })).not.toContainText('Terminada');

  await page.goto('/#/turno');
  await page.getByRole('button', { name: '← Banda anterior' }).click();
  await page.goto('/#/turno/fase/0');
  await expect(page.locator('.phase-card-wrapper', { hasText: 'Fase de Crisis' })).toContainText('Terminada');
});

// COR03-001: el orden de la hoja solo orienta («siguiente sugerida»), nunca autoriza ni bloquea.
test('terminar un paso fuera del orden de la hoja no pide confirmación de secuencia ni queda como anomalía', async ({ page }) => {
  await page.goto('/#/turno/fase/0');
  await expect(page.getByText('→ Siguiente sugerida')).toBeVisible();

  await page.goto('/#/turno/fase/0/logistica');
  await expect(page.getByText('fuera de secuencia')).toHaveCount(0);
  let dialogMessage = '';
  page.once('dialog', (dialog) => { dialogMessage = dialog.message(); dialog.accept(); });
  await page.getByRole('button', { name: 'Terminar fase' }).click();
  expect(dialogMessage).not.toContain('fuera de secuencia');
  await expect(page).toHaveURL(/#\/turno\/fase\/0$/);
  await expect(page.locator('.phase-card-wrapper', { hasText: 'Fase Logística' })).toContainText('Terminada');
});

test('las URL del modelo anterior no se rompen: la Fase 0 se redirige y las «campañas» vuelven al índice', async ({ page }) => {
  await page.goto('/#/turno/proceso_estrategico/1/logistica');
  await expect(page).toHaveURL(/#\/turno\/fase\/0\/logistica$/);
  await expect(page.getByRole('heading', { name: 'Fase Logística' })).toBeVisible();
  await page.goto('/#/turno/proceso_campana/1/acciones_aereas');
  await expect(page).toHaveURL(/#\/turno$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Turno de juego');
});

test('la migración desde el progreso anterior conserva el dato, avisa una sola vez y no reparte la campaña', async ({ page }) => {
  await page.goto('/#/turno');
  await page.evaluate(() => {
    localStorage.setItem('tcw-progress', JSON.stringify({
      schemaVersion: 3, currentBand: 1,
      bandRuns: { 1: { processRuns: {
        'proceso_estrategico:1': { finishedPhases: ['logistica'], finishedSubphases: [], skippedPhases: [] },
        'proceso_campana:1': { finishedPhases: ['acciones_aereas'], finishedSubphases: ['planificacion_misiones'], skippedPhases: [] }
      } } },
      pendingResolutions: []
    }));
  });
  await page.goto('/#/turno/fase/0');
  await page.goto('/#/turno');
  await expect(page.getByText('ℹ Cambio en el seguimiento del turno')).toBeVisible();
  await expect(page.getByText(/progreso que habías marcado en las dos «campañas» anteriores/)).toBeVisible();
  // Ninguna fase nueva aparece terminada.
  await expect(page.locator('.phase-card', { hasText: /\d\.ª fase/ }).filter({ hasText: 'Terminada' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Entendido' }).click();
  await page.goto('/#/turno');
  await expect(page.getByText('ℹ Cambio en el seguimiento del turno')).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tcw-progress')));
  expect(stored.schemaVersion).toBe(4);
  expect(stored.bands[1].finished).toContain('phase-0/logistica');
  expect(stored.legacy.processRuns[1]['proceso_campana:1'].finishedPhases).toEqual(['acciones_aereas']);
});

// COR02-003: un wizard abierto DESDE una subfase queda vinculado a su nodo; «Terminar» avisa y se puede cancelar.
async function startGroundWizardFrom(page, hash) {
  await page.goto(hash);
  await page.getByRole('button', { name: 'Combate cercano terrestre', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Combate cercano terrestre' })).toBeVisible();
  await page.getByRole('button', { name: '▶ Resolver con el wizard de combate' }).click();
  await expect(page).toHaveURL(/#\/wizard\/ground-close-combat/);
  await expect(page.getByText('Paso 1 de 5')).toBeVisible();
}

test('un wizard abierto desde una subfase queda vinculado a su segmento, «Terminar» avisa y se puede cancelar', async ({ page }) => {
  await startGroundWizardFrom(page, '/#/turno/fase/1/ground/combate_terrestre');

  await page.goto('/#/turno/fase/1/ground');
  await expect(page.getByText('⏳ Resolución activa: Combate cercano terrestre')).toBeVisible();
  // No aparece en otro segmento ni en otra fase.
  await page.goto('/#/turno/fase/4/ground');
  await expect(page.getByText('⏳ Resolución activa')).toHaveCount(0);

  await page.goto('/#/turno/fase/1/ground');
  let dialogMessage = '';
  page.once('dialog', (dialog) => { dialogMessage = dialog.message(); dialog.dismiss(); });
  await page.getByRole('button', { name: 'Terminar fase' }).click();
  expect(dialogMessage).toContain('resolución(es) activa(s) sin guardar: Combate cercano terrestre');
  await expect(page.getByText('⏳ Resolución activa: Combate cercano terrestre')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '✕ Cancelar resolución' }).click();
  await expect(page.getByText('⏳ Resolución activa')).toHaveCount(0);
});

test('dos resoluciones del mismo wizard abiertas en fases distintas no se pisan y cada una recupera su borrador (TUR-015)', async ({ page }) => {
  await startGroundWizardFrom(page, '/#/turno/fase/1/ground/combate_terrestre');
  await startGroundWizardFrom(page, '/#/turno/fase/4/ground/combate_terrestre');

  await page.goto('/#/turno/fase/1/ground');
  await expect(page.getByText('⏳ Resolución activa: Combate cercano terrestre')).toHaveCount(1);
  await page.goto('/#/turno/fase/4/ground');
  await expect(page.getByText('⏳ Resolución activa: Combate cercano terrestre')).toHaveCount(1);
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('tcw-progress')).pendingResolutions);
  expect(pending.map((r) => r.nodeId).sort()).toEqual(['phase-1/ground/combate_terrestre', 'phase-4/ground/combate_terrestre']);
  const drafts = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tcw-wizard-drafts') || '{}')));
  expect(drafts.filter((k) => k.startsWith('ground-close-combat@')).sort()).toEqual(['ground-close-combat@phase-1/ground/combate_terrestre', 'ground-close-combat@phase-4/ground/combate_terrestre']);

  // Retomar la de la 1.ª fase (distinta de la que está en memoria) recupera su propio borrador.
  await page.goto('/#/turno/fase/1/ground');
  await page.getByRole('button', { name: '↩ Volver a la resolución' }).click();
  await expect(page).toHaveURL(/#\/wizard\/ground-close-combat/);
  await expect(page.getByText('↩ Resolución en curso recuperada')).toBeVisible();
});

test('Refuerzos abre cada fase antes de Aire I y Recuperación de Mando va antes de cada día; ambos consultables y no bloqueantes', async ({ page }) => {
  for (const n of [1, 2, 3, 4, 5, 6]) {
    await page.goto(`/#/turno/fase/${n}`);
    const titles = await page.locator('.phase-card__title').allInnerTexts();
    expect(titles.slice(0, 2), `fase ${n}`).toEqual(['Refuerzos', 'Aire I']);
  }

  await page.goto('/#/turno/fase/3/reinforcements');
  await expect(page.getByRole('heading', { name: 'Refuerzos' })).toBeVisible();
  await expect(page.getByText('Fase adicional al principio de cada fase de campaña, antes de las subfases de Aire I.').first()).toBeVisible();
  await expect(page.getByText(/Pendiente de transcribir\/validar el procedimiento/)).toBeVisible();
  await page.getByRole('button', { name: 'Marcar como hecho' }).click();
  await expect(page).toHaveURL(/#\/turno\/fase\/3$/);
  await expect(page.locator('.phase-card', { hasText: 'Refuerzos' })).toContainText('Terminada');
  // Marcarlo no exige ni marca nada más, y Refuerzos de otra fase sigue sin marcar.
  await page.goto('/#/turno/fase/6');
  await expect(page.locator('.phase-card', { hasText: 'Refuerzos' })).not.toContainText('Terminada');

  await page.goto('/#/turno');
  const days = page.locator('.phase-card', { hasText: 'Recuperación de Mando' });
  await expect(days).toHaveCount(2);
  await days.first().click();
  await expect(page).toHaveURL(/#\/turno\/mando\/day-odd$/);
  await expect(page.getByRole('heading', { name: 'Recuperación de Mando' })).toBeVisible();
  await expect(page.getByText(/Límite de Capacidad de Mando indicado en la tarjeta del Centro de Mando/)).toBeVisible();
  await expect(page.getByText(/Antes del inicio de cada día/)).toBeVisible();
  // Orden en el índice: Recuperación de Mando va antes de las fases de cada día.
  await page.goto('/#/turno');
  const order = await page.locator('.phase-card__title').allInnerTexts();
  const iRec = order.findIndex((t) => t.startsWith('Recuperación de Mando'));
  const iFirst = order.findIndex((t) => t.startsWith('1.ª fase'));
  const iRec2 = order.findIndex((t, i) => i > iRec && t.startsWith('Recuperación de Mando'));
  const iFourth = order.findIndex((t) => t.startsWith('4.ª fase'));
  expect(iRec).toBeLessThan(iFirst);
  expect(iRec2).toBeGreaterThan(iFirst);
  expect(iRec2).toBeLessThan(iFourth);
});

test('TUR-013: cada segmento lista los combates que le corresponden y los atajos de wizard', async ({ page }) => {
  await page.goto('/#/turno/fase/1/surface');
  await expect(page.getByRole('button', { name: /Ataque antibuque guiado/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ataque antibuque no guiado/ })).toBeVisible();

  await page.goto('/#/turno/fase/1/ground');
  await expect(page.getByRole('button', { name: /Combate cercano terrestre/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Ataque de reacción \(CF, AS, KB, BAI\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Reabastecimiento de Campo del Ejército/ })).toBeVisible();

  await page.goto('/#/turno/fase/1/air-2/salidas_combate');
  await expect(page.getByRole('button', { name: /Combate aéreo: interceptación, BVR y WVR/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ataque antibuque guiado/ })).toBeVisible();

  await page.goto('/#/turno/fase/0/logistica');
  await expect(page.getByRole('button', { name: /Verificación de garantía logística/ })).toBeVisible();
});

test('TUR-013: abrir un wizard desde el turno conserva y muestra banda, día, fase, segmento y subfase de origen, también en el historial', async ({ page }) => {
  await page.goto('/#/turno/fase/4/ground/ataques_terrestres');
  await page.getByRole('button', { name: /Ataque de reacción \(CF, AS, KB, BAI\)/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/ground-reaction/);
  await expect(page.getByText('Origen en el turno: Banda 1 · Día 2 (par) · 4.ª fase, mañana · Tierra · Ataques terrestres')).toBeVisible();
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('tcw-progress')).pendingResolutions);
  expect(pending.map((r) => r.nodeId)).toEqual(['phase-4/ground/ataques_terrestres']);

  // Tras recargar dentro del wizard el origen se conserva.
  await page.reload();
  await expect(page.getByText(/Origen en el turno: Banda 1 · Día 2 \(par\) · 4\.ª fase/)).toBeVisible();

  // Un wizard abierto fuera del turno no muestra origen.
  await page.goto('/#/');
  await page.goto('/#/wizard/ground-close-combat');
  await expect(page.getByText('Origen en el turno')).toHaveCount(0);
});

test('TUR-007: cada nivel muestra sus fuentes (documento, sección y página, estado y nota) en un bloque plegable', async ({ page }) => {
  await page.goto('/#/turno/fase/1/ground/combate_terrestre');
  const details = page.locator('.source-details');
  await expect(details.locator('summary')).toHaveText('Fuentes y trazabilidad');
  await expect(details.locator('.source-details__list')).toBeHidden();
  await details.locator('summary').click();
  const text = await details.innerText();
  expect(text).toContain('8.6 Segmento de Combate Terrestre');
  expect(text).toContain('pág. 176-183');
  expect(text).toContain('Pendiente de revisión');
  expect(text).toContain('Compromiso');
  expect(text).toContain('Nivel de Reacción');
  // La fuente de la subfase es propia, no la de la fase padre.
  await page.goto('/#/turno/fase/1/surface/combate_superficie');
  await page.locator('.source-details summary').click();
  await expect(page.locator('.source-details')).toContainText('9.5 Combate de Superficie');
  await expect(page.locator('.source-details')).toContainText('Verificado');

  // No existe un paso «Restablecimiento de capacidades» en las fases aéreas; la recuperación de mando va antes de cada día.
  await page.goto('/#/turno/fase/4/air-1');
  await expect(page.locator('.subphase-card')).toHaveCount(7); // 6 de la fase aérea + «Parálisis» al final de Aire I
  await page.goto('/#/turno/fase/4/air-2');
  await expect(page.locator('.subphase-card')).toHaveCount(6);
  await page.goto('/#/turno/fase/4/air-1');
  await expect(page.getByText('Restablecimiento de capacidades')).toHaveCount(0);
  await page.goto('/#/turno/fase/4/air-1/restablecimiento');
  await expect(page.getByText(/Subfase «restablecimiento» no encontrada/)).toBeVisible();

  await page.goto('/#/turno/fase/4');
  await page.locator('.source-details summary').click();
  await expect(page.locator('.source-details')).toContainText('TCW - Hoja de turnos 1.1.pdf');
});

test('Aire I termina con el recordatorio opcional «Parálisis» que enlaza al ciberataque; Aire II no lo tiene', async ({ page }) => {
  await page.goto('/#/turno/fase/1/air-1');
  await expect(page.getByRole('button', { name: /Parálisis \(regla opcional\)/ })).toBeVisible();
  await page.goto('/#/turno/fase/1/air-1/paralisis_red');
  await expect(page.getByRole('heading', { name: 'Parálisis' })).toBeVisible();
  await expect(page.getByText(/retírale la parálisis en este momento/)).toBeVisible();
  await page.getByRole('button', { name: /Ataque cibernético/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/cyber-attack$/);
  await page.goto('/#/turno/fase/1/air-2');
  await expect(page.getByRole('button', { name: /Parálisis/ })).toHaveCount(0);
});
