(function () {
  "use strict";

  const algebra = window.VonThunenMapAlgebra;
  const interpretation = window.VonThunenMapInterpretation;
  const regulation = window.VonThunenTerritorialRegulation;
  const defaults = window.VonThunenModel.DEFAULT_ACTIVITIES;
  const SIZE = algebra.DEFAULT_SIZE;
  const PALETTE = defaults.map(function (activity) { return activity.color; });
  const NO_ACTIVITY_COLOR = "#e7ebe5";
  const canvas = document.getElementById("raster-map");
  const rasterContext = canvas.getContext("2d", { alpha: false });
  const beforeCanvas = document.getElementById("before-map");
  const afterCanvas = document.getElementById("after-map");
  const state = {
    layer: "specialization",
    activity: 0,
    road: null,
    roadNetwork: { roads: [], nodes: [] },
    drawingRoad: false,
    pendingRoadStart: null,
    draftRoad: [],
    selectedRoadId: null,
    editingVertices: false,
    addingVertex: false,
    selectedVertex: null,
    connectingNodes: false,
    history: [],
    future: [],
    showNodes: true,
    showIntersections: true,
    selectedCell: { x: 50, y: 50 },
    before: null,
    after: null,
    comparison: null,
    config: null,
    territory: regulation.createDefaultTerritory(SIZE),
    rules: regulation.createDefaultRules(defaults),
    regulationBefore: null,
    regulationAfter: null
  };
  const layerNames = {
    specialization: "Especialización productiva",
    distance: "Distancia al mercado",
    transport: "Costos de transporte",
    rent: "Renta de localización",
    "land-class": "Clase de suelo",
    protection: "Suelo de protección",
    restriction: "Restricciones territoriales",
    usage: "Uso POT seleccionado",
    integrated: "Renta + admisibilidad",
    admissibility: "Admisibilidad de usos rentables"
  };
  const validParameters = {};
  defaults.forEach(function (activity) {
    validParameters[activity.id] = { A: activity.A, t: activity.t };
  });

  function format(value, digits) {
    return new Intl.NumberFormat("es-ES", {
      maximumFractionDigits: digits === undefined ? 2 : digits,
      minimumFractionDigits: 0
    }).format(value);
  }

  function readActivities() {
    const scenarioButton = document.querySelector(".scenario-button.is-active");
    const scenario = scenarioButton ? scenarioButton.dataset.scenario : "original";
    const increaseInput = document.getElementById("cost-increase");
    const increase = increaseInput ? Number(increaseInput.value) / 100 : 1;
    return defaults.map(function (activity) {
      const aInput = document.getElementById(activity.id + "-A");
      const tInput = document.getElementById(activity.id + "-t");
      const A = aInput.value !== "" && Number.isFinite(Number(aInput.value)) && Number(aInput.value) >= 0
        ? Number(aInput.value) : validParameters[activity.id].A;
      const baseCost = tInput.value !== "" && Number.isFinite(Number(tInput.value)) && Number(tInput.value) >= 0
        ? Number(tInput.value) : validParameters[activity.id].t;
      return Object.assign({}, activity, { A: A, t: baseCost * (scenario === "costos" ? increase : 1) });
    });
  }

  function readConfig(road) {
    const maxDistance = Number(document.getElementById("territory-distance").value);
    const accessibility = Number(document.getElementById("accessibility").value);
    const activities = readActivities();
    return {
      size: SIZE,
      activities: activities,
      marketX: Number(document.getElementById("market-x").value),
      marketY: Number(document.getElementById("market-y").value),
      cellKm: maxDistance / 50,
      accessibility: accessibility,
      road: road,
      roadNetwork: state.roadNetwork
    };
  }

  function colorAt(layer, index, raster, min, max) {
    if (layer === "specialization") {
      const classIndex = raster.specialization[index];
      return classIndex < 0 ? NO_ACTIVITY_COLOR : PALETTE[classIndex];
    }

    let value;
    if (layer === "distance") value = raster.distance[index];
    else if (layer === "transport") value = raster.transportCosts[state.activity][index];
    else value = raster.rentSurfaces[state.activity][index];

    if (layer === "rent") {
      if (value >= 0) return interpolateColor("#f1f5ee", "#276749", max > 0 ? Math.min(value / max, 1) : 0);
      return interpolateColor("#f5eeee", "#c45a55", min < 0 ? Math.min(value / min, 1) : 0);
    }
    const fraction = max > min ? (value - min) / (max - min) : 0;
    return interpolateColor(layer === "distance" ? "#f5f2d9" : "#e7f1f5",
      layer === "distance" ? "#477b59" : "#286887", fraction);
  }

  function paintCategoricalRaster(context, raster, regulatory, layer) {
    const image = context.createImageData(SIZE, SIZE);
    const stateColors = regulation.RESULT_STATES.map(function (item) { return item.color; });
    const useColors = ["#4c8b65", "#81a96c", "#e5aa50", "#c75d56"];
    const soilColors = regulation.SOIL_CLASSES.map(function (item) { return item.color; });
    for (let index = 0; index < raster.count; index += 1) {
      let color = "#e7ebe5";
      if (layer === "integrated") {
        color = stateColors[regulatory.resultState[index]];
      } else if (layer === "land-class") {
        color = soilColors[state.territory.soilClass[index]] || "#e7ebe5";
      } else if (layer === "protection") {
        color = regulatory.protected[index] ? "#7851a9" : "#f1f0eb";
      } else if (layer === "restriction") {
        color = regulatory.restricted[index] ? "#d16d43" : "#f1f0eb";
      } else if (layer === "usage") {
        color = useColors[regulatory.selectedUseType[index]] || "#e7ebe5";
      } else if (layer === "admissibility") {
        if (regulatory.admissible[index]) color = "#347953";
        else if (regulatory.conditioned[index]) color = "#e5aa50";
        else if (regulatory.prohibited[index]) color = "#c75d56";
      }
      const rgb = parseColor(color);
      const offset = index * 4;
      image.data[offset] = rgb[0];
      image.data[offset + 1] = rgb[1];
      image.data[offset + 2] = rgb[2];
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  function interpolateColor(start, end, amount) {
    const first = parseColor(start);
    const last = parseColor(end);
    const ratio = Math.max(0, Math.min(1, amount));
    return [
      Math.round(first[0] + (last[0] - first[0]) * ratio),
      Math.round(first[1] + (last[1] - first[1]) * ratio),
      Math.round(first[2] + (last[2] - first[2]) * ratio)
    ];
  }

  function parseColor(color) {
    const value = color.slice(1);
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16)
    ];
  }

  function rasterRange(raster, layer) {
    let values;
    if (layer === "distance") values = raster.distance;
    else if (layer === "transport") values = raster.transportCosts[state.activity];
    else values = raster.rentSurfaces[state.activity];
    let min = Infinity;
    let max = -Infinity;
    for (let index = 0; index < values.length; index += 1) {
      min = Math.min(min, values[index]);
      max = Math.max(max, values[index]);
    }
    return { min: min, max: max };
  }

  function paintContinuousRaster(context, raster, layer, marker, roadOverlay) {
    const range = rasterRange(raster, layer);
    const image = context.createImageData(SIZE, SIZE);
    for (let index = 0; index < raster.count; index += 1) {
      const color = colorAt(layer, index, raster, range.min, range.max);
      const offset = index * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    if (roadOverlay && raster.road) drawRoad(context, raster.road.points);
    if (marker && document.getElementById("market-overlay").checked) {
      drawMarket(context, raster.marketX, raster.marketY);
    }
    return range;
  }

  function paintSpecialization(context, raster) {
    const image = context.createImageData(SIZE, SIZE);
    for (let index = 0; index < raster.count; index += 1) {
      const color = parseColor(raster.specialization[index] < 0
        ? NO_ACTIVITY_COLOR : PALETTE[raster.specialization[index]]);
      const offset = index * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  function drawRoad(context, points) {
    if (!points || points.length < 2) return;
    context.save();
    context.strokeStyle = "#18362b";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(points[0].x + 0.5, points[0].y + 0.5);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x + 0.5, points[index].y + 0.5);
    }
    context.stroke();
    context.restore();
  }

  function drawRoadNetwork(context) {
    state.roadNetwork.roads.forEach(function (road) {
      if (!road.points || road.points.length < 2) return;
      context.save();
      context.strokeStyle = road.id === state.selectedRoadId ? "#e05b3f" : "#18362b";
      context.lineWidth = road.id === state.selectedRoadId ? 3 : 2;
      context.setLineDash([]);
      context.beginPath();
      context.moveTo(road.points[0].x + 0.5, road.points[0].y + 0.5);
      for (let index = 1; index < road.points.length; index += 1) {
        context.lineTo(road.points[index].x + 0.5, road.points[index].y + 0.5);
      }
      context.stroke();
      context.restore();

      if (state.editingVertices && road.id === state.selectedRoadId) {
        road.points.forEach(function (point, index) {
          context.save();
          context.fillStyle = state.selectedVertex === index ? "#e05b3f" : "#ffffff";
          context.strokeStyle = "#18362b";
          context.lineWidth = 1;
          context.beginPath();
          context.arc(point.x + 0.5, point.y + 0.5, 3, 0, Math.PI * 2);
          context.fill();
          context.stroke();
          context.restore();
        });
      }
    });

    if (state.draftRoad.length > 0) {
      context.save();
      context.strokeStyle = "#2875a6";
      context.lineWidth = 2.5;
      context.setLineDash([4, 3]);
      context.beginPath();
      context.moveTo(state.draftRoad[0].x + 0.5, state.draftRoad[0].y + 0.5);
      for (let index = 1; index < state.draftRoad.length; index += 1) {
        context.lineTo(state.draftRoad[index].x + 0.5, state.draftRoad[index].y + 0.5);
      }
      context.stroke();
      context.restore();
      state.draftRoad.forEach(function (point) {
        context.beginPath();
        context.fillStyle = "#2875a6";
        context.arc(point.x + 0.5, point.y + 0.5, 2.5, 0, Math.PI * 2);
        context.fill();
      });
    }

    if (state.showNodes) {
      state.roadNetwork.nodes.forEach(function (node) {
        context.save();
        context.fillStyle = node.roadIds.length > 1 ? "#e05b3f" : "#2875a6";
        context.strokeStyle = "#ffffff";
        context.lineWidth = 1;
        context.beginPath();
        context.arc(node.x + 0.5, node.y + 0.5, 4, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.restore();
      });
    }
  }

  function drawMarket(context, x, y) {
    context.save();
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#173b2c";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x + 0.5, y + 0.5, 3.2, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }

  function drawSelection(context) {
    context.save();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1;
    context.strokeRect(state.selectedCell.x, state.selectedCell.y, 1, 1);
    context.restore();
  }

  function drawChangeMap(raster, changes) {
    const target = document.getElementById("change-map");
    const context = target.getContext("2d", { alpha: false });
    const image = context.createImageData(SIZE, SIZE);
    const changedColor = [34, 91, 67];
    const unchangedColor = [237, 239, 234];
    for (let cell = 0; cell < raster.count; cell += 1) {
      const color = changes[cell] ? changedColor : unchangedColor;
      const offset = cell * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  function updateMainMap() {
    const layer = state.layer;
    let range = null;
    if (["specialization", "distance", "transport", "rent"].indexOf(layer) >= 0) {
      if (layer === "specialization") paintSpecialization(rasterContext, state.after);
      else range = paintContinuousRaster(rasterContext, state.after, layer, false, false);
    } else {
      paintCategoricalRaster(rasterContext, state.after, state.regulationAfter, layer);
    }
    drawRoadNetwork(rasterContext);
    if (document.getElementById("market-overlay").checked) {
      drawMarket(rasterContext, state.after.marketX, state.after.marketY);
    }
    drawSelection(rasterContext);
    updateLayerTitle();
    renderScale(range);
  }

  function updateLayerTitle() {
    let title = layerNames[state.layer];
    if (state.layer === "transport" || state.layer === "rent") {
      title += " · " + defaults[state.activity].name;
    } else if (state.layer === "usage" || state.layer === "admissibility") {
      title += " · " + defaults[state.activity].name;
    }
    document.getElementById("raster-layer-name").textContent = title;
  }

  function renderScale(range) {
    const scale = document.getElementById("raster-scale");
    while (scale.firstChild) scale.removeChild(scale.firstChild);
    if (state.layer === "specialization") {
      defaults.forEach(function (activity, index) {
        addScaleItem(scale, activity.color, activity.name);
      });
      addScaleItem(scale, NO_ACTIVITY_COLOR, "Sin renta viable");
      return;
    }
    if (["land-class", "protection", "restriction", "usage", "integrated", "admissibility"].indexOf(state.layer) >= 0) {
      let items;
      if (state.layer === "land-class") {
        items = regulation.SOIL_CLASSES.map(function (item) { return [item.color, item.label]; });
      } else if (state.layer === "usage") {
        items = [["#4c8b65", "Principal"], ["#81a96c", "Compatible"],
          ["#e5aa50", "Condicionado"], ["#c75d56", "Prohibido"]];
      } else if (state.layer === "integrated") {
        items = regulation.RESULT_STATES.map(function (item) { return [item.color, item.label]; });
      } else if (state.layer === "protection") {
        items = [["#7851a9", "Protección"], ["#f1f0eb", "Sin protección"]];
      } else if (state.layer === "restriction") {
        items = [["#d16d43", "Restricción"], ["#f1f0eb", "Sin restricción"]];
      } else {
        items = [["#347953", "Admisible rentable"], ["#e5aa50", "Condicionado"],
          ["#c75d56", "Prohibido rentable"], ["#e7ebe5", "Sin uso admisible rentable"]];
      }
      items.forEach(function (item) { addScaleItem(scale, item[0], item[1]); });
      return;
    }
    const gradient = document.createElement("div");
    gradient.className = "raster-gradient " + (state.layer === "distance"
      ? "gradient-distance" : state.layer === "transport" ? "gradient-transport" : "gradient-rent");
    scale.appendChild(gradient);
    const labels = document.createElement("div");
    labels.className = "raster-gradient-labels";
    const low = document.createElement("span");
    low.textContent = format(range.min) + (state.layer === "distance" ? " km" : " $/ha");
    const high = document.createElement("span");
    high.textContent = format(range.max) + (state.layer === "distance" ? " km" : " $/ha");
    labels.appendChild(low);
    labels.appendChild(high);
    scale.appendChild(labels);
    if (state.layer === "rent") {
      const zero = document.createElement("small");
      zero.className = "raster-zero-note";
      zero.textContent = "Renta cero: centro neutro · negativa: tonos rojos";
      scale.appendChild(zero);
    }
  }

  function addScaleItem(parent, color, label) {
    const item = document.createElement("span");
    item.className = "raster-legend-item";
    const swatch = document.createElement("i");
    swatch.style.backgroundColor = color;
    const text = document.createElement("span");
    text.textContent = label;
    item.appendChild(swatch);
    item.appendChild(text);
    parent.appendChild(item);
  }

  function getCellIndex(x, y) {
    return y * SIZE + x;
  }

  function renderCellInspector() {
    const x = state.selectedCell.x;
    const y = state.selectedCell.y;
    const index = getCellIndex(x, y);
    const raster = state.after;
    const classIndex = raster.specialization[index];
    const dominant = classIndex < 0 ? "Sin actividad viable" : defaults[classIndex].name;
    document.getElementById("cell-title").textContent = "Celda (x: " + x + ", y: " + y + ")";
    document.getElementById("cell-winner").textContent = dominant;
    const metrics = document.getElementById("cell-metrics");
    while (metrics.firstChild) metrics.removeChild(metrics.firstChild);
    const summaryValues = [
      ["Distancia", format(raster.distance[index]) + " km"],
      ["Distancia efectiva", format(raster.effectiveDistance[index]) + " km"]
    ];
    summaryValues.forEach(function (item) { addMetric(metrics, item[0], item[1]); });
    raster.activities.forEach(function (activity, activityIndex) {
      addMetric(metrics, "CT " + activity.name, format(raster.transportCosts[activityIndex][index]) + " $/ha");
      addMetric(metrics, "R " + activity.name, format(raster.rentSurfaces[activityIndex][index]) + " $/ha");
    });
    const regulatory = state.regulationAfter;
    const soil = regulation.SOIL_CLASSES[state.territory.soilClass[index]];
    const useType = regulation.USE_TYPES[regulatory.selectedUseType[index]];
    addMetric(metrics, "Clase territorial", soil ? soil.label : "No definida");
    addMetric(metrics, "Protección", regulatory.protected[index] ? "Sí" : "No");
    addMetric(metrics, "Restricción", regulatory.restricted[index] ? "Sí" : "No");
    addMetric(metrics, "Uso POT · " + defaults[state.activity].name, useType ? useType.label : "Sin regla");
    addMetric(metrics, "Renta + norma", regulation.RESULT_STATES[regulatory.resultState[index]].label);
    const condition = document.getElementById("cell-regulation-condition");
    if (condition) {
      condition.textContent = regulatory.conditions[index] ||
        "No se reporta condición específica; consulta el POT/PBOT/EOT aplicable.";
    }
  }

  function addMetric(parent, label, value) {
    const item = document.createElement("div");
    item.className = "cell-metric";
    const name = document.createElement("span");
    name.textContent = label;
    const result = document.createElement("b");
    result.textContent = value;
    item.appendChild(name);
    item.appendChild(result);
    parent.appendChild(item);
  }

  function countClasses(raster) {
    const counts = new Int32Array(5);
    raster.specialization.forEach(function (value) {
      counts[value < 0 ? 4 : value] += 1;
    });
    return counts;
  }

  function renderResults() {
    const result = state.comparison;
    const areaTable = document.getElementById("activity-area-table");
    const rentTable = document.getElementById("raster-rent-table");
    while (areaTable.firstChild) areaTable.removeChild(areaTable.firstChild);
    while (rentTable.firstChild) rentTable.removeChild(rentTable.firstChild);

    const areaHeading = document.createElement("p");
    areaHeading.className = "raster-table-heading";
    areaHeading.textContent = "Superficie por actividad";
    areaTable.appendChild(areaHeading);
    const oldCounts = countClasses(state.before);
    const newCounts = countClasses(state.after);
    defaults.forEach(function (activity, index) {
      const row = document.createElement("div");
      row.className = "raster-stat-row";
      const name = document.createElement("span");
      name.className = "raster-stat-name";
      const swatch = document.createElement("i");
      swatch.style.backgroundColor = activity.color;
      name.appendChild(swatch);
      name.appendChild(document.createTextNode(activity.name));
      const base = document.createElement("span");
      base.textContent = format(oldCounts[index], 0);
      const arrow = document.createElement("span");
      arrow.textContent = "→";
      const after = document.createElement("b");
      after.textContent = format(newCounts[index], 0);
      const delta = newCounts[index] - oldCounts[index];
      const change = document.createElement("span");
      change.className = delta > 0 ? "area-gain" : delta < 0 ? "area-loss" : "";
      change.textContent = (delta > 0 ? "+" : "") + format(delta, 0) +
        " celdas · " + (delta > 0 ? "+" : "") + format(delta * result.cellAreaKm2) + " km²";
      [name, base, arrow, after, change].forEach(function (element) { row.appendChild(element); });
      areaTable.appendChild(row);
    });
    const rentHeading = document.createElement("p");
    rentHeading.className = "raster-table-heading";
    rentHeading.textContent = "Cambio medio de renta por celda";
    rentTable.appendChild(rentHeading);
    defaults.forEach(function (activity, index) {
      const delta = result.rentChange[index] / result.changed.length;
      const row = document.createElement("div");
      row.className = "raster-rent-row";
      const name = document.createElement("span");
      const swatch = document.createElement("i");
      swatch.style.backgroundColor = activity.color;
      name.appendChild(swatch);
      name.appendChild(document.createTextNode(activity.name));
      const value = document.createElement("b");
      value.className = delta > 0.005 ? "area-gain" : delta < -0.005 ? "area-loss" : "";
      value.textContent = (delta > 0 ? "+" : "") + format(delta) + " $/ha";
      row.appendChild(name);
      row.appendChild(value);
      rentTable.appendChild(row);
    });
    document.getElementById("changed-cells").textContent = format(result.changedCells, 0);
    document.getElementById("changed-percent").textContent = format(result.changedPercent, 1);
    document.getElementById("before-viable-count").textContent =
      format(state.before.count, 0) + " celdas";
    document.getElementById("after-viable-count").textContent =
      format(state.after.count, 0) + " celdas";
  }

  function renderInterpretation() {
    document.getElementById("territorial-interpretation").textContent =
      window.VonThunenMapInterpretation.interpretComparison(
        state.comparison,
        defaults,
        state.roadNetwork.roads.some(function (road) { return road.reduction > 0; })
      );
  }

  function render() {
    const config = readConfig(state.road);
    state.config = config;
    state.before = algebra.createRaster(Object.assign({}, config, {
      road: null,
      roadNetwork: { roads: [], nodes: [] }
    }));
    state.after = algebra.createRaster(config);
    state.comparison = algebra.compareRasters(state.before, state.after);
    state.regulationBefore = regulation.evaluateRaster(
      state.before, state.territory, state.rules, config.activities, state.activity);
    state.regulationAfter = regulation.evaluateRaster(
      state.after, state.territory, state.rules, config.activities, state.activity);
    document.getElementById("cell-size-label").textContent = format(config.cellKm) + " km";
    document.getElementById("market-x-value").textContent = String(config.marketX);
    document.getElementById("market-y-value").textContent = String(config.marketY);
    updateMainMap();
    refreshRoadControls();
    paintSpecialization(beforeCanvas.getContext("2d", { alpha: false }), state.before);
    paintSpecialization(afterCanvas.getContext("2d", { alpha: false }), state.after);
    const governanceBefore = document.getElementById("governance-before-map");
    const governanceAfter = document.getElementById("governance-after-map");
    if (governanceBefore && governanceAfter) {
      paintCategoricalRaster(governanceBefore.getContext("2d", { alpha: false }), state.before,
        state.regulationBefore, "integrated");
      paintCategoricalRaster(governanceAfter.getContext("2d", { alpha: false }), state.after,
        state.regulationAfter, "integrated");
    }
    drawChangeMap(state.after, state.comparison.changed);
    renderCellInspector();
    renderResults();
    renderInterpretation();
    window.dispatchEvent(new CustomEvent("territory:render"));
  }

  function selectCell(x, y, keepRoadDrawing) {
    state.selectedCell = {
      x: Math.max(0, Math.min(SIZE - 1, Math.floor(x))),
      y: Math.max(0, Math.min(SIZE - 1, Math.floor(y)))
    };
    window.dispatchEvent(new CustomEvent("territory:cell-selected"));
    if (state.connectingNodes) {
      createExplicitNode(state.selectedCell);
      return;
    }
    if (state.drawingRoad && !keepRoadDrawing) {
      const last = state.draftRoad[state.draftRoad.length - 1];
      if (last && last.x === state.selectedCell.x && last.y === state.selectedCell.y) return;
      state.draftRoad.push({ x: state.selectedCell.x, y: state.selectedCell.y });
      document.getElementById("road-status").textContent =
        "Trazado en construcción: " + state.draftRoad.length + " vértices. Haz clic para agregar o Finalizar.";
      document.getElementById("road-finish-button").disabled = state.draftRoad.length < 2;
      updateMainMap();
      return;
    }
    if (state.editingVertices) {
      const road = findSelectedRoad();
      if (road) {
        if (state.addingVertex) {
          let insertIndex = 1;
          let nearestDistance = Infinity;
          for (let index = 1; index < road.points.length; index += 1) {
            const projected = algebra.projectPointToSegment(
              state.selectedCell.x, state.selectedCell.y,
              road.points[index - 1], road.points[index]);
            const distance = Math.hypot(projected.x - state.selectedCell.x, projected.y - state.selectedCell.y);
            if (distance < nearestDistance) {
              nearestDistance = distance;
              insertIndex = index;
            }
          }
          state.history.push(snapshotRoadState());
          state.future = [];
          road.points.splice(insertIndex, 0, { x: state.selectedCell.x, y: state.selectedCell.y });
          state.selectedVertex = insertIndex;
          state.addingVertex = false;
          render();
          return;
        }
        let nearestIndex = -1;
        let nearestDistance = Infinity;
        road.points.forEach(function (point, index) {
          const distance = Math.hypot(point.x - state.selectedCell.x, point.y - state.selectedCell.y);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        });
        if (nearestDistance <= 5) {
          state.selectedVertex = nearestIndex;
          state.history.push(snapshotRoadState());
          state.future = [];
          road.points[nearestIndex] = { x: state.selectedCell.x, y: state.selectedCell.y };
          render();
          return;
        }
      }
    }
    renderCellInspector();
    updateMainMap();
  }

  function updateRoadStatus() {
    const status = document.getElementById("road-status");
    if (state.roadNetwork.roads.length === 0) {
      status.textContent = "Sin carreteras. Usa “Nueva carretera” y agrega varios vértices.";
      return;
    }
    const road = findSelectedRoad();
    if (road) {
      status.textContent = road.name + ": " + formatRoadLength(road) +
        " · " + road.points.length + " vértices · " + road.surface;
    } else {
      status.textContent = state.roadNetwork.roads.length + " carreteras independientes creadas.";
    }
  }

  function snapshotRoadState() {
    return JSON.stringify(state.roadNetwork);
  }

  function restoreRoadSnapshot(snapshot) {
    state.roadNetwork = JSON.parse(snapshot);
    if (!state.roadNetwork || !Array.isArray(state.roadNetwork.roads)) {
      state.roadNetwork = { roads: [], nodes: [] };
    }
  }

  function findSelectedRoad() {
    return state.roadNetwork.roads.find(function (road) {
      return road.id === state.selectedRoadId;
    }) || null;
  }

  function formatRoadLength(road) {
    let length = 0;
    for (let index = 1; index < road.points.length; index += 1) {
      length += Math.hypot(
        (road.points[index].x - road.points[index - 1].x) * state.config.cellKm,
        (road.points[index].y - road.points[index - 1].y) * state.config.cellKm);
    }
    return format(length, 2) + " km";
  }

  function roadNearPoint(road, point, tolerance) {
    for (let index = 1; index < road.points.length; index += 1) {
      const projected = algebra.projectPointToSegment(
        point.x, point.y, road.points[index - 1], road.points[index]);
      if (Math.hypot(projected.x - point.x, projected.y - point.y) <= tolerance) return true;
    }
    return false;
  }

  function createExplicitNode(point) {
    const roadAId = document.getElementById("road-connect-a").value;
    const roadBId = document.getElementById("road-connect-b").value;
    if (!roadAId || !roadBId || roadAId === roadBId) {
      document.getElementById("road-status").textContent =
        "Selecciona dos carreteras diferentes para crear el nodo.";
      state.connectingNodes = false;
      return;
    }
    const roadA = state.roadNetwork.roads.find(function (road) { return road.id === roadAId; });
    const roadB = state.roadNetwork.roads.find(function (road) { return road.id === roadBId; });
    if (!roadA || !roadB) {
      document.getElementById("road-status").textContent =
        "Las carreteras seleccionadas ya no existen.";
      state.connectingNodes = false;
      return;
    }
    if (!roadNearPoint(roadA, point, 2) || !roadNearPoint(roadB, point, 2)) {
      document.getElementById("road-status").textContent =
        "El nodo debe quedar sobre ambas carreteras seleccionadas.";
      return;
    }
    state.history.push(snapshotRoadState());
    state.future = [];
    state.roadNetwork.nodes.push({
      id: "node-" + (Date.now()).toString(36) + "-" + state.roadNetwork.nodes.length,
      x: point.x,
      y: point.y,
      roadIds: [roadAId, roadBId]
    });
    state.connectingNodes = false;
    document.getElementById("raster-map-hint").textContent =
      "Nodo explícito creado. Las dos carreteras comparten conectividad.";
    updateTopologyStatus();
    render();
  }

  function updateTopologyStatus() {
    const roadCount = state.roadNetwork.roads.length;
    const nodeCount = state.roadNetwork.nodes.length;
    const element = document.getElementById("road-topology-status");
    if (!roadCount) {
      element.textContent = "Topología: sin carreteras.";
      return;
    }
    element.textContent = "Topología: " + roadCount + " carreteras · " +
      nodeCount + " nodo" + (nodeCount === 1 ? "" : "s") +
      " explícito" + (nodeCount === 1 ? "" : "s") +
      ". Cada cruce visual requiere un nodo.";
  }

  function refreshRoadControls() {
    const list = document.getElementById("road-list");
    list.innerHTML = "";
    state.roadNetwork.roads.forEach(function (road) {
      const option = document.createElement("option");
      option.value = road.id;
      option.textContent = road.name + " · " + formatRoadLength(road);
      list.appendChild(option);
    });
    if (state.selectedRoadId) list.value = state.selectedRoadId;

    ["road-connect-a", "road-connect-b"].forEach(function (id) {
      const select = document.getElementById(id);
      const previous = select.value;
      select.innerHTML = "";
      state.roadNetwork.roads.forEach(function (road) {
        const option = document.createElement("option");
        option.value = road.id;
        option.textContent = road.name;
        select.appendChild(option);
      });
      if (state.roadNetwork.roads.some(function (road) { return road.id === previous; })) select.value = previous;
    });

    const road = findSelectedRoad();
    const disabled = !road;
    ["road-edit-button", "road-duplicate-button", "road-delete-button",
      "road-delete-vertex", "road-add-vertex", "road-connect-button",
      "road-disconnect-button"].forEach(function (id) {
      document.getElementById(id).disabled = disabled;
    });
    document.getElementById("road-name").disabled = disabled;
    if (road) {
      document.getElementById("road-name").value = road.name;
      document.getElementById("road-surface").value = road.surface;
      document.getElementById("road-speed").value = String(road.speed);
      document.getElementById("road-circulation-cost").value = String(road.circulationCost);
      document.getElementById("road-penalty").value = String(road.penalty);
      document.getElementById("road-capacity").value = String(road.capacity);
      document.getElementById("road-reduction").value = String(Math.round(road.reduction * 100));
      document.getElementById("road-reach").value = String(road.reachKm);
      document.getElementById("road-reduction-value").textContent =
        Math.round(road.reduction * 100) + " %";
      document.getElementById("road-reach-value").textContent = road.reachKm + " km";
    }
    document.getElementById("road-undo-button").disabled = state.history.length === 0;
    document.getElementById("road-redo-button").disabled = state.future.length === 0;
    updateTopologyStatus();
    updateRoadStatus();
  }

  function finishRoad() {
    if (state.draftRoad.length < 2) return;
    state.history.push(snapshotRoadState());
    state.future = [];
    const number = state.roadNetwork.roads.length + 1;
    const id = "road-" + Date.now().toString(36) + "-" + number;
    const road = {
      id: id,
      name: "Carretera " + number,
      points: state.draftRoad.map(function (point) { return { x: point.x, y: point.y }; }),
      reduction: Number(document.getElementById("road-reduction").value) / 100,
      reachKm: Number(document.getElementById("road-reach").value),
      surface: "pavimentada",
      speed: 60,
      circulationCost: 1,
      penalty: 0,
      capacity: 0,
      connectedNodeIds: []
    };
    state.roadNetwork.roads.push(road);
    state.selectedRoadId = id;
    state.draftRoad = [];
    state.drawingRoad = false;
    state.road = road;
    document.getElementById("road-draw-button").setAttribute("aria-pressed", "false");
    document.getElementById("road-draw-button").textContent = "＋ Dibujar carretera";
    document.getElementById("raster-map-hint").textContent =
      "Carretera creada. Selecciona otra carretera o usa Nueva carretera.";
    document.getElementById("road-finish-button").disabled = true;
    document.getElementById("road-cancel-button").disabled = true;
    refreshRoadControls();
    render();
  }

  function bindEvents() {
    document.getElementById("road-new-button").addEventListener("click", function () {
      document.getElementById("road-draw-button").click();
    });
    document.getElementById("road-finish-button").addEventListener("click", finishRoad);
    document.getElementById("road-cancel-button").addEventListener("click", function () {
      state.draftRoad = [];
      state.drawingRoad = false;
      document.getElementById("road-finish-button").disabled = true;
      document.getElementById("road-cancel-button").disabled = true;
      document.getElementById("road-draw-button").setAttribute("aria-pressed", "false");
      document.getElementById("road-draw-button").textContent = "＋ Dibujar carretera";
      document.getElementById("raster-map-hint").textContent = "Trazado cancelado.";
      updateMainMap();
    });
    document.getElementById("road-list").addEventListener("change", function () {
      state.selectedRoadId = this.value;
      state.editingVertices = false;
      refreshRoadControls();
      updateMainMap();
    });
    document.getElementById("road-name").addEventListener("input", function () {
      const road = findSelectedRoad();
      if (!road) return;
      road.name = this.value || "Carretera sin nombre";
      refreshRoadControls();
    });
    ["road-surface", "road-speed", "road-circulation-cost", "road-penalty", "road-capacity"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () {
        const road = findSelectedRoad();
        if (!road) return;
        state.history.push(snapshotRoadState());
        state.future = [];
        if (id === "road-surface") road.surface = this.value;
        if (id === "road-speed") road.speed = Number(this.value);
        if (id === "road-circulation-cost") road.circulationCost = Number(this.value);
        if (id === "road-penalty") road.penalty = Number(this.value);
        if (id === "road-capacity") road.capacity = Number(this.value);
        render();
      });
    });
    document.getElementById("road-edit-button").addEventListener("click", function () {
      state.editingVertices = !state.editingVertices;
      state.selectedVertex = null;
      state.addingVertex = false;
      this.textContent = state.editingVertices ? "Terminar edición" : "Editar vértices";
      document.getElementById("raster-map-hint").textContent =
        state.editingVertices
          ? "Haz clic cerca de un vértice y luego en su nueva posición."
          : "Edición de vértices finalizada.";
      updateMainMap();
    });
    document.getElementById("road-add-vertex").addEventListener("click", function () {
      state.editingVertices = true;
      state.addingVertex = true;
      state.selectedVertex = null;
      document.getElementById("raster-map-hint").textContent =
        "Haz clic sobre el mapa para insertar un vértice intermedio según el segmento más cercano.";
      updateMainMap();
    });
    document.getElementById("road-delete-vertex").addEventListener("click", function () {
      const road = findSelectedRoad();
      if (!road || state.selectedVertex === null || road.points.length <= 2) return;
      state.history.push(snapshotRoadState());
      state.future = [];
      road.points.splice(state.selectedVertex, 1);
      state.selectedVertex = null;
      render();
    });
    document.getElementById("road-duplicate-button").addEventListener("click", function () {
      const road = findSelectedRoad();
      if (!road) return;
      state.history.push(snapshotRoadState());
      state.future = [];
      const copy = JSON.parse(JSON.stringify(road));
      copy.id = "road-" + Date.now().toString(36);
      copy.name = road.name + " (copia)";
      copy.points = copy.points.map(function (point) {
        return { x: Math.min(SIZE - 1, point.x + 1), y: Math.min(SIZE - 1, point.y + 1) };
      });
      state.roadNetwork.roads.push(copy);
      state.selectedRoadId = copy.id;
      render();
    });
    document.getElementById("road-delete-button").addEventListener("click", function () {
      if (!state.selectedRoadId) return;
      state.history.push(snapshotRoadState());
      state.future = [];
      state.roadNetwork.roads = state.roadNetwork.roads.filter(function (road) {
        return road.id !== state.selectedRoadId;
      });
      state.roadNetwork.nodes.forEach(function (node) {
        node.roadIds = node.roadIds.filter(function (id) { return id !== state.selectedRoadId; });
      });
      state.roadNetwork.nodes = state.roadNetwork.nodes.filter(function (node) {
        return node.roadIds.length > 0;
      });
      state.selectedRoadId = null;
      state.editingVertices = false;
      render();
    });
    document.getElementById("road-undo-button").addEventListener("click", function () {
      if (!state.history.length) return;
      state.future.push(snapshotRoadState());
      restoreRoadSnapshot(state.history.pop());
      state.selectedRoadId = state.roadNetwork.roads[0] ? state.roadNetwork.roads[0].id : null;
      render();
    });
    document.getElementById("road-redo-button").addEventListener("click", function () {
      if (!state.future.length) return;
      state.history.push(snapshotRoadState());
      restoreRoadSnapshot(state.future.pop());
      state.selectedRoadId = state.roadNetwork.roads[0] ? state.roadNetwork.roads[0].id : null;
      render();
    });
    document.getElementById("road-connect-button").addEventListener("click", function () {
      state.connectingNodes = true;
      state.drawingRoad = false;
      document.getElementById("raster-map-hint").textContent =
        "Haz clic sobre una posición que pertenezca a ambas carreteras para crear el nodo.";
    });
    document.getElementById("road-disconnect-button").addEventListener("click", function () {
      const roadIds = [
        document.getElementById("road-connect-a").value,
        document.getElementById("road-connect-b").value
      ];
      let removed = false;
      state.history.push(snapshotRoadState());
      state.roadNetwork.nodes = state.roadNetwork.nodes.filter(function (node) {
        const matches = roadIds.every(function (id) { return node.roadIds.indexOf(id) !== -1; });
        if (matches) removed = true;
        return !matches;
      });
      if (!removed) state.history.pop();
      else state.future = [];
      render();
    });
    document.getElementById("road-show-nodes").addEventListener("change", function () {
      state.showNodes = this.checked;
      updateMainMap();
    });
    document.getElementById("road-show-intersections").addEventListener("change", function () {
      state.showIntersections = this.checked;
      updateMainMap();
    });
    document.getElementById("road-save-button").addEventListener("click", function () {
      localStorage.setItem("von-thunen-road-network", JSON.stringify(state.roadNetwork));
      document.getElementById("road-status").textContent =
        "Red vial guardada localmente: " + state.roadNetwork.roads.length + " carreteras.";
    });
    document.getElementById("road-export-button").addEventListener("click", function () {
      const featureCollection = {
        type: "FeatureCollection",
        features: state.roadNetwork.roads.map(function (road) {
          return {
            type: "Feature",
            id: road.id,
            properties: {
              name: road.name,
              surface: road.surface,
              speed: road.speed,
              circulationCost: road.circulationCost,
              penalty: road.penalty,
              capacity: road.capacity,
              reduction: road.reduction,
              reachKm: road.reachKm,
              connectedNodeIds: road.connectedNodeIds
            },
            geometry: {
              type: "LineString",
              coordinates: road.points.map(function (point) { return [point.x, point.y]; })
            }
          };
        }),
        networkMetadata: { nodes: state.roadNetwork.nodes }
      };
      const blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: "application/geo+json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "red-vial-von-thunen.geojson";
      anchor.click();
      URL.revokeObjectURL(url);
    });
    document.getElementById("road-import-file").addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      file.text().then(function (text) {
        const geojson = JSON.parse(text);
        const roads = (geojson.features || []).map(function (feature, index) {
          const properties = feature.properties || {};
          return {
            id: String(feature.id || "import-road-" + (index + 1)),
            name: properties.name || "Carretera importada " + (index + 1),
            points: ((feature.geometry && feature.geometry.coordinates) || []).map(function (coordinate) {
              return { x: Math.round(coordinate[0]), y: Math.round(coordinate[1]) };
            }),
            reduction: Number(properties.reduction || 0.5),
            reachKm: Number(properties.reachKm || 8),
            surface: properties.surface || "pavimentada",
            speed: Number(properties.speed || 60),
            circulationCost: Number(properties.circulationCost || 1),
            penalty: Number(properties.penalty || 0),
            capacity: Number(properties.capacity || 0),
            connectedNodeIds: properties.connectedNodeIds || []
          };
        }).filter(function (road) { return road.points.length >= 2; });
        state.history.push(snapshotRoadState());
        state.future = [];
        state.roadNetwork = {
          roads: roads,
          nodes: (geojson.networkMetadata && geojson.networkMetadata.nodes) || []
        };
        state.selectedRoadId = roads[0] ? roads[0].id : null;
        render();
      }).catch(function (error) {
        document.getElementById("road-status").textContent = "No se pudo importar: " + error.message;
      });
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && state.drawingRoad) {
        event.preventDefault();
        finishRoad();
      }
      if (event.key === "Escape" && (state.drawingRoad || state.connectingNodes)) {
        state.drawingRoad = false;
        state.connectingNodes = false;
        state.draftRoad = [];
        document.getElementById("road-cancel-button").disabled = true;
        document.getElementById("road-finish-button").disabled = true;
        document.getElementById("road-draw-button").setAttribute("aria-pressed", "false");
        document.getElementById("road-draw-button").textContent = "＋ Dibujar carretera";
        document.getElementById("raster-map-hint").textContent = "Trazado cancelado.";
        updateMainMap();
      }
    });
    document.querySelectorAll('input[name="raster-layer"]').forEach(function (input) {
      input.addEventListener("change", function () {
        state.layer = input.value;
        updateMainMap();
      });
    });
    document.getElementById("raster-activity").addEventListener("change", function (event) {
      state.activity = Number(event.target.value);
      render();
    });
    document.getElementById("market-overlay").addEventListener("change", updateMainMap);
    ["market-x", "market-y", "territory-distance", "accessibility", "road-reduction", "road-reach"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", function () {
        if (id === "road-reduction") {
          document.getElementById("road-reduction-value").textContent = this.value + " %";
        }
        if (id === "road-reach") {
          document.getElementById("road-reach-value").textContent = this.value + " km";
        }
        if (state.road) {
          state.road.reduction = Number(document.getElementById("road-reduction").value) / 100;
          state.road.reachKm = Number(document.getElementById("road-reach").value);
          updateRoadStatus();
        }
        const selectedRoad = findSelectedRoad();
        if (selectedRoad) {
          selectedRoad.reduction = Number(document.getElementById("road-reduction").value) / 100;
          selectedRoad.reachKm = Number(document.getElementById("road-reach").value);
        }
        render();
      });
    });
    document.getElementById("raster-map").addEventListener("click", function (event) {
      const bounds = canvas.getBoundingClientRect();
      const x = Math.floor((event.clientX - bounds.left) / bounds.width * SIZE);
      const y = Math.floor((event.clientY - bounds.top) / bounds.height * SIZE);
      selectCell(x, y);
    });
    document.getElementById("road-draw-button").addEventListener("click", function () {
      state.draftRoad = [];
      state.drawingRoad = true;
      state.editingVertices = false;
      state.connectingNodes = false;
      this.setAttribute("aria-pressed", "true");
      this.textContent = "Añadiendo vértices…";
      document.getElementById("raster-map-hint").textContent =
        "Haz clic para agregar vértices consecutivos. Usa Finalizar carretera o Enter.";
      document.getElementById("road-status").textContent = "Esperando el primer vértice de la carretera.";
      document.getElementById("road-finish-button").disabled = true;
      document.getElementById("road-cancel-button").disabled = false;
      updateMainMap();
    });
    document.getElementById("reset-simulator").addEventListener("click", function () {
      defaults.forEach(function (activity) {
        const income = document.getElementById(activity.id + "-A");
        const transport = document.getElementById(activity.id + "-t");
        income.value = String(activity.A);
        transport.value = String(activity.t);
        income.dispatchEvent(new Event("input", { bubbles: true }));
        transport.dispatchEvent(new Event("input", { bubbles: true }));
      });
      document.getElementById("distance").value = "20";
      document.getElementById("territory-distance").value = "80";
      document.getElementById("distance").max = "80";
      document.getElementById("accessibility").value = "100";
      document.getElementById("market-x").value = "50";
      document.getElementById("market-y").value = "50";
      document.getElementById("road-reduction").value = "50";
      document.getElementById("road-reach").value = "8";
      state.road = null;
      state.roadNetwork = { roads: [], nodes: [] };
      state.draftRoad = [];
      state.selectedRoadId = null;
      state.history = [];
      state.future = [];
      state.drawingRoad = false;
      state.pendingRoadStart = null;
      state.selectedCell = { x: 50, y: 50 };
      const originalButton = document.querySelector('[data-scenario="original"]');
      if (originalButton) originalButton.click();
      const costsButton = document.querySelector('[data-scenario="costos"]');
      if (costsButton) {
        costsButton.click();
        const costIncrease = document.getElementById("cost-increase");
        costIncrease.value = "150";
        costIncrease.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const roadButton = document.querySelector('[data-scenario="carretera"]');
      if (roadButton) {
        roadButton.click();
        defaults.forEach(function (activity, index) {
          const slider = document.querySelectorAll(".road-control-row input")[index];
          slider.value = String(activity.roadReduction);
          slider.dispatchEvent(new Event("input", { bubbles: true }));
        });
        originalButton.click();
      }
      document.querySelector('input[name="raster-layer"][value="specialization"]').checked = true;
      state.layer = "specialization";
      document.getElementById("raster-activity").value = "0";
      document.getElementById("market-overlay").checked = true;
      document.getElementById("road-reduction-value").textContent = "50 %";
      document.getElementById("road-reach-value").textContent = "8 km";
      const button = document.getElementById("road-draw-button");
      button.setAttribute("aria-pressed", "false");
      button.textContent = "＋ Dibujar carretera";
      document.getElementById("raster-map-hint").textContent = "Haz clic en el mapa para consultar una celda.";
      updateRoadStatus();
      window.dispatchEvent(new CustomEvent("territory:reset"));
      render();
    });
    document.getElementById("activity-inputs").addEventListener("input", function (event) {
      const input = event.target;
      if (!input.matches("input[data-field]") || input.value === "") return;
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0) return;
      const activityId = input.closest("[data-activity]").dataset.activity;
      validParameters[activityId][input.dataset.field] = value;
      window.requestAnimationFrame(render);
    });
    document.getElementById("scenario-adjustments").addEventListener("input", function () {
      window.requestAnimationFrame(render);
    });
    document.querySelectorAll(".scenario-button").forEach(function (button) {
      button.addEventListener("click", function () {
        window.requestAnimationFrame(render);
      });
    });
  }

  bindEvents();
  try {
    const savedNetwork = localStorage.getItem("von-thunen-road-network");
    if (savedNetwork) {
      const parsed = JSON.parse(savedNetwork);
      if (Array.isArray(parsed.roads) && Array.isArray(parsed.nodes)) {
        state.roadNetwork = parsed;
        state.selectedRoadId = parsed.roads[0] ? parsed.roads[0].id : null;
      }
    }
  } catch (error) {
    state.roadNetwork = { roads: [], nodes: [] };
  }
  render();
  window.VonThunenTerritorialApp = Object.freeze({
    getState: function () { return state; },
    render: render,
    selectCell: selectCell
  });
}());
