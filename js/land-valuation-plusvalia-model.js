(function () {
  "use strict";

  const INTERVENTIONS = [
    { id: "road", label: "Construcción de carretera" },
    { id: "pavement", label: "Pavimentación / transitabilidad" },
    { id: "isolated_connection", label: "Conexión de zona aislada" },
    { id: "land_use", label: "Cambio de uso del suelo" },
    { id: "urban_expansion", label: "Incorporación a expansión urbana" },
    { id: "building_potential", label: "Mayor aprovechamiento edificatorio" },
    { id: "market", label: "Cambio de localización del mercado" }
  ];

  function finiteOrZero(value) {
    return Number.isFinite(value) ? value : 0;
  }

  function percentageChange(initial, posterior) {
    if (!Number.isFinite(initial) || initial <= 0) return null;
    if (!Number.isFinite(posterior)) return null;
    return (posterior - initial) / initial * 100;
  }

  function selectedValue(mvesResult, cell, scenario) {
    if (!mvesResult) return 0;
    const field = scenario === "admissible" ? "admissibleValue" : "potentialValue";
    return finiteOrZero(mvesResult[field] && mvesResult[field][cell]);
  }

  function dominantLeader(mvesResult, cell, scenario) {
    if (!mvesResult) return -1;
    const field = scenario === "admissible" ? "admissibleValueLeader" : "potentialValueLeader";
    return mvesResult[field] ? mvesResult[field][cell] : -1;
  }

  function dominantLandRent(mvesResult, cell, scenario) {
    if (!mvesResult) return 0;
    const leader = dominantLeader(mvesResult, cell, scenario);
    if (leader < 0) return 0;
    return finiteOrZero(mvesResult.activities[leader].landRent[cell]);
  }

  function dominantTransport(mvesResult, cell, scenario) {
    if (!mvesResult) return 0;
    const leader = dominantLeader(mvesResult, cell, scenario);
    if (leader < 0) return 0;
    return finiteOrZero(mvesResult.activities[leader].transportCosts[cell]);
  }

  function dominantProductivity(mvesResult, cell, scenario) {
    if (!mvesResult) return 0;
    const leader = dominantLeader(mvesResult, cell, scenario);
    if (leader < 0) return 0;
    return finiteOrZero(mvesResult.activities[leader].productivityFactor[cell]);
  }

  function compare(initial, posterior, options) {
    const count = Math.min(initial.count, posterior.count);
    const scenario = options.scenario || "potential";
    const interventionIds = options.interventionIds || [];
    const referenceBefore = Number(options.referenceBefore);
    const referenceAfter = Number(options.referenceAfter);
    const areaPerCellM2 = Number(options.areaPerCellM2);
    const participation = Number(options.participation);
    const factorsEnabled = options.factors || {};
    const hasCommercialReferences = Number.isFinite(referenceBefore) &&
      referenceBefore > 0 && Number.isFinite(referenceAfter) && referenceAfter > 0 &&
      areaPerCellM2 > 0;
    const initialValues = new Float64Array(count);
    const posteriorValues = new Float64Array(count);
    const absoluteChange = new Float64Array(count);
    const percentChange = new Float64Array(count);
    percentChange.fill(NaN);
    const plusvaliaPerM2 = new Float64Array(count);
    const plusvaliaTotal = new Float64Array(count);
    const participationTotal = new Float64Array(count);
    const dominantChange = new Int8Array(count);
    dominantChange.fill(0);
    const factorScores = {
      transport: 0,
      accessibility: 0,
      rent: 0,
      productivity: 0,
      landUse: 0,
      buildingPotential: 0,
      urbanExpansion: 0,
      other: 0
    };

    let initialAverage = 0;
    let posteriorAverage = 0;
    let valuedSurface = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    let plusvaliaCount = 0;
    let plusvaliaEffect = 0;
    let rentChange = 0;
    let transportChange = 0;
    let accessibilityChange = 0;
    let useChangeCount = 0;
    let urbanBeneficiaryCount = 0;

    for (let cell = 0; cell < count; cell += 1) {
      const beforeValue = selectedValue(initial, cell, scenario);
      const afterValue = selectedValue(posterior, cell, scenario);
      const delta = afterValue - beforeValue;
      const percent = percentageChange(beforeValue, afterValue);
      initialValues[cell] = beforeValue;
      posteriorValues[cell] = afterValue;
      absoluteChange[cell] = delta;
      if (percent !== null) percentChange[cell] = percent;

      initialAverage += beforeValue;
      posteriorAverage += afterValue;
      if (beforeValue > 0 || afterValue > 0) valuedSurface += 1;
      if (delta > 0) positiveCount += 1;
      if (delta < 0) negativeCount += 1;

      const beforeLeader = dominantLeader(initial, cell, scenario);
      const afterLeader = dominantLeader(posterior, cell, scenario);
      if (beforeLeader !== afterLeader) dominantChange[cell] = 1;

      const beforeRent = dominantLandRent(initial, cell, scenario);
      const afterRent = dominantLandRent(posterior, cell, scenario);
      const rentDelta = afterRent - beforeRent;
      rentChange += rentDelta;

      const beforeTransport = dominantTransport(initial, cell, scenario);
      const afterTransport = dominantTransport(posterior, cell, scenario);
      const transportDelta = afterTransport - beforeTransport;
      transportChange += transportDelta;

      const beforeProductivity = dominantProductivity(initial, cell, scenario);
      const afterProductivity = dominantProductivity(posterior, cell, scenario);
      const productivityDelta = afterProductivity - beforeProductivity;
      if (productivityDelta !== 0 && factorsEnabled.aptitude !== false) {
        factorScores.productivity += productivityDelta;
      }

      const transportBenefit = Math.max(0, -transportDelta);
      if (factorsEnabled.transport !== false) factorScores.transport += transportBenefit;

      if (rentDelta !== 0 && factorsEnabled.rent !== false) factorScores.rent += rentDelta;

      const beforeActivity = initial.activities[beforeLeader];
      const afterActivity = posterior.activities[afterLeader];
      if (beforeActivity && afterActivity) {
        const beforeUse = beforeActivity.useType[cell];
        const afterUse = afterActivity.useType[cell];
        if (beforeUse !== afterUse && factorsEnabled.landUse !== false) {
          useChangeCount += 1;
          factorScores.landUse += delta;
        }
      }

      if (interventionIds.indexOf("road") >= 0 ||
          interventionIds.indexOf("pavement") >= 0 ||
          interventionIds.indexOf("isolated_connection") >= 0 ||
          interventionIds.indexOf("market") >= 0) {
        if (factorsEnabled.accessibility !== false) {
          factorScores.accessibility += Math.abs(delta) * 0.15;
        }
      }

      const urbanIntervention = interventionIds.indexOf("urban_expansion") >= 0 ||
        interventionIds.indexOf("land_use") >= 0 ||
        interventionIds.indexOf("building_potential") >= 0;
      if (urbanIntervention && delta > 0) {
        urbanBeneficiaryCount += 1;
        if (interventionIds.indexOf("urban_expansion") >= 0) {
          factorScores.urbanExpansion += delta;
        }
        if (interventionIds.indexOf("building_potential") >= 0) {
          if (factorsEnabled.building !== false) factorScores.buildingPotential += delta;
        }
      }

      if (hasCommercialReferences && urbanIntervention) {
        plusvaliaPerM2[cell] = Math.max(0, referenceAfter - referenceBefore);
        plusvaliaTotal[cell] = plusvaliaPerM2[cell] * areaPerCellM2;
        const participationRate = Number.isFinite(participation) ? participation / 100 : 0;
        participationTotal[cell] = participationRate > 0
          ? plusvaliaTotal[cell] * participationRate
          : 0;
        if (plusvaliaPerM2[cell] > 0) {
          plusvaliaCount += 1;
          plusvaliaEffect += plusvaliaTotal[cell];
        }
      }

      accessibilityChange += options.initialAccessibility && options.posteriorAccessibility
        ? options.posteriorAccessibility[cell] - options.initialAccessibility[cell]
        : 0;
    }

    return {
      count: count,
      scenario: scenario,
      initialValues: initialValues,
      posteriorValues: posteriorValues,
      absoluteChange: absoluteChange,
      percentChange: percentChange,
      plusvaliaPerM2: plusvaliaPerM2,
      plusvaliaTotal: plusvaliaTotal,
      participationTotal: participationTotal,
      dominantChange: dominantChange,
      factors: factorScores,
      indicators: {
        initialAverage: count ? initialAverage / count : 0,
        posteriorAverage: count ? posteriorAverage / count : 0,
        economicIncrement: posteriorAverage - initialAverage,
        positiveSurfacePercent: count ? positiveCount / count * 100 : 0,
        negativeSurfacePercent: count ? negativeCount / count * 100 : 0,
        valuedSurfacePercent: count ? valuedSurface / count * 100 : 0,
        positiveCount: positiveCount,
        negativeCount: negativeCount,
        useChangeCount: useChangeCount,
        urbanBeneficiaryCount: urbanBeneficiaryCount,
        rentChange: rentChange / count,
        transportChange: transportChange / count,
        accessibilityChange: accessibilityChange / count,
        plusvaliaCount: plusvaliaCount,
        plusvaliaEffect: plusvaliaEffect,
        hasCommercialReferences: hasCommercialReferences
      }
    };
  }

  window.VonThunenLandValuationPlusvalia = Object.freeze({
    INTERVENTIONS: INTERVENTIONS,
    percentageChange: percentageChange,
    compare: compare
  });
}());
