(function () {
  "use strict";

  const ACTIVITIES = [
    { id: "horticultura", label: "Horticultura", color: "#e58b50" },
    { id: "lecheria", label: "Producción lechera", color: "#6d9fc0" },
    { id: "cereales", label: "Cultivos de cereales", color: "#b79b55" },
    { id: "ganaderia", label: "Ganadería extensiva", color: "#73946d" }
  ];
  const DIMENSIONS = [
    { id: "soil", label: "A. Características del suelo" },
    { id: "water", label: "B. Disponibilidad hídrica" },
    { id: "climate", label: "C. Condiciones climáticas" },
    { id: "topography", label: "D. Condiciones topográficas" },
    { id: "environment", label: "E. Condiciones ambientales" }
  ];
  const CLASSES = [
    { id: "S1", label: "S1 · Aptitud alta", color: "#347953" },
    { id: "S2", label: "S2 · Aptitud media", color: "#8ab477" },
    { id: "S3", label: "S3 · Aptitud baja o marginal", color: "#e6b353" },
    { id: "N", label: "N · No apto", color: "#c75d56" }
  ];
  const DEMO_SOURCE = "Superficie sintética generada por el simulador; no es una observación de campo.";
  const DEMO_QUALITY = "Demostrativa · no validada para decisiones productivas.";

  const CRITERIA = [
    { id: "soilDepth", dimension: "soil", label: "Profundidad efectiva", unit: "cm", min: 20, max: 160, direction: "high", target: 120, emphasis: [1.35, 1.15, 1.3, 0.8] },
    { id: "soilTexture", dimension: "soil", label: "Textura del suelo", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "optimum", target: 65, tolerance: 45, emphasis: [1.15, 0.95, 1.2, 0.8] },
    { id: "soilFertility", dimension: "soil", label: "Fertilidad del suelo", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "high", target: 80, emphasis: [1.45, 1.1, 1.3, 0.85] },
    { id: "soilPh", dimension: "soil", label: "pH", unit: "pH", min: 4, max: 8.5, direction: "optimum", target: 6.4, tolerance: 2.4, emphasis: [1.1, 0.9, 1.1, 0.75] },
    { id: "organicMatter", dimension: "soil", label: "Materia orgánica", unit: "%", min: 0.5, max: 8, direction: "high", target: 5, emphasis: [1.25, 1.15, 1.05, 0.9] },
    { id: "drainage", dimension: "soil", label: "Capacidad de drenaje", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "optimum", target: 72, tolerance: 48, emphasis: [1.2, 1.15, 1.05, 0.8] },
    { id: "nutrients", dimension: "soil", label: "Disponibilidad de nutrientes", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "high", target: 75, emphasis: [1.35, 1.05, 1.3, 0.8] },
    { id: "moistureRetention", dimension: "soil", label: "Retención de humedad", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "optimum", target: 68, tolerance: 48, emphasis: [1.2, 1.15, 1.15, 0.95] },
    { id: "waterAvailability", dimension: "water", label: "Disponibilidad de agua", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "high", target: 75, emphasis: [1.55, 1.45, 1.05, 1.2] },
    { id: "precipitation", dimension: "water", label: "Precipitación", unit: "mm/año", min: 300, max: 2400, direction: "optimum", target: 1500, tolerance: 1050, emphasis: [1.35, 1.3, 1.4, 1.0] },
    { id: "irrigationNeed", dimension: "water", label: "Necesidad de riego", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "low", target: 25, emphasis: [0.9, 0.9, 0.85, 0.75] },
    { id: "moistureRegime", dimension: "water", label: "Régimen de humedad", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "optimum", target: 65, tolerance: 50, emphasis: [1.2, 1.25, 1.1, 1.0] },
    { id: "waterDeficitRisk", dimension: "water", label: "Riesgo de déficit hídrico", unit: "%", min: 0, max: 100, direction: "low", target: 20, emphasis: [1.45, 1.4, 1.2, 1.15] },
    { id: "temperature", dimension: "climate", label: "Temperatura media", unit: "°C", min: 4, max: 32, direction: "optimum", target: 19, tolerance: 14, emphasis: [1.2, 1.25, 1.25, 1.0] },
    { id: "relativeHumidity", dimension: "climate", label: "Humedad relativa", unit: "%", min: 25, max: 100, direction: "optimum", target: 70, tolerance: 42, emphasis: [1.0, 1.2, 0.9, 0.95] },
    { id: "annualRainfall", dimension: "climate", label: "Precipitación anual", unit: "mm/año", min: 300, max: 2400, direction: "optimum", target: 1450, tolerance: 1000, emphasis: [1.15, 1.2, 1.25, 1.0] },
    { id: "climateSeasonality", dimension: "climate", label: "Estacionalidad climática", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "low", target: 35, emphasis: [1.1, 1.05, 1.0, 0.85] },
    { id: "altitude", dimension: "climate", label: "Altitud", unit: "m s. n. m.", min: 0, max: 3200, direction: "optimum", target: 1250, tolerance: 1500, emphasis: [1.0, 1.0, 1.0, 0.85] },
    { id: "slope", dimension: "topography", label: "Pendiente", unit: "%", min: 0, max: 55, direction: "low", target: 15, emphasis: [1.25, 1.05, 1.4, 1.05] },
    { id: "mechanization", dimension: "topography", label: "Condiciones de mecanización", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "high", target: 70, emphasis: [1.0, 0.9, 1.45, 0.65] },
    { id: "erosionSusceptibility", dimension: "topography", label: "Susceptibilidad a erosión", unit: "%", min: 0, max: 100, direction: "low", target: 25, emphasis: [1.15, 1.0, 1.25, 1.05] },
    { id: "physicalAccess", dimension: "topography", label: "Accesibilidad física", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "high", target: 70, emphasis: [1.3, 1.1, 1.0, 0.75] },
    { id: "currentErosion", dimension: "environment", label: "Erosión actual", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "low", target: 20, emphasis: [1.15, 1.05, 1.2, 1.1] },
    { id: "degradationRisk", dimension: "environment", label: "Susceptibilidad a degradación", unit: "%", min: 0, max: 100, direction: "low", target: 25, emphasis: [1.05, 1.0, 1.1, 1.35] },
    { id: "floodRisk", dimension: "environment", label: "Amenaza de inundación", unit: "%", min: 0, max: 100, direction: "low", target: 20, emphasis: [1.2, 1.2, 1.15, 1.0] },
    { id: "environmentalRestriction", dimension: "environment", label: "Restricciones ambientales", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "low", target: 10, emphasis: [1.0, 1.0, 1.0, 1.0] },
    { id: "conservation", dimension: "environment", label: "Condiciones de conservación", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "optimum", target: 55, tolerance: 55, emphasis: [0.9, 0.95, 0.9, 1.0] },
    { id: "foragePotential", dimension: "soil", label: "Potencial didáctico de producción de forraje", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "high", target: 75, emphasis: [0.75, 1.45, 0.8, 1.25] },
    { id: "pastureAvailability", dimension: "water", label: "Disponibilidad de pasturas", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "high", target: 70, emphasis: [0.65, 1.25, 0.6, 1.45] },
    { id: "carryingCapacity", dimension: "environment", label: "Capacidad de soporte", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "high", target: 70, emphasis: [0.6, 1.25, 0.6, 1.4] },
    { id: "waterlogging", dimension: "water", label: "Encharcamiento potencial", unit: "%", min: 0, max: 100, direction: "low", target: 20, emphasis: [1.1, 0.9, 1.1, 0.8] },
    { id: "soilCompaction", dimension: "soil", label: "Compactación potencial", unit: "índice didáctico 0–100", min: 0, max: 100, direction: "low", target: 20, emphasis: [0.95, 1.05, 1.25, 0.95] }
  ];

  const DEFAULT_THRESHOLDS = { s1: 80, s2: 60, s3: 40 };
  const CRITICAL_BY_ACTIVITY = [
    ["waterAvailability", "soilDepth", "floodRisk", "environmentalRestriction"],
    ["waterAvailability", "foragePotential", "floodRisk", "environmentalRestriction"],
    ["soilDepth", "slope", "floodRisk", "environmentalRestriction"],
    ["pastureAvailability", "degradationRisk", "environmentalRestriction"]
  ];

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function normaliseWeights(weights) {
    if (!Array.isArray(weights) || weights.length === 0 ||
        weights.some(function (value) { return !Number.isFinite(value) || value < 0; })) {
      throw new TypeError("Los pesos deben ser una lista no vacía de números finitos no negativos.");
    }
    const total = weights.reduce(function (sum, value) { return sum + value; }, 0);
    if (!(total > 0) || !Number.isFinite(total)) {
      const equal = 1 / weights.length;
      return weights.map(function () { return equal; });
    }
    const normalized = weights.map(function (value) { return value / total; });
    const prefix = normalized.slice(0, -1).reduce(function (sum, value) { return sum + value; }, 0);
    normalized[normalized.length - 1] = Math.max(0, 1 - prefix);
    return normalized;
  }

  function getOfferScore(criterion, value) {
    if (!Number.isFinite(value)) return 0;
    if (criterion.direction === "high") {
      return clamp((value - criterion.min) / (criterion.max - criterion.min) * 100, 0, 100);
    }
    if (criterion.direction === "low") {
      return clamp((criterion.max - value) / (criterion.max - criterion.min) * 100, 0, 100);
    }
    return clamp((1 - Math.abs(value - criterion.target) / criterion.tolerance) * 100, 0, 100);
  }

  function getValueFromOffer(criterion, offer) {
    const boundedOffer = clamp(offer, 0, 100);
    if (criterion.direction === "high") {
      return criterion.min + (criterion.max - criterion.min) * boundedOffer / 100;
    }
    if (criterion.direction === "low") {
      return criterion.max - (criterion.max - criterion.min) * boundedOffer / 100;
    }
    return clamp(criterion.target + criterion.tolerance * (1 - boundedOffer / 100),
      criterion.min, criterion.max);
  }

  function getCellOffer(criterionIndex, x, y, size) {
    const criterion = CRITERIA[criterionIndex];
    const seed = criterionIndex + 1;
    const nx = x / Math.max(1, size - 1);
    const ny = y / Math.max(1, size - 1);
    const dx = (x - (size - 1) / 2) / size;
    const dy = (y - (size - 1) / 2) / size;
    const radial = Math.hypot(dx, dy) * 1.414;
    const wave = Math.sin((x + seed * 5) / (8 + seed % 9)) *
      Math.cos((y - seed * 3) / (10 + seed % 7));
    const diagonal = Math.sin((x + y + seed * 11) / 19);
    return clamp(68 + wave * 23 + diagonal * 12 + (0.5 - radial) * 20 +
      (nx - ny) * ((seed % 2 ? 1 : -1) * 8), 3, 97);
  }

  function createDefaultTerritory(size) {
    return CRITERIA.map(function (source, criterionIndex) {
      const criterion = Object.assign({}, source, { seed: criterionIndex + 1 });
      const values = new Float32Array(size * size);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const index = y * size + x;
          values[index] = getValueFromOffer(criterion, getCellOffer(criterionIndex, x, y, size));
        }
      }
      return values;
    });
  }

  function createDefaultProfiles() {
    return ACTIVITIES.map(function (activity, activityIndex) {
      const rawWeights = CRITERIA.map(function (criterion) { return criterion.emphasis[activityIndex]; });
      const weights = normaliseWeights(rawWeights);
      const requirements = CRITERIA.map(function (criterion) {
        const activityBase = [51, 47, 49, 39][activityIndex];
        const importance = criterion.emphasis[activityIndex];
        return clamp(activityBase + (importance - 1) * 18, 12, 72);
      });
      const critical = new Uint8Array(CRITERIA.length);
      CRITICAL_BY_ACTIVITY[activityIndex].forEach(function (criterionId) {
        const index = CRITERIA.findIndex(function (criterion) { return criterion.id === criterionId; });
        if (index >= 0) critical[index] = 1;
      });
      return { activityId: activity.id, weights: weights, requirements: requirements, critical: critical };
    });
  }

  function classify(score, thresholds) {
    if (score >= thresholds.s1) return 0;
    if (score >= thresholds.s2) return 1;
    if (score >= thresholds.s3) return 2;
    return 3;
  }

  function scoreFactor(offer, requirement) {
    if (requirement >= 100) return offer >= 100 ? 100 : offer / 100 * 40;
    if (offer < requirement) {
      return requirement <= 0 ? offer : offer / requirement * 40;
    }
    return 40 + (offer - requirement) / (100 - requirement) * 60;
  }

  function evaluateRaster(values, profiles, thresholds, size) {
    if (!Array.isArray(values) || values.length !== CRITERIA.length ||
        !Array.isArray(profiles) || profiles.length !== ACTIVITIES.length ||
        !Number.isInteger(size) || size <= 0 ||
        values.some(function (layer) { return !layer || layer.length !== size * size; }) ||
        ![thresholds.s1, thresholds.s2, thresholds.s3].every(Number.isFinite) ||
        thresholds.s1 <= thresholds.s2 || thresholds.s2 <= thresholds.s3 ||
        thresholds.s3 < 1 || thresholds.s1 > 100) {
      throw new TypeError("El MAT requiere capas y perfiles completos, dimensiones iguales y umbrales S1 > S2 > S3 entre 0 y 100.");
    }
    const cellCount = size * size;
    const factorScores = CRITERIA.map(function () {
      return ACTIVITIES.map(function () { return new Float32Array(cellCount); });
    });
    const indices = ACTIVITIES.map(function () { return new Float32Array(cellCount); });
    const weightedIndices = ACTIVITIES.map(function () { return new Float32Array(cellCount); });
    const classes = ACTIVITIES.map(function () { return new Uint8Array(cellCount); });
    const criticalLimitations = ACTIVITIES.map(function () { return new Uint8Array(cellCount); });
    const dominant = new Int8Array(cellCount);
    dominant.fill(-1);
    const dominantClass = new Uint8Array(cellCount);

    for (let cell = 0; cell < cellCount; cell += 1) {
      let highest = -1;
      let leader = -1;
      for (let activityIndex = 0; activityIndex < ACTIVITIES.length; activityIndex += 1) {
        const profile = profiles[activityIndex];
        let weighted = 0;
        let hasCriticalLimit = false;
        for (let criterionIndex = 0; criterionIndex < CRITERIA.length; criterionIndex += 1) {
          const offer = getOfferScore(CRITERIA[criterionIndex], values[criterionIndex][cell]);
          const factorScore = scoreFactor(offer, profile.requirements[criterionIndex]);
          factorScores[criterionIndex][activityIndex][cell] = factorScore;
          weighted += profile.weights[criterionIndex] * factorScore;
          if (profile.critical[criterionIndex] && factorScore < thresholds.s3) hasCriticalLimit = true;
        }
        weightedIndices[activityIndex][cell] = weighted;
        const finalScore = hasCriticalLimit ? Math.min(weighted, Math.max(0, thresholds.s3 - 0.01)) : weighted;
        indices[activityIndex][cell] = finalScore;
        const category = classify(finalScore, thresholds);
        classes[activityIndex][cell] = category;
        criticalLimitations[activityIndex][cell] = hasCriticalLimit ? 1 : 0;
        if (category !== 3 && finalScore > highest) {
          highest = finalScore;
          leader = activityIndex;
        }
      }
      if (leader >= 0) {
        dominant[cell] = leader;
        dominantClass[cell] = classes[leader][cell];
      } else {
        dominantClass[cell] = 3;
      }
    }
    return {
      factorScores: factorScores,
      indices: indices,
      weightedIndices: weightedIndices,
      classes: classes,
      criticalLimitations: criticalLimitations,
      dominant: dominant,
      dominantClass: dominantClass,
      thresholds: Object.assign({}, thresholds),
      count: cellCount,
      size: size
    };
  }

  function getClassLabel(category) {
    return CLASSES[category] ? CLASSES[category].label : "Sin clasificación";
  }

  function getClassFromScore(score, thresholds) {
    return classify(score, thresholds);
  }

  function getUsageType(regulation, raster, territory, rules, activities, cell, activityIndex) {
    return regulation.getUsageTypeForCell(raster, territory, rules, activities, cell, activityIndex).useType;
  }

  function compareTerritory(result, economicRaster, regulationModule,
    territory, rules, activities, thresholds, cellArea) {
    const perActivity = ACTIVITIES.map(function () { return new Int32Array(4); });
    const dominantCounts = new Int32Array(5);
    const integrationCounts = new Int32Array(6);
    const integrationStatus = new Uint8Array(result.count);
    const tripleLeader = new Int8Array(result.count);
    tripleLeader.fill(-1);
    let highArea = 0;
    let mediumArea = 0;
    let lowArea = 0;
    let notSuitableArea = 0;

    for (let cell = 0; cell < result.count; cell += 1) {
      for (let activity = 0; activity < ACTIVITIES.length; activity += 1) {
        perActivity[activity][result.classes[activity][cell]] += 1;
      }
      const aptitudeLeader = result.dominant[cell];
      if (aptitudeLeader < 0) {
        dominantCounts[4] += 1;
      } else {
        dominantCounts[result.dominantClass[cell]] += 1;
      }

      const bestEconomic = economicRaster.specialization[cell];
      let tripleActivity = -1;
      let bestTripleScore = -1;
      let hasAptitudeNoProfit = false;
      let hasProfitLowAptitude = false;
      let hasNormativeConflict = false;
      for (let activity = 0; activity < ACTIVITIES.length; activity += 1) {
        const score = result.indices[activity][cell];
        const category = result.classes[activity][cell];
        const rent = economicRaster.rentSurfaces[activity][cell];
        const useType = getUsageType(regulationModule, economicRaster, territory,
          rules, activities, cell, activity);
        const allowed = useType === "principal" || useType === "compatible";
        if (score >= thresholds.s3 && rent > 0 && allowed && score > bestTripleScore) {
          bestTripleScore = score;
          tripleActivity = activity;
        }
        if (category <= 1 && rent <= 0) hasAptitudeNoProfit = true;
        if (bestEconomic === activity && rent > 0 && category >= 2) hasProfitLowAptitude = true;
        if (score >= thresholds.s3 && rent > 0 && useType === "prohibited") {
          hasNormativeConflict = true;
        }
      }
      let status;
      if (tripleActivity >= 0 && hasNormativeConflict) status = 5;
      else if (tripleActivity >= 0) status = 0;
      else if (hasNormativeConflict) status = 3;
      else if (hasAptitudeNoProfit) status = 1;
      else if (hasProfitLowAptitude) status = 2;
      else status = 4;
      tripleLeader[cell] = tripleActivity;
      integrationStatus[cell] = status;
      integrationCounts[status] += 1;

      const dominantIndex = aptitudeLeader < 0 ? -1 : result.indices[aptitudeLeader][cell];
      if (dominantIndex >= thresholds.s1) highArea += cellArea;
      else if (dominantIndex >= thresholds.s2) mediumArea += cellArea;
      else if (dominantIndex >= thresholds.s3) lowArea += cellArea;
      else notSuitableArea += cellArea;
    }
    return {
      perActivity: perActivity,
      dominantCounts: dominantCounts,
      integrationCounts: integrationCounts,
      integrationStatus: integrationStatus,
      tripleLeader: tripleLeader,
      highArea: highArea,
      mediumArea: mediumArea,
      lowArea: lowArea,
      notSuitableArea: notSuitableArea,
      cellArea: cellArea
    };
  }

  const RECOMMENDATIONS = {
    waterAvailability: "Revisar disponibilidad y variabilidad hídrica local; cualquier intervención requiere evaluación de fuentes, permisos y sostenibilidad.",
    waterDeficitRisk: "Evaluar balance hídrico y alternativas de manejo del agua con asistencia técnica; no se garantiza que el riego sea viable.",
    soilDepth: "Verificar la profundidad efectiva en campo y la presencia de capas limitantes antes de seleccionar prácticas productivas.",
    soilFertility: "Confirmar con análisis de suelo y recomendaciones técnicas locales antes de plantear enmiendas o fertilización.",
    soilPh: "Validar el pH mediante muestreo representativo y consultar asistencia agronómica antes de corregirlo.",
    drainage: "Verificar drenaje en distintas épocas; las obras de drenaje pueden requerir permisos y evaluación ambiental.",
    slope: "Evaluar prácticas de conservación y mecanización apropiadas al relieve; evitar intervenir sin diagnóstico de erosión.",
    erosionSusceptibility: "Priorizar evaluación de cobertura y conservación del suelo; las medidas dependen del sitio.",
    currentErosion: "Solicitar diagnóstico local de erosión y valorar prácticas de cobertura y conservación con asistencia técnica.",
    degradationRisk: "Revisar intensidad y carga de uso; las medidas de manejo no garantizan la recuperación del suelo.",
    floodRisk: "Consultar mapas y estudios oficiales de amenaza y riesgo; no se recomienda asumir que obras resuelven la exposición.",
    environmentalRestriction: "Verificar determinantes y restricciones ambientales oficiales; una limitación normativa no se elimina con manejo agronómico.",
    pastureAvailability: "Verificar oferta estacional de pasturas y capacidad de soporte mediante evaluación local.",
    foragePotential: "Confirmar el potencial forrajero con observaciones locales y validar especies o sistemas con asistencia técnica.",
    carryingCapacity: "Estimar capacidad de carga con información local y evitar extrapolar el índice didáctico."
  };

  function diagnose(result, values, profiles, cell, activityIndex, thresholds) {
    const profile = profiles[activityIndex];
    const factors = CRITERIA.map(function (criterion, criterionIndex) {
      const offer = getOfferScore(criterion, values[criterionIndex][cell]);
      const score = result.factorScores[criterionIndex][activityIndex][cell];
      return {
        criterionId: criterion.id,
        label: criterion.label,
        value: values[criterionIndex][cell],
        unit: criterion.unit,
        offerScore: offer,
        score: score,
        category: classify(score, thresholds),
        weight: profile.weights[criterionIndex],
        requiredOffer: profile.requirements[criterionIndex],
        critical: profile.critical[criterionIndex] === 1,
        source: DEMO_SOURCE,
        quality: DEMO_QUALITY,
        function: criterion.direction === "optimum"
          ? "Índice de proximidad a un valor objetivo didáctico."
          : criterion.direction === "low"
            ? "Escala inversa normalizada en el rango didáctico."
            : "Escala directa normalizada en el rango didáctico."
      };
    });
    const limiting = factors.slice().sort(function (a, b) {
      const criticalDifference = Number(b.critical && b.score < thresholds.s3) -
        Number(a.critical && a.score < thresholds.s3);
      return criticalDifference || a.score - b.score;
    })[0];
    return {
      activity: ACTIVITIES[activityIndex],
      score: result.indices[activityIndex][cell],
      weightedScore: result.weightedIndices[activityIndex][cell],
      category: result.classes[activityIndex][cell],
      criticalLimitation: result.criticalLimitations[activityIndex][cell] === 1,
      favorable: factors.filter(function (factor) { return factor.score >= thresholds.s2; }),
      unfavorable: factors.filter(function (factor) { return factor.score < thresholds.s2; }),
      mainLimitation: limiting,
      recommendation: RECOMMENDATIONS[limiting.criterionId] ||
        "Verificar el factor limitante en campo y revisar alternativas con asistencia técnica local; el indicador no garantiza que una intervención sea suficiente.",
      factors: factors
    };
  }

  window.VonThunenTerritorialSuitability = Object.freeze({
    ACTIVITIES: ACTIVITIES,
    DIMENSIONS: DIMENSIONS,
    CLASSES: CLASSES,
    CRITERIA: CRITERIA,
    DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
    DEMO_SOURCE: DEMO_SOURCE,
    DEMO_QUALITY: DEMO_QUALITY,
    createDefaultTerritory: createDefaultTerritory,
    createDefaultProfiles: createDefaultProfiles,
    normaliseWeights: normaliseWeights,
    getOfferScore: getOfferScore,
    getValueFromOffer: getValueFromOffer,
    scoreFactor: scoreFactor,
    classify: classify,
    getClassLabel: getClassLabel,
    getClassFromScore: getClassFromScore,
    evaluateRaster: evaluateRaster,
    compareTerritory: compareTerritory,
    diagnose: diagnose
  });
}());
