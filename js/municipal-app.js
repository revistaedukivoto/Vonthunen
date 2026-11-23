(function () {
  "use strict";

  const geometryTools = window.VonThunenMunicipalGeometry;
  const algebra = window.VonThunenMapAlgebra;
  const territorialApp = window.VonThunenTerritorialApp;
  const ATTRIBUTE_SERVICE_ROOT =
    "https://geoportal.dane.gov.co/mparcgis/rest/services/MGN2025/Serv_CapasMGN_2025/MapServer/317";
  const GEOMETRY_SERVICE_ROOT =
    "https://geoportal.dane.gov.co/mparcgis/rest/services/MGN2025/Serv_CapasMGN_2025/FeatureServer/317";
  const ATTRIBUTE_FIELDS =
    "DPTO_CCDGO,DPTO_CNMBRE,MPIO_CDPMP,MPIO_CNMBRE,MPIO_TIPO,MPIO_NANO";
  const ACTIVITY_COLORS = ["#e58b50", "#6d9fc0", "#b79b55", "#73946d"];
  const ACTIVITY_NAMES = [
    "Horticultura", "Producción lechera", "Cultivos de cereales", "Ganadería extensiva"
  ];
  const NO_DATA_COLOR = "#e7ebe5";
  const canvas = document.getElementById("municipal-map");
  const context = canvas.getContext("2d", { alpha: false });
  const viewport = document.getElementById("municipal-map-viewport");
  const state = {
    municipalities: [],
    municipalityCache: new Map(),
    selectedMunicipality: null,
    projectedGeometry: null,
    grid: null,
    raster: null,
    market: null,
    marketGrid: null,
    economicActivities: null,
    economicZones: [],
    economicBoundaries: [],
    selectedCell: null,
    layer: "specialization",
    activity: 0,
    zoom: 1,
    transparency: 15,
    resolution: 0,
    source: "",
    loadedAt: "",
    executedAt: "",
    dragging: null,
    movedMap: false,
    loadToken: 0
  };

  const departmentSelect = document.getElementById("municipal-department");
  const citySelect = document.getElementById("municipal-city");
  const searchInput = document.getElementById("municipal-search");
  const layerSelect = document.getElementById("municipal-layer");
  const activitySelect = document.getElementById("municipal-activity");
  const resolutionSelect = document.getElementById("municipal-resolution");
  const zoomInput = document.getElementById("municipal-zoom");
  const transparencyInput = document.getElementById("municipal-transparency");
  const statusElement = document.getElementById("municipal-status");
  const retryButton = document.getElementById("municipal-retry");
  const workspace = document.getElementById("municipal-workspace");
  const cellPanel = document.getElementById("municipal-cell-panel");
  const resultsPanel = document.getElementById("municipal-results");

  function format(value, digits) {
    return new Intl.NumberFormat("es-CO", {
      maximumFractionDigits: digits === undefined ? 1 : digits
    }).format(value);
  }

  function setStatus(message, isError) {
    statusElement.textContent = message;
    statusElement.classList.toggle("is-error", Boolean(isError));
  }

  function buildQueryUrl(serviceRoot, parameters) {
    const query = new URLSearchParams(parameters);
    return serviceRoot + "/query?" + query.toString();
  }

  function fetchJsonp(url) {
    return new Promise(function (resolve, reject) {
      const callbackName = "__vonThunenDane_" + Date.now() +
        "_" + Math.floor(Math.random() * 1000000);
      const script = document.createElement("script");
      let settled = false;

      function finish(error, result) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        script.onerror = null;
        script.remove();
        delete window[callbackName];
        if (error) reject(error);
        else resolve(result);
      }

      const timeout = window.setTimeout(function () {
        finish(new Error("El servicio DANE no respondió mediante JSONP."));
      }, 12000);
      window[callbackName] = function (result) {
        finish(null, result);
      };
      script.async = true;
      script.onerror = function () {
        finish(new Error("No se pudo cargar la respuesta JSONP del servicio DANE."));
      };
      script.src = url + "&callback=" + encodeURIComponent(callbackName);
      document.head.appendChild(script);
    });
  }

  function validateServiceResult(result) {
    if (!result || typeof result !== "object") {
      throw new Error("El servicio cartográfico devolvió una respuesta inválida.");
    }
    if (result.error) {
      const details = result.error.details || [];
      throw new Error(result.error.message + (details.length ? " " + details.join(" ") : ""));
    }
    return result;
  }

  async function fetchJson(url) {
    let response;
    try {
      response = await fetch(url, { mode: "cors", credentials: "omit" });
    } catch (error) {
      try {
        return validateServiceResult(await fetchJsonp(url));
      } catch (jsonpError) {
        throw new Error(
          "No fue posible conectarse al servicio DANE: " + error.message +
          " (JSONP: " + jsonpError.message + ")"
        );
      }
    }
    if (!response.ok) {
      throw new Error("El servicio cartográfico respondió HTTP " + response.status + ".");
    }
    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw new Error("El servicio cartográfico no devolvió un JSON válido.");
    }
    return validateServiceResult(result);
  }

  function sortSpanish(a, b) {
    return String(a).localeCompare(String(b), "es", { sensitivity: "base" });
  }

  function normalizeText(value) {
    return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es");
  }

  function uniqueDepartments(municipalities) {
    const departments = new Map();
    municipalities.forEach(function (item) {
      departments.set(item.DPTO_CCDGO, item.DPTO_CNMBRE);
    });
    return Array.from(departments, function (entry) {
      return { code: entry[0], name: entry[1] };
    }).sort(function (a, b) { return sortSpanish(a.name, b.name); });
  }

  function fillSelect(select, items, placeholder, getValue, getLabel) {
    while (select.firstChild) select.removeChild(select.firstChild);
    const initial = document.createElement("option");
    initial.value = "";
    initial.textContent = placeholder;
    select.appendChild(initial);
    items.forEach(function (item) {
      const option = document.createElement("option");
      option.value = getValue(item);
      option.textContent = getLabel(item);
      select.appendChild(option);
    });
  }

  function renderCityOptions() {
    const departmentCode = departmentSelect.value;
    const needle = normalizeText(searchInput.value.trim());
    let matches = departmentCode || needle ? state.municipalities.filter(function (item) {
      if (departmentCode && item.DPTO_CCDGO !== departmentCode) return false;
      if (!needle) return true;
      return normalizeText(item.MPIO_CNMBRE).includes(needle) ||
        item.MPIO_CDPMP.includes(needle);
    }) : [];
    matches = matches.slice().sort(function (a, b) {
      return sortSpanish(a.MPIO_CNMBRE, b.MPIO_CNMBRE);
    });
    fillSelect(citySelect, matches, matches.length
      ? "Selecciona un municipio (" + matches.length + ")"
      : departmentCode || needle ? "Sin coincidencias" : "Selecciona un departamento o busca",
    function (item) { return item.MPIO_CDPMP; },
    function (item) {
      return item.MPIO_CNMBRE + " · " + item.MPIO_CDPMP + " · " + item.DPTO_CNMBRE;
    });
    citySelect.disabled = matches.length === 0;
  }

  async function queryMunicipalityList(serviceRoot) {
    const result = await fetchJson(buildQueryUrl(serviceRoot, {
      where: "OBJECTID > 0",
      outFields: ATTRIBUTE_FIELDS,
      returnGeometry: "false",
      f: "json"
    }));
    if (!Array.isArray(result.features)) {
      throw new Error("La respuesta del MGN no incluye la lista de municipios.");
    }
    const municipalities = result.features.map(function (feature) {
      return feature.attributes || {};
    }).filter(function (item) {
      return item.MPIO_TIPO === "MUNICIPIO" && item.MPIO_CDPMP &&
        item.MPIO_CNMBRE && item.DPTO_CCDGO;
    });
    if (!municipalities.length) {
      throw new Error("La consulta del MGN no devolvió municipios DIVIPOLA.");
    }
    return municipalities;
  }

  async function loadMunicipalityList() {
    setStatus("Consultando nombres y códigos DIVIPOLA del MGN DANE 2025…", false);
    retryButton.disabled = true;
    retryButton.hidden = true;
    try {
      let municipalities;
      let fallbackUsed = false;
      try {
        municipalities = await queryMunicipalityList(ATTRIBUTE_SERVICE_ROOT);
      } catch (primaryError) {
        try {
          municipalities = await queryMunicipalityList(GEOMETRY_SERVICE_ROOT);
          fallbackUsed = true;
        } catch (fallbackError) {
          throw new Error(
            "No fue posible consultar el MGN DANE. MapServer: " + primaryError.message +
            " FeatureServer: " + fallbackError.message
          );
        }
      }
      state.municipalities = municipalities;
      fillSelect(departmentSelect, uniqueDepartments(state.municipalities),
        "Selecciona un departamento", function (item) { return item.code; },
      function (item) { return item.name; });
      departmentSelect.disabled = false;
      renderCityOptions();
      setStatus(
        "Lista obtenida del MGN: " + format(state.municipalities.length, 0) +
        " municipios DIVIPOLA" +
        (fallbackUsed ? " (endpoint alterno FeatureServer)" : "") +
        ". La geometría se descarga solo al cargar un municipio.",
        false
      );
    } catch (error) {
      departmentSelect.disabled = true;
      citySelect.disabled = true;
      setStatus(error.message + " La carga manual de GeoJSON permanece disponible.", true);
      retryButton.hidden = false;
    } finally {
      retryButton.disabled = false;
    }
  }

  function queryMunicipality(code) {
    return fetchJson(buildQueryUrl(GEOMETRY_SERVICE_ROOT, {
      where: "MPIO_CDPMP = '" + String(code).replace(/'/g, "''") + "'",
      outFields: ATTRIBUTE_FIELDS,
      returnGeometry: "true",
      outSR: String(geometryTools.SOURCE_EPSG),
      f: "json"
    }));
  }

  function calculateResolution(projectedGeometry) {
    const areaResolution = Math.sqrt(projectedGeometry.areaM2 / 10000);
    const extent = projectedGeometry.extent;
    const width = extent.maxX - extent.minX;
    const height = extent.maxY - extent.minY;
    const cellLimitResolution = Math.sqrt(width * height / 200000);
    const axisLimitResolution = Math.max(width, height) / 2000;
    return Math.max(100,
      Math.ceil(Math.max(areaResolution, cellLimitResolution, axisLimitResolution)));
  }

  function buildRasterGrid(projectedGeometry, resolution) {
    state.grid = geometryTools.createGrid(projectedGeometry, resolution);
    state.resolution = resolution;
    state.raster = null;
    state.economicActivities = null;
    state.economicZones = [];
    state.economicBoundaries = [];
    state.selectedCell = null;
    cellPanel.hidden = true;
    state.marketGrid = state.market ? findMarketCell(state.market) : null;
    if (state.market) calculateMunicipalRaster();
    renderAll();
  }

  function findMarketCell(point) {
    const grid = state.grid;
    let column = Math.max(0, Math.min(grid.width - 1,
      Math.floor((point.x - grid.originX) / grid.resolutionMeters)));
    let row = Math.max(0, Math.min(grid.height - 1,
      Math.floor((point.y - grid.originY) / grid.resolutionMeters)));
    let index = row * grid.width + column;
    if (grid.validMask[index] === 1) return { x: column, y: row };

    let closest = -1;
    let closestDistance = Infinity;
    for (let cell = 0; cell < grid.count; cell += 1) {
      if (grid.validMask[cell] !== 1) continue;
      const dx = grid.cellCoordinates[cell * 2] - point.x;
      const dy = grid.cellCoordinates[cell * 2 + 1] - point.y;
      const distance = dx * dx + dy * dy;
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = cell;
      }
    }
    if (closest < 0) throw new RangeError("No hay celdas válidas para ubicar el mercado.");
    return { x: closest % grid.width, y: Math.floor(closest / grid.width) };
  }

  function classifyAtDistance(distanceKm, activities, accessibility) {
    let bestRent = 0;
    let winner = -1;
    activities.forEach(function (activity, index) {
      const slope = activity.t * 100 / accessibility;
      const rent = activity.A - slope * distanceKm;
      if (rent > bestRent) {
        bestRent = rent;
        winner = index;
      }
    });
    return winner;
  }

  function calculateEconomicZones(activities, accessibility, maxDistance) {
    const breakpoints = [0, maxDistance];
    activities.forEach(function (activity) {
      const slope = activity.t * 100 / accessibility;
      if (slope > 0) {
        const zero = activity.A / slope;
        if (zero > 0 && zero < maxDistance) breakpoints.push(zero);
      }
    });
    for (let first = 0; first < activities.length; first += 1) {
      for (let second = first + 1; second < activities.length; second += 1) {
        const firstSlope = activities[first].t * 100 / accessibility;
        const secondSlope = activities[second].t * 100 / accessibility;
        if (firstSlope === secondSlope) continue;
        const crossing = (activities[first].A - activities[second].A) /
          (firstSlope - secondSlope);
        if (crossing > 0 && crossing < maxDistance) breakpoints.push(crossing);
      }
    }
    breakpoints.sort(function (a, b) { return a - b; });
    const unique = breakpoints.filter(function (value, index) {
      return index === 0 || Math.abs(value - breakpoints[index - 1]) > 1e-6;
    });
    const zones = [];
    for (let index = 0; index < unique.length - 1; index += 1) {
      const start = unique[index];
      const end = unique[index + 1];
      const activity = classifyAtDistance((start + end) / 2, activities, accessibility);
      const previous = zones[zones.length - 1];
      if (previous && previous.activity === activity) previous.end = end;
      else zones.push({ start: start, end: end, activity: activity });
    }
    const boundaries = [];
    for (let index = 1; index < zones.length; index += 1) {
      if (zones[index - 1].activity !== zones[index].activity) {
        boundaries.push({ distanceKm: zones[index].start, activity: zones[index].activity });
      }
    }
    return { zones: zones, boundaries: boundaries };
  }

  function calculateMunicipalRaster() {
    if (!state.market || !state.grid) return;
    const original = territorialApp.getState();
    const sourceConfig = original.config;
    const activities = sourceConfig.activities.map(function (activity, index) {
      return {
        id: activity.id,
        name: activity.name || ACTIVITY_NAMES[index],
        A: activity.A,
        t: activity.t,
        color: ACTIVITY_COLORS[index]
      };
    });
    const marketCell = findMarketCell(state.market);
    const roadCatalog = window.VonThunenRoadCatalog;
    const roadNetwork = roadCatalog
      ? roadCatalog.projectToGrid(state.grid)
      : null;
    const raster = algebra.createRaster({
      width: state.grid.width,
      height: state.grid.height,
      activities: activities,
      marketX: marketCell.x,
      marketY: marketCell.y,
      marketPoint: state.market,
      cellCoordinates: state.grid.cellCoordinates,
      validMask: state.grid.validMask,
      cellKm: state.resolution / 1000,
      accessibility: sourceConfig.accessibility,
      road: null,
      roadNetwork: roadNetwork
    });
    let maxDistance = 0;
    for (let cell = 0; cell < raster.count; cell += 1) {
      if (raster.validMask[cell] === 1) {
        maxDistance = Math.max(maxDistance, raster.distance[cell]);
      }
    }
    const zones = calculateEconomicZones(activities, sourceConfig.accessibility, maxDistance);
    state.raster = raster;
    state.marketGrid = marketCell;
    state.economicActivities = activities;
    state.economicZones = zones.zones;
    state.economicBoundaries = zones.boundaries;
    state.executedAt = new Date().toISOString();
    renderAll();
  }

  function loadProjectedGeometry(properties, rawGeometry, source, requestedAt) {
    const normalized = geometryTools.normalizeGeometry(rawGeometry);
    const projected = geometryTools.projectGeometry(normalized);
    const cellResolution = resolutionSelect.value === "auto"
      ? calculateResolution(projected)
      : Number(resolutionSelect.value);
    const grid = geometryTools.createGrid(projected, cellResolution);
    state.selectedMunicipality = properties;
    state.projectedGeometry = projected;
    state.source = source;
    state.loadedAt = requestedAt || new Date().toISOString();
    state.executedAt = "";
    state.market = null;
    state.marketGrid = null;
    state.grid = grid;
    state.resolution = cellResolution;
    state.raster = null;
    state.economicActivities = null;
    state.economicZones = [];
    state.economicBoundaries = [];
    state.selectedCell = null;
    state.zoom = 1;
    zoomInput.value = "1";
    workspace.hidden = false;
    cellPanel.hidden = true;
    resultsPanel.hidden = true;
    document.getElementById("municipal-clear").disabled = false;
    document.getElementById("municipal-map-hint").textContent =
      "Geometría cargada. Elige “Marcar mercado en el mapa” y selecciona una ubicación interior.";
    document.getElementById("municipal-market-status").textContent =
      "Sin mercado central. No se asigna automáticamente un centroide.";
    document.getElementById("municipal-change-market").disabled = true;
    renderAll();
    setStatus(
      "Geometría válida: " + properties.MPIO_CNMBRE + " · " +
      properties.MPIO_CDPMP + ". " + format(grid.validCount, 0) +
      " celdas interiores a " + format(cellResolution, 0) + " m. Define un mercado para ejecutar el modelo.",
      false
    );
    window.dispatchEvent(new CustomEvent("municipality:loaded", {
      detail: {
        municipality: properties,
        projectedGeometry: projected,
        grid: grid
      }
    }));
  }

  async function loadMunicipality(code) {
    const token = ++state.loadToken;
    const metadata = state.municipalities.find(function (item) {
      return item.MPIO_CDPMP === code;
    });
    if (!metadata) {
      setStatus("Selecciona un municipio DIVIPOLA válido de la lista del MGN.", true);
      return;
    }
    resetMapState();
    setStatus("Descargando geometría MGN de " + metadata.MPIO_CNMBRE + "…", false);
    document.getElementById("municipal-load").disabled = true;
    try {
      let feature = state.municipalityCache.get(code);
      if (!feature) {
        const result = await queryMunicipality(code);
        feature = result.features && result.features[0];
        if (!feature || !feature.geometry) {
          throw new Error("El MGN no devolvió una geometría para " + metadata.MPIO_CNMBRE + ".");
        }
        state.municipalityCache.set(code, feature);
      }
      if (token !== state.loadToken) return;
      loadProjectedGeometry(
        feature.attributes || metadata,
        feature.geometry,
        "DANE · MGN 2025 · capa Municipio (ID 317)",
        new Date().toISOString()
      );
    } catch (error) {
      if (token === state.loadToken) {
        setStatus(error.message + " Puedes cargar el límite como GeoJSON.", true);
      }
    } finally {
      if (token === state.loadToken) document.getElementById("municipal-load").disabled = false;
    }
  }

  async function loadGeoJsonFile(file) {
    if (!file) return;
    setStatus("Leyendo geometría GeoJSON…", false);
    try {
      const contents = await file.text();
      const geojson = JSON.parse(contents);
      const feature = geojson.type === "Feature" ? geojson :
        geojson.type === "FeatureCollection" && geojson.features.length === 1
          ? geojson.features[0] : null;
      const properties = feature && feature.properties ? feature.properties : {};
      const name = properties.MPIO_CNMBRE || properties.municipio ||
        properties.name || file.name.replace(/\.(geojson|json)$/i, "");
      const code = properties.MPIO_CDPMP || properties.DIVIPOLA || "Archivo local";
      const department = properties.DPTO_CNMBRE || properties.departamento || "No informado";
      loadProjectedGeometry({
        MPIO_CNMBRE: String(name),
        MPIO_CDPMP: String(code),
        DPTO_CNMBRE: String(department),
        MPIO_NANO: properties.MPIO_NANO || "No informado",
        MPIO_TIPO: properties.MPIO_TIPO || "GeoJSON del usuario"
      }, geojson, "Archivo GeoJSON aportado por el usuario: " + file.name,
      new Date().toISOString());
      document.getElementById("municipal-clear").disabled = false;
    } catch (error) {
      setStatus("No se pudo cargar el GeoJSON: " + error.message, true);
    } finally {
      document.getElementById("municipal-file").value = "";
    }
  }

  function placeMarket(point, sourceLabel) {
    if (!state.projectedGeometry ||
        !geometryTools.pointInGeometry(point, state.projectedGeometry)) {
      document.getElementById("municipal-market-status").textContent =
        "Punto fuera del límite municipal. Elige una ubicación dentro del polígono.";
      setStatus("El mercado central debe estar dentro de la geometría municipal.", true);
      return false;
    }
    state.market = point;
    state.marketGrid = findMarketCell(point);
    document.getElementById("municipal-change-market").disabled = false;
    document.getElementById("municipal-market-status").textContent =
      sourceLabel + " · E " + format(point.x, 1) + " m · N " + format(point.y, 1) + " m.";
    const lonLat = geometryTools.unproject(point.x, point.y);
    document.getElementById("municipal-latitude").value = lonLat.latitude.toFixed(6);
    document.getElementById("municipal-longitude").value = lonLat.longitude.toFixed(6);
    document.getElementById("municipal-map-hint").textContent =
      "Mercado definido. Selecciona una celda válida para consultar distancia, costos y rentas.";
    calculateMunicipalRaster();
    setStatus(
      "Modelo municipal calculado para " + format(state.grid.validCount, 0) +
      " celdas interiores.",
      false
    );
    return true;
  }

  function canvasPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    const px = (event.clientX - bounds.left) / bounds.width * canvas.width;
    const py = (event.clientY - bounds.top) / bounds.height * canvas.height;
    return {
      x: state.grid.originX + px * state.resolution,
      y: state.grid.originY + (canvas.height - py) * state.resolution,
      column: Math.floor(px),
      row: canvas.height - 1 - Math.floor(py)
    };
  }

  function handleMapClick(event) {
    if (state.movedMap) {
      state.movedMap = false;
      return;
    }
    if (!state.grid || !state.projectedGeometry) return;
    const point = canvasPoint(event);
    if (document.querySelector('input[name="municipal-market-mode"]:checked').value === "click" &&
        !state.market) {
      placeMarket({ x: point.x, y: point.y }, "Mercado marcado en el mapa");
      return;
    }
    const index = point.row * state.grid.width + point.column;
    if (point.column < 0 || point.column >= state.grid.width ||
        point.row < 0 || point.row >= state.grid.height ||
        state.grid.validMask[index] !== 1) {
      document.getElementById("municipal-cell-title").textContent = "Celda fuera del municipio";
      document.getElementById("municipal-cell-winner").textContent = "NODATA";
      document.getElementById("municipal-cell-metrics").textContent =
        "La celda exterior no participa en los cálculos ni en las estadísticas.";
      cellPanel.hidden = false;
      state.selectedCell = null;
      drawMap();
      return;
    }
    state.selectedCell = { x: point.column, y: point.row };
    renderCell();
    drawMap();
  }

  function bindPan() {
    canvas.addEventListener("pointerdown", function (event) {
      if (event.button !== 0 || !viewport) return;
      canvas.setPointerCapture(event.pointerId);
      state.dragging = {
        clientX: event.clientX,
        clientY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        moved: false
      };
    });
    canvas.addEventListener("pointermove", function (event) {
      if (!state.dragging) return;
      const dx = event.clientX - state.dragging.clientX;
      const dy = event.clientY - state.dragging.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 4) state.dragging.moved = true;
      if (state.dragging.moved) {
        viewport.scrollLeft = state.dragging.scrollLeft - dx;
        viewport.scrollTop = state.dragging.scrollTop - dy;
      }
    });
    canvas.addEventListener("pointerup", function () {
      if (state.dragging) {
        state.movedMap = state.dragging.moved;
        state.dragging = null;
      }
    });
    canvas.addEventListener("pointercancel", function () { state.dragging = null; });
  }

  function parseColor(color) {
    return [
      parseInt(color.slice(1, 3), 16),
      parseInt(color.slice(3, 5), 16),
      parseInt(color.slice(5, 7), 16)
    ];
  }

  function mixColor(start, end, amount) {
    const first = parseColor(start);
    const last = parseColor(end);
    const ratio = Math.max(0, Math.min(1, amount));
    return first.map(function (value, index) {
      return Math.round(value + (last[index] - value) * ratio);
    });
  }

  function applyOpacity(color, opacity) {
    const background = [245, 244, 239];
    return color.map(function (value, index) {
      return Math.round(background[index] + (value - background[index]) * opacity);
    });
  }

  function cellColor(index, range) {
    if (state.layer === "specialization") {
      const activity = state.raster.specialization[index];
      return parseColor(activity < 0 ? NO_DATA_COLOR : ACTIVITY_COLORS[activity]);
    }
    if (state.layer === "economic-rings") {
      const distance = state.raster.distance[index];
      const zone = state.economicZones.find(function (item, zoneIndex) {
        return distance >= item.start &&
          (distance < item.end || zoneIndex === state.economicZones.length - 1);
      });
      return !zone || zone.activity < 0
        ? parseColor(NO_DATA_COLOR) : parseColor(ACTIVITY_COLORS[zone.activity]);
    }
    if (state.layer === "distance-rings") {
      const step = 10;
      const band = Math.floor(state.raster.distance[index] / step);
      const colors = ["#d9e8d1", "#a9c5aa", "#76a187", "#4d7b6d", "#315c56"];
      return parseColor(colors[band % colors.length]);
    }
    if (state.layer === "aptitude" || state.layer === "value" || state.layer === "regulation") {
      return parseColor("#d8d8d3");
    }
    let value;
    if (state.layer === "distance") value = state.raster.distance[index];
    else if (state.layer === "transport") value = state.raster.transportCosts[state.activity][index];
    else value = state.raster.rentSurfaces[state.activity][index];
    if (!Number.isFinite(value)) return parseColor(NO_DATA_COLOR);
    if (state.layer === "rent") {
      const normalized = value >= 0
        ? range.max > 0 ? Math.min(value / range.max, 1) : 0
        : range.min < 0 ? Math.min(value / range.min, 1) : 0;
      return value >= 0
        ? mixColor("#f1f5ee", "#276749", normalized)
        : mixColor("#f5eeee", "#c45a55", normalized);
    }
    return mixColor(state.layer === "distance" ? "#f5f2d9" : "#e7f1f5",
      state.layer === "distance" ? "#477b59" : "#286887",
      range.max > range.min ? (value - range.min) / (range.max - range.min) : 0);
  }

  function getColorRange() {
    if (!state.raster) return { min: 0, max: 1 };
    const values = state.layer === "distance" ? state.raster.distance :
      state.layer === "transport" ? state.raster.transportCosts[state.activity] :
        state.layer === "rent" ? state.raster.rentSurfaces[state.activity] : null;
    if (!values) return { min: 0, max: 1 };
    let min = Infinity;
    let max = -Infinity;
    for (let cell = 0; cell < values.length; cell += 1) {
      if (state.grid.validMask[cell] !== 1 || !Number.isFinite(values[cell])) continue;
      min = Math.min(min, values[cell]);
      max = Math.max(max, values[cell]);
    }
    return { min: min, max: max };
  }

  function drawGeometryPath() {
    const grid = state.grid;
    context.beginPath();
    state.projectedGeometry.polygons.forEach(function (polygon) {
      polygon.forEach(function (ring) {
        ring.forEach(function (point, index) {
          const x = (point.x - grid.originX) / grid.resolutionMeters;
          const y = canvas.height - (point.y - grid.originY) / grid.resolutionMeters;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
      });
    });
  }

  function drawMarketAndRings() {
    if (!state.market) return;
    const grid = state.grid;
    const x = (state.market.x - grid.originX) / grid.resolutionMeters;
    const y = canvas.height - (state.market.y - grid.originY) / grid.resolutionMeters;
    const drawEconomic = state.layer === "economic-rings" ||
      state.layer === "specialization";
    const drawDistance = state.layer === "distance-rings";
    if (drawEconomic || drawDistance) {
      context.save();
      drawGeometryPath();
      context.clip("evenodd");
      context.strokeStyle = drawEconomic ? "rgba(35, 54, 43, .85)" : "rgba(28, 73, 83, .72)";
      context.lineWidth = Math.max(0.7, canvas.width / 900);
      context.setLineDash(drawEconomic ? [] : [2, 2]);
      const boundaries = drawEconomic
        ? state.economicBoundaries.map(function (item) { return item.distanceKm; })
        : distanceRingBoundaries();
      boundaries.forEach(function (radiusKm) {
        const radius = radiusKm * 1000 / grid.resolutionMeters;
        if (radius > 0) {
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.stroke();
        }
      });
      context.restore();
    }
    context.save();
    context.fillStyle = "#fff";
    context.strokeStyle = "#173b2c";
    context.lineWidth = Math.max(1, canvas.width / 500);
    context.beginPath();
    context.arc(x, y, Math.max(2.5, canvas.width / 160), 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }

  function distanceRingBoundaries() {
    let maximum = 0;
    for (let cell = 0; cell < state.raster.count; cell += 1) {
      if (state.grid.validMask[cell] === 1) {
        maximum = Math.max(maximum, state.raster.distance[cell]);
      }
    }
    const rings = [];
    for (let km = 10; km < maximum; km += 10) rings.push(km);
    return rings;
  }

  function drawMap() {
    if (!state.grid || !state.projectedGeometry) return;
    const grid = state.grid;
    canvas.width = grid.width;
    canvas.height = grid.height;
    context.fillStyle = "#f5f4ef";
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawGeometryPath();
    context.fillStyle = "#f4f3ec";
    context.fill("evenodd");

    if (state.raster) {
      const image = context.createImageData(grid.width, grid.height);
      const range = getColorRange();
      const unavailable = ["aptitude", "value", "regulation"].indexOf(state.layer) >= 0;
      const outside = parseColor("#f5f4ef");
      for (let row = 0; row < grid.height; row += 1) {
        const targetRow = grid.height - 1 - row;
        for (let column = 0; column < grid.width; column += 1) {
          const index = row * grid.width + column;
          const color = grid.validMask[index] !== 1
            ? outside : applyOpacity(
              unavailable ? [216, 216, 211] : cellColor(index, range),
              1 - state.transparency / 100
            );
          const offset = (targetRow * grid.width + column) * 4;
          image.data[offset] = color[0];
          image.data[offset + 1] = color[1];
          image.data[offset + 2] = color[2];
          image.data[offset + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
    }

    drawGeometryPath();
    context.strokeStyle = "#294838";
    context.lineWidth = Math.max(0.7, canvas.width / 900);
    context.stroke();
    if (state.selectedCell) {
      context.strokeStyle = "#ffffff";
      context.lineWidth = Math.max(1, canvas.width / 700);
      context.strokeRect(state.selectedCell.x, grid.height - 1 - state.selectedCell.y, 1, 1);
    }
    const roadCatalog = window.VonThunenRoadCatalog;
    if (roadCatalog && typeof roadCatalog.draw === "function") {
      roadCatalog.draw(context, grid, canvas.height);
    }
    drawMarketAndRings();
    resizeCanvasDisplay();
    renderLegend();
  }

  function resizeCanvasDisplay() {
    if (!state.grid) return;
    const fitScale = Math.max(1, (viewport.clientWidth - 8) / canvas.width);
    const pixelScale = Math.max(1, fitScale) * state.zoom;
    canvas.style.width = Math.round(canvas.width * pixelScale) + "px";
    canvas.style.height = Math.round(canvas.height * pixelScale) + "px";
  }

  function renderLegend() {
    const legend = document.getElementById("municipal-legend");
    while (legend.firstChild) legend.removeChild(legend.firstChild);
    if (state.layer === "specialization" || state.layer === "economic-rings") {
      ACTIVITY_NAMES.forEach(function (name, index) {
        addLegendItem(legend, ACTIVITY_COLORS[index], name);
      });
      if (state.layer === "economic-rings") {
        state.economicBoundaries.forEach(function (item) {
          const next = item.activity < 0 ? "Sin renta viable" : ACTIVITY_NAMES[item.activity];
          addLegendItem(legend, "#294838", format(item.distanceKm) + " km · " + next);
        });
      }
      addLegendItem(legend, NO_DATA_COLOR, "Sin renta positiva / NODATA exterior");
      return;
    }
    if (state.layer === "distance-rings") {
      addLegendItem(legend, "#477b59", "Anillos cada 10 km · recortados por máscara raster");
      return;
    }
    if (["aptitude", "value", "regulation"].indexOf(state.layer) >= 0) {
      addLegendItem(legend, "#d8d8d3", "Sin capa georreferenciada cargada");
      return;
    }
    const range = getColorRange();
    const gradient = document.createElement("div");
    gradient.className = "raster-gradient " +
      (state.layer === "distance" ? "gradient-distance" :
        state.layer === "transport" ? "gradient-transport" : "gradient-rent");
    legend.appendChild(gradient);
    const labels = document.createElement("div");
    labels.className = "raster-gradient-labels";
    const low = document.createElement("span");
    const high = document.createElement("span");
    const unit = state.layer === "distance" ? " km" : " $/ha";
    low.textContent = format(range.min) + unit;
    high.textContent = format(range.max) + unit;
    labels.appendChild(low);
    labels.appendChild(high);
    legend.appendChild(labels);
  }

  function addLegendItem(parent, color, label) {
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

  function appendMetadata(parent, label, value) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    parent.appendChild(term);
    parent.appendChild(description);
  }

  function renderMetadata() {
    const target = document.getElementById("municipal-metadata");
    while (target.firstChild) target.removeChild(target.firstChild);
    if (!state.selectedMunicipality || !state.projectedGeometry || !state.grid) return;
    const municipality = state.selectedMunicipality;
    appendMetadata(target, "Municipio", municipality.MPIO_CNMBRE || "No informado");
    appendMetadata(target, "DIVIPOLA", municipality.MPIO_CDPMP || "No informado");
    appendMetadata(target, "Departamento", municipality.DPTO_CNMBRE || "No informado");
    appendMetadata(target, "Fuente y versión", state.source);
    appendMetadata(target, "Año del atributo MGN", String(municipality.MPIO_NANO || "No informado"));
    appendMetadata(target, "Fecha de consulta/carga",
      new Date(state.loadedAt).toLocaleString("es-CO"));
    appendMetadata(target, "CRS fuente → análisis",
      (state.source.indexOf("DANE") >= 0 ? "EPSG:4686" : "GeoJSON") + " → EPSG:9377");
    appendMetadata(target, "Resolución raster", format(state.resolution, 0) + " m");
    appendMetadata(target, "Dimensiones", state.grid.width + " × " + state.grid.height);
    appendMetadata(target, "Celdas válidas",
      format(state.grid.validCount, 0) + " de " + format(state.grid.count, 0));
    appendMetadata(target, "Área calculada",
      format(state.projectedGeometry.areaM2 / 1000000, 2) + " km²");
    appendMetadata(target, "Perímetro calculado",
      format(state.projectedGeometry.perimeterM / 1000, 2) + " km");
    appendMetadata(target, "Capas usadas", state.raster
      ? "Geometría MGN + modelo económico Von Thünen"
      : "Geometría municipal; falta definir mercado");
    if (state.raster) {
      appendMetadata(target, "Parámetros", state.economicActivities.map(function (activity) {
        return activity.name + ": A=" + format(activity.A, 0) +
          ", t=" + format(activity.t, 2);
      }).join("; "));
      appendMetadata(target, "Ejecución", new Date(state.executedAt).toLocaleString("es-CO"));
    }
  }

  function renderCell() {
    if (!state.grid || !state.selectedCell || !state.raster) return;
    const x = state.selectedCell.x;
    const y = state.selectedCell.y;
    const index = y * state.grid.width + x;
    const projectedX = state.grid.cellCoordinates[index * 2];
    const projectedY = state.grid.cellCoordinates[index * 2 + 1];
    const lonLat = geometryTools.unproject(projectedX, projectedY);
    const winnerIndex = state.raster.specialization[index];
    const winner = winnerIndex < 0 ? "Sin actividad viable" : ACTIVITY_NAMES[winnerIndex];
    document.getElementById("municipal-cell-title").textContent =
      "Celda (columna " + x + ", fila " + y + ")";
    document.getElementById("municipal-cell-winner").textContent = winner;
    const metrics = document.getElementById("municipal-cell-metrics");
    while (metrics.firstChild) metrics.removeChild(metrics.firstChild);
    const rows = [
      ["Coordenadas proyectadas", "E " + format(projectedX, 1) + " m · N " + format(projectedY, 1) + " m"],
      ["Coordenadas geográficas", lonLat.latitude.toFixed(6) + "°, " + lonLat.longitude.toFixed(6) + "°"],
      ["Distancia al mercado", format(state.raster.distance[index], 3) + " km"],
      ["Área de celda", format(state.resolution * state.resolution / 1000000, 4) + " km²"],
      ["MAT", "Sin capa raster georreferenciada; no calculado"],
      ["MVES", "No disponible sin insumos locales y aptitud georreferenciada"],
      ["POT / norma", "No cargado; análisis jurídico-territorial incompleto"]
    ];
    state.economicActivities.forEach(function (activity, activityIndex) {
      rows.push(["Costo de transporte · " + activity.name,
        format(state.raster.transportCosts[activityIndex][index], 2) + " $/ha"]);
      rows.push(["Renta Von Thünen · " + activity.name,
        format(state.raster.rentSurfaces[activityIndex][index], 2) + " $/ha"]);
    });
    rows.forEach(function (item) {
      const metric = document.createElement("div");
      metric.className = "cell-metric";
      const label = document.createElement("span");
      label.textContent = item[0];
      const value = document.createElement("b");
      value.textContent = item[1];
      metric.appendChild(label);
      metric.appendChild(value);
      metrics.appendChild(metric);
    });
    cellPanel.hidden = false;
  }

  function renderResults() {
    if (!state.raster || !state.grid) {
      resultsPanel.hidden = true;
      return;
    }
    resultsPanel.hidden = false;
    const counts = new Int32Array(ACTIVITY_NAMES.length + 1);
    const distanceSums = new Float64Array(ACTIVITY_NAMES.length);
    for (let cell = 0; cell < state.raster.count; cell += 1) {
      if (state.grid.validMask[cell] !== 1) continue;
      const winner = state.raster.specialization[cell];
      counts[winner < 0 ? ACTIVITY_NAMES.length : winner] += 1;
      if (winner >= 0) distanceSums[winner] += state.raster.distance[cell];
    }
    while (resultsPanel.firstChild) resultsPanel.removeChild(resultsPanel.firstChild);
    const summary = document.createElement("div");
    summary.className = "municipal-results-grid";
    const summaryValues = [
      ["Celdas interiores", format(state.grid.validCount, 0)],
      ["Área raster válida", format(state.grid.validCount *
        state.resolution * state.resolution / 1000000, 2) + " km²"],
      ["Área geométrica", format(state.projectedGeometry.areaM2 / 1000000, 2) + " km²"],
      ["Extensión del raster", state.grid.width + " × " + state.grid.height + " celdas"]
    ];
    summaryValues.forEach(function (item) {
      const card = document.createElement("div");
      card.className = "municipal-result-card";
      const label = document.createElement("span");
      label.textContent = item[0];
      const value = document.createElement("b");
      value.textContent = item[1];
      card.appendChild(label);
      card.appendChild(value);
      summary.appendChild(card);
    });
    resultsPanel.appendChild(summary);
    const table = document.createElement("table");
    table.className = "municipal-results-table";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["ACTIVIDAD", "CELDAS DOMINANTES", "ÁREA RASTER", "DISTANCIA MEDIA"].forEach(function (label) {
      const cell = document.createElement("th");
      cell.textContent = label;
      headRow.appendChild(cell);
    });
    head.appendChild(headRow);
    table.appendChild(head);
    const body = document.createElement("tbody");
    ACTIVITY_NAMES.forEach(function (name, index) {
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      const swatch = document.createElement("i");
      swatch.style.backgroundColor = ACTIVITY_COLORS[index];
      nameCell.appendChild(swatch);
      nameCell.appendChild(document.createTextNode(name));
      const countCell = document.createElement("td");
      countCell.textContent = format(counts[index], 0);
      const areaCell = document.createElement("td");
      areaCell.textContent = format(counts[index] *
        state.resolution * state.resolution / 1000000, 2) + " km²";
      const distanceCell = document.createElement("td");
      distanceCell.textContent = counts[index]
        ? format(distanceSums[index] / counts[index], 2) + " km"
        : "—";
      [nameCell, countCell, areaCell, distanceCell].forEach(function (cell) {
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
    table.appendChild(body);
    resultsPanel.appendChild(table);
    if (state.economicZones.length) {
      const zones = document.createElement("p");
      zones.className = "municipal-zones-note";
      zones.textContent = "Envolvente superior por distancia: " +
        state.economicZones.map(function (zone) {
          return format(zone.start, 2) + "–" + format(zone.end, 2) + " km: " +
            (zone.activity < 0 ? "sin renta viable" : ACTIVITY_NAMES[zone.activity]);
        }).join(" · ") +
        ". Los anillos teóricos son distintos de las celdas dominantes en el municipio irregular.";
      resultsPanel.appendChild(zones);
    }
  }

  function renderAll() {
    if (!state.grid || !state.projectedGeometry) return;
    drawMap();
    renderMetadata();
    renderResults();
    if (state.selectedCell && state.raster) renderCell();
  }

  function clearMunicipality() {
    state.loadToken += 1;
    resetMapState();
    document.getElementById("municipal-clear").disabled = true;
    document.getElementById("municipal-market-status").textContent =
      "Aún no se ha definido un mercado.";
    setStatus("Escenario municipal cerrado. El simulador general mantiene su propio territorio didáctico.", false);
    window.dispatchEvent(new CustomEvent("municipality:cleared"));
  }

  function resetMapState() {
    state.selectedMunicipality = null;
    state.projectedGeometry = null;
    state.grid = null;
    state.raster = null;
    state.market = null;
    state.marketGrid = null;
    state.selectedCell = null;
    state.economicZones = [];
    state.economicBoundaries = [];
    state.market = null;
    state.marketGrid = null;
    state.economicActivities = null;
    state.resolution = 0;
    state.source = "";
    state.loadedAt = "";
    state.executedAt = "";
    workspace.hidden = true;
    cellPanel.hidden = true;
    resultsPanel.hidden = true;
    document.getElementById("municipal-change-market").disabled = true;
  }

  retryButton.addEventListener("click", loadMunicipalityList);
  departmentSelect.addEventListener("change", renderCityOptions);
  searchInput.addEventListener("input", function () {
    const query = normalizeText(searchInput.value.trim());
    if (query && state.municipalities.length) {
      const exact = state.municipalities.find(function (item) {
        return item.MPIO_CDPMP === query ||
          normalizeText(item.MPIO_CNMBRE) === query;
      });
      if (exact) departmentSelect.value = exact.DPTO_CCDGO;
      else if (!departmentSelect.value) {
        const matches = state.municipalities.filter(function (item) {
          return normalizeText(item.MPIO_CNMBRE).includes(query) ||
            item.MPIO_CDPMP.indexOf(query) >= 0;
        });
        if (matches.length && matches.every(function (item) {
          return item.DPTO_CCDGO === matches[0].DPTO_CCDGO;
        })) departmentSelect.value = matches[0].DPTO_CCDGO;
      }
    }
    renderCityOptions();
  });
  citySelect.addEventListener("change", function () {
    document.getElementById("municipal-load").disabled = !citySelect.value;
  });
  document.getElementById("municipal-load").addEventListener("click", function () {
    if (citySelect.value) loadMunicipality(citySelect.value);
  });
  document.getElementById("municipal-file").addEventListener("change", function (event) {
    loadGeoJsonFile(event.target.files && event.target.files[0]);
  });
  document.getElementById("municipal-clear").addEventListener("click", clearMunicipality);
  resolutionSelect.addEventListener("change", function () {
    if (!state.projectedGeometry) return;
    try {
      const resolution = resolutionSelect.value === "auto"
        ? calculateResolution(state.projectedGeometry)
        : Number(resolutionSelect.value);
      buildRasterGrid(state.projectedGeometry, resolution);
    } catch (error) {
      setStatus(error.message, true);
      const fallback = state.resolution === calculateResolution(state.projectedGeometry)
        ? "auto" : String(state.resolution);
      resolutionSelect.value = fallback;
    }
  });
  layerSelect.addEventListener("change", function () {
    state.layer = layerSelect.value;
    drawMap();
  });
  activitySelect.addEventListener("change", function () {
    state.activity = Number(activitySelect.value);
    if (state.market) calculateMunicipalRaster();
  });
  zoomInput.addEventListener("input", function () {
    state.zoom = Number(zoomInput.value);
    resizeCanvasDisplay();
  });
  transparencyInput.addEventListener("input", function () {
    state.transparency = Number(transparencyInput.value);
    document.getElementById("municipal-transparency-value").textContent =
      state.transparency + " %";
    drawMap();
  });
  document.getElementById("municipal-coordinate-market").addEventListener("click", function () {
    if (!state.projectedGeometry) return;
    const latitudeInput = document.getElementById("municipal-latitude");
    const longitudeInput = document.getElementById("municipal-longitude");
    if (!latitudeInput.value.trim() || !longitudeInput.value.trim()) {
      setStatus("Ingresa latitud y longitud geográficas válidas.", true);
      return;
    }
    const latitude = Number(latitudeInput.value);
    const longitude = Number(longitudeInput.value);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setStatus("Ingresa latitud y longitud geográficas válidas.", true);
      return;
    }
    try {
      placeMarket(geometryTools.projectLonLat(longitude, latitude),
        "Mercado definido por coordenadas");
    } catch (error) {
      setStatus(error.message, true);
    }
  });
  document.getElementById("municipal-change-market").addEventListener("click", function () {
    state.market = null;
    state.marketGrid = null;
    state.raster = null;
    state.economicZones = [];
    state.economicBoundaries = [];
    state.selectedCell = null;
    this.disabled = true;
    cellPanel.hidden = true;
    resultsPanel.hidden = true;
    document.getElementById("municipal-market-status").textContent =
      "Selecciona la nueva ubicación del mercado en el mapa o mediante coordenadas.";
    document.getElementById("municipal-map-hint").textContent =
      "Haz clic dentro del polígono municipal para marcar el nuevo mercado.";
    drawMap();
  });
  canvas.addEventListener("click", handleMapClick);
  bindPan();
  window.addEventListener("resize", resizeCanvasDisplay);
  window.addEventListener("territory:render", function () {
    if (state.market && state.grid) calculateMunicipalRaster();
  });

  loadMunicipalityList();

  window.VonThunenMunicipalApp = Object.freeze({
    getState: function () { return state; },
    loadMunicipality: loadMunicipality,
    loadGeoJsonFile: loadGeoJsonFile,
    placeMarket: placeMarket,
    clear: clearMunicipality,
    calculateEconomicZones: calculateEconomicZones
  });
}());
