(function () {
  "use strict";

  const ACTIVITY_DEFAULTS = [
    {
      id: "horticultura", label: "Horticultura", productUnit: "kg", price: 2400,
      yieldPerHaCycle: 9000, cyclesPerYear: 2, lossRate: 0.1, aptitudeFloor: 0.2, aptitudeExponent: 1.4,
      variableCosts: { inputs: 2400000, fertilizer: 1250000, seeds: 680000, feed: 0, waterEnergy: 520000, marketing: 430000 },
      fixedCosts: { machinery: 850000, maintenance: 360000, other: 240000 },
      factorCompensation: { labor: 3100000, capital: 680000, management: 420000, entrepreneurialReturn: 750000 }
    },
    {
      id: "lecheria", label: "Producción lechera", productUnit: "l", price: 1750,
      yieldPerHaCycle: 6200, cyclesPerYear: 1, lossRate: 0.06, aptitudeFloor: 0.25, aptitudeExponent: 1.3,
      variableCosts: { inputs: 980000, fertilizer: 420000, seeds: 150000, feed: 1480000, waterEnergy: 620000, marketing: 350000 },
      fixedCosts: { machinery: 1050000, maintenance: 430000, other: 300000 },
      factorCompensation: { labor: 2400000, capital: 920000, management: 440000, entrepreneurialReturn: 520000 }
    },
    {
      id: "cereales", label: "Cultivos de cereales", productUnit: "kg", price: 1650,
      yieldPerHaCycle: 4800, cyclesPerYear: 1, lossRate: 0.08, aptitudeFloor: 0.2, aptitudeExponent: 1.5,
      variableCosts: { inputs: 720000, fertilizer: 690000, seeds: 390000, feed: 0, waterEnergy: 330000, marketing: 270000 },
      fixedCosts: { machinery: 940000, maintenance: 350000, other: 210000 },
      factorCompensation: { labor: 1150000, capital: 640000, management: 260000, entrepreneurialReturn: 300000 }
    },
    {
      id: "ganaderia", label: "Ganadería extensiva", productUnit: "kg vivo", price: 7800,
      yieldPerHaCycle: 190, cyclesPerYear: 1, lossRate: 0.04, aptitudeFloor: 0.3, aptitudeExponent: 1.2,
      variableCosts: { inputs: 190000, fertilizer: 0, seeds: 45000, feed: 260000, waterEnergy: 95000, marketing: 190000 },
      fixedCosts: { machinery: 270000, maintenance: 150000, other: 100000 },
      factorCompensation: { labor: 410000, capital: 210000, management: 130000, entrepreneurialReturn: 120000 }
    }
  ];
  const COMMON_DEFAULTS = {
    method: "capitalization",
    scenario: "potential",
    transportConversionFactor: 1,
    capitalizationRate: 0.08,
    discountRate: 0.09,
    horizonYears: 10,
    incomeGrowth: 0.02,
    costGrowth: 0.025,
    terminalValuePerHa: 0
  };
  const SENSITIVITY_FIELDS = [
    { id: "price", label: "Precio de venta" },
    { id: "yield", label: "Rendimiento base" },
    { id: "productionCost", label: "Costos de producción" },
    { id: "transport", label: "Costo de transporte" },
    { id: "capitalizationRate", label: "Tasa de capitalización" },
    { id: "discountRate", label: "Tasa de descuento" }
  ];
  const VARIABLE_COSTS = [
    { id: "inputs", label: "Otros insumos" },
    { id: "fertilizer", label: "Fertilizantes" },
    { id: "seeds", label: "Semillas" },
    { id: "feed", label: "Alimentación animal" },
    { id: "waterEnergy", label: "Agua y energía" },
    { id: "marketing", label: "Comercialización (sin transporte)" }
  ];
  const FIXED_COSTS = [
    { id: "machinery", label: "Maquinaria y depreciación" },
    { id: "maintenance", label: "Mantenimiento" },
    { id: "other", label: "Otros costos fijos" }
  ];
  const FACTOR_COMPENSATION = [
    { id: "labor", label: "Trabajo" },
    { id: "capital", label: "Capital y costo de oportunidad" },
    { id: "management", label: "Administración y gestión" },
    { id: "entrepreneurialReturn", label: "Beneficio empresarial imputado / riesgo" }
  ];

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function createDefaultProfiles() {
    return ACTIVITY_DEFAULTS.map(function (profile) {
      return {
        id: profile.id,
        label: profile.label,
        productUnit: profile.productUnit,
        price: profile.price,
        yieldPerHaCycle: profile.yieldPerHaCycle,
        cyclesPerYear: profile.cyclesPerYear,
        lossRate: profile.lossRate,
        aptitudeFloor: profile.aptitudeFloor,
        aptitudeExponent: profile.aptitudeExponent,
        variableCosts: Object.assign({}, profile.variableCosts),
        fixedCosts: Object.assign({}, profile.fixedCosts),
        factorCompensation: Object.assign({}, profile.factorCompensation)
      };
    });
  }

  function createDefaultCommon() {
    return Object.assign({}, COMMON_DEFAULTS);
  }

  function validateInputs(aptitude, profiles, economicRaster, territory, rules, activities, common) {
    if (!aptitude || !Number.isInteger(aptitude.count) ||
        !Array.isArray(aptitude.indices) || !Array.isArray(aptitude.classes) ||
        !Array.isArray(profiles) || profiles.length !== ACTIVITY_DEFAULTS.length ||
        !economicRaster || economicRaster.count !== aptitude.count ||
        !Array.isArray(economicRaster.transportCosts) ||
        economicRaster.transportCosts.length !== profiles.length ||
        !territory || !Array.isArray(rules) || !Array.isArray(activities) ||
        activities.length !== profiles.length ||
        !Number.isFinite(common.transportConversionFactor) || common.transportConversionFactor < 0 ||
        !Number.isFinite(common.capitalizationRate) || common.capitalizationRate < 0 ||
        !Number.isFinite(common.discountRate) || common.discountRate < 0 ||
        !Number.isInteger(common.horizonYears) || common.horizonYears < 1 ||
        common.horizonYears > 100 ||
        !Number.isFinite(common.incomeGrowth) || common.incomeGrowth <= -1 ||
        !Number.isFinite(common.costGrowth) || common.costGrowth <= -1 ||
        !Number.isFinite(common.terminalValuePerHa) || common.terminalValuePerHa < 0 ||
        ["capitalization", "dcf"].indexOf(common.method) < 0 ||
        ["potential", "admissible"].indexOf(common.scenario) < 0) {
      throw new TypeError("El MVES requiere capas raster, cuatro perfiles y parámetros económicos válidos.");
    }
    for (let activity = 0; activity < profiles.length; activity += 1) {
      const profile = profiles[activity];
      if (!profile || profile.id !== activities[activity].id ||
          !Number.isFinite(profile.price) || profile.price < 0 ||
          !Number.isFinite(profile.yieldPerHaCycle) || profile.yieldPerHaCycle < 0 ||
          !Number.isFinite(profile.cyclesPerYear) || profile.cyclesPerYear < 0 ||
          !Number.isFinite(profile.lossRate) || profile.lossRate < 0 || profile.lossRate > 1 ||
          !Number.isFinite(profile.aptitudeFloor) || profile.aptitudeFloor < 0 || profile.aptitudeFloor > 1 ||
          !Number.isFinite(profile.aptitudeExponent) || profile.aptitudeExponent <= 0 ||
          !profile.variableCosts || !profile.fixedCosts || !profile.factorCompensation ||
          !aptitude.indices[activity] || aptitude.indices[activity].length !== aptitude.count ||
          !aptitude.classes[activity] || aptitude.classes[activity].length !== aptitude.count ||
          !economicRaster.transportCosts[activity] ||
          economicRaster.transportCosts[activity].length !== aptitude.count) {
        throw new TypeError("El perfil y las superficies de cada actividad deben estar completos y ser compatibles.");
      }
      [VARIABLE_COSTS, FIXED_COSTS, FACTOR_COMPENSATION].forEach(function (categories) {
        categories.forEach(function (category) {
          const value = profile[category.id] !== undefined
            ? profile[category.id]
            : profile.variableCosts[category.id] !== undefined
              ? profile.variableCosts[category.id]
              : profile.fixedCosts[category.id] !== undefined
                ? profile.fixedCosts[category.id]
                : profile.factorCompensation[category.id];
          if (!Number.isFinite(value) || value < 0) {
            throw new TypeError("Los costos y remuneraciones deben ser números finitos no negativos.");
          }
        });
      });
    }
  }

  function getProductivityFactor(score, aptitudeClass, profile) {
    if (!Number.isFinite(score) || aptitudeClass === 3 || aptitudeClass < 0 || aptitudeClass > 3) return 0;
    const normalized = clamp(score / 100, 0, 1);
    return profile.aptitudeFloor +
      (1 - profile.aptitudeFloor) * Math.pow(normalized, profile.aptitudeExponent);
  }

  function sensitivityFactor(sensitivities, field) {
    return sensitivities.reduce(function (factor, item) {
      return item.field === field ? factor * Math.max(0, 1 + item.percent / 100) : factor;
    }, 1);
  }

  function sumCosts(profile, group) {
    return Object.keys(profile[group]).reduce(function (sum, key) {
      return sum + profile[group][key];
    }, 0);
  }

  function projectDiscountedValue(yearOneRevenue, yearOneCosts, settings, lastYearRent) {
    let value = 0;
    for (let year = 1; year <= settings.horizonYears; year += 1) {
      const revenue = yearOneRevenue * Math.pow(1 + settings.incomeGrowth, year - 1);
      const costs = yearOneCosts * Math.pow(1 + settings.costGrowth, year - 1);
      value += (revenue - costs) / Math.pow(1 + settings.discountRate, year);
    }
    if (settings.terminalValuePerHa > 0 && lastYearRent > 0) {
      value += settings.terminalValuePerHa / Math.pow(1 + settings.discountRate, settings.horizonYears);
    }
    return value;
  }

  function evaluate(aptitude, profiles, economicRaster, territory, rules, regulation,
    activities, common, sensitivities) {
    const activeSensitivities = (sensitivities || []).filter(function (item) {
      return item && SENSITIVITY_FIELDS.some(function (field) { return field.id === item.field; }) &&
        Number.isFinite(item.percent);
    });
    validateInputs(aptitude, profiles, economicRaster, territory, rules, activities, common);
    const count = aptitude.count;
    const activityResults = profiles.map(function () {
      return {
        productivityFactor: new Float32Array(count),
        effectiveYield: new Float32Array(count),
        grossRevenue: new Float64Array(count),
        variableCosts: new Float64Array(count),
        fixedCosts: new Float64Array(count),
        operatingCosts: new Float64Array(count),
        transportCosts: new Float64Array(count),
        factorCompensation: new Float64Array(count),
        otherFactorCompensation: new Float64Array(count),
        entrepreneurialReturn: new Float64Array(count),
        totalCosts: new Float64Array(count),
        operatingMargin: new Float64Array(count),
        landRent: new Float64Array(count),
        capitalizedValue: new Float64Array(count),
        discountedValue: new Float64Array(count),
        useType: new Array(count),
        condition: new Array(count)
      };
    });
    const potentialRentLeader = new Int8Array(count);
    const admissibleRentLeader = new Int8Array(count);
    const potentialValueLeader = new Int8Array(count);
    const admissibleValueLeader = new Int8Array(count);
    potentialRentLeader.fill(-1);
    admissibleRentLeader.fill(-1);
    potentialValueLeader.fill(-1);
    admissibleValueLeader.fill(-1);
    const potentialValue = new Float64Array(count);
    const admissibleValue = new Float64Array(count);
    const potentialValueCellCounts = new Int32Array(profiles.length);
    const admissibleValueCellCounts = new Int32Array(profiles.length);

    for (let cell = 0; cell < count; cell += 1) {
      let bestPotentialRent = 0;
      let bestAllowedRent = 0;
      let bestPotentialValue = 0;
      let bestAllowedValue = 0;
      for (let activity = 0; activity < profiles.length; activity += 1) {
        const profile = profiles[activity];
        const result = activityResults[activity];
        const aptitudeScore = aptitude.indices[activity][cell];
        const aptitudeClass = aptitude.classes[activity][cell];
        const response = getProductivityFactor(aptitudeScore, aptitudeClass, profile);
        const yieldFactor = sensitivityFactor(activeSensitivities, "yield");
        const priceFactor = sensitivityFactor(activeSensitivities, "price");
        const productionCostFactor = sensitivityFactor(activeSensitivities, "productionCost");
        const transportFactor = sensitivityFactor(activeSensitivities, "transport");
        const baseYield = profile.yieldPerHaCycle * profile.cyclesPerYear *
          (1 - profile.lossRate) * response * yieldFactor;
        const revenue = baseYield * profile.price * priceFactor;
        const variableCosts = sumCosts(profile, "variableCosts") *
          profile.cyclesPerYear * productionCostFactor;
        const fixedCosts = sumCosts(profile, "fixedCosts") * productionCostFactor;
        const operatingCosts = variableCosts + fixedCosts;
        const transport = economicRaster.transportCosts[activity][cell] *
          common.transportConversionFactor * transportFactor;
        const factorCompensation = sumCosts(profile, "factorCompensation");
        const entrepreneurialReturn = profile.factorCompensation.entrepreneurialReturn;
        const otherFactorCompensation = factorCompensation - entrepreneurialReturn;
        const totalCosts = operatingCosts + transport + factorCompensation;
        const operatingMargin = revenue - operatingCosts - transport;
        const landRent = operatingMargin - factorCompensation;
        const capitalizationRate = common.capitalizationRate *
          sensitivityFactor(activeSensitivities, "capitalizationRate");
        const discountRate = common.discountRate *
          sensitivityFactor(activeSensitivities, "discountRate");
        const settings = Object.assign({}, common, { discountRate: discountRate });
        const lastRent = revenue * Math.pow(1 + common.incomeGrowth, common.horizonYears - 1) -
          totalCosts * Math.pow(1 + common.costGrowth, common.horizonYears - 1);
        const discountedValue = projectDiscountedValue(revenue, totalCosts, settings, lastRent);
        const capitalizedValue = landRent > 0 && capitalizationRate > 0
          ? landRent / capitalizationRate
          : NaN;
        const use = regulation.getUsageTypeForCell(economicRaster, territory,
          rules, activities, cell, activity);
        const permitted = use.useType === "principal" || use.useType === "compatible";

        result.productivityFactor[cell] = response;
        result.effectiveYield[cell] = baseYield;
        result.grossRevenue[cell] = revenue;
        result.variableCosts[cell] = variableCosts;
        result.fixedCosts[cell] = fixedCosts;
        result.operatingCosts[cell] = operatingCosts;
        result.transportCosts[cell] = transport;
        result.factorCompensation[cell] = factorCompensation;
        result.otherFactorCompensation[cell] = otherFactorCompensation;
        result.entrepreneurialReturn[cell] = entrepreneurialReturn;
        result.totalCosts[cell] = totalCosts;
        result.operatingMargin[cell] = operatingMargin;
        result.landRent[cell] = landRent;
        result.capitalizedValue[cell] = capitalizedValue;
        result.discountedValue[cell] = discountedValue;
        result.useType[cell] = use.useType;
        result.condition[cell] = use.condition;

        const selectedValue = common.method === "capitalization"
          ? capitalizedValue
          : discountedValue > 0 ? discountedValue : NaN;
        const validValue = Number.isFinite(selectedValue) && selectedValue > 0 ? selectedValue : 0;
        if (landRent > bestPotentialRent) {
          bestPotentialRent = landRent;
          potentialRentLeader[cell] = activity;
        }
        if (permitted && landRent > bestAllowedRent) {
          bestAllowedRent = landRent;
          admissibleRentLeader[cell] = activity;
        }
        if (validValue > bestPotentialValue) {
          bestPotentialValue = validValue;
          potentialValueLeader[cell] = activity;
        }
        if (permitted && validValue > bestAllowedValue) {
          bestAllowedValue = validValue;
          admissibleValueLeader[cell] = activity;
        }
      }
      potentialValue[cell] = bestPotentialValue;
      admissibleValue[cell] = bestAllowedValue;
      if (potentialValueLeader[cell] >= 0) potentialValueCellCounts[potentialValueLeader[cell]] += 1;
      if (admissibleValueLeader[cell] >= 0) admissibleValueCellCounts[admissibleValueLeader[cell]] += 1;
    }

    return {
      count: count,
      activities: activityResults,
      potentialRentLeader: potentialRentLeader,
      admissibleRentLeader: admissibleRentLeader,
      potentialValueLeader: potentialValueLeader,
      admissibleValueLeader: admissibleValueLeader,
      potentialValue: potentialValue,
      admissibleValue: admissibleValue,
      potentialValueCellCounts: potentialValueCellCounts,
      admissibleValueCellCounts: admissibleValueCellCounts,
      method: common.method,
      scenario: common.scenario,
      common: Object.assign({}, common),
      sensitivities: activeSensitivities.slice()
    };
  }

  window.VonThunenEconomicLandValuation = Object.freeze({
    ACTIVITIES: ACTIVITY_DEFAULTS,
    COMMON_DEFAULTS: COMMON_DEFAULTS,
    SENSITIVITY_FIELDS: SENSITIVITY_FIELDS,
    VARIABLE_COSTS: VARIABLE_COSTS,
    FIXED_COSTS: FIXED_COSTS,
    FACTOR_COMPENSATION: FACTOR_COMPENSATION,
    createDefaultProfiles: createDefaultProfiles,
    createDefaultCommon: createDefaultCommon,
    getProductivityFactor: getProductivityFactor,
    projectDiscountedValue: projectDiscountedValue,
    evaluate: evaluate
  });
}());
