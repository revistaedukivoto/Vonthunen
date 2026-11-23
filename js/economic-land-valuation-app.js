(function () {
  "use strict";

  const model = window.VonThunenEconomicLandValuation;
  const territorialApp = window.VonThunenTerritorialApp;
  const suitabilityApp = window.VonThunenTerritorialSuitabilityApp;
  const regulation = window.VonThunenTerritorialRegulation;
  const simulation = territorialApp.getState();
  const suitability = suitabilityApp.getState();
  const canvas = document.getElementById("mves-value-map");
  const context = canvas.getContext("2d", { alpha: false });
  const profilesContainer = document.getElementById("mves-activity-config");
  const state = {
    profiles: model.createDefaultProfiles(),
    common: model.createDefaultCommon(),
    sensitivities: [{ field: "", percent: 0 }, { field: "", percent: 0 }],
    result: null
  };
  const moneyFormat = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
  const percentFormat = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
  const landMeasureFormat = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

  function formatMoney(value) {
    return Number.isFinite(value) ? moneyFormat.format(Math.round(value)) : "No estimación positiva";
  }

  function formatPercent(value) {
    return percentFormat.format(value * 100) + " %";
  }

  function createNumberField(parent, labelText, value, key, min, max, step, unit) {
    const label = document.createElement("label");
    label.className = "mves-field";
    const title = document.createElement("span");
    title.textContent = labelText;
    const unitText = document.createElement("small");
    unitText.textContent = unit;
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(min);
    if (max !== null) input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.dataset.v06Key = key;
    input.setAttribute("aria-label", labelText + " · " + unit);
    label.appendChild(title);
    label.appendChild(input);
    label.appendChild(unitText);
    parent.appendChild(label);
  }

  function renderActivityProfiles() {
    profilesContainer.replaceChildren();
    state.profiles.forEach(function (profile, index) {
      const details = document.createElement("details");
      details.className = "mves-activity-card";
      if (index === 0) details.open = true;
      const summary = document.createElement("summary");
      summary.textContent = profile.label + " · " + profile.productUnit;
      details.appendChild(summary);

      const production = document.createElement("div");
      production.className = "mves-production-fields";
      [
        ["Precio de venta", profile.price, "price", 0, null, 1, "COP/" + profile.productUnit],
        ["Rendimiento base", profile.yieldPerHaCycle, "yieldPerHaCycle", 0, null, 1, profile.productUnit + "/ha/ciclo"],
        ["Ciclos por año", profile.cyclesPerYear, "cyclesPerYear", 0, 20, 0.1, "ciclos/año"],
        ["Pérdidas", profile.lossRate * 100, "lossRatePercent", 0, 100, 1, "%"],
        ["Piso de la respuesta productiva", profile.aptitudeFloor * 100, "aptitudeFloorPercent", 0, 100, 1, "%"],
        ["Exponente de respuesta", profile.aptitudeExponent, "aptitudeExponent", 0.1, 5, 0.1, "parámetro"]
      ].forEach(function (field) {
        createNumberField(production, field[0], field[1], field[2], field[3],
          field[4], field[5], field[6]);
      });
      production.querySelectorAll("input").forEach(function (input) {
        input.dataset.v06Activity = String(index);
      });
      details.appendChild(production);

      const costs = document.createElement("div");
      costs.className = "mves-cost-grid";
      const variableGroup = document.createElement("section");
      variableGroup.className = "mves-cost-group";
      const variableHeading = document.createElement("h5");
      variableHeading.textContent = "Costos variables · COP/ha/ciclo";
      variableGroup.appendChild(variableHeading);
      const variableFields = document.createElement("div");
      variableFields.className = "mves-cost-fields";
      model.VARIABLE_COSTS.forEach(function (category) {
        createNumberField(variableFields, category.label, profile.variableCosts[category.id],
          "variableCosts." + category.id, 0, null, 1000, "COP/ha/ciclo");
      });
      variableGroup.appendChild(variableFields);
      variableGroup.querySelectorAll("input").forEach(function (input) {
        input.dataset.v06Activity = String(index);
        input.dataset.v06Group = "variableCosts";
      });

      const fixedGroup = document.createElement("section");
      fixedGroup.className = "mves-cost-group";
      const fixedHeading = document.createElement("h5");
      fixedHeading.textContent = "Costos fijos · COP/ha/año";
      fixedGroup.appendChild(fixedHeading);
      const fixedFields = document.createElement("div");
      fixedFields.className = "mves-cost-fields";
      model.FIXED_COSTS.forEach(function (category) {
        createNumberField(fixedFields, category.label, profile.fixedCosts[category.id],
          "fixedCosts." + category.id, 0, null, 1000, "COP/ha/año");
      });
      fixedGroup.appendChild(fixedFields);
      fixedGroup.querySelectorAll("input").forEach(function (input) {
        input.dataset.v06Activity = String(index);
        input.dataset.v06Group = "fixedCosts";
      });

      const factorGroup = document.createElement("section");
      factorGroup.className = "mves-cost-group";
      const factorHeading = document.createElement("h5");
      factorHeading.textContent = "Remuneración de factores no territoriales · COP/ha/año";
      factorGroup.appendChild(factorHeading);
      const factorFields = document.createElement("div");
      factorFields.className = "mves-cost-fields";
      model.FACTOR_COMPENSATION.forEach(function (category) {
        createNumberField(factorFields, category.label, profile.factorCompensation[category.id],
          "factorCompensation." + category.id, 0, null, 1000, "COP/ha/año");
      });
      factorGroup.appendChild(factorFields);
      factorGroup.querySelectorAll("input").forEach(function (input) {
        input.dataset.v06Activity = String(index);
        input.dataset.v06Group = "factorCompensation";
      });

      costs.appendChild(variableGroup);
      costs.appendChild(fixedGroup);
      costs.appendChild(factorGroup);
      details.appendChild(costs);
      profilesContainer.appendChild(details);
    });
  }

  function populateSensitivityOptions() {
    ["mves-sensitivity-a", "mves-sensitivity-b"].forEach(function (id) {
      const select = document.getElementById(id);
      select.replaceChildren();
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "Sin cambio";
      select.appendChild(none);
      model.SENSITIVITY_FIELDS.forEach(function (field) {
        const option = document.createElement("option");
        option.value = field.id;
        option.textContent = field.label;
        select.appendChild(option);
      });
    });
  }

  function syncCommonControls() {
    document.getElementById("mves-method").value = state.common.method;
    document.getElementById("mves-scenario").value = state.common.scenario;
    document.getElementById("mves-transport-conversion").value =
      String(state.common.transportConversionFactor);
    document.getElementById("mves-cap-rate").value = String(state.common.capitalizationRate * 100);
    document.getElementById("mves-discount-rate").value = String(state.common.discountRate * 100);
    document.getElementById("mves-horizon").value = String(state.common.horizonYears);
    document.getElementById("mves-income-growth").value = String(state.common.incomeGrowth * 100);
    document.getElementById("mves-cost-growth").value = String(state.common.costGrowth * 100);
    document.getElementById("mves-terminal-value").value = String(state.common.terminalValuePerHa);
  }

  function updateSensitivityReadouts() {
    ["a", "b"].forEach(function (key, index) {
      document.getElementById("mves-sensitivity-" + key).value = state.sensitivities[index].field;
      document.getElementById("mves-sensitivity-" + key + "-value").value =
        String(state.sensitivities[index].percent);
      document.getElementById("mves-sensitivity-" + key + "-output").textContent =
        (state.sensitivities[index].percent > 0 ? "+" : "") +
        state.sensitivities[index].percent + " %";
    });
  }

  function readCommonControls() {
    return {
      method: document.getElementById("mves-method").value,
      scenario: document.getElementById("mves-scenario").value,
      transportConversionFactor: Number(
        document.getElementById("mves-transport-conversion").value),
      capitalizationRate: Number(document.getElementById("mves-cap-rate").value) / 100,
      discountRate: Number(document.getElementById("mves-discount-rate").value) / 100,
      horizonYears: Number(document.getElementById("mves-horizon").value),
      incomeGrowth: Number(document.getElementById("mves-income-growth").value) / 100,
      costGrowth: Number(document.getElementById("mves-cost-growth").value) / 100,
      terminalValuePerHa: Number(document.getElementById("mves-terminal-value").value)
    };
  }

  function updateCommonControls() {
    const requiredIds = [
      "mves-cap-rate", "mves-discount-rate", "mves-horizon",
      "mves-transport-conversion", "mves-income-growth", "mves-cost-growth",
      "mves-terminal-value"
    ];
    if (requiredIds.some(function (id) {
      return document.getElementById(id).value.trim() === "";
    })) {
      document.getElementById("mves-status").textContent =
        "Completa todos los parámetros económicos antes de recalcular.";
      document.getElementById("mves-status").classList.add("is-error");
      syncCommonControls();
      return;
    }
    const next = readCommonControls();
    const valid = ["capitalizationRate", "discountRate"].every(function (key) {
      return Number.isFinite(next[key]) && next[key] >= 0 && next[key] <= 1;
    }) && Number.isInteger(next.horizonYears) && next.horizonYears >= 1 && next.horizonYears <= 100 &&
      Number.isFinite(next.transportConversionFactor) && next.transportConversionFactor >= 0 &&
      Number.isFinite(next.incomeGrowth) && next.incomeGrowth > -1 && next.incomeGrowth <= 1 &&
      Number.isFinite(next.costGrowth) && next.costGrowth > -1 && next.costGrowth <= 1 &&
      Number.isFinite(next.terminalValuePerHa) && next.terminalValuePerHa >= 0;
    const status = document.getElementById("mves-status");
    if (!valid) {
      status.textContent = "Revisa tasas (0–100%), horizonte (1–100 años), crecimientos (mayores que −100%) y valor terminal no negativo.";
      status.classList.add("is-error");
      syncCommonControls();
      return;
    }
    state.common = next;
    status.textContent = "Parámetros activos. Tasa de capitalización y descuento son distintas; cada método usa la correspondiente.";
    status.classList.remove("is-error");
    recompute();
  }

  function updateActivityProfile(input) {
    const index = Number(input.dataset.v06Activity);
    const profile = state.profiles[index];
    const value = Number(input.value);
    if (input.value.trim() === "" || !Number.isFinite(value) || value < Number(input.min) ||
        (input.max !== "" && value > Number(input.max))) {
      const currentKey = input.dataset.v06Key;
      const currentValue = input.dataset.v06Group
        ? profile[input.dataset.v06Group][input.dataset.v06Cost ||
          currentKey.split(".")[1]]
        : currentKey === "lossRatePercent"
          ? profile.lossRate * 100
          : currentKey === "aptitudeFloorPercent"
            ? profile.aptitudeFloor * 100
            : profile[currentKey];
      input.value = String(currentValue);
      document.getElementById("mves-status").textContent =
        "El valor debe ser numérico y respetar el rango indicado.";
      document.getElementById("mves-status").classList.add("is-error");
      return;
    }
    const key = input.dataset.v06Key;
    if (input.dataset.v06Group) {
      profile[input.dataset.v06Group][input.dataset.v06Cost ||
        key.split(".")[1]] = value;
    } else if (key === "lossRatePercent") {
      profile.lossRate = value / 100;
    } else if (key === "aptitudeFloorPercent") {
      profile.aptitudeFloor = value / 100;
    } else {
      profile[key] = value;
    }
    document.getElementById("mves-status").classList.remove("is-error");
    recompute();
  }

  function updateSensitivity(slot) {
    const index = slot === "a" ? 0 : 1;
    state.sensitivities[index] = {
      field: document.getElementById("mves-sensitivity-" + slot).value,
      percent: Number(document.getElementById("mves-sensitivity-" + slot + "-value").value)
    };
    document.getElementById("mves-sensitivity-" + slot + "-output").textContent =
      (state.sensitivities[index].percent > 0 ? "+" : "") +
      state.sensitivities[index].percent + " %";
    recompute();
  }

  function getCurrentValue(activityResult, cell) {
    if (state.common.method === "capitalization") return activityResult.capitalizedValue[cell];
    return activityResult.discountedValue[cell];
  }

  function getMapData() {
    return state.common.scenario === "admissible"
      ? { values: state.result.admissibleValue, leaders: state.result.admissibleValueLeader }
      : { values: state.result.potentialValue, leaders: state.result.potentialValueLeader };
  }

  function drawMap() {
    const data = getMapData();
    let maximum = 0;
    for (let cell = 0; cell < data.values.length; cell += 1) {
      if (data.values[cell] > maximum) maximum = data.values[cell];
    }
    const image = context.createImageData(100, 100);
    const low = [242, 238, 224];
    const high = [52, 121, 83];
    const noValue = [231, 235, 229];
    for (let cell = 0; cell < data.values.length; cell += 1) {
      const offset = cell * 4;
      const amount = maximum > 0 && data.values[cell] > 0
        ? Math.min(1, data.values[cell] / maximum)
        : -1;
      const color = amount < 0
        ? noValue
        : low.map(function (channel, index) {
          return Math.round(channel + (high[index] - channel) * amount);
        });
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const selected = simulation.selectedCell;
    context.save();
    context.strokeStyle = "#20352d";
    context.lineWidth = 1;
    context.strokeRect(selected.x + 0.1, selected.y + 0.1, 0.8, 0.8);
    context.restore();
    document.getElementById("mves-map-range").textContent =
      maximum > 0 ? "0 – " + formatMoney(maximum) + " COP/ha" : "No hay valores positivos para este escenario.";
    document.getElementById("mves-map-scenario").textContent =
      state.common.scenario === "admissible"
        ? "Usos principales o compatibles"
        : "Valor potencial hipotético";
  }

  function appendSummaryCard(parent, label, value, note, color) {
    const card = document.createElement("div");
    card.className = "governance-metric mves-summary-card";
    const title = document.createElement("span");
    title.textContent = label;
    const amount = document.createElement("b");
    amount.textContent = value;
    if (color) amount.style.color = color;
    const detail = document.createElement("small");
    detail.textContent = note;
    card.appendChild(title);
    card.appendChild(amount);
    card.appendChild(detail);
    parent.appendChild(card);
  }

  function usageLabel(type) {
    const item = regulation.USE_TYPES.find(function (entry) { return entry.id === type; });
    return item ? item.label : "Sin regla";
  }

  function aptitudeLabel(activity, cell) {
    const classIndex = suitability.result.classes[activity][cell];
    return modelActivityClass(classIndex);
  }

  function modelActivityClass(classIndex) {
    const matModel = window.VonThunenTerritorialSuitability;
    return matModel.CLASSES[classIndex] ? matModel.CLASSES[classIndex].label : "Sin clasificación";
  }

  function methodValueText(activityResult, cell) {
    if (state.common.method === "capitalization") {
      const value = activityResult.capitalizedValue[cell];
      return Number.isFinite(value) && value > 0
        ? formatMoney(value) + " COP/ha"
        : "No válida: R ≤ 0 o tasa = 0";
    }
    const value = activityResult.discountedValue[cell];
    return Number.isFinite(value) && value > 0
      ? formatMoney(value) + " COP/ha"
      : "Sin valor positivo (" + formatMoney(value) + " COP/ha)";
  }

  function renderComparisonRows(cell) {
    const body = document.getElementById("mves-comparison-rows");
    body.replaceChildren();
    const activityDefinitions = simulation.config.activities;
    state.result.activities.forEach(function (activityResult, index) {
      const row = document.createElement("tr");
      const use = activityResult.useType[cell];
      const values = [
        activityDefinitions[index].name,
        formatMoney(activityResult.grossRevenue[cell]),
        formatMoney(activityResult.operatingCosts[cell]),
        formatMoney(activityResult.transportCosts[cell]),
        formatMoney(activityResult.operatingMargin[cell]),
        formatMoney(activityResult.otherFactorCompensation[cell]),
        formatMoney(activityResult.entrepreneurialReturn[cell]),
        formatMoney(activityResult.landRent[cell]),
        state.common.method === "capitalization"
          ? formatPercent(state.common.capitalizationRate)
          : formatPercent(state.common.discountRate),
        methodValueText(activityResult, cell),
        aptitudeLabel(index, cell),
        usageLabel(use)
      ];
      values.forEach(function (value, column) {
        const cellElement = document.createElement("td");
        cellElement.textContent = value;
        if (column === 0) cellElement.style.color = activityDefinitions[index].color;
        if (column === 7) {
          cellElement.className = activityResult.landRent[cell] > 0 ? "mves-positive" : "mves-nonpositive";
        }
        if (column === 9 && (use === "prohibited" || use === "conditioned")) {
          cellElement.className = "mves-nonpositive";
        }
        row.appendChild(cellElement);
      });
      body.appendChild(row);
    });
  }

  function renderCell(cell) {
    const simulationCell = simulation.selectedCell;
    const activities = simulation.config.activities;
    const potentialRentIndex = state.result.potentialRentLeader[cell];
    const allowedRentIndex = state.result.admissibleRentLeader[cell];
    const scenarioRentIndex = state.common.scenario === "admissible"
      ? allowedRentIndex
      : potentialRentIndex;
    const valueLeaders = getMapData().leaders;
    const valueIndex = valueLeaders[cell];
    const matLeader = suitability.result.dominant[cell];
    document.getElementById("mves-cell-title").textContent =
      "Celda (x: " + simulationCell.x + ", y: " + simulationCell.y + ") · " +
      (state.common.scenario === "admissible" ? "escenario normativamente admisible" : "escenario potencial");
    const summary = document.getElementById("mves-cell-summary");
    summary.replaceChildren();
    const factItems = [
      ["Mayor renta residual", potentialRentIndex < 0
        ? "Sin renta positiva"
        : activities[potentialRentIndex].name + " · " +
          formatMoney(state.result.activities[potentialRentIndex].landRent[cell]) + " COP/ha/año"],
      ["Mayor renta entre usos admisibles", allowedRentIndex < 0
        ? "Ninguno con renta positiva"
        : activities[allowedRentIndex].name + " · " +
          formatMoney(state.result.activities[allowedRentIndex].landRent[cell]) + " COP/ha/año"],
      ["Mayor valor estimado", valueIndex < 0
        ? "Sin estimación positiva"
        : activities[valueIndex].name + " · " +
          formatMoney(getCurrentValue(state.result.activities[valueIndex], cell)) + " COP/ha"],
      ["Aptitud dominante (MAT)", matLeader < 0
        ? "Sin aptitud evaluada"
        : window.VonThunenTerritorialSuitability.ACTIVITIES[matLeader].label],
      ["Renta de localización Von Thünen", potentialRentIndex < 0
        ? "No se suma a la renta residual"
        : formatMoney(simulation.after.rentSurfaces[potentialRentIndex][cell]) + " COP/ha"]
    ];
    const matCriteria = window.VonThunenTerritorialSuitability.CRITERIA;
    [
      ["soilDepth", "Profundidad efectiva"],
      ["soilFertility", "Fertilidad del suelo"],
      ["waterAvailability", "Disponibilidad de agua"],
      ["slope", "Pendiente"],
      ["temperature", "Temperatura media"],
      ["environmentalRestriction", "Índice de restricciones ambientales"]
    ].forEach(function (item) {
      const criterionIndex = matCriteria.findIndex(function (criterion) {
        return criterion.id === item[0];
      });
      if (criterionIndex < 0) return;
      const criterion = matCriteria[criterionIndex];
      factItems.push([
        item[1] + " (MAT)",
        landMeasureFormat.format(suitability.values[criterionIndex][cell]) + " " + criterion.unit
      ]);
    });
    factItems.forEach(function (item) {
      const fact = document.createElement("div");
      fact.className = "mves-diagnostic-item";
      const title = document.createElement("span");
      title.textContent = item[0];
      const value = document.createElement("b");
      value.textContent = item[1];
      fact.appendChild(title);
      fact.appendChild(value);
      summary.appendChild(fact);
    });

    const notes = [];
    if (potentialRentIndex >= 0) {
      notes.push("El mayor residual potencial es " + activities[potentialRentIndex].name +
        " (" + formatMoney(state.result.activities[potentialRentIndex].landRent[cell]) +
        " COP/ha/año), antes de considerar si el uso está permitido.");
    } else {
      notes.push("Ninguna actividad tiene renta residual positiva en el escenario base de esta celda; la capitalización no entrega una estimación válida y el flujo descontado podría diferir según las proyecciones.");
    }
    if (valueIndex >= 0 && scenarioRentIndex >= 0 && valueIndex !== scenarioRentIndex) {
      notes.push("La actividad con mayor valor calculado (" + activities[valueIndex].name +
        ") difiere de la de mayor renta anual, por efecto de los flujos y tasas configurados.");
    }
    if (allowedRentIndex >= 0 && allowedRentIndex !== potentialRentIndex) {
      notes.push("Las reglas hipotéticas actuales cambian la alternativa admisible de mayor renta a " +
        activities[allowedRentIndex].name + ". Verifica el POT y las condiciones locales.");
    }
    const prohibitedActivities = state.result.activities.map(function (activity, index) {
      return activity.useType[cell] === "prohibited" && activity.landRent[cell] > 0
        ? activities[index].name
        : "";
    }).filter(Boolean);
    if (prohibitedActivities.length) {
      notes.push("El uso de " + prohibitedActivities.join(", ") +
        " aparece prohibido en las reglas didácticas actuales y no se presenta como aprovechamiento legal disponible.");
    }
    if (matLeader >= 0) {
      notes.push("La aptitud dominante es " +
        window.VonThunenTerritorialSuitability.ACTIVITIES[matLeader].label +
        "; la respuesta productiva se calcula con el índice MAT continuo y la curva editable de esa actividad, no equiparando una clase a un porcentaje de rendimiento.");
    }
    const conditional = state.result.activities.map(function (activity, index) {
      return activity.useType[cell] === "conditioned" && activity.landRent[cell] > 0
        ? activities[index].name + (activity.condition[cell]
          ? ": " + activity.condition[cell]
          : ": verificación pendiente.")
        : "";
    }).filter(Boolean);
    if (conditional.length) notes.push("Usos condicionados no incluidos como admisibles: " + conditional.join(" "));
    notes.push("El valor mostrado es una estimación económica didáctica por capitalización/flujo descontado, no un precio comercial.");
    document.getElementById("mves-interpretation").textContent = notes.join(" ");
    renderComparisonRows(cell);
  }

  function renderSummary() {
    const cell = simulation.selectedCell.y * 100 + simulation.selectedCell.x;
    const summary = document.getElementById("mves-summary");
    summary.replaceChildren();
    const activities = simulation.config.activities;
    function bestActivityBy(metric) {
      let best = -Infinity;
      let leader = -1;
      state.result.activities.forEach(function (activityResult, index) {
        const use = activityResult.useType[cell];
        if (state.common.scenario === "admissible" &&
            use !== "principal" && use !== "compatible") return;
        const value = activityResult[metric][cell];
        if (value > best) {
          best = value;
          leader = index;
        }
      });
      return { index: leader, value: best };
    }
    const incomeLeader = bestActivityBy("grossRevenue");
    const marginLeader = bestActivityBy("operatingMargin");
    const rentLeader = state.common.scenario === "admissible"
      ? state.result.admissibleRentLeader[cell]
      : state.result.potentialRentLeader[cell];
    const valueLeader = getMapData().leaders[cell];
    const valueFor = function (leader, metric, suffix) {
      return leader < 0 ? "Sin actividad" :
        formatMoney(state.result.activities[leader][metric][cell]) + " " + suffix;
    };
    appendSummaryCard(summary, "Mayor renta residual del suelo",
      valueFor(rentLeader, "landRent", "COP/ha/año"),
      rentLeader < 0 ? "Sin renta positiva en el escenario" : activities[rentLeader].name,
      rentLeader < 0 ? null : activities[rentLeader].color);
    appendSummaryCard(summary, "Mayor valor económico calculado",
      valueLeader < 0 ? "Sin estimación positiva" :
        formatMoney(getCurrentValue(state.result.activities[valueLeader], cell)) + " COP/ha",
      valueLeader < 0 ? "Sin estimación positiva en el escenario" : activities[valueLeader].name,
      valueLeader < 0 ? null : activities[valueLeader].color);
    appendSummaryCard(summary, "Mayor ingreso bruto",
      valueFor(incomeLeader.index, "grossRevenue", "COP/ha/año"),
      incomeLeader.index < 0 ? "Sin uso admisible" : activities[incomeLeader.index].name,
      incomeLeader.index < 0 ? null : activities[incomeLeader.index].color);
    appendSummaryCard(summary, "Mayor margen operativo",
      valueFor(marginLeader.index, "operatingMargin", "COP/ha/año"),
      marginLeader.index < 0 ? "Sin uso admisible" : activities[marginLeader.index].name,
      marginLeader.index < 0 ? null : activities[marginLeader.index].color);
    appendSummaryCard(summary, "Método y horizonte",
      state.common.method === "capitalization" ? "Capitalización" : "Flujo descontado",
      state.common.method === "capitalization"
        ? "Tasa " + formatPercent(state.common.capitalizationRate)
        : state.common.horizonYears + " años · tasa " + formatPercent(state.common.discountRate));
    appendSummaryCard(summary, "Aptitud territorial dominante",
      suitability.result.dominant[cell] < 0 ? "Sin aptitud evaluada" :
        window.VonThunenTerritorialSuitability.ACTIVITIES[suitability.result.dominant[cell]].label,
      "Dimensión distinta de renta, valor y admisibilidad.");
  }

  function paintDiagnostic() {
    const cell = simulation.selectedCell.y * 100 + simulation.selectedCell.x;
    drawMap();
    renderSummary();
    renderCell(cell);
  }

  function recompute() {
    state.result = model.evaluate(suitability.result, state.profiles,
      simulation.after, simulation.territory, simulation.rules,
      regulation, simulation.config.activities, state.common, state.sensitivities);
    const methodNote = document.getElementById("mves-method-note");
    methodNote.textContent = state.common.method === "capitalization"
      ? "V = R/r con R anual constante. Solo se muestra una estimación si la renta residual anual es positiva y la tasa de capitalización es mayor que cero."
      : "V = Σ[Rₜ/(1+r)ᵗ] + VTₙ/(1+r)ⁿ. El flujo usa crecimiento separado de ingresos y costos; el valor terminal solo se incorpora si la renta del último año es positiva.";
    document.getElementById("mves-sensitivity-summary").textContent =
      state.sensitivities.filter(function (item) { return item.field && item.percent !== 0; })
        .map(function (item) {
          const field = model.SENSITIVITY_FIELDS.find(function (candidate) {
            return candidate.id === item.field;
          });
          return field.label + " " + (item.percent > 0 ? "+" : "") + item.percent + "%";
        }).join(" · ") || "Sin variaciones de sensibilidad; se muestran los parámetros base.";
    paintDiagnostic();
  }

  function bindEvents() {
    profilesContainer.addEventListener("change", function (event) {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.dataset.v06Activity) return;
      updateActivityProfile(input);
    });
    [
      "mves-method", "mves-scenario", "mves-cap-rate", "mves-discount-rate",
      "mves-transport-conversion", "mves-horizon", "mves-income-growth",
      "mves-cost-growth", "mves-terminal-value"
    ].forEach(function (id) {
      document.getElementById(id).addEventListener("change", updateCommonControls);
    });
    ["a", "b"].forEach(function (key) {
      document.getElementById("mves-sensitivity-" + key)
        .addEventListener("change", function () { updateSensitivity(key); });
      document.getElementById("mves-sensitivity-" + key + "-value")
        .addEventListener("input", function () {
          document.getElementById("mves-sensitivity-" + key + "-output").textContent =
            (Number(this.value) > 0 ? "+" : "") + this.value + " %";
        });
      document.getElementById("mves-sensitivity-" + key + "-value")
        .addEventListener("change", function () { updateSensitivity(key); });
    });
    canvas.addEventListener("click", function (event) {
      const bounds = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(99,
        Math.floor((event.clientX - bounds.left) / bounds.width * 100)));
      const y = Math.max(0, Math.min(99,
        Math.floor((event.clientY - bounds.top) / bounds.height * 100)));
      territorialApp.selectCell(x, y, true);
    });
    document.getElementById("mves-reset").addEventListener("click", function () {
      reset();
    });
    window.addEventListener("territory:render", recompute);
    window.addEventListener("territory:cell-selected", paintDiagnostic);
    window.addEventListener("territory:reset", reset);
    window.addEventListener("mat:render", recompute);
  }

  function reset() {
    state.profiles = model.createDefaultProfiles();
    state.common = model.createDefaultCommon();
    state.sensitivities = [{ field: "", percent: 0 }, { field: "", percent: 0 }];
    renderActivityProfiles();
    syncCommonControls();
    updateSensitivityReadouts();
    document.getElementById("mves-status").textContent =
      "Parámetros iniciales didácticos restaurados.";
    document.getElementById("mves-status").classList.remove("is-error");
    recompute();
  }

  populateSensitivityOptions();
  renderActivityProfiles();
  syncCommonControls();
  updateSensitivityReadouts();
  bindEvents();
  recompute();
  window.VonThunenEconomicLandValuationApp = Object.freeze({
    getState: function () { return state; },
    recompute: recompute,
    reset: reset
  });
}());
