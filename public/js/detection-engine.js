// Motor de detección (roadmap Fase 4). Funciones puras que resuelven los
// procedimientos ya transcritos en data/detection/help-sheet.json
// (TCW-Hoja-de-Ayuda-Deteccion.pdf) para los casos en los que la fuente da una
// regla numérica o categórica comprobable. Ninguna función inventa una
// distancia, umbral o fórmula que la hoja no declare explícitamente: donde la
// fuente solo da una regla cualitativa (p.ej. detección electrónica, quién
// puede detectar unidades terrestres), la función devuelve esa explicación
// tal cual, sin fingir un cálculo numérico que no existe.
//
// UMD-lite: funciona en Node (tests) y en el navegador (<script>).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DetectionEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REFS = {
    airToAir: [{ document: 'TCW-Hoja-de-Ayuda-Deteccion.pdf', pages: '2-3' }],
    surfaceDetectsAir: [{ document: 'TCW-Hoja-de-Ayuda-Deteccion.pdf', page: 4 }],
    groundDetectability: [{ document: 'TCW-Hoja-de-Ayuda-Deteccion.pdf', pages: '4-5' }],
    brieflyDetectable: [{ document: 'TCW-Hoja-de-Ayuda-Deteccion.pdf', page: 5 }],
    fixedInstallation: [{ document: 'TCW-Hoja-de-Ayuda-Deteccion.pdf', page: 4 }],
    groundDetectorEligibility: [{ document: 'TCW-Hoja-de-Ayuda-Deteccion.pdf', page: 4 }],
    navalDetectorEligibility: [{ document: 'TCW-Hoja-de-Ayuda-Deteccion.pdf', page: 4 }],
    electronic: [{ document: 'TCW-Hoja-de-Ayuda-Deteccion.pdf', page: 6 }]
  };

  // Detección aire-aire (1.2, "Para determinar la exposición de una unidad
  // aérea enemiga por una unidad aliada: se cuentan tantos hexágonos como esa
  // firma [la firma aérea de LA ENEMIGA] desde la unidad guía. Si se llega
  // hasta el counter enemigo... la unidad queda expuesta"): expuesta si la
  // distancia en hexágonos es <= la firma aérea del objetivo. La regla es
  // asimétrica por diseño (cada lado usa la firma del OTRO como umbral), así
  // que dos unidades a la misma distancia pueden exponerse mutuamente, solo
  // una en un sentido, o ninguna — los 3 casos que la hoja documenta con el
  // ejemplo KF-16C/D (firma 3) vs J-16 (firma 5), sin transcribir la
  // distancia exacta en hexágonos de cada caso (no es medible con precisión
  // en las fotografías de la hoja).
  function resolveAirToAirExposure({ hexDistance, targetAirSignature }) {
    const exposed = hexDistance <= targetAirSignature;
    return {
      exposed,
      hexDistance,
      targetAirSignature,
      reason: exposed
        ? `La distancia (${hexDistance} hex) no supera la firma aérea del objetivo (${targetAirSignature}): queda expuesto.`
        : `La distancia (${hexDistance} hex) supera la firma aérea del objetivo (${targetAirSignature}): no queda expuesto.`,
      sourceRefs: REFS.airToAir
    };
  }

  // Resuelve la exposición mutua entre dos aeronaves a una distancia dada,
  // aplicando resolveAirToAirExposure en los dos sentidos (cada lado usa la
  // firma aérea del otro como umbral) — reproduce los 3 casos cualitativos
  // que la hoja documenta (mutua / en un solo sentido / ninguna).
  function resolveAirToAirMutualExposure({ hexDistance, unitA, unitB }) {
    const aExposesB = resolveAirToAirExposure({ hexDistance, targetAirSignature: unitB.airSignature });
    const bExposesA = resolveAirToAirExposure({ hexDistance, targetAirSignature: unitA.airSignature });
    let outcome;
    if (aExposesB.exposed && bExposesA.exposed) outcome = 'mutual';
    else if (aExposesB.exposed || bExposesA.exposed) outcome = 'one-way';
    else outcome = 'none';
    return { outcome, aExposesB, bExposesA, sourceRefs: REFS.airToAir };
  }

  // Detección naval de unidades aéreas (1.2, "detectedByOthers": "Todas las
  // unidades de superficie detectan a unidades aéreas según su valor de firma
  // terrestre, y a las unidades de baja altitud a 1 hex"): si el objetivo es
  // de baja altitud, el alcance es fijo (correcciones.02.md COR02-006:
  // `lowAltitudeFixedRangeHex`, tomado de
  // data/detection/help-sheet.json#airDetection en vez de incrustado aquí);
  // si no, se usa su firma terrestre (el valor INFERIOR del counter) como
  // umbral, igual que resolveAirToAirExposure pero con la firma terrestre en
  // vez de la aérea.
  function resolveSurfaceDetectsAir({ hexDistance, targetIsLowAltitude, targetGroundSignature, lowAltitudeFixedRangeHex }) {
    if (targetIsLowAltitude) {
      const exposed = hexDistance <= lowAltitudeFixedRangeHex;
      return {
        exposed,
        hexDistance,
        rule: 'low-altitude-fixed-range',
        reason: exposed
          ? `Unidad de baja altitud a ${hexDistance} hex: dentro del alcance fijo de ${lowAltitudeFixedRangeHex} hex, queda expuesta.`
          : `Unidad de baja altitud a ${hexDistance} hex: fuera del alcance fijo de ${lowAltitudeFixedRangeHex} hex, no queda expuesta.`,
        sourceRefs: REFS.surfaceDetectsAir
      };
    }
    const exposed = hexDistance <= targetGroundSignature;
    return {
      exposed,
      hexDistance,
      targetGroundSignature,
      rule: 'ground-signature',
      reason: exposed
        ? `La distancia (${hexDistance} hex) no supera la firma terrestre del objetivo (${targetGroundSignature}): queda expuesto.`
        : `La distancia (${hexDistance} hex) supera la firma terrestre del objetivo (${targetGroundSignature}): no queda expuesto.`,
      sourceRefs: REFS.surfaceDetectsAir
    };
  }

  // Detectabilidad de unidades terrestres móviles (1.3,
  // "mobileUnitDetectability": "Unidades principales: Terreno x4 < Fuerza de
  // la unidad"; "Unidades técnicas: Terreno x4 < Número de unidades
  // técnicas"). Devuelve si la unidad está en estado "detectable" (precondición
  // para poder ser expuesta) u "oculta" — no calcula alcance: eso es un paso
  // posterior una vez la unidad ya es detectable.
  function resolveGroundMobileDetectability({ unitType, terrainValue, strengthOrTechnicalCount, terrainMultiplier }) {
    if (unitType !== 'main' && unitType !== 'technical') {
      throw new Error(`unitType desconocido: "${unitType}" (esperado "main" o "technical")`);
    }
    const threshold = terrainValue * terrainMultiplier;
    const detectable = threshold < strengthOrTechnicalCount;
    const label = unitType === 'main' ? 'Fuerza de la unidad' : 'Número de unidades técnicas';
    return {
      detectable,
      state: detectable ? 'detectable' : 'hidden',
      threshold,
      strengthOrTechnicalCount,
      reason: `Terreno×${terrainMultiplier} (${terrainValue}×${terrainMultiplier}=${threshold}) ${detectable ? '<' : '≥'} ${label} (${strengthOrTechnicalCount}): la unidad queda ${detectable ? 'detectable' : 'oculta'}.`,
      sourceRefs: REFS.groundDetectability
    };
  }

  // Estado "brevemente detectable" (1.3, "brieflyDetectableTriggers"): una
  // unidad oculta que realiza una acción de la lista pasa a brevemente
  // detectable hasta que el atacante resuelve todos los ataques de reacción
  // que esa exposición temporal permita. `actions` (correcciones.02.md
  // COR02-006): lista `{id,label}` tomada de
  // data/detection/help-sheet.json#groundDetection.brieflyDetectableTriggers,
  // ya no incrustada en el motor.
  function resolveBrieflyDetectable({ action, actions }) {
    const match = actions.find((a) => a.id === action);
    const triggers = !!match;
    const actionLabels = actions.map((a) => a.label).join(', ');
    return {
      triggers,
      action,
      state: triggers ? 'briefly-detectable' : 'hidden',
      reason: triggers
        ? `"${match.label}" es una acción que expone temporalmente: la unidad pasa a brevemente detectable (puede sufrir ataques de reacción hasta que se resuelvan).`
        : `"${action}" no es una de las ${actions.length} acciones que exponen temporalmente (${actionLabels}): la unidad sigue oculta.`,
      sourceRefs: REFS.brieflyDetectable
    };
  }

  // Instalaciones fijas (1.3, "fixedInstallations": "Se consideran objetivos
  // siempre expuestos"): no hay cálculo, es una regla categórica.
  function resolveFixedInstallationExposure() {
    return {
      exposed: true,
      state: 'continuously-exposed',
      reason: 'Las instalaciones fijas se consideran objetivos siempre expuestos.',
      sourceRefs: REFS.fixedInstallation
    };
  }

  // Quién puede detectar unidades terrestres (1.3, "whoCanDetect": "Solo
  // poseen capacidad de detección terrestre algunas unidades aéreas y de
  // baja altitud (misiones de ISR)"; unidades terrestres/navales/submarinas
  // no pueden). Regla categórica, no una distancia: se explica el motivo, sin
  // inventar un alcance que la fuente no da. `capableTypes`/`incapableTypes`
  // (correcciones.02.md COR02-006): listas `{id,label}` tomadas de
  // data/detection/help-sheet.json#groundDetection.whoCanDetect, ya no
  // incrustadas en el motor.
  function resolveGroundDetectorEligibility({ detectorType, capableTypes, incapableTypes }) {
    const capableMatch = capableTypes.find((t) => t.id === detectorType);
    const incapableMatch = incapableTypes.find((t) => t.id === detectorType);
    if (!capableMatch && !incapableMatch) {
      throw new Error(`detectorType desconocido: "${detectorType}"`);
    }
    const capable = !!capableMatch;
    return {
      capable,
      detectorType,
      reason: capable
        ? 'Las unidades aéreas y de baja altitud en misión de ISR sí pueden exponer unidades terrestres.'
        : 'Las unidades terrestres, navales y submarinas no pueden exponer unidades terrestres (solo algunas unidades aéreas/de baja altitud en ISR).',
      sourceRefs: REFS.groundDetectorEligibility
    };
  }

  // Detección de unidades navales ("navalDetection": quién puede exponer a
  // una unidad naval — distinto de resolveSurfaceDetectsAir, que es la unidad
  // naval detectando a una unidad AÉREA). Las 4 reglas son categóricas, cada
  // una con su propia condición, sin alcance numérico declarado: "Unidades
  // aéreas" necesitan estar en misión aérea especial o ISR; "Unidades
  // terrestres" necesitan estar en hex. costero; "Unidades de baja altitud"
  // necesitan estar en el lado operativo; "Unidades de superficie" pueden
  // siempre, sin condición. `rules` (correcciones.02.md COR02-006): lista
  // `{id,conditionLabel,alwaysCapable}` tomada de
  // data/detection/help-sheet.json#navalDetection.detectedBy, ya no
  // incrustada en el motor.
  function resolveNavalDetectorEligibility({ detectorType, conditionMet, rules }) {
    const rule = rules.find((r) => r.id === detectorType);
    if (!rule) throw new Error(`detectorType desconocido: "${detectorType}" (esperado air/ground/low-altitude/surface)`);
    const capable = rule.alwaysCapable ? true : !!conditionMet;
    let reason;
    if (rule.alwaysCapable) {
      reason = 'Cualquier unidad de superficie puede exponer a una unidad naval, sin condición adicional.';
    } else if (capable) {
      reason = `Se cumple la condición requerida (${rule.conditionLabel}): puede exponer a la unidad naval.`;
    } else {
      reason = `No se cumple la condición requerida (${rule.conditionLabel}): no puede exponer a la unidad naval.`;
    }
    return { capable, detectorType, conditionLabel: rule.conditionLabel, reason, sourceRefs: REFS.navalDetectorEligibility };
  }

  // Detección electrónica (1.4, "electronicDetection": "Unidades de EW, con
  // capacidad de detección electrónica, contra unidades de radar"). Regla
  // categórica (capacidad vs capacidad), sin alcance numérico declarado en la
  // fuente: no se inventa uno.
  //
  // `targetIsSurfaceUnit` (COR03-004, correcciones03.md): las unidades de
  // superficie son un tipo de "unidad de radar" válido (pueden quedar
  // `exposed`), pero el Decision Book §4.4.1 las excluye EXPLÍCITAMENTE de
  // los ataques antirradiación — "no pueden ser objetivo de ataques
  // antiradiación", a diferencia de las demás unidades de radar. `exposed` y
  // `armEligible` son ahora conceptos distintos por esta excepción real (ver
  // docs/rules/known-ambiguities.md): antes de esta corrección la función
  // asumía que toda unidad expuesta electrónicamente era automáticamente
  // elegible para ARM, sin esta salvedad.
  function resolveElectronicDetection({ attackerHasEwCapability, targetHasRadar, targetIsSurfaceUnit }) {
    const exposed = !!attackerHasEwCapability && !!targetHasRadar;
    let reason;
    if (!attackerHasEwCapability) {
      reason = 'La unidad detectora no tiene capacidad de detección electrónica (EW): no puede exponer electrónicamente.';
    } else if (!targetHasRadar) {
      reason = 'El objetivo no es una unidad de radar: la detección electrónica no aplica.';
    } else if (targetIsSurfaceUnit) {
      reason = 'Unidad con EW contra un buque de superficie: queda expuesto electrónicamente, pero las unidades de superficie nunca son objetivo de ataques antirradiación (Decision Book §4.4.1).';
    } else {
      reason = 'Unidad con EW contra unidad de radar: queda expuesta electrónicamente (puede ser objetivo de ataques ARM).';
    }
    const armEligible = exposed && !targetIsSurfaceUnit;
    return {
      exposed,
      armEligible,
      state: exposed ? 'exposed-electronically' : 'not-exposed',
      reason,
      sourceRefs: REFS.electronic
    };
  }

  return {
    resolveAirToAirExposure,
    resolveAirToAirMutualExposure,
    resolveSurfaceDetectsAir,
    resolveGroundMobileDetectability,
    resolveBrieflyDetectable,
    resolveFixedInstallationExposure,
    resolveGroundDetectorEligibility,
    resolveNavalDetectorEligibility,
    resolveElectronicDetection
  };
});
