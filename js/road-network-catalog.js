(function () {
  "use strict";

  const CACHE_KEY = "von-thunen-road-network-catalog-v11";
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_WAYS = 4000;
  const INFLUENCE_METERS = 5000;
  const ENDPOINTS = [
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter"
  ];
  const state = {
    geoJson: null,
    municipality: null,
    projectedGeometry: null,
    sourceStatus: "Sin consultar",
    loadedAt: null,
    fetchedAt: null,
    coverage: "No disponible",
    segments: 0,
    nodes: 0,
    lengthMeters: 0,
    cacheEntry: null,
    show: true,
    inProgress: false
  };

  function readCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    } catch (error) {
      return {};
    }
  }

  function writeCache(code, entry) {
    const cache = readCache();
    cache[code] = entry;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      return true;
    } catch (error) {
      return false;
    }
  }

  function getBounds(projectedGeometry, extraMeters) {
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    projectedGeometry.polygons.forEach(function (polygon) {
      polygon.forEach(function (ring) {
        ring.forEach(function (point) {
          west = Math.min(west, point.x);
          east = Math.max(east, point.x);
          south = Math.min(south, point.y);
          north = Math.max(north, point.y);
        });
      });
    });
    west -= extraMeters;
    east += extraMeters;
    south -= extraMeters;
    north += extraMeters;
    if (!Number.isFinite(west) || !Number.isFinite(south) ||
        !Number.isFinite(east) || !Number.isFinite(north)) {
      throw new RangeError("No fue posible calcular el área de influencia vial.");
    }
    return { west: west, east: east, south: south, north: north };
  }

  function projectedToLonLatBounds(projectedGeometry) {
    const bounds = getBounds(projectedGeometry, INFLUENCE_METERS);
    const tools = window.VonThunenMunicipalGeometry;
    const southwest = tools.unproject(bounds.west, bounds.south);
    const northeast = tools.unproject(bounds.east, bounds.north);
    return {
      south: southwest.latitude,
      west: southwest.longitude,
      north: northeast.latitude,
      east: northeast.longitude
    };
  }

  function classifyRoad(tags) {
    const highway = String(tags.highway || "").toLowerCase();
    if (highway === "motorway" || highway === "motorway_link") {
      return { category: "nacional", surface: tags.surface || "no informado", speed: 80 };
    }
    if (highway === "trunk" || highway === "trunk_link") {
      return { category: "nacional", surface: tags.surface || "no informado", speed: 70 };
    }
    if (highway === "primary" || highway === "primary_link") {
      return { category: "departamental", surface: tags.surface || "no informado", speed: 55 };
    }
    if (highway === "secondary" || highway === "secondary_link") {
      return { category: "departamental", surface: tags.surface || "no informado", speed: 45 };
    }
    if (highway === "tertiary" || highway === "tertiary_link") {
      return { category: "municipal", surface: tags.surface || "no informado", speed: 35 };
    }
    if (highway === "unclassified" || highway === "residential") {
      return { category: "municipal", surface: tags.surface || "no informado", speed: 25 };
    }
    if (highway === "track" || highway === "path") {
      return { category: "terciaria", surface: tags.surface || "no informado", speed: 15 };
    }
    if (highway === "service") {
      return { category: "urbana", surface: tags.surface || "no informado", speed: 20 };
    }
    return { category: "otra", surface: tags.surface || "no informado", speed: 20 };
  }

  function parseOverpass(overpass, municipality) {
    if (!overpass || !Array.isArray(overpass.elements)) {
      throw new Error("Overpass no devolvió elementos viales.");
    }
    const tools = window.VonThunenMunicipalGeometry;
    const roads = [];
    const nodeUse = new Map();
    const highwayValues = new Set([
      "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
      "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified",
      "residential", "living_street", "service", "track", "road", "path"
    ]);
    const selected = overpass.elements.filter(function (element) {
      const highway = element.tags && element.tags.highway;
      return element.type === "way" && highwayValues.has(String(highway).toLowerCase());
    }).slice(0, MAX_WAYS);

    selected.forEach(function (element) {
      if (!Array.isArray(element.geometry) || element.geometry.length < 2) return;
      const tags = element.tags || {};
      const classification = classifyRoad(tags);
      const coordinates = element.geometry.map(function (point) {
        const projected = tools.projectLonLat(Number(point.lon), Number(point.lat));
        return [projected.x, projected.y];
      });
      const sourceNodeIds = element.nodes || [];
      for (let index = 0; index < sourceNodeIds.length; index += 1) {
        const nodeId = String(sourceNodeIds[index]);
        if (!nodeUse.has(nodeId)) nodeUse.set(nodeId, new Set());
        nodeUse.get(nodeId).add("road-" + element.id);
      }
      roads.push({
        type: "Feature",
        id: "osm-way-" + element.id,
        properties: {
          road_id: "osm-way-" + element.id,
          source_id: String(element.id),
          source: "OpenStreetMap",
          license: "ODbL",
          attribution: "© colaboradores de OpenStreetMap",
          divipola: municipality.MPIO_CDPMP,
          department: municipality.DPTO_CNMBRE,
          municipality: municipality.MPIO_CNMBRE,
          road_category: classification.category,
          road_surface: classification.surface,
          road_condition: tags.surface || "no informado",
          speed_kmh: classification.speed,
          transport_cost: 1,
          accessibility: "complementaria",
          source_date: overpass.timestamp ||
            (overpass.elements[0] && overpass.elements[0].timestamp) || null,
          updated_at: new Date().toISOString(),
          source_tags: tags
        },
        geometry: {
          type: "LineString",
          coordinates: coordinates
        }
      });
    });

    if (!roads.length) throw new Error("No se encontraron vías en el área de influencia consultada.");

    const nodes = [];
    selected.forEach(function (element) {
      if (!Array.isArray(element.nodes) || !Array.isArray(element.geometry)) return;
      element.nodes.forEach(function (nodeId, nodeIndex) {
        const roadIdSet = nodeUse.get(String(nodeId));
        if (!roadIdSet || roadIdSet.size < 2) return;
        const point = element.geometry[nodeIndex];
        if (!point) return;
        const projected = tools.projectLonLat(Number(point.lon), Number(point.lat));
        const roadIds = Array.from(roadIdSet).map(function (roadRef) {
          return "osm-way-" + String(roadRef).replace("road-", "");
        });
        const existing = nodes.find(function (node) {
          return node.x === projected.x && node.y === projected.y;
        });
        if (existing) {
          roadIds.forEach(function (roadId) {
            if (existing.roadIds.indexOf(roadId) === -1) existing.roadIds.push(roadId);
          });
        } else {
          nodes.push({
            id: "osm-node-" + nodeId,
            x: projected.x,
            y: projected.y,
            roadIds: roadIds
          });
        }
      });
    });

    let lengthMeters = 0;
    roads.forEach(function (road) {
      for (let index = 1; index < road.geometry.coordinates.length; index += 1) {
        const first = road.geometry.coordinates[index - 1];
        const last = road.geometry.coordinates[index];
        lengthMeters += Math.hypot(last[0] - first[0], last[1] - first[1]);
      }
    });
    return {
      type: "FeatureCollection",
      crs: { type: "name", properties: { name: "EPSG:9377" } },
      features: roads,
      networkMetadata: {
        catalog: "CATÁLOGO COMPLEMENTARIO OPENSTREETMAP",
        municipality: municipality,
        source: "OpenStreetMap",
        license: "ODbL",
        attribution: "© colaboradores de OpenStreetMap",
        coverage: "Cobertura complementaria; no representa una red nacional oficial completa.",
        fetchedAt: new Date().toISOString(),
        sourceDate: overpass.timestamp || null,
        lengthMeters: lengthMeters,
        influenceMeters: INFLUENCE_METERS,
        nodes: nodes
      }
    };
  }

  async function fetchFromEndpoints(query) {
    let lastError = null;
    for (let index = 0; index < ENDPOINTS.length; index += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(function () { controller.abort(); }, 15000);
      try {
        const response = await fetch(ENDPOINTS[index], {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "Accept": "application/json"
          },
          body: "data=" + encodeURIComponent(query),
          signal: controller.signal
        });
        window.clearTimeout(timeout);
        if (!response.ok) throw new Error("HTTP " + response.status);
        return await response.json();
      } catch (error) {
        window.clearTimeout(timeout);
        lastError = error;
      }
    }
    throw new Error("No fue posible consultar la fuente vial: " +
      (lastError && lastError.message ? lastError.message : "sin respuesta"));
  }

  async function loadMunicipalityRoads(municipality, projectedGeometry) {
    const code = municipality.MPIO_CDPMP;
    if (!code || !projectedGeometry) return;
    state.municipality = municipality;
    state.projectedGeometry = projectedGeometry;
    state.inProgress = true;
    updateStatus("Consultando red vial complementaria de OpenStreetMap…");
    refreshPanel();
    const cache = readCache();
    const entry = cache[code];
    const fresh = entry && entry.fetchedAt &&
      Date.now() - Date.parse(entry.fetchedAt) < CACHE_TTL_MS;
    if (fresh) {
      try {
        const parsed = window.VonThunenUrbanMarketRings.parseRoadNetworkGeoJson(entry.geoJson);
        state.geoJson = entry.geoJson;
        state.cacheEntry = entry;
        applyRoadNetwork(entry.geoJson, parsed);
        state.sourceStatus = "Caché vigente";
        state.coverage = entry.geoJson.networkMetadata.coverage;
        state.loadedAt = entry.fetchedAt;
        state.segments = entry.geoJson.features.length;
        state.nodes = entry.geoJson.networkMetadata.nodes.length;
        state.lengthMeters = entry.geoJson.networkMetadata.lengthMeters || 0;
        updateStatus("Red recuperada de caché · " + formatLength(state.lengthMeters) +
          " · " + formatCount(state.segments) + " segmentos.");
        state.inProgress = false;
        return;
      } catch (error) {
        state.cacheEntry = null;
      }
    }

    try {
      const bounds = projectedToLonLatBounds(projectedGeometry);
      const query =
        "[out:json][timeout:20];(" +
        "way[\"highway\"~\"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|track|road|path)$\"]" +
        "(" + bounds.south + "," + bounds.west + "," + bounds.north + "," + bounds.east + ");" +
        ");out geom " + MAX_WAYS + ";";
      const overpass = await fetchFromEndpoints(query);
      const geoJson = parseOverpass(overpass, municipality);
      const parsed = window.VonThunenUrbanMarketRings.parseRoadNetworkGeoJson(geoJson);
      state.geoJson = geoJson;
      state.sourceStatus = "Consulta completada";
      state.coverage = geoJson.networkMetadata.coverage;
      state.loadedAt = geoJson.networkMetadata.fetchedAt;
      state.fetchedAt = geoJson.networkMetadata.fetchedAt;
      state.segments = geoJson.features.length;
      state.nodes = geoJson.networkMetadata.nodes.length;
      state.lengthMeters = geoJson.networkMetadata.lengthMeters || 0;
      state.cacheEntry = {
        fetchedAt: state.fetchedAt,
        geoJson: geoJson
      };
      writeCache(code, state.cacheEntry);
      applyRoadNetwork(geoJson, parsed);
      updateStatus("Red cargada automáticamente · " + formatLength(state.lengthMeters) +
        " · " + formatCount(state.segments) + " segmentos complementarios.");
    } catch (error) {
      if (entry && entry.geoJson) {
        try {
          const parsed = window.VonThunenUrbanMarketRings.parseRoadNetworkGeoJson(entry.geoJson);
          state.geoJson = entry.geoJson;
          state.cacheEntry = entry;
          applyRoadNetwork(entry.geoJson, parsed);
          state.sourceStatus = "Última versión almacenada";
          state.coverage = entry.geoJson.networkMetadata.coverage;
          state.loadedAt = entry.fetchedAt;
          state.segments = entry.geoJson.features.length;
          state.nodes = entry.geoJson.networkMetadata.nodes.length;
          state.lengthMeters = entry.geoJson.networkMetadata.lengthMeters || 0;
          updateStatus("La consulta falló. Se conserva la versión de " +
            formatDate(entry.fetchedAt) + ": " + formatLength(state.lengthMeters) +
            " · " + formatCount(state.segments) + " segmentos.");
        } catch (cacheError) {
          state.geoJson = null;
          applyRoadNetwork(null, null);
          updateStatus("Sin red disponible: " + error.message);
        }
      } else {
        state.geoJson = null;
        applyRoadNetwork(null, null);
        updateStatus("Sin red disponible: " + error.message);
      }
    } finally {
      state.inProgress = false;
      refreshPanel();
    }
  }

  function applyRoadNetwork(geoJson, parsed) {
    const urbanApp = window.VonThunenUrbanMarketRingsApp;
    if (urbanApp && typeof urbanApp.setRoadNetwork === "function") {
      urbanApp.setRoadNetwork(geoJson);
    }
    if (geoJson) {
      window.dispatchEvent(new CustomEvent("road-catalog:changed", {
        detail: { geoJson: geoJson, parsed: parsed }
      }));
    } else {
      window.dispatchEvent(new CustomEvent("road-catalog:changed", {
        detail: { geoJson: null, parsed: null }
      }));
    }
  }

  function formatCount(value) {
    return new Intl.NumberFormat("es-CO").format(value);
  }

  function formatLength(value) {
    if (!Number.isFinite(value)) return "longitud no disponible";
    if (value >= 1000) {
      return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 })
        .format(value / 1000) + " km";
    }
    return formatCount(Math.round(value)) + " m";
  }

  function formatDate(value) {
    if (!value) return "fecha no disponible";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "fecha no disponible" :
      date.toLocaleString("es-CO");
  }

  function updateStatus(message) {
    const status = document.getElementById("road-catalog-status");
    if (status) status.textContent = message;
  }

  function refreshPanel() {
    const municipality = document.getElementById("road-catalog-municipality");
    const source = document.getElementById("road-catalog-source");
    const date = document.getElementById("road-catalog-date");
    const segments = document.getElementById("road-catalog-segments");
    const nodes = document.getElementById("road-catalog-nodes");
    const length = document.getElementById("road-catalog-length");
    const coverage = document.getElementById("road-catalog-coverage");
    if (municipality) {
      municipality.textContent = state.municipality
        ? state.municipality.MPIO_CNMBRE + " · " + state.municipality.MPIO_CDPMP
        : "Ningún municipio seleccionado";
    }
    if (source) source.textContent = state.geoJson ? "OpenStreetMap / Overpass" : "Sin fuente vial";
    if (date) date.textContent = state.loadedAt ? formatDate(state.loadedAt) : "No consultada";
    if (segments) segments.textContent = formatCount(state.segments);
    if (nodes) nodes.textContent = formatCount(state.nodes);
    if (length) length.textContent = formatLength(state.lengthMeters);
    if (coverage) coverage.textContent = state.coverage;
  }

  function projectToGrid(grid) {
    if (!state.geoJson || !grid) return null;
    const roadNetwork = { roads: [], nodes: [] };
    const roadIds = new Set();
    state.geoJson.features.forEach(function (feature) {
      if (!feature.geometry || feature.geometry.type !== "LineString") return;
      const points = feature.geometry.coordinates.map(function (coordinate) {
        const x = Math.max(0, Math.min(grid.width - 1,
          Math.round((coordinate[0] - grid.originX) / grid.resolutionMeters)));
        const y = Math.max(0, Math.min(grid.height - 1,
          Math.round((coordinate[1] - grid.originY) / grid.resolutionMeters)));
        return { x: x, y: y };
      }).filter(function (point, index, list) {
        return index === 0 || point.x !== list[index - 1].x || point.y !== list[index - 1].y;
      });
      if (points.length < 2) return;
      const id = String(feature.id);
      roadIds.add(id);
      roadNetwork.roads.push({
        id: id,
        name: feature.properties.name || feature.properties.road_id,
        points: points,
        surface: feature.properties.road_surface,
        speed: Number(feature.properties.speed_kmh || 20),
        circulationCost: Number(feature.properties.transport_cost || 1),
        penalty: 0,
        capacity: 0,
        reduction: 0.5,
        reachKm: 8,
        connectedNodeIds: [],
        sourceProperties: feature.properties
      });
    });
    if (!roadIds.size) return null;
    state.geoJson.networkMetadata.nodes.forEach(function (node) {
      const roadIdsOnNode = node.roadIds.filter(function (roadId) {
        return roadIds.has(roadId);
      });
      if (roadIdsOnNode.length < 2) return;
      roadNetwork.nodes.push({
        id: node.id,
        x: Math.max(0, Math.min(grid.width - 1,
          Math.round((node.x - grid.originX) / grid.resolutionMeters))),
        y: Math.max(0, Math.min(grid.height - 1,
          Math.round((node.y - grid.originY) / grid.resolutionMeters))),
        roadIds: roadIdsOnNode
      });
    });
    return roadNetwork;
  }

  function draw(context, grid, canvasHeight) {
    if (!state.show || !state.geoJson || !grid) return;
    context.save();
    context.strokeStyle = "#4d72a8";
    context.lineWidth = Math.max(0.8, canvasHeight / 700);
    context.setLineDash([]);
    context.globalAlpha = 0.78;
    state.geoJson.features.forEach(function (feature) {
      if (!feature.geometry || feature.geometry.type !== "LineString") return;
      context.beginPath();
      feature.geometry.coordinates.forEach(function (coordinate, index) {
        const x = (coordinate[0] - grid.originX) / grid.resolutionMeters;
        const y = canvasHeight - (coordinate[1] - grid.originY) / grid.resolutionMeters;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    });
    context.restore();
  }

  function clearMunicipality() {
    state.geoJson = null;
    state.municipality = null;
    state.projectedGeometry = null;
    state.sourceStatus = "Sin consultar";
    state.loadedAt = null;
    state.coverage = "No disponible";
    state.segments = 0;
    state.nodes = 0;
    state.lengthMeters = 0;
    applyRoadNetwork(null, null);
    refreshPanel();
  }

  function bindEvents() {
    const show = document.getElementById("road-catalog-show");
    const update = document.getElementById("road-catalog-update");
    if (show) {
      show.addEventListener("change", function () {
        state.show = this.checked;
        window.dispatchEvent(new CustomEvent("road-catalog:changed"));
      });
    }
    if (update) {
      update.addEventListener("click", function () {
        if (!state.municipality || !state.projectedGeometry || state.inProgress) return;
        const cache = readCache();
        delete cache[state.municipality.MPIO_CDPMP];
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch (error) {}
        loadMunicipalityRoads(state.municipality, state.projectedGeometry);
      });
    }
  }

  window.addEventListener("municipality:loaded", function (event) {
    const detail = event.detail || {};
    if (detail.municipality && detail.projectedGeometry) {
      loadMunicipalityRoads(detail.municipality, detail.projectedGeometry);
    }
  });
  window.addEventListener("municipality:cleared", clearMunicipality);

  bindEvents();
  window.VonThunenRoadCatalog = Object.freeze({
    getState: function () { return state; },
    loadMunicipalityRoads: loadMunicipalityRoads,
    projectToGrid: projectToGrid,
    draw: draw,
    refreshPanel: refreshPanel,
    clear: clearMunicipality
  });
}());
