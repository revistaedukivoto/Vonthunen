(function () {
  "use strict";

  const model = window.VonThunenTerritorialSuitability;
  const territorialApp = window.VonThunenTerritorialApp;
  const regulation = window.VonThunenTerritorialRegulation;
  const simulation = territorialApp.getState();
  const size = window.VonThunenMapAlgebra.DEFAULT_SIZE;
  const state = {
    values: model.createDefaultTerritory(size),
    defaultValues: model.createDefaultTerritory(size),
    globalAdjustments: new Float32Array(model.CRITERIA.length),
    cellOverrides: model.CRITERIA.map(function () { return new Map(); }),
    profiles: model.createDefaultProfiles(),
    thresholds: Object.assign({}, model.DEFAULT_THRESHOLDS),
    result: null,
    comparison: null,
    mapMode: "dominant",
    mapActivity: 0,
    mapCriterion: 0,
    diagnosticActivity: 0,
    editorCriterion: 0
  };
  const numberFormat = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
  const CLASS_COLORS = model.CLASSES.map(function (item) { return item.color; });
  const INTEGRATION = [
    { id: "triple", label: "Coinciden aptitud, renta y uso admisible", color: "#347953" },
    { id: "aptitude-no-rent", label: "Alta aptitud, sin renta positiva", color: "#6d9fc0" },
    { id: "economic-low-aptitude", label: "Líder económico con aptitud baja/N", color: "#e5aa50" },
    { id: "prohibited", label: "Aptitud y renta positivas, uso prohibido", color: "#c75d56" },
    { id: "other", label: "Otras combinaciones o sin coincidencia", color: "#e7ebe5" },
    { id: "triple-and-conflict", label: "Coincidencia triple y conflicto normativo en otro uso", color: "#7851a9" }
  ];
  const activitySelect = document.getElementById("mat-map-activity");
  const criterionSelect = document.getElementById("mat-map-criterion");
  const diagnosticSelect = document.getElementById("mat-diagnostic-activity");
  const editorCriterionSelect = document.getElementById("mat-editor-criterion");
  const profileContainer = document.getElementById("mat-profile-matrices");
  const valueEditor = document.getElementById("mat-cell-value-editor");
  const canvas = document.getElementById("suitability-map");
  const mapContext = canvas.getContext("2d", { alpha: false });

  function format(value, digits) {
    return new Intl.NumberFormat("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits === undefined ? 1 : digits
    }).format(value);
  }

  function createOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function addSelectOptions() {
    model.ACTIVITIES.forEach(function (activity) {
      createOption(activitySelect, String(model.ACTIVITIES.indexOf(activity)), activity.label);
      createOption(diagnosticSelect, String(model.ACTIVITIES.indexOf(activity)), activity.label);
    });
    model.CRITERIA.forEach(function (criterion, index) {
      createOption(criterionSelect, String(index), criterion.label);
      createOption(editorCriterionSelect, String(index), criterion.label);
    });
  }

  function dimensionLabel(dimensionId) {
    const dimension = model.DIMENSIONS.find(function (item) { return item.id === dimensionId; });
    return dimension ? dimension.label : "Criterio";
  }

  function responseText(criterion) {
    if (criterion.direction === "high") return "Escala directa: más oferta genera mayor puntaje normalizado.";
    if (criterion.direction === "low") return "Escala inversa: menos valor genera mayor puntaje normalizado.";
    return "Función de proximidad a un objetivo didáctico; cae al alejarse del valor de referencia.";
  }

  function renderProfileMatrices() {
    while (profileContainer.firstChild) profileContainer.removeChild(profileContainer.firstChild);
    model.ACTIVITIES.forEach(function (activity, activityIndex) {
      const details = document.createElement("details");
      details.className = "mat-profile-details";
      if (activityIndex === 0) details.open = true;
      const summary = document.createElement("summary");
      summary.textContent = activity.label;
      const weightSummary = document.createElement("span");
      weightSummary.id = "mat-weight-summary-" + activityIndex;
      summary.appendChild(weightSummary);
      details.appendChild(summary);

      const tableWrap = document.createElement("div");
      tableWrap.className = "mat-profile-table-wrap";
      const table = document.createElement("table");
      table.className = "mat-profile-table";
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      ["CRITERIO · RANGO · FUNCIÓN · FUENTE", "PESO", "OFERTA MÍN.", "CRÍTICO"].forEach(function (label) {
        const header = document.createElement("th");
        header.textContent = label;
        headerRow.appendChild(header);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);
      const tbody = document.createElement("tbody");

      model.CRITERIA.forEach(function (criterion, criterionIndex) {
        const row = document.createElement("tr");
        const description = document.createElement("td");
        const name = document.createElement("b");
        name.textContent = criterion.label;
        const metadata = document.createElement("small");
        metadata.textContent = dimensionLabel(criterion.dimension) + " · rango didáctico " +
          format(criterion.min, 2) + "–" + format(criterion.max, 2) + " " + criterion.unit +
          " · " + responseText(criterion) + " · " + model.DEMO_SOURCE + " Calidad: " + model.DEMO_QUALITY;
        description.appendChild(name);
        description.appendChild(metadata);

        const weightCell = document.createElement("td");
        const weight = document.createElement("input");
        weight.type = "number";
        weight.min = "0";
        weight.max = "1";
        weight.step = "0.01";
        weight.value = state.profiles[activityIndex].weights[criterionIndex].toFixed(4);
        weight.setAttribute("aria-label", "Peso de " + criterion.label + " para " + activity.label);
        weight.dataset.matWeight = activityIndex + ":" + criterionIndex;
        weight.addEventListener("change", function () {
          const value = Number(weight.value);
          if (!Number.isFinite(value) || value < 0 || value > 1) {
            weight.value = state.profiles[activityIndex].weights[criterionIndex].toFixed(4);
            return;
          }
          const weights = state.profiles[activityIndex].weights.slice();
          weights[criterionIndex] = value;
          state.profiles[activityIndex].weights = model.normaliseWeights(weights);
          updateWeightControls(activityIndex);
          recompute();
        });
        weightCell.appendChild(weight);

        const requirementCell = document.createElement("td");
        const requirement = document.createElement("input");
        requirement.type = "number";
        requirement.min = "0";
        requirement.max = "100";
        requirement.step = "1";
        requirement.value = state.profiles[activityIndex].requirements[criterionIndex].toFixed(1);
        requirement.setAttribute("aria-label", "Oferta mínima requerida para " + criterion.label + " en " + activity.label);
        requirement.addEventListener("change", function () {
          const value = Number(requirement.value);
          if (!Number.isFinite(value) || value < 0 || value > 100) {
            requirement.value = state.profiles[activityIndex].requirements[criterionIndex].toFixed(1);
            return;
          }
          state.profiles[activityIndex].requirements[criterionIndex] = value;
          recompute();
        });
        requirementCell.appendChild(requirement);

        const criticalCell = document.createElement("td");
        criticalCell.className = "mat-critical-cell";
        const critical = document.createElement("input");
        critical.type = "checkbox";
        critical.checked = state.profiles[activityIndex].critical[criterionIndex] === 1;
        critical.setAttribute("aria-label", "Usar " + criterion.label + " como limitante crítica para " + activity.label);
        critical.addEventListener("change", function () {
          state.profiles[activityIndex].critical[criterionIndex] = critical.checked ? 1 : 0;
          recompute();
        });
        criticalCell.appendChild(critical);
        [description, weightCell, requirementCell, criticalCell].forEach(function (cell) {
          row.appendChild(cell);
        });
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      details.appendChild(tableWrap);
      profileContainer.appendChild(details);
      updateWeightControls(activityIndex);
    });
  }

  function updateWeightControls(activityIndex) {
    const profile = state.profiles[activityIndex];
    let total = 0;
    profile.weights.forEach(function (weight, criterionIndex) {
      total += weight;
      const input = document.querySelector('[data-mat-weight="' + activityIndex + ":" + criterionIndex + '"]');
      if (input) input.value = weight.toFixed(4);
    });
    const totalElement = document.getElementById("mat-weight-summary-" + activityIndex);
    if (totalElement) totalElement.textContent = "· Σ pesos = " + total.toFixed(4);
  }

  function readThresholdInputs() {
    return {
      s1: Number(document.getElementById("mat-threshold-s1").value),
      s2: Number(document.getElementById("mat-threshold-s2").value),
      s3: Number(document.getElementById("mat-threshold-s3").value)
    };
  }

  function updateThresholds() {
    const next = readThresholdInputs();
    const valid = [next.s1, next.s2, next.s3].every(function (value) {
      return Number.isFinite(value) && value >= 1 && value <= 100;
    }) && next.s1 > next.s2 && next.s2 > next.s3;
    const status = document.getElementById("mat-threshold-status");
    if (!valid) {
      status.textContent = "Los umbrales deben estar entre 1 y 100 y cumplir S1 > S2 > S3.";
      status.classList.add("is-error");
      document.getElementById("mat-threshold-s1").value = state.thresholds.s1;
      document.getElementById("mat-threshold-s2").value = state.thresholds.s2;
      document.getElementById("mat-threshold-s3").value = state.thresholds.s3;
      return;
    }
    state.thresholds = next;
    status.textContent = "Umbrales didácticos activos; se aplican luego de las limitantes críticas.";
    status.classList.remove("is-error");
    recompute();
  }

  function interpolate(start, end, amount) {
    const factor = Math.max(0, Math.min(1, amount));
    const from = start.match(/[A-Fa-f0-9]{2}/g).map(function (value) { return parseInt(value, 16); });
    const to = end.match(/[A-Fa-f0-9]{2}/g).map(function (value) { return parseInt(value, 16); });
    return from.map(function (value, index) {
      return Math.round(value + (to[index] - value) * factor);
    });
  }

  function parseHex(color) {
    return color.slice(1).match(/[A-Fa-f0-9]{2}/g).map(function (value) { return parseInt(value, 16); });
  }

  function paintClasses(context, classes) {
    const image = context.createImageData(size, size);
    for (let cell = 0; cell < classes.length; cell += 1) {
      const color = parseHex(CLASS_COLORS[classes[cell]]);
      const offset = cell * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  function paintDominant(context) {
    const image = context.createImageData(size, size);
    for (let cell = 0; cell < state.result.count; cell += 1) {
      const leader = state.result.dominant[cell];
      const color = leader < 0 ? parseHex("#e7ebe5") : parseHex(model.ACTIVITIES[leader].color);
      const offset = cell * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  function paintCriterion(context, criterionIndex) {
    const criterion = model.CRITERIA[criterionIndex];
    const values = state.values[criterionIndex];
    const image = context.createImageData(size, size);
    for (let cell = 0; cell < values.length; cell += 1) {
      const score = model.getOfferScore(criterion, values[cell]) / 100;
      const color = interpolate("#f2eee0", "#347953", score);
      const offset = cell * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  function integrationColor(statusIndex) {
    return parseHex(INTEGRATION[statusIndex].color);
  }

  function paintIntegration(context) {
    const image = context.createImageData(size, size);
    for (let cell = 0; cell < state.result.count; cell += 1) {
      const color = integrationColor(state.comparison.integrationStatus[cell]);
      const offset = cell * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  function drawCellMarker(context) {
    const selected = simulation.selectedCell;
    context.save();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1;
    context.strokeRect(selected.x, selected.y, 1, 1);
    context.restore();
  }

  function paintMainMap() {
    if (state.mapMode === "activity") {
      paintClasses(mapContext, state.result.classes[state.mapActivity]);
    } else if (state.mapMode === "criterion") {
      paintCriterion(mapContext, state.mapCriterion);
    } else if (state.mapMode === "integration") {
      paintIntegration(mapContext);
    } else {
      paintDominant(mapContext);
    }
    drawCellMarker(mapContext);
    renderMapLegend();
    const note = document.getElementById("mat-map-note");
    if (state.mapMode === "activity") {
      note.textContent = "Clasificación " + model.ACTIVITIES[state.mapActivity].label +
        "; la categoría N no se mejora por efecto de la renta económica.";
    } else if (state.mapMode === "criterion") {
      const criterion = model.CRITERIA[state.mapCriterion];
      note.textContent = criterion.label + " · " + criterion.unit +
        ". Color = oferta normalizada; rangos sintéticos, calidad demostrativa.";
    } else if (state.mapMode === "integration") {
      note.textContent = "Coincidencia de aptitud, renta positiva y uso normativamente principal/compatible, o los conflictos señalados.";
    } else {
      note.textContent = "Líder de aptitud física/ambiental (desempate por orden de leyenda); no representa la actividad más rentable.";
    }
  }

  function createLegendItem(parent, color, label) {
    const item = document.createElement("span");
    item.className = "mat-legend-item";
    const swatch = document.createElement("i");
    swatch.style.backgroundColor = color;
    const text = document.createElement("span");
    text.textContent = label;
    item.appendChild(swatch);
    item.appendChild(text);
    parent.appendChild(item);
  }

  function renderMapLegend() {
    const legend = document.getElementById("mat-map-legend");
    while (legend.firstChild) legend.removeChild(legend.firstChild);
    if (state.mapMode === "activity") {
      model.CLASSES.forEach(function (item) { createLegendItem(legend, item.color, item.label); });
    } else if (state.mapMode === "criterion") {
      createLegendItem(legend, "#f2eee0", "Oferta menor");
      createLegendItem(legend, "#347953", "Oferta mayor");
    } else if (state.mapMode === "integration") {
      INTEGRATION.forEach(function (item) { createLegendItem(legend, item.color, item.label); });
    } else {
      model.ACTIVITIES.forEach(function (activity) { createLegendItem(legend, activity.color, activity.label); });
      createLegendItem(legend, "#e7ebe5", "Sin aptitud evaluada");
    }
  }

  function paintGallery() {
    model.ACTIVITIES.forEach(function (activity, index) {
      paintClasses(document.getElementById("mat-activity-map-" + index).getContext("2d", { alpha: false }),
        state.result.classes[index]);
      document.getElementById("mat-activity-label-" + index).textContent = activity.label;
    });
    paintDominant(document.getElementById("mat-dominant-map").getContext("2d", { alpha: false }));
    paintIntegration(document.getElementById("mat-integration-map").getContext("2d", { alpha: false }));
    const legend = document.getElementById("mat-class-legend");
    while (legend.firstChild) legend.removeChild(legend.firstChild);
    model.CLASSES.forEach(function (item) { createLegendItem(legend, item.color, item.label); });
    model.ACTIVITIES.forEach(function (activity) { createLegendItem(legend, activity.color, activity.label); });
    INTEGRATION.forEach(function (item) { createLegendItem(legend, item.color, item.label); });
  }

  function classCounts(values) {
    const counts = new Int32Array(4);
    values.forEach(function (value) { counts[value] += 1; });
    return counts;
  }

  function createSummaryCard(label, value, note, color) {
    const card = document.createElement("div");
    card.className = "governance-metric mat-summary-card";
    const title = document.createElement("span");
    title.textContent = label;
    const amount = document.createElement("b");
    amount.textContent = value;
    if (color) amount.style.color = color;
    const caption = document.createElement("small");
    caption.textContent = note;
    card.appendChild(title);
    card.appendChild(amount);
    card.appendChild(caption);
    return card;
  }

  function renderIndicators() {
    const summary = document.getElementById("mat-summary");
    const rows = document.getElementById("mat-results-rows");
    const area = state.comparison.cellArea;
    summary.replaceChildren();
    rows.replaceChildren();
    const totals = state.comparison.dominantCounts;
    summary.appendChild(createSummaryCard("Aptitud alta S1", format(state.comparison.highArea) + " km²",
      format(totals[0]) + " celdas"));
    summary.appendChild(createSummaryCard("Aptitud media S2", format(state.comparison.mediumArea) + " km²",
      format(totals[1]) + " celdas"));
    summary.appendChild(createSummaryCard("Aptitud marginal S3", format(state.comparison.lowArea) + " km²",
      format(totals[2]) + " celdas"));
    summary.appendChild(createSummaryCard("Sin aptitud / N", format(state.comparison.notSuitableArea) + " km²",
      format(totals[3] + totals[4]) + " celdas"));

    model.ACTIVITIES.forEach(function (activity, index) {
      const row = document.createElement("tr");
      const activityCell = document.createElement("td");
      activityCell.textContent = activity.label;
      activityCell.style.color = activity.color;
      const counts = state.comparison.perActivity[index];
      const values = [counts[0], counts[1], counts[2], counts[3]];
      values.forEach(function (count) {
        const cell = document.createElement("td");
        cell.textContent = format(count * area) + " km² · " + format(count, 0);
        row.appendChild(cell);
      });
      const weightCell = document.createElement("td");
      const weightSum = state.profiles[index].weights.reduce(function (sum, weight) { return sum + weight; }, 0);
      weightCell.textContent = weightSum.toFixed(4);
      weightCell.className = "mat-weight-sum";
      row.insertBefore(activityCell, row.firstChild);
      row.appendChild(weightCell);
      rows.appendChild(row);
      updateWeightControls(index);
    });

    const legend = document.getElementById("mat-integration-legend");
    legend.replaceChildren();
    INTEGRATION.forEach(function (item, index) {
      const entry = document.createElement("span");
      entry.className = "mat-integration-item";
      const swatch = document.createElement("i");
      swatch.style.backgroundColor = item.color;
      const text = document.createElement("span");
      text.textContent = item.label + ": " + format(state.comparison.integrationCounts[index]) + " celdas";
      entry.appendChild(swatch);
      entry.appendChild(text);
      legend.appendChild(entry);
    });
    const triple = state.comparison.integrationCounts[0];
    const highNoRent = state.comparison.integrationCounts[1];
    const economicLow = state.comparison.integrationCounts[2];
    const prohibited = state.comparison.integrationCounts[3] +
      state.comparison.integrationCounts[5];
    const tripleAndConflict = state.comparison.integrationCounts[5];
    document.getElementById("mat-integration-reading").textContent =
      triple + " celdas reúnen al menos aptitud S3, renta positiva y uso principal o compatible; " +
      highNoRent + " presentan aptitud S1/S2 para alguna actividad sin renta positiva para esa misma actividad; " +
      economicLow + " tienen una actividad económicamente dominante con aptitud S3/N; " + prohibited +
      " contienen una aptitud suficiente y renta positiva con uso prohibido, incluidos " + tripleAndConflict +
      " donde además existe otra actividad que reúne las tres condiciones. Las cifras no convierten aptitud en rentabilidad ni autorizan actividades.";
  }

  function createInspectorCard(label, value, note) {
    const card = document.createElement("div");
    card.className = "mat-inspector-card";
    const title = document.createElement("span");
    title.textContent = label;
    const amount = document.createElement("b");
    amount.textContent = value;
    card.appendChild(title);
    card.appendChild(amount);
    if (note) {
      const detail = document.createElement("small");
      detail.textContent = note;
      card.appendChild(detail);
    }
    return card;
  }

  function renderDiagnosis() {
    const cell = simulation.selectedCell.y * size + simulation.selectedCell.x;
    const activityIndex = state.diagnosticActivity;
    const activity = model.ACTIVITIES[activityIndex];
    const diagnosis = model.diagnose(state.result, state.values, state.profiles, cell,
      activityIndex, state.thresholds);
    const inspector = document.getElementById("mat-inspector");
    inspector.replaceChildren();
    document.getElementById("mat-diagnostic-title").textContent =
      "Celda (x: " + simulation.selectedCell.x + ", y: " + simulation.selectedCell.y + ") · " + activity.label;
    inspector.appendChild(createInspectorCard("Índice de aptitud", format(diagnosis.score) + " / 100",
      "Índice ponderado " + format(diagnosis.weightedScore) +
      (diagnosis.criticalLimitation ? " · reducido por limitante crítica" : "")));
    inspector.appendChild(createInspectorCard("Clasificación final", model.getClassLabel(diagnosis.category),
      diagnosis.criticalLimitation
        ? "N por una limitante crítica bajo el umbral S3."
        : "Clasificación según los umbrales didácticos configurados."));
    const leaderIndex = state.result.dominant[cell];
    inspector.appendChild(createInspectorCard("Aptitud dominante de la celda",
      leaderIndex < 0 ? "Sin aptitud evaluada" : model.ACTIVITIES[leaderIndex].label,
      "No equivale a mayor renta ni a permiso de uso."));
    const economicLeader = simulation.after.specialization[cell];
    inspector.appendChild(createInspectorCard("Mayor renta económica",
      economicLeader < 0 ? "Sin renta positiva" : simulation.after.activities[economicLeader].name,
      economicLeader < 0 ? "Ninguna renta es positiva." :
        format(simulation.after.rentSurfaces[economicLeader][cell]) + " $/ha · independiente del MAT."));
    const admissibleLeader = simulation.regulationAfter.admissibleLeader[cell];
    inspector.appendChild(createInspectorCard("Mejor renta admisible",
      admissibleLeader < 0 ? "Sin actividad admisible rentable" : simulation.after.activities[admissibleLeader].name,
      admissibleLeader < 0 ? "Ninguna actividad positiva es principal o compatible según las reglas actuales." :
        format(simulation.after.rentSurfaces[admissibleLeader][cell]) +
        " $/ha · la regla local debe verificarse."));
    const tripleLeader = state.comparison.tripleLeader[cell];
    inspector.appendChild(createInspectorCard("Coincide aptitud + renta + uso",
      tripleLeader < 0 ? "No hay coincidencia" : model.ACTIVITIES[tripleLeader].label,
      tripleLeader < 0 ? "No se encontró actividad con aptitud ≥ S3, renta positiva y uso principal/compatible." :
        "Cumple simultáneamente aptitud ≥ S3, renta positiva y uso principal/compatible."));

    const limitation = document.createElement("div");
    limitation.className = "mat-limitation";
    limitation.textContent = "Limitación principal: " + diagnosis.mainLimitation.label +
      " · puntaje " + format(diagnosis.mainLimitation.score) + "/100" +
      (diagnosis.mainLimitation.critical ? " · marcada como crítica" : "") +
      ". Medida posible para evaluación: " + diagnosis.recommendation +
      " Esta recomendación no garantiza recuperación ni sustituye estudios técnicos.";
    inspector.appendChild(limitation);

    const factorGroups = document.createElement("div");
    factorGroups.className = "mat-factors";
    const favorable = document.createElement("section");
    favorable.className = "mat-factor-list";
    const favorableHeading = document.createElement("h4");
    favorableHeading.textContent = "Variables favorables (S1/S2): " + diagnosis.favorable.length;
    favorable.appendChild(favorableHeading);
    const unfavorable = document.createElement("section");
    unfavorable.className = "mat-factor-list";
    const unfavorableHeading = document.createElement("h4");
    unfavorableHeading.textContent = "Variables desfavorables o limitantes: " + diagnosis.unfavorable.length;
    unfavorable.appendChild(unfavorableHeading);
    diagnosis.favorable.forEach(function (factor) {
      const text = document.createElement("p");
      text.textContent = factor.label + ": " + format(factor.value) + " " + factor.unit +
        " · " + model.getClassLabel(factor.category) + " · peso " + (factor.weight * 100).toFixed(1) + "%";
      favorable.appendChild(text);
    });
    diagnosis.unfavorable.forEach(function (factor) {
      const text = document.createElement("p");
      text.textContent = factor.label + ": " + format(factor.value) + " " + factor.unit +
        " · " + model.getClassLabel(factor.category) + (factor.critical ? " · CRÍTICA" : "");
      unfavorable.appendChild(text);
    });
    if (!diagnosis.favorable.length) {
      const text = document.createElement("p");
      text.textContent = "No hay criterios con puntaje igual o superior a S2.";
      favorable.appendChild(text);
    }
    if (!diagnosis.unfavorable.length) {
      const text = document.createElement("p");
      text.textContent = "Ningún criterio está bajo S2 para esta actividad.";
      unfavorable.appendChild(text);
    }
    factorGroups.appendChild(favorable);
    factorGroups.appendChild(unfavorable);
    inspector.appendChild(factorGroups);
    renderCellEditor(cell);
  }

  function renderCellEditor(cell) {
    const criterionIndex = state.editorCriterion;
    const criterion = model.CRITERIA[criterionIndex];
    const currentValue = state.values[criterionIndex][cell];
    const adjustment = document.getElementById("mat-layer-adjustment");
    adjustment.value = String(state.globalAdjustments[criterionIndex]);
    document.getElementById("mat-layer-adjustment-value").textContent =
      (state.globalAdjustments[criterionIndex] > 0 ? "+" : "") +
      state.globalAdjustments[criterionIndex] + " puntos";
    valueEditor.replaceChildren();
    const row = document.createElement("div");
    row.className = "mat-value-row";
    const detail = document.createElement("span");
    detail.textContent = criterion.label + " · valor sintético " + format(currentValue) + " " +
      criterion.unit + " · oferta " +
      format(model.getOfferScore(criterion, currentValue)) + "/100";
    const label = document.createElement("label");
    label.textContent = "Nuevo valor";
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(criterion.min);
    input.max = String(criterion.max);
    input.step = criterion.unit === "pH" ? "0.1" : "any";
    input.value = String(Number(currentValue.toFixed(2)));
    input.setAttribute("aria-label", "Valor de " + criterion.label + " en la celda seleccionada");
    label.appendChild(input);
    row.appendChild(detail);
    row.appendChild(label);
    valueEditor.appendChild(row);
    const source = document.createElement("p");
    source.className = "mat-editor-source";
    source.textContent = "Rango simulado permitido: " + format(criterion.min, 2) + "–" +
      format(criterion.max, 2) + " " + criterion.unit + ". " + responseText(criterion) +
      " Fuente: " + model.DEMO_SOURCE + " Calidad: " + model.DEMO_QUALITY;
    valueEditor.appendChild(source);
    input.addEventListener("change", function () {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < criterion.min || value > criterion.max) {
        input.value = String(Number(currentValue.toFixed(2)));
        input.setCustomValidity("El valor debe estar dentro del rango didáctico indicado.");
        input.reportValidity();
        return;
      }
      input.setCustomValidity("");
      state.values[criterionIndex][cell] = value;
      state.cellOverrides[criterionIndex].set(cell, value);
      recompute();
    });
  }

  function applyGlobalAdjustment(criterionIndex, adjustment) {
    const criterion = model.CRITERIA[criterionIndex];
    state.globalAdjustments[criterionIndex] = adjustment;
    for (let cell = 0; cell < state.defaultValues[criterionIndex].length; cell += 1) {
      const baseValue = state.defaultValues[criterionIndex][cell];
      const adjustedOffer = Math.max(0, Math.min(100,
        model.getOfferScore(criterion, baseValue) + adjustment));
      state.values[criterionIndex][cell] = model.getValueFromOffer(criterion, adjustedOffer);
    }
    state.cellOverrides[criterionIndex].forEach(function (value, cell) {
      state.values[criterionIndex][cell] = value;
    });
  }

  function updateSelectedMap(event) {
    const bounds = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - bounds.left) / bounds.width * size);
    const y = Math.floor((event.clientY - bounds.top) / bounds.height * size);
    territorialApp.selectCell(x, y, true);
  }

  function recompute() {
    state.result = model.evaluateRaster(state.values, state.profiles, state.thresholds, size);
    state.comparison = model.compareTerritory(state.result, simulation.after,
      regulation, simulation.territory, simulation.rules,
      simulation.config.activities, state.thresholds, simulation.after.cellKm * simulation.after.cellKm);
    render();
    window.dispatchEvent(new CustomEvent("mat:render"));
  }

  function render() {
    paintMainMap();
    paintGallery();
    renderIndicators();
    renderDiagnosis();
  }

  function resetMat(resetValues) {
    if (resetValues) {
      state.values = model.createDefaultTerritory(size);
      state.defaultValues = model.createDefaultTerritory(size);
      state.globalAdjustments = new Float32Array(model.CRITERIA.length);
      state.cellOverrides = model.CRITERIA.map(function () { return new Map(); });
    }
    state.profiles = model.createDefaultProfiles();
    state.thresholds = Object.assign({}, model.DEFAULT_THRESHOLDS);
    document.getElementById("mat-threshold-s1").value = state.thresholds.s1;
    document.getElementById("mat-threshold-s2").value = state.thresholds.s2;
    document.getElementById("mat-threshold-s3").value = state.thresholds.s3;
    renderProfileMatrices();
    recompute();
  }

  function bindEvents() {
    document.getElementById("mat-map-mode").addEventListener("change", function (event) {
      state.mapMode = event.target.value;
      render();
    });
    activitySelect.addEventListener("change", function (event) {
      state.mapActivity = Number(event.target.value);
      render();
    });
    criterionSelect.addEventListener("change", function (event) {
      state.mapCriterion = Number(event.target.value);
      render();
    });
    diagnosticSelect.addEventListener("change", function (event) {
      state.diagnosticActivity = Number(event.target.value);
      renderDiagnosis();
    });
    editorCriterionSelect.addEventListener("change", function (event) {
      state.editorCriterion = Number(event.target.value);
      renderCellEditor(simulation.selectedCell.y * size + simulation.selectedCell.x);
    });
    const layerAdjustment = document.getElementById("mat-layer-adjustment");
    layerAdjustment.addEventListener("input", function () {
      document.getElementById("mat-layer-adjustment-value").textContent =
        (Number(layerAdjustment.value) > 0 ? "+" : "") + layerAdjustment.value + " puntos";
    });
    layerAdjustment.addEventListener("change", function () {
      applyGlobalAdjustment(state.editorCriterion, Number(layerAdjustment.value));
      recompute();
    });
    ["mat-threshold-s1", "mat-threshold-s2", "mat-threshold-s3"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", updateThresholds);
    });
    canvas.addEventListener("click", updateSelectedMap);
    document.getElementById("mat-reset-cell").addEventListener("click", function () {
      const cell = simulation.selectedCell.y * size + simulation.selectedCell.x;
      model.CRITERIA.forEach(function (criterion, index) {
        state.cellOverrides[index].delete(cell);
        const adjustment = state.globalAdjustments[index];
        const offer = Math.max(0, Math.min(100,
          model.getOfferScore(criterion, state.defaultValues[index][cell]) + adjustment));
        state.values[index][cell] = model.getValueFromOffer(criterion, offer);
      });
      recompute();
    });
    document.getElementById("mat-reset-profiles").addEventListener("click", function () {
      resetMat(false);
    });
    window.addEventListener("territory:render", function () {
      recompute();
    });
    window.addEventListener("territory:cell-selected", function () {
      renderDiagnosis();
      paintMainMap();
    });
    window.addEventListener("territory:reset", function () {
      resetMat(true);
    });
  }

  function renderIntegrationLegend() {
    const legend = document.getElementById("mat-integration-legend");
    INTEGRATION.forEach(function (item) {
      const entry = document.createElement("span");
      entry.className = "mat-integration-item";
      const swatch = document.createElement("i");
      swatch.style.backgroundColor = item.color;
      const text = document.createElement("span");
      text.textContent = item.label;
      entry.appendChild(swatch);
      entry.appendChild(text);
      legend.appendChild(entry);
    });
  }

  addSelectOptions();
  renderProfileMatrices();
  renderIntegrationLegend();
  bindEvents();
  recompute();
  window.VonThunenTerritorialSuitabilityApp = Object.freeze({
    getState: function () { return state; },
    recompute: recompute
  });
}());
