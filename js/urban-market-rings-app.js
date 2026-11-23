(function () {
  "use strict";

  const municipalApp = window.VonThunenMunicipalApp;
  const geometryTools = window.VonThunenMunicipalGeometry;
  const model = window.VonThunenUrbanMarketRings;
  const municipal = municipalApp.getState();
  const canvas = document.getElementById("urban-market-map");
  const context = canvas.getContext("2d", { alpha: false });
  const state = {
    urbanGeometry: null,
    urbanSource: "No cargada",
    fallbackEnabled: true,
    fallbackRadiusKm: 3,
    roadNetwork: null,
    roadGeoJson: null,
    result: null,
    accesses: [],
    selectedCell: null
  };

  function format(value, digits) {
    return new Intl.NumberFormat("es-CO", {
      maximumFractionDigits: digits === undefined ? 1 : digits
    }).format(value);
  }

  function recalculate() {
    updateRoadStatus();
    if (!municipal.grid || !municipal.projectedGeometry) {
      document.getElementById("urban-market-indicators").textContent =
        "Carga primero un límite municipal.";
      return;
    }
    const bandCount = Number(document.getElementById("urban-band-count").value);
    const maximumKm = Number(document.getElementById("urban-max-distance").value);
    state.fallbackEnabled = document.getElementById("urban-fallback-checkbox").checked;
    state.fallbackRadiusKm = Number(document.getElementById("urban-fallback-radius").value);
    state.result = model.calculateMunicipalUrbanRaster({
      grid: municipal.grid,
      urbanGeometry: state.urbanGeometry,
      fallbackMarket: !state.urbanGeometry && state.fallbackEnabled ? municipal.market : null,
      fallbackRadiusMeters: state.fallbackRadiusKm * 1000,
      bandCount: bandCount,
      maximumKm: maximumKm,
      distanceMode: document.getElementById("urban-distance-mode").value,
      roadNetwork: state.roadNetwork,
      roadSpeed: Number(document.getElementById("urban-road-speed").value),
      roadCost: Number(document.getElementById("urban-road-cost").value)
    });
    updateRoadStatus();
    render();
  }

  function updateRoadModeAvailability() {
    const option = document.querySelector('#urban-distance-mode option[value="road"]');
    option.disabled = !state.roadNetwork;
    if (!state.roadNetwork && document.getElementById("urban-distance-mode").value === "road") {
      document.getElementById("urban-distance-mode").value = "geometry";
    }
  }

  function updateRoadStatus() {
    const element = document.getElementById("urban-road-status");
    updateRoadModeAvailability();
    if (!state.roadNetwork) {
      element.textContent =
        "Sin red municipal georreferenciada. Las carreteras del editor general usan la cuadrícula demostrativa y no se aplican aquí.";
      return;
    }
    if (state.result && state.result.roadNetworkStatus === "network-no-urban-connection") {
      element.textContent = "La red EPSG:9377 no tiene una ruta conectada al área urbana. No se asignan distancias viales a las celdas desconectadas.";
      return;
    }
    element.textContent = "Red vial EPSG:9377 cargada: " + state.roadNetwork.roads.length +
      " carreteras. Solo se reconocen conexiones explícitas declaradas en networkMetadata.nodes.";
  }

  function parseColor(color) {
    const value = color.slice(1);
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16)
    ];
  }

  function bandColor(index) {
    const colors = ["#f0efe1", "#dfeccf", "#c9dda6", "#b1cb83", "#93b76a",
      "#75a34f", "#5b8f43", "#477b3b", "#356735", "#28562c", "#1f4727", "#173a22"];
    return colors[Math.max(0, index) % colors.length];
  }

  function paintMap() {
    if (!municipal.grid || !state.result) return;
    const grid = municipal.grid;
    canvas.width = grid.width;
    canvas.height = grid.height;
    const image = context.createImageData(grid.width, grid.height);
    const showUrban = document.getElementById("urban-show-urban").checked;
    const showRings = document.getElementById("urban-show-rings").checked;
    const showRents = document.getElementById("urban-show-rents").checked;
    const activity = Number(document.getElementById("urban-activity").value);

    for (let index = 0; index < grid.count; index += 1) {
      let color = "#e7ebe5";
      if (grid.validMask[index] === 1) {
        if (showUrban && state.result.urbanMask[index] === 1) color = "#b78383";
        else if (showRings && state.result.ruralMask[index] === 1) {
          const band = state.result.band[index];
          color = band >= 0 ? bandColor(band) : "#e2dcca";
        } else if (showRents && municipal.raster &&
            municipal.raster.rentSurfaces && municipal.raster.rentSurfaces[activity]) {
          const rent = municipal.raster.rentSurfaces[activity][index];
          if (Number.isFinite(rent) && rent > 0) color = "#73946d";
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

    if (municipal.market) {
      const gridColumn = (municipal.market.x - grid.originX) / grid.resolutionMeters;
      const gridRowFromBottom = (municipal.market.y - grid.originY) / grid.resolutionMeters;
      const gridRow = grid.height - gridRowFromBottom;
      context.save();
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#173b2c";
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(gridColumn, gridRow, Math.max(2, grid.resolutionMeters / grid.resolutionMeters),
        0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    }
    state.accesses.forEach(function (access) {
      context.save();
      context.fillStyle = "#2875a6";
      context.strokeStyle = "#ffffff";
      context.beginPath();
      context.arc(access.column, canvas.height - 1 - access.row, 3, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    });
  }

  function renderIndicators() {
    if (!municipal.grid || !municipal.projectedGeometry || !state.result) return;
    const grid = municipal.grid;
    let urbanCount = 0;
    let ruralCount = 0;
    let reachableCount = 0;
    let analyzedCount = 0;
    let distanceSum = 0;
    let maxRuralDistance = 0;
    const bandAreas = state.result.thresholdsKm.map(function () { return 0; });
    for (let index = 0; index < grid.count; index += 1) {
      if (grid.validMask[index] !== 1) continue;
      if (state.result.urbanMask[index] === 1) urbanCount += 1;
      else if (state.result.ruralMask[index] === 1) {
        ruralCount += 1;
        const distanceKm = state.result.distanceMeters[index] / 1000;
        if (Number.isFinite(distanceKm)) {
          reachableCount += 1;
          distanceSum += distanceKm;
          maxRuralDistance = Math.max(maxRuralDistance, distanceKm);
        }
        const band = state.result.band[index];
        if (band >= 0) {
          analyzedCount += 1;
          bandAreas[band] += 1;
        }
      }
    }
    const areaPerCellHa = grid.resolutionMeters * grid.resolutionMeters / 10000;
    const urbanArea = urbanCount * areaPerCellHa;
    const ruralArea = ruralCount * areaPerCellHa;
    const analyzedArea = analyzedCount * areaPerCellHa;
    const meanDistance = reachableCount ? distanceSum / reachableCount : 0;
    const bandText = bandAreas.map(function (count, index) {
      return "Banda " + (index + 1) + ": " + format(count * areaPerCellHa, 1) + " ha";
    }).join("<br>");
    document.getElementById("urban-market-indicators").innerHTML =
      "<b>Área urbana estimada:</b> " + format(urbanArea, 1) + " ha<br>" +
      "<b>Área rural:</b> " + format(ruralArea, 1) + " ha<br>" +
      "<b>Área rural analizada:</b> " + format(analyzedArea, 1) + " ha<br>" +
      "<b>Número de anillos:</b> " + state.result.bandCount + "<br>" +
      "<b>Área rural con distancia disponible:</b> " + format(reachableCount * areaPerCellHa, 1) + " ha<br>" +
      "<b>Distancia media de celdas alcanzables:</b> " + format(meanDistance, 2) + " km<br>" +
      "<b>Máxima distancia representada:</b> " + format(maxRuralDistance, 2) + " km<br>" +
      bandText;
  }

  function renderLegend() {
    const legend = document.getElementById("urban-market-legend");
    const items = ["<span><i style=\"background:#b78383\"></i> Mercado urbano</span>"];
    state.result.thresholdsKm.forEach(function (threshold, index) {
      items.push('<span><i style="background:' + bandColor(index) + '"></i>' +
        " Banda " + (index + 1) + " · ≤ " + format(threshold, 1) + " km</span>");
    });
    items.push("<span><i style=\"background:#e2dcca\"></i> Fuera de bandas</span>");
    legend.innerHTML = items.join("");
  }

  function renderCell() {
    if (!state.selectedCell || !state.result) return;
    const index = state.selectedCell.row * municipal.grid.width + state.selectedCell.column;
    const distanceKm = Number.isFinite(state.result.distanceMeters[index])
      ? state.result.distanceMeters[index] / 1000 : null;
    const band = state.result.band[index];
    const urban = state.result.urbanMask[index] === 1;
    const activity = Number(document.getElementById("urban-activity").value);
    let rent = null;
    if (municipal.raster && municipal.raster.rentSurfaces &&
        municipal.raster.rentSurfaces[activity]) {
      rent = municipal.raster.rentSurfaces[activity][index];
    }
    const distanceMode = document.getElementById("urban-distance-mode").value;
    const accessibility = urban ? "Punto urbano" : Number.isFinite(distanceKm)
      ? "Modalidad " + distanceMode
      : distanceMode === "road" ? "Sin ruta vial conectada al mercado" : "Sin área urbana definida";
    const distanceLabel = distanceMode === "road"
      ? "Distancia vial efectiva" : "Distancia al área urbana";
    document.getElementById("urban-market-cell").innerHTML =
      "<b>Celda:</b> " + state.selectedCell.column + ", " + state.selectedCell.row + "<br>" +
      "<b>Clase:</b> " + (urban ? "Suelo urbano / mercado" : "Área rural") + "<br>" +
      "<b>" + distanceLabel + ":</b> " + (distanceKm === null ? "No disponible" : format(distanceKm, 3) + " km") + "<br>" +
      "<b>Anillo:</b> " + (band >= 0 ? band + 1 : "Fuera del máximo") + "<br>" +
      "<b>Renta de localización:</b> " + (rent === null || !Number.isFinite(rent) ? "No disponible" : format(rent, 1) + " COP/ha") + "<br>" +
      "<b>Accesibilidad:</b> " + accessibility;
  }

  function render() {
    paintMap();
    renderIndicators();
    renderLegend();
    renderCell();
  }

  function canvasCoordinates(event) {
    const bounds = canvas.getBoundingClientRect();
    const column = Math.floor((event.clientX - bounds.left) / bounds.width * canvas.width);
    const renderedRow = Math.floor((event.clientY - bounds.top) / bounds.height * canvas.height);
    const row = canvas.height - 1 - renderedRow;
    const grid = municipal.grid;
    const x = grid.originX + (column + 0.5) * grid.resolutionMeters;
    const y = grid.originY + (row + 0.5) * grid.resolutionMeters;
    return { column: column, row: row, x: x, y: y };
  }

  function importUrbanGeometry(file) {
    if (!file) return;
    file.text().then(function (text) {
      const geojson = JSON.parse(text);
      const normalized = geometryTools.normalizeGeometry(geojson);
      state.urbanGeometry = geometryTools.projectGeometry(normalized);
      state.urbanSource = "GeoJSON urbano cargado: " + file.name;
      document.getElementById("urban-market-source").textContent =
        state.urbanSource + ". Debe verificarse contra el POT/PBOT/EOT aplicable.";
      recalculate();
    }).catch(function (error) {
      document.getElementById("urban-market-source").textContent =
        "No se pudo cargar la geometría urbana: " + error.message;
    });
  }

  function payload() {
    return {
      type: "von-thunen-v1.1-urban-market",
      modelVersion: "V1.1",
      municipality: municipal.selectedMunicipality,
      urbanSource: state.urbanSource,
      urbanGeometry: state.urbanGeometry,
      fallbackEnabled: state.fallbackEnabled,
      fallbackRadiusKm: state.fallbackRadiusKm,
      roadGeoJson: state.roadGeoJson,
      bandCount: Number(document.getElementById("urban-band-count").value),
      maximumKm: Number(document.getElementById("urban-max-distance").value),
      distanceMode: document.getElementById("urban-distance-mode").value,
      accesses: state.accesses,
      result: state.result
    };
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(payload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mercado-urbano-v1-1.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file) {
    if (!file) return;
    file.text().then(function (text) {
      const imported = JSON.parse(text);
      if (imported.type !== "von-thunen-v1.0-urban-market" &&
          imported.type !== "von-thunen-v1.1-urban-market") {
        throw new Error("Formato de configuración urbana no reconocido.");
      }
      const roadNetwork = imported.roadGeoJson
        ? model.parseRoadNetworkGeoJson(imported.roadGeoJson) : null;
      state.urbanGeometry = imported.urbanGeometry || null;
      state.urbanSource = imported.urbanSource || "Configuración importada";
      state.roadGeoJson = imported.roadGeoJson || null;
      state.roadNetwork = roadNetwork;
      state.fallbackEnabled = imported.fallbackEnabled !== false;
      state.fallbackRadiusKm = Number(imported.fallbackRadiusKm || 3);
      state.accesses = Array.isArray(imported.accesses) ? imported.accesses : [];
      document.getElementById("urban-fallback-checkbox").checked = state.fallbackEnabled;
      document.getElementById("urban-fallback-radius").value = String(state.fallbackRadiusKm);
      document.getElementById("urban-band-count").value = String(imported.bandCount || 5);
      document.getElementById("urban-max-distance").value = String(imported.maximumKm || 30);
      document.getElementById("urban-distance-mode").value = imported.distanceMode || "geometry";
      document.getElementById("urban-market-source").textContent =
        state.urbanSource + " · Configuración importada.";
      updateRoadModeAvailability();
      if (!state.roadNetwork) document.getElementById("urban-distance-mode").value = "geometry";
      recalculate();
    }).catch(function (error) {
      document.getElementById("urban-market-source").textContent =
        "No se pudo importar: " + error.message;
    });
  }

  function importRoadNetwork(file) {
    if (!file) return;
    file.text().then(function (text) {
      const geojson = JSON.parse(text);
      const roadNetwork = model.parseRoadNetworkGeoJson(geojson);
      state.roadGeoJson = geojson;
      state.roadNetwork = roadNetwork;
      state.result = null;
      document.getElementById("urban-distance-mode").value = "road";
      updateRoadStatus();
      recalculate();
    }).catch(function (error) {
      document.getElementById("urban-road-status").textContent =
        "No se pudo cargar la red vial: " + error.message;
    });
  }

  function setRoadNetwork(geoJson) {
    if (!geoJson) {
      state.roadGeoJson = null;
      state.roadNetwork = null;
      updateRoadModeAvailability();
      recalculate();
      return;
    }
    try {
      const roadNetwork = model.parseRoadNetworkGeoJson(geoJson);
      state.roadGeoJson = geoJson;
      state.roadNetwork = roadNetwork;
      document.getElementById("urban-distance-mode").value = "road";
      updateRoadStatus();
      recalculate();
    } catch (error) {
      document.getElementById("urban-road-status").textContent =
        "No se pudo integrar la red automática: " + error.message;
    }
  }

  function bindEvents() {
    ["urban-band-count", "urban-max-distance", "urban-fallback-radius",
      "urban-fallback-checkbox", "urban-distance-mode", "urban-activity",
      "urban-show-urban", "urban-show-rings", "urban-show-rents"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", recalculate);
    });
    document.getElementById("urban-geojson-file").addEventListener("change", function (event) {
      importUrbanGeometry(event.target.files && event.target.files[0]);
    });
    document.getElementById("urban-road-geojson-file").addEventListener("change", function (event) {
      importRoadNetwork(event.target.files && event.target.files[0]);
    });
    canvas.addEventListener("click", function (event) {
      if (!municipal.grid || !state.result) return;
      const point = canvasCoordinates(event);
      const index = point.row * municipal.grid.width + point.column;
      if (municipal.grid.validMask[index] !== 1) return;
      state.selectedCell = point;
      if (document.querySelector('input[name="urban-access-mode"]:checked')) {
        state.accesses.push(point);
      }
      render();
    });
    document.getElementById("urban-clear-access").addEventListener("click", function () {
      state.accesses = [];
      render();
    });
    document.getElementById("urban-save-json").addEventListener("click", function () {
      try {
        localStorage.setItem("von-thunen-v10-urban-market", JSON.stringify(payload()));
        document.getElementById("urban-market-source").textContent =
          "Configuración urbana guardada localmente. " + state.urbanSource;
      } catch (error) {
        document.getElementById("urban-market-source").textContent =
          "No se pudo guardar la configuración local: " + error.message;
      }
    });
    document.getElementById("urban-export-json").addEventListener("click", exportJson);
    document.getElementById("urban-import-json").addEventListener("change", function (event) {
      importJson(event.target.files && event.target.files[0]);
    });
    window.addEventListener("territory:render", recalculate);
  }

  try {
    const saved = JSON.parse(localStorage.getItem("von-thunen-v10-urban-market") || "null");
    if (saved && (saved.type === "von-thunen-v1.0-urban-market" ||
        saved.type === "von-thunen-v1.1-urban-market")) {
      state.urbanGeometry = saved.urbanGeometry || null;
      state.urbanSource = saved.urbanSource || "Configuración recuperada";
      state.roadGeoJson = saved.roadGeoJson || null;
      state.roadNetwork = state.roadGeoJson
        ? model.parseRoadNetworkGeoJson(state.roadGeoJson) : null;
      state.fallbackEnabled = saved.fallbackEnabled !== false;
      state.fallbackRadiusKm = Number(saved.fallbackRadiusKm || 3);
      state.accesses = Array.isArray(saved.accesses) ? saved.accesses : [];
      document.getElementById("urban-fallback-checkbox").checked = state.fallbackEnabled;
      document.getElementById("urban-fallback-radius").value = String(state.fallbackRadiusKm);
      document.getElementById("urban-band-count").value = String(saved.bandCount || 5);
      document.getElementById("urban-max-distance").value = String(saved.maximumKm || 30);
      document.getElementById("urban-distance-mode").value = saved.distanceMode || "geometry";
      document.getElementById("urban-market-source").textContent =
        state.urbanSource + " · Recuperada localmente.";
    }
  } catch (error) {
    state.urbanGeometry = null;
    state.roadNetwork = null;
    document.getElementById("urban-road-status").textContent =
      "No se pudo recuperar la red vial guardada: " + error.message;
  }
  updateRoadModeAvailability();
  updateRoadStatus();
  bindEvents();
  window.VonThunenUrbanMarketRingsApp = Object.freeze({
    getState: function () { return state; },
    recalculate: recalculate,
    payload: payload,
    setRoadNetwork: setRoadNetwork
  });
}());
