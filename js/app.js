(function () {
  "use strict";

  const model = window.VonThunenModel;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const DISTANCE = document.getElementById("distance");
  const TERRITORY_DISTANCE = document.getElementById("territory-distance");
  const ACCESSIBILITY = document.getElementById("accessibility");
  const DISTANCE_OUTPUT = document.getElementById("distance-output");
  const activities = model.DEFAULT_ACTIVITIES.map(function (activity) {
    return Object.assign({}, activity);
  });
  const activityById = new Map(activities.map(function (activity) {
    return [activity.id, activity];
  }));
  const state = { scenario: "original", costIncrease: 150 };
  const formatMoney = new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0
  });
  const scenarioNames = {
    original: "Modelo original",
    costos: "Incremento de costos",
    carretera: "Construcción de carretera"
  };

  function svgElement(tag, attributes) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.keys(attributes).forEach(function (key) {
      element.setAttribute(key, attributes[key]);
    });
    return element;
  }

  function addText(parent, text, attributes) {
    const element = svgElement("text", attributes);
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function formatValue(value) {
    return formatMoney.format(Math.round(value * 10) / 10);
  }

  function effectiveActivities(scenario, accessibility) {
    const accessFactor = 100 / accessibility;
    return activities.map(function (activity) {
      let scenarioFactor = 1;
      if (scenario === "costos") scenarioFactor = state.costIncrease / 100;
      if (scenario === "carretera") scenarioFactor = 1 - activity.roadReduction / 100;
      return Object.assign({}, activity, { t: activity.t * accessFactor * scenarioFactor });
    });
  }

  function getCurrentActivities() {
    return effectiveActivities(state.scenario, Number(ACCESSIBILITY.value));
  }

  function getBaselineActivities() {
    return effectiveActivities("original", 100);
  }

  function getZonesFor(scenarioActivities) {
    return model.getZones(scenarioActivities, Number(TERRITORY_DISTANCE.value));
  }

  function activityInputMarkup(activity) {
    return '<div class="activity-input" data-activity="' + activity.id + '">' +
      '<div class="activity-name"><span class="activity-dot" style="background:' + activity.color + '"></span><span>' + activity.name + '</span></div>' +
      '<div class="input-wrap"><label for="' + activity.id + '-A">Ingreso A</label><input id="' + activity.id + '-A" data-field="A" type="number" min="0" step="10" value="' + activity.A + '" aria-label="Ingreso de mercado A de ' + activity.name + '"><span class="input-suffix">$/ha</span></div>' +
      '<div class="input-wrap"><label for="' + activity.id + '-t">Costo t</label><input id="' + activity.id + '-t" data-field="t" type="number" min="0" step="0.5" value="' + activity.t + '" aria-label="Costo de transporte t de ' + activity.name + '"><span class="input-suffix">$/km</span></div>' +
      '</div>';
  }

  function renderActivityInputs() {
    document.getElementById("activity-inputs").innerHTML = activities.map(activityInputMarkup).join("");
  }

  function setChildren(element, children) {
    while (element.firstChild) element.removeChild(element.firstChild);
    children.forEach(function (child) { element.appendChild(child); });
  }

  function renderScenarioControls() {
    const container = document.getElementById("scenario-adjustments");
    while (container.firstChild) container.removeChild(container.firstChild);

    if (state.scenario === "costos") {
      const wrapper = document.createElement("div");
      wrapper.className = "scenario-slider";
      const labels = document.createElement("div");
      labels.className = "scenario-slider-labels";
      const label = document.createElement("label");
      label.htmlFor = "cost-increase";
      label.textContent = "Aumento general del costo";
      const output = document.createElement("output");
      output.htmlFor = "cost-increase";
      output.id = "cost-increase-output";
      output.textContent = state.costIncrease + " %";
      labels.appendChild(label);
      labels.appendChild(output);
      const input = document.createElement("input");
      input.type = "range";
      input.id = "cost-increase";
      input.min = "100";
      input.max = "250";
      input.step = "5";
      input.value = String(state.costIncrease);
      input.setAttribute("aria-label", "Porcentaje de incremento de los costos de transporte");
      input.addEventListener("input", function () {
        state.costIncrease = Number(input.value);
        output.textContent = state.costIncrease + " %";
        render();
      });
      wrapper.appendChild(labels);
      wrapper.appendChild(input);
      container.appendChild(wrapper);
      return;
    }

    if (state.scenario === "carretera") {
      const title = document.createElement("p");
      title.className = "road-control-title";
      title.textContent = "Reducción del costo por actividad";
      container.appendChild(title);
      activities.forEach(function (activity) {
        const row = document.createElement("div");
        row.className = "road-control-row";
        const name = document.createElement("span");
        name.textContent = activity.name;
        const input = document.createElement("input");
        input.type = "range";
        input.min = "0";
        input.max = "80";
        input.step = "5";
        input.value = String(activity.roadReduction);
        input.setAttribute("aria-label", "Reducción del costo de transporte para " + activity.name);
        const output = document.createElement("output");
        output.textContent = activity.roadReduction + "%";
        input.addEventListener("input", function () {
          activity.roadReduction = Number(input.value);
          output.textContent = activity.roadReduction + "%";
          render();
        });
        row.appendChild(name);
        row.appendChild(input);
        row.appendChild(output);
        container.appendChild(row);
      });
      return;
    }

    const note = document.createElement("p");
    note.className = "scenario-note";
    note.textContent = "Sin cambios en los costos base. Ajusta A, t o la accesibilidad para explorar el modelo.";
    container.appendChild(note);
  }

  function renderSummary(distance, winner) {
    const rent = winner ? model.calculateRent(winner, distance) : 0;
    const name = winner ? winner.name : "Sin actividad viable";
    document.getElementById("winner-name").textContent = name;
    document.getElementById("winner-rent").textContent = formatValue(rent);
    document.getElementById("winner-color").style.backgroundColor = winner ? winner.color : "#aab2aa";
    document.getElementById("winner-description").textContent = winner
      ? "Mayor renta positiva a " + formatValue(distance) + " km del mercado"
      : "Todas las actividades tienen renta cero o negativa aquí.";
  }

  function renderTable(distance, winner, currentActivities, baselineActivities) {
    const body = document.getElementById("rent-rows");
    const rows = activities.map(function (activity, index) {
      const current = currentActivities[index];
      const baseline = baselineActivities[index];
      const rent = model.calculateRent(current, distance);
      const oldRent = model.calculateRent(baseline, distance);
      const delta = rent - oldRent;
      const row = document.createElement("tr");
      if (winner && activity.id === winner.id) row.className = "is-winner";

      const nameCell = document.createElement("td");
      const name = document.createElement("span");
      name.className = "table-activity";
      const dot = document.createElement("span");
      dot.className = "table-dot";
      dot.style.backgroundColor = activity.color;
      name.appendChild(dot);
      name.appendChild(document.createTextNode(activity.name));
      if (winner && activity.id === winner.id) {
        const tag = document.createElement("span");
        tag.className = "winner-tag";
        tag.textContent = "DOMINANTE";
        name.appendChild(tag);
      }
      nameCell.appendChild(name);
      row.appendChild(nameCell);

      [formatValue(activity.A), formatValue(current.t), formatValue(distance)].forEach(function (value) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });

      const rentCell = document.createElement("td");
      rentCell.className = rent > 0 ? "rent-positive" : "rent-negative";
      rentCell.textContent = formatValue(rent) + " $/ha";
      row.appendChild(rentCell);

      const resultCell = document.createElement("td");
      resultCell.textContent = rent > 0 ? "Viable" : "No viable";
      row.appendChild(resultCell);

      const changeCell = document.createElement("td");
      changeCell.className = delta > 0.05 ? "rent-positive" : delta < -0.05 ? "rent-negative" : "";
      changeCell.textContent = (delta > 0 ? "+" : "") + formatValue(delta) + " $/ha";
      row.appendChild(changeCell);
      return row;
    });
    setChildren(body, rows);
  }

  function renderRings(distance, maxDistance, currentActivities, zones) {
    const bands = document.getElementById("ring-bands");
    const guides = document.getElementById("ring-guides");
    const marker = document.getElementById("ring-marker");
    const centerGroup = document.getElementById("market-center");
    const legend = document.getElementById("ring-legend-items");
    const center = 220;
    const maxRadius = 183;
    [bands, guides, marker, centerGroup].forEach(function (group) {
      while (group.firstChild) group.removeChild(group.firstChild);
    });

    zones.forEach(function (zone, index) {
      const activity = zone.id ? activityById.get(zone.id) : null;
      const innerRadius = maxRadius * zone.start / maxDistance;
      const outerRadius = maxRadius * zone.end / maxDistance;
      const radius = (innerRadius + outerRadius) / 2;
      const thickness = Math.max(outerRadius - innerRadius, 1.5);
      bands.appendChild(svgElement("circle", {
        cx: center, cy: center, r: radius, fill: "none",
        stroke: activity ? activity.color : "#e7ebe5",
        "stroke-width": thickness, "stroke-opacity": activity ? ".83" : "1"
      }));
      if (index > 0) {
        guides.appendChild(svgElement("circle", {
          cx: center, cy: center, r: innerRadius, fill: "none", stroke: "#ffffff",
          "stroke-width": "2"
        }));
      }
    });

    const tickCount = 4;
    for (let tick = 1; tick <= tickCount; tick += 1) {
      const tickDistance = maxDistance * tick / tickCount;
      const radius = maxRadius * tick / tickCount;
      guides.appendChild(svgElement("circle", {
        cx: center, cy: center, r: radius, fill: "none", stroke: "#ffffff",
        "stroke-width": "1", "stroke-dasharray": "2 4", opacity: ".72"
      }));
      addText(guides, formatValue(tickDistance), {
        x: center + 4, y: center - radius + 10, fill: "#52645a",
        "font-size": "9", "font-family": "DM Sans, sans-serif"
      });
    }

    const markerRadius = maxRadius * distance / maxDistance;
    marker.appendChild(svgElement("line", {
      x1: center, y1: center, x2: center + markerRadius, y2: center,
      stroke: "#21372d", "stroke-width": "1.5", "stroke-dasharray": "3 3", opacity: ".76"
    }));
    marker.appendChild(svgElement("circle", {
      cx: center + markerRadius, cy: center, r: "5", fill: "#fff",
      stroke: "#21372d", "stroke-width": "2"
    }));
    centerGroup.appendChild(svgElement("circle", {
      cx: center, cy: center, r: "22", fill: "#fff", stroke: "#e8ebe4", "stroke-width": "1.5"
    }));
    addText(centerGroup, "⌂", {
      x: center, y: center + 5, "text-anchor": "middle", fill: "#2e7759",
      "font-size": "17", "font-family": "DM Sans, sans-serif"
    });

    const winner = model.getDominantActivity(currentActivities, distance);
    document.getElementById("rings-desc").textContent = winner
      ? "Mercado central fijo en el centro. A " + formatValue(distance) + " kilómetros domina " +
        winner.name + ". Escala de 0 a " + formatValue(maxDistance) + " kilómetros."
      : "Mercado central fijo en el centro. A " + formatValue(distance) +
        " kilómetros no hay actividades económicamente viables. Escala de 0 a " +
        formatValue(maxDistance) + " kilómetros.";
    const items = zones.map(function (zone) {
      const activity = zone.id ? activityById.get(zone.id) : null;
      const item = document.createElement("div");
      item.className = "legend-item";
      const color = document.createElement("span");
      color.className = "legend-color";
      color.style.backgroundColor = activity ? activity.color : "#e7ebe5";
      const text = document.createElement("span");
      text.className = "legend-text";
      const name = document.createElement("b");
      name.textContent = activity ? activity.name : "Sin actividad viable";
      const detail = document.createElement("small");
      detail.textContent = zone.start === 0 ? "más próxima al mercado" : "zona de producción";
      text.appendChild(name);
      text.appendChild(detail);
      const range = document.createElement("span");
      range.className = "legend-range";
      range.textContent = formatValue(zone.start) + "–" + formatValue(zone.end) + " km";
      item.appendChild(color);
      item.appendChild(text);
      item.appendChild(range);
      return item;
    });
    setChildren(legend, items);
    document.getElementById("legend-max-distance").textContent = formatValue(maxDistance);
  }

  function renderChart(distance, maxDistance, currentActivities) {
    const grid = document.getElementById("chart-grid");
    const lines = document.getElementById("chart-lines");
    const marker = document.getElementById("chart-marker");
    const labels = document.getElementById("chart-labels");
    [grid, lines, marker, labels].forEach(function (group) {
      while (group.firstChild) group.removeChild(group.firstChild);
    });

    const plot = { left: 55, right: 843, top: 20, bottom: 220 };
    const allValues = [0];
    currentActivities.forEach(function (activity) {
      allValues.push(model.calculateRent(activity, 0));
      allValues.push(model.calculateRent(activity, maxDistance));
    });
    let minValue = Math.min.apply(null, allValues);
    let maxValue = Math.max.apply(null, allValues);
    const span = Math.max(maxValue - minValue, 1);
    minValue = Math.min(0, minValue - span * 0.08);
    maxValue = Math.max(0, maxValue + span * 0.08);
    const y = function (value) {
      return plot.bottom - (value - minValue) / (maxValue - minValue) * (plot.bottom - plot.top);
    };
    const x = function (value) {
      return plot.left + value / maxDistance * (plot.right - plot.left);
    };

    for (let index = 0; index <= 4; index += 1) {
      const value = minValue + (maxValue - minValue) * index / 4;
      const position = y(value);
      grid.appendChild(svgElement("line", {
        x1: plot.left, y1: position, x2: plot.right, y2: position,
        class: Math.abs(value) < span / 1000 ? "chart-zero-line" : "chart-grid-line"
      }));
      addText(labels, formatValue(value), {
        x: plot.left - 8, y: position + 3, "text-anchor": "end", class: "chart-axis-label"
      });
    }
    const zeroY = y(0);
    grid.appendChild(svgElement("line", {
      x1: plot.left, y1: zeroY, x2: plot.right, y2: zeroY, class: "chart-zero-line"
    }));
    const tickStep = maxDistance / 4;
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = tickStep * tick;
      const position = x(value);
      grid.appendChild(svgElement("line", {
        x1: position, y1: plot.top, x2: position, y2: plot.bottom, class: "chart-grid-line"
      }));
      addText(labels, formatValue(value), {
        x: position, y: plot.bottom + 18, "text-anchor": "middle", class: "chart-axis-label"
      });
    }
    addText(labels, "DISTANCIA · KM", {
      x: plot.right, y: plot.bottom + 37, "text-anchor": "end", class: "chart-axis-label"
    });

    currentActivities.forEach(function (activity) {
      const zeroCrossing = activity.t > 0 ? activity.A / activity.t : Infinity;
      const sections = [
        { start: 0, end: Math.min(maxDistance, zeroCrossing), viable: activity.A > 0 },
        { start: Math.max(0, zeroCrossing), end: maxDistance, viable: false }
      ];
      sections.forEach(function (section) {
        if (section.end - section.start <= 1e-8) return;
        const startRent = model.calculateRent(activity, section.start);
        const endRent = model.calculateRent(activity, section.end);
        lines.appendChild(svgElement("path", {
          d: "M" + x(section.start).toFixed(2) + " " + y(startRent).toFixed(2) +
            " L" + x(section.end).toFixed(2) + " " + y(endRent).toFixed(2),
          class: section.viable ? "chart-series" : "chart-series chart-series-negative",
          stroke: activity.color
        }));
      });

      const currentRent = model.calculateRent(activity, distance);
      if (currentRent >= 0) {
        marker.appendChild(svgElement("circle", {
          cx: x(distance), cy: y(currentRent), r: "4", fill: activity.color, class: "chart-current-point"
        }));
      }
    });

    marker.appendChild(svgElement("line", {
      x1: x(distance), y1: plot.top, x2: x(distance), y2: plot.bottom,
      class: "chart-current-line"
    }));
  }

  function zoneTrack(zones, maxDistance, label) {
    const track = document.createElement("div");
    track.className = "territory-track";
    track.setAttribute("role", "img");
    track.setAttribute("aria-label", label);
    zones.forEach(function (zone) {
      const segment = document.createElement("span");
      segment.className = "territory-segment";
      segment.style.left = (zone.start / maxDistance * 100) + "%";
      segment.style.width = ((zone.end - zone.start) / maxDistance * 100) + "%";
      segment.style.backgroundColor = zone.id ? activityById.get(zone.id).color : "#e7ebe5";
      const name = zone.id ? activityById.get(zone.id).name : "Sin actividad viable";
      segment.title = name + ": " + formatValue(zone.start) + "–" + formatValue(zone.end) + " km";
      track.appendChild(segment);
    });
    return track;
  }

  function rangeDescription(zones, activityId) {
    const range = model.getActivityRange(zones, activityId);
    return range ? formatValue(range.start) + "–" + formatValue(range.end) + " km" : "sin territorio viable";
  }

  function renderComparison(distance, maxDistance, baselineActivities, currentActivities, baselineZones, currentZones) {
    const container = document.getElementById("comparison-maps");
    const columns = [];
    [
      { title: "Distribución inicial", detail: "Modelo original · parámetros base", zones: baselineZones },
      { title: "Después del experimento", detail: scenarioNames[state.scenario] + " · costos efectivos", zones: currentZones }
    ].forEach(function (view) {
      const column = document.createElement("div");
      column.className = "comparison-map";
      const heading = document.createElement("div");
      heading.className = "comparison-map-heading";
      const title = document.createElement("b");
      title.textContent = view.title;
      const detail = document.createElement("span");
      detail.textContent = view.detail;
      heading.appendChild(title);
      heading.appendChild(detail);
      column.appendChild(heading);
      column.appendChild(zoneTrack(view.zones, maxDistance, view.title));
      const scale = document.createElement("div");
      scale.className = "comparison-scale";
      const left = document.createElement("span");
      left.textContent = "0 km · mercado";
      const right = document.createElement("span");
      right.textContent = formatValue(maxDistance) + " km";
      scale.appendChild(left);
      scale.appendChild(right);
      column.appendChild(scale);
      const sourceActivities = view.title === "Distribución inicial" ? baselineActivities : currentActivities;
      const winner = model.getDominantActivity(sourceActivities, distance);
      const outcome = document.createElement("p");
      outcome.className = "comparison-outcome";
      outcome.textContent = "A " + formatValue(distance) + " km: " + (winner ? winner.name : "sin actividad viable");
      column.appendChild(outcome);
      columns.push(column);
    });
    setChildren(container, columns);

    const changes = document.getElementById("boundary-changes");
    const rows = activities.map(function (activity) {
      const oldRange = model.getActivityRange(baselineZones, activity.id);
      const newRange = model.getActivityRange(currentZones, activity.id);
      const row = document.createElement("div");
      row.className = "boundary-change";
      const name = document.createElement("span");
      name.className = "boundary-name";
      const dot = document.createElement("span");
      dot.className = "table-dot";
      dot.style.backgroundColor = activity.color;
      name.appendChild(dot);
      name.appendChild(document.createTextNode(activity.name));
      const oldValue = document.createElement("span");
      oldValue.textContent = rangeDescription(baselineZones, activity.id);
      const arrow = document.createElement("span");
      arrow.className = "boundary-arrow";
      arrow.textContent = "→";
      const newValue = document.createElement("span");
      newValue.textContent = rangeDescription(currentZones, activity.id);
      row.appendChild(name);
      row.appendChild(oldValue);
      row.appendChild(arrow);
      row.appendChild(newValue);
      if (!oldRange && newRange) row.classList.add("gained-zone");
      if (oldRange && !newRange) row.classList.add("lost-zone");
      return row;
    });
    setChildren(changes, rows);
    document.getElementById("comparison-distance").textContent = "A " + formatValue(distance) + " KM DEL MERCADO";
  }

  function renderLearning(distance, winner, currentActivities, baselineActivities) {
    const baseWinner = model.getDominantActivity(baselineActivities, distance);
    const positiveChange = activities.map(function (activity, index) {
      return {
        activity: activity,
        delta: model.calculateRent(currentActivities[index], distance) -
          model.calculateRent(baselineActivities[index], distance)
      };
    }).sort(function (a, b) { return b.delta - a.delta; });
    const gain = positiveChange[0];
    const lost = positiveChange[positiveChange.length - 1];
    const sentences = [];

    if (state.scenario === "costos") {
      sentences.push("En este experimento, el índice de costos de transporte es " + state.costIncrease +
        "% del valor base. Al aumentar t, las rentas disminuyen más rápidamente con la distancia; " +
        "las actividades con mayores costos por kilómetro tienden a concentrarse cerca del mercado.");
    } else if (state.scenario === "carretera") {
      const mostReduced = activities.slice().sort(function (a, b) {
        return b.roadReduction - a.roadReduction;
      })[0];
      sentences.push("La carretera reduce el costo de transporte de cada actividad según los porcentajes configurados. " +
        mostReduced.name + " recibe la mayor reducción (" + mostReduced.roadReduction +
        "%); una menor pendiente de renta puede ampliar su zona competitiva.");
    } else {
      sentences.push("En el modelo original, cada actividad pierde renta a una tasa determinada por su costo t. " +
        "Las intersecciones de esas rentas positivas definen los cambios de uso del suelo.");
    }

    if (Number(ACCESSIBILITY.value) !== 100) {
      sentences.push("El índice de accesibilidad es " + ACCESSIBILITY.value +
        "%: una accesibilidad mayor reduce el costo efectivo por kilómetro para todas las actividades.");
    }
    if (!winner) {
      sentences.push("A " + formatValue(distance) + " km ninguna actividad ofrece renta positiva; por tanto, ese tramo no se asigna a un uso económicamente viable.");
    } else {
      sentences.push("A " + formatValue(distance) + " km domina " + winner.name +
        " con una renta de " + formatValue(model.calculateRent(winner, distance)) +
        " $/ha" + (baseWinner && baseWinner.id !== winner.id
          ? "; en el modelo original dominaba " + baseWinner.name
          : "; la actividad dominante coincide con la distribución inicial") + ".");
    }
    if (Math.abs(gain.delta) > 0.05 || Math.abs(lost.delta) > 0.05) {
      const gainText = gain.delta > 0.05
        ? gain.activity.name + " gana competitividad (+" + formatValue(gain.delta) + " $/ha)"
        : gain.activity.name + " tiene la menor pérdida (" + formatValue(gain.delta) + " $/ha)";
      const lossText = lost.delta < -0.05
        ? lost.activity.name + " pierde competitividad (" + formatValue(lost.delta) + " $/ha)"
        : lost.activity.name + " registra el menor aumento (+" + formatValue(lost.delta) + " $/ha)";
      sentences.push("Frente al modelo original, en la ubicación seleccionada: " + gainText +
        "; " + lossText + ".");
    }
    document.getElementById("learning-title").textContent = state.scenario === "original"
      ? "La renta organiza el espacio"
      : "Qué cambió en este experimento";
    document.getElementById("learning-copy").textContent = sentences.join(" ");
  }

  function render() {
    const distance = Math.min(Number(DISTANCE.value), Number(TERRITORY_DISTANCE.value));
    const maxDistance = Number(TERRITORY_DISTANCE.value);
    if (Number(DISTANCE.value) !== distance) DISTANCE.value = String(distance);
    DISTANCE_OUTPUT.innerHTML = formatValue(distance) + " <small>km</small>";
    document.getElementById("map-distance").textContent = formatValue(distance);
    document.getElementById("territory-output").textContent = formatValue(maxDistance) + " km";
    document.getElementById("territory-end").textContent = formatValue(maxDistance);
    document.getElementById("accessibility-output").textContent = ACCESSIBILITY.value + " %";
    const percentage = distance / maxDistance * 100;
    DISTANCE.style.background = "linear-gradient(to right, #2e7759 " + percentage + "%, #dfe5dc " + percentage + "%)";
    const currentActivities = getCurrentActivities();
    const baselineActivities = getBaselineActivities();
    const currentZones = getZonesFor(currentActivities);
    const baselineZones = getZonesFor(baselineActivities);
    const winner = model.getDominantActivity(currentActivities, distance);
    renderSummary(distance, winner);
    renderTable(distance, winner, currentActivities, baselineActivities);
    renderRings(distance, maxDistance, currentActivities, currentZones);
    renderChart(distance, maxDistance, currentActivities);
    renderComparison(distance, maxDistance, baselineActivities, currentActivities, baselineZones, currentZones);
    renderLearning(distance, winner, currentActivities, baselineActivities);
  }

  function bindEvents() {
    DISTANCE.addEventListener("input", render);
    TERRITORY_DISTANCE.addEventListener("input", function () {
      DISTANCE.max = TERRITORY_DISTANCE.value;
      render();
    });
    ACCESSIBILITY.addEventListener("input", render);
    document.getElementById("activity-inputs").addEventListener("input", function (event) {
      const input = event.target;
      if (!input.matches("input[data-field]")) return;
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0) {
        input.setCustomValidity("Introduce un valor igual o superior a cero.");
        input.reportValidity();
        return;
      }
      input.setCustomValidity("");
      const row = input.closest("[data-activity]");
      const activity = activityById.get(row.dataset.activity);
      activity[input.dataset.field] = value;
      render();
    });
    document.querySelectorAll(".scenario-button").forEach(function (button) {
      button.addEventListener("click", function () {
        state.scenario = button.dataset.scenario;
        document.querySelectorAll(".scenario-button").forEach(function (item) {
          const active = item === button;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-pressed", String(active));
        });
        renderScenarioControls();
        render();
      });
    });
  }

  renderActivityInputs();
  renderScenarioControls();
  bindEvents();
  render();
}());
