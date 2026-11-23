(function () {
  "use strict";

  const model = window.VonThunenLandValuationPlusvalia;
  const territorialApp = window.VonThunenTerritorialApp;
  const mvesApp = window.VonThunenEconomicLandValuationApp;
  const simulation = territorialApp.getState();
  const state = {
    initial: null,
    posterior: null,
    result: null,
    scenarios: [],
    selectedCell: 0
  };

  const money = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
  const percent = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

  function formatMoney(value) {
    return Number.isFinite(value) ? money.format(Math.round(value)) : "No disponible";
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? percent.format(value) + " %" : "No aplicable";
  }

  function cloneMvesResult(source) {
    if (!source) return null;
    return {
      count: source.count,
      method: source.method,
      scenario: source.scenario,
      potentialValue: Array.from(source.potentialValue),
      admissibleValue: Array.from(source.admissibleValue),
      potentialValueLeader: Array.from(source.potentialValueLeader),
      admissibleValueLeader: Array.from(source.admissibleValueLeader),
      activities: source.activities.map(function (activity) {
        return {
          landRent: Array.from(activity.landRent),
          transportCosts: Array.from(activity.transportCosts),
          productivityFactor: Array.from(activity.productivityFactor),
          useType: activity.useType.slice(),
          condition: activity.condition.slice()
        };
      })
    };
  }

  function currentMvesResult() {
    return cloneMvesResult(mvesApp.getState().result);
  }

  function selectedInterventions() {
    const select = document.getElementById("plusvalia-interventions");
    return Array.from(select.selectedOptions).map(function (option) { return option.value; });
  }

  function readScenarioOptions() {
    return {
      scenario: document.getElementById("plusvalia-scenario-mode").value,
      interventionIds: selectedInterventions(),
      factors: {
        transport: document.getElementById("plusvalia-factor-transport").checked,
        accessibility: document.getElementById("plusvalia-factor-accessibility").checked,
        rent: document.getElementById("plusvalia-factor-rent").checked,
        aptitude: document.getElementById("plusvalia-factor-aptitude").checked,
        landUse: document.getElementById("plusvalia-factor-use").checked,
        building: document.getElementById("plusvalia-factor-building").checked
      },
      referenceBefore: Number(document.getElementById("plusvalia-price-before").value),
      referenceAfter: Number(document.getElementById("plusvalia-price-after").value),
      areaPerCellM2: Number(document.getElementById("plusvalia-area-cell").value),
      participation: Number(document.getElementById("plusvalia-participation").value)
    };
  }

  function drawColorMap(canvas, values, mode, result) {
    const context = canvas.getContext("2d", { alpha: false });
    const width = 100;
    const height = 100;
    const image = context.createImageData(width, height);
    const validCount = Math.max(1, values.length);
    let minimum = Infinity;
    let maximum = -Infinity;
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (Number.isFinite(value)) {
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
    }
    if (!Number.isFinite(minimum)) { minimum = 0; maximum = 1; }
    for (let index = 0; index < width * height; index += 1) {
      const sourceIndex = index < validCount ? index : -1;
      let color = "#9a9f9b";
      if (sourceIndex >= 0) {
        const value = values[sourceIndex];
        if (mode === "value") {
          if (Number.isFinite(value) && value > 0) {
            const fraction = maximum > minimum ? (value - minimum) / (maximum - minimum) : 0.5;
            color = interpolateColor("#edf3ed", "#2f7650", fraction);
          } else {
            color = "#9a9f9b";
          }
        } else if (mode === "change") {
          if (Number.isFinite(value) && Math.abs(value) < 0.01) color = "#e6ebe3";
          else if (value > 0) color = "#2f7650";
          else if (value < 0) color = "#b85d58";
          else color = "#9a9f9b";
        } else if (mode === "plusvalia") {
          if (Number.isFinite(value) && value > 0) color = "#b98a4a";
          else color = "#9a9f9b";
        }
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

  function parseColor(color) {
    const value = color.slice(1);
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16)
    ];
  }

  function interpolateColor(start, end, fraction) {
    const first = parseColor(start);
    const last = parseColor(end);
    const ratio = Math.max(0, Math.min(1, fraction));
    function hex(value) {
      return Math.round(value).toString(16).padStart(2, "0");
    }
    return "#" +
      hex(first[0] + (last[0] - first[0]) * ratio) +
      hex(first[1] + (last[1] - first[1]) * ratio) +
      hex(first[2] + (last[2] - first[2]) * ratio);
  }

  function renderSummary() {
    const indicators = state.result.indicators;
    const cards = [
      ["Valor inicial promedio", formatMoney(indicators.initialAverage), "COP/ha"],
      ["Valor posterior promedio", formatMoney(indicators.posteriorAverage), "COP/ha"],
      ["Incremento económico estimado", formatMoney(indicators.economicIncrement), "COP/ha de diferencia promedio"],
      ["Superficie valorizada", formatPercent(indicators.positiveSurfacePercent), "porcentaje de celdas"],
      ["Superficie desvalorizada", formatPercent(indicators.negativeSurfacePercent), "porcentaje de celdas"],
      ["Unidades beneficiadas", indicators.positiveCount.toLocaleString("es-CO"), "celdas"],
      ["Cambio de uso detectado", indicators.useChangeCount.toLocaleString("es-CO"), "celdas"],
      ["Efecto plusvalía", indicators.hasCommercialReferences ? formatMoney(indicators.plusvaliaEffect) : "Sin datos comerciales", indicators.hasCommercialReferences ? "estimación según referencias" : "no hay liquidación oficial"]
    ];
    document.getElementById("plusvalia-summary").innerHTML = cards.map(function (card) {
      return '<div class="plusvalia-metric"><b>' + card[1] + '</b><span>' + card[0] + " · " + card[2] + "</span></div>";
    }).join("");
  }

  function renderFactorChart() {
    const canvas = document.getElementById("plusvalia-factors-chart");
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const labels = [
      ["transport", "Transporte"],
      ["accessibility", "Accesibilidad"],
      ["rent", "Renta"],
      ["productivity", "Aptitud"],
      ["landUse", "Uso"],
      ["buildingPotential", "Edificabilidad"],
      ["urbanExpansion", "Expansión"],
      ["other", "Otros"]
    ];
    let maximum = 1;
    labels.forEach(function (item) {
      maximum = Math.max(maximum, Math.abs(state.result.factors[item[0]] || 0));
    });
    const chartX = 130;
    const chartWidth = canvas.width - chartX - 25;
    labels.forEach(function (item, index) {
      const y = 24 + index * 24;
      const value = state.result.factors[item[0]] || 0;
      context.fillStyle = "#69786e";
      context.font = "11px sans-serif";
      context.fillText(item[1], 8, y + 10);
      const origin = chartX + chartWidth / 2;
      const barWidth = value / maximum * chartWidth / 2;
      context.fillStyle = value >= 0 ? "#2f7650" : "#b85d58";
      context.fillRect(value >= 0 ? origin : origin + barWidth, y, Math.abs(barWidth), 12);
      context.strokeStyle = "#e1e6df";
      context.beginPath();
      context.moveTo(origin, y - 3);
      context.lineTo(origin, y + 16);
      context.stroke();
    });
  }

  function renderCell() {
    const cell = state.selectedCell;
    const change = state.result.absoluteChange[cell];
    const percentChange = state.result.percentChange[cell];
    const initial = state.result.initialValues[cell];
    const posterior = state.result.posteriorValues[cell];
    const plusvalia = state.result.plusvaliaPerM2[cell];
    const scenario = state.result.scenario;
    const areaPerCell = Number(document.getElementById("plusvalia-area-cell").value);
    const initialLeader = state.initial ? (
      scenario === "admissible" ? state.initial.admissibleValueLeader[cell] : state.initial.potentialValueLeader[cell]
    ) : -1;
    const posteriorLeader = state.posterior ? (
      scenario === "admissible" ? state.posterior.admissibleValueLeader[cell] : state.posterior.potentialValueLeader[cell]
    ) : -1;
    const activityName = posteriorLeader >= 0 ? state.posterior.activities[posteriorLeader] : null;
    document.getElementById("plusvalia-cell-summary").innerHTML =
      "<b>Unidad espacial</b> Celda " + cell + "<br>" +
      "<b>Área por celda</b> " + (Number.isFinite(areaPerCell) ? areaPerCell.toLocaleString("es-CO") : "0") + " m²<br>" +
      "<b>Valor inicial</b> " + formatMoney(initial) + " COP/ha<br>" +
      "<b>Valor posterior</b> " + formatMoney(posterior) + " COP/ha<br>" +
      "<b>Diferencia</b> " + formatMoney(change) + " COP/ha<br>" +
      "<b>Variación</b> " + formatPercent(percentChange) + "<br>" +
      "<b>Actividad líder inicial/posterior</b> " + (initialLeader + 1) + " / " + (posteriorLeader + 1) + "<br>" +
      "<b>Efecto plusvalía por m²</b> " + formatMoney(plusvalia) + " COP/m²<br>" +
      "<b>Calidad</b> " + (state.result.indicators.hasCommercialReferences
        ? "Referencias comerciales registradas; estimación didáctica"
        : "Sin datos comerciales suficientes; no usar como liquidación");
  }

  function paintMaps() {
    drawColorMap(document.getElementById("plusvalia-map-a"),
      state.result.initialValues, "value", state.result);
    drawColorMap(document.getElementById("plusvalia-map-b"),
      state.result.posteriorValues, "value", state.result);
    drawColorMap(document.getElementById("plusvalia-map-change"),
      state.result.absoluteChange, "change", state.result);
    drawColorMap(document.getElementById("plusvalia-map-plusvalia"),
      state.result.plusvaliaPerM2, "plusvalia", state.result);
  }

  function runComparison() {
    if (!state.initial) {
      state.initial = currentMvesResult();
      if (!state.initial) {
        document.getElementById("plusvalia-status").textContent =
          "El MVES aún no tiene un resultado disponible.";
        return;
      }
    }
    state.posterior = currentMvesResult();
    if (!state.posterior) {
      document.getElementById("plusvalia-status").textContent =
        "No fue posible obtener el resultado posterior del MVES.";
      return;
    }
    const options = readScenarioOptions();
    state.result = model.compare(state.initial, state.posterior, options);
    paintMaps();
    renderSummary();
    renderFactorChart();
    renderCell();
    document.getElementById("plusvalia-status").textContent =
      "Comparación ejecutada. " +
      (options.interventionIds.length ? options.interventionIds.length + " intervención(es) activa(s)." : "Sin intervención activa.");
  }

  function populateInterventions() {
    const select = document.getElementById("plusvalia-interventions");
    model.INTERVENTIONS.forEach(function (intervention) {
      const option = document.createElement("option");
      option.value = intervention.id;
      option.textContent = intervention.label;
      select.appendChild(option);
    });
  }

  function captureInitial() {
    state.initial = currentMvesResult();
    if (!state.initial) {
      document.getElementById("plusvalia-status").textContent =
        "El MVES todavía no tiene resultados.";
      return;
    }
    state.result = null;
    document.getElementById("plusvalia-status").textContent =
      "Escenario inicial capturado. Modifica el territorio y ejecuta la comparación.";
  }

  function scenarioPayload() {
    return {
      type: "von-thunen-v0.8",
      name: document.getElementById("plusvalia-scenario-b").value,
      municipality: document.getElementById("plusvalia-municipality").value,
      period: document.getElementById("plusvalia-period").value,
      initialName: document.getElementById("plusvalia-scenario-a").value,
      posteriorName: document.getElementById("plusvalia-scenario-b").value,
      interventionIds: selectedInterventions(),
      method: document.getElementById("plusvalia-method").value,
      mvesScenario: document.getElementById("plusvalia-scenario-mode").value,
      parameters: readScenarioOptions(),
      source: {
        name: document.getElementById("plusvalia-source").value,
        date: document.getElementById("plusvalia-source-date").value,
        methodology: document.getElementById("plusvalia-methodology").value
      },
      modelVersion: "V0.8",
      initial: state.initial,
      posterior: state.posterior,
      result: state.result
    };
  }

  function saveScenario() {
    const payload = scenarioPayload();
    const saved = state.scenarios;
    saved.push(payload);
    localStorage.setItem("von-thunen-v08-scenarios", JSON.stringify(saved));
    refreshSavedList();
    document.getElementById("plusvalia-status").textContent =
      "Escenario guardado localmente.";
  }

  function refreshSavedList() {
    const list = document.getElementById("plusvalia-saved-list");
    list.innerHTML = "";
    state.scenarios.forEach(function (scenario, index) {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = scenario.name + " · " + scenario.municipality + " · " + scenario.modelVersion;
      list.appendChild(option);
    });
  }

  function exportJson() {
    const payload = scenarioPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "escenario-valorizacion-v0-8.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportGeoJson() {
    if (!state.result) {
      document.getElementById("plusvalia-status").textContent =
        "Ejecuta la comparación antes de exportar.";
      return;
    }
    const width = simulation.after ? simulation.after.width : 100;
    const height = simulation.after ? simulation.after.height : 100;
    const features = [];
    for (let index = 0; index < state.result.count; index += 1) {
      const x = index % width;
      const y = Math.floor(index / width);
      features.push({
        type: "Feature",
        id: "cell-" + index,
        properties: {
          initialValueCopHa: state.result.initialValues[index],
          posteriorValueCopHa: state.result.posteriorValues[index],
          absoluteChangeCopHa: state.result.absoluteChange[index],
          percentChange: Number.isFinite(state.result.percentChange[index])
            ? state.result.percentChange[index] : null,
          plusvaliaCopM2: state.result.plusvaliaPerM2[index],
          plusvaliaTotalCop: state.result.plusvaliaTotal[index]
        },
        geometry: {
          type: "Point",
          coordinates: [x, y]
        }
      });
    }
    const payload = {
      type: "FeatureCollection",
      name: "Valorización V0.8",
      features: features,
      properties: scenarioPayload()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "valorizacion-v0-8.geojson";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    if (!state.result) {
      document.getElementById("plusvalia-status").textContent =
        "Ejecuta la comparación antes de exportar.";
      return;
    }
    const rows = [["cell", "initial_value_cop_ha", "posterior_value_cop_ha",
      "absolute_change_cop_ha", "percent_change", "plusvalia_cop_m2", "plusvalia_total_cop"]];
    for (let cell = 0; cell < state.result.count; cell += 1) {
      rows.push([
        cell,
        state.result.initialValues[cell],
        state.result.posteriorValues[cell],
        state.result.absoluteChange[cell],
        Number.isFinite(state.result.percentChange[cell]) ? state.result.percentChange[cell] : "",
        state.result.plusvaliaPerM2[cell],
        state.result.plusvaliaTotal[cell]
      ]);
    }
    const csv = rows.map(function (row) {
      return row.map(function (value) {
        return '"' + String(value).replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "valorizacion-v0-8.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function importScenario(file) {
    if (!file) return;
    file.text().then(function (text) {
      const payload = JSON.parse(text);
      if (payload.type !== "von-thunen-v0.8") throw new Error("Formato de escenario V0.8 no reconocido.");
      state.initial = payload.initial;
      state.posterior = payload.posterior;
      state.result = payload.result;
      document.getElementById("plusvalia-municipality").value = payload.municipality || "";
      document.getElementById("plusvalia-period").value = payload.period || "";
      document.getElementById("plusvalia-scenario-a").value = payload.initialName || "";
      document.getElementById("plusvalia-scenario-b").value = payload.posteriorName || "";
      document.getElementById("plusvalia-method").value = payload.method || "capitalization";
      document.getElementById("plusvalia-scenario-mode").value = payload.mvesScenario || "potential";
      const select = document.getElementById("plusvalia-interventions");
      Array.from(select.options).forEach(function (option) {
        option.selected = (payload.interventionIds || []).indexOf(option.value) >= 0;
      });
      paintMaps();
      renderSummary();
      renderFactorChart();
      renderCell();
      document.getElementById("plusvalia-status").textContent =
        "Escenario importado correctamente.";
    }).catch(function (error) {
      document.getElementById("plusvalia-status").textContent =
        "No se pudo importar: " + error.message;
    });
  }

  function bindEvents() {
    document.getElementById("plusvalia-capture-a").addEventListener("click", captureInitial);
    document.getElementById("plusvalia-run").addEventListener("click", runComparison);
    document.getElementById("plusvalia-save").addEventListener("click", saveScenario);
    document.getElementById("plusvalia-duplicate").addEventListener("click", function () {
      if (!state.result) {
        document.getElementById("plusvalia-status").textContent =
          "Ejecuta o importa un escenario antes de duplicarlo.";
        return;
      }
      document.getElementById("plusvalia-scenario-b").value =
        document.getElementById("plusvalia-scenario-b").value + " (copia)";
      saveScenario();
    });
    document.getElementById("plusvalia-export-csv").addEventListener("click", exportCsv);
    document.getElementById("plusvalia-export-json").addEventListener("click", exportJson);
    document.getElementById("plusvalia-export-geojson").addEventListener("click", exportGeoJson);
    document.getElementById("plusvalia-import-file").addEventListener("change", function (event) {
      importScenario(event.target.files && event.target.files[0]);
    });
    document.getElementById("plusvalia-saved-list").addEventListener("change", function () {
      const scenario = state.scenarios[Number(this.value)];
      if (!scenario) return;
      state.initial = scenario.initial;
      state.posterior = scenario.posterior;
      state.result = scenario.result;
      if (state.result) {
        paintMaps();
        renderSummary();
        renderFactorChart();
        renderCell();
      }
    });
    ["plusvalia-map-a", "plusvalia-map-b", "plusvalia-map-change", "plusvalia-map-plusvalia"]
      .forEach(function (id) {
        document.getElementById(id).addEventListener("click", function (event) {
          if (!state.result) return;
          const bounds = this.getBoundingClientRect();
          const x = Math.max(0, Math.min(99, Math.floor((event.clientX - bounds.left) / bounds.width * 100)));
          const y = Math.max(0, Math.min(99, Math.floor((event.clientY - bounds.top) / bounds.height * 100)));
          const width = simulation.after ? simulation.after.width : 100;
          const height = simulation.after ? simulation.after.height : 100;
          const rasterIndex = y * width + x;
          state.selectedCell = Math.max(0, Math.min(state.result.count - 1, rasterIndex));
          renderCell();
        });
      });
    window.addEventListener("territory:render", function () {
      if (state.result) runComparison();
    });
  }

  populateInterventions();
  try {
    const saved = JSON.parse(localStorage.getItem("von-thunen-v08-scenarios") || "[]");
    state.scenarios = Array.isArray(saved) ? saved : [];
  } catch (error) {
    state.scenarios = [];
  }
  refreshSavedList();
  bindEvents();

  window.VonThunenLandValuationPlusvaliaApp = Object.freeze({
    getState: function () { return state; },
    captureInitial: captureInitial,
    runComparison: runComparison
  });
}());
