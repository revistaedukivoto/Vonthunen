(function () {
  "use strict";

  const DEFAULT_SIZE = 100;
  const NO_ACTIVITY = -1;
  const NEIGHBORS = [
    [-1, -1, Math.SQRT2], [0, -1, 1], [1, -1, Math.SQRT2],
    [-1, 0, 1], [1, 0, 1],
    [-1, 1, Math.SQRT2], [0, 1, 1], [1, 1, Math.SQRT2]
  ];

  function validateConfig(config) {
    if (config.size !== undefined && config.width === undefined &&
        config.height === undefined && config.size !== DEFAULT_SIZE) {
      throw new RangeError("La cuadrícula demostrativa estándar continúa siendo de 100 × 100 celdas.");
    }
    if (!Array.isArray(config.activities) || config.activities.length !== 4) {
      throw new TypeError("El modelo raster requiere exactamente cuatro actividades.");
    }
    if (!(config.cellKm > 0) || !Number.isFinite(config.cellKm)) {
      throw new RangeError("El tamaño de celda debe ser una distancia positiva.");
    }
    if (!(config.accessibility > 0) || !Number.isFinite(config.accessibility)) {
      throw new RangeError("La accesibilidad debe ser un porcentaje positivo.");
    }
    config.activities.forEach(function (activity) {
      if (!Number.isFinite(activity.A) || activity.A < 0 ||
          !Number.isFinite(activity.t) || activity.t < 0) {
        throw new RangeError("Cada actividad debe tener renta y costo no negativos.");
      }
    });
    const width = config.width === undefined ? DEFAULT_SIZE : config.width;
    const height = config.height === undefined ? DEFAULT_SIZE : config.height;
    if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 ||
        width * height > 250000) {
      throw new RangeError("Las dimensiones raster deben ser positivas y no superar 250.000 celdas.");
    }
    if (!Number.isFinite(config.marketX) || !Number.isFinite(config.marketY) ||
        config.marketX < 0 || config.marketX >= width ||
        config.marketY < 0 || config.marketY >= height) {
      throw new RangeError("El mercado debe ubicarse dentro de la cuadrícula.");
    }
    if (config.validMask && config.validMask.length !== width * height) {
      throw new RangeError("La máscara debe tener una posición por celda raster.");
    }
    if (config.cellCoordinates && config.cellCoordinates.length !== width * height * 2) {
      throw new RangeError("Las coordenadas geográficas proyectadas deben incluir cada celda.");
    }
    if (config.marketPoint && (!Number.isFinite(config.marketPoint.x) ||
        !Number.isFinite(config.marketPoint.y))) {
      throw new TypeError("Las coordenadas proyectadas del mercado deben ser finitas.");
    }
    if (config.road) {
      if (!Number.isFinite(config.road.reduction) || config.road.reduction < 0 || config.road.reduction > 0.8) {
        throw new RangeError("La reducción vial debe estar entre 0 y 80%.");
      }
      if (!(config.road.reachKm > 0) || !Number.isFinite(config.road.reachKm)) {
        throw new RangeError("El alcance de la carretera debe ser positivo.");
      }
      if (config.road.points.length < 2) {
        throw new TypeError("La carretera necesita un punto inicial y uno final.");
      }
      config.road.points.forEach(function (point) {
        if (!Number.isInteger(point.x) || !Number.isInteger(point.y) ||
            point.x < 0 || point.x >= width || point.y < 0 || point.y >= height) {
          throw new RangeError("Todos los puntos de la carretera deben pertenecer a la cuadrícula.");
        }
      });
    }
    if (config.roadNetwork) {
      if (!Array.isArray(config.roadNetwork.roads) || !Array.isArray(config.roadNetwork.nodes)) {
        throw new TypeError("La red vial debe contener listas de carreteras y nodos.");
      }
    }
  }

  function getIndex(x, y, size) {
    return y * size + x;
  }

  function projectPointToSegment(x, y, first, last) {
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return { x: first.x, y: first.y };
    const t = Math.max(0, Math.min(1, ((x - first.x) * dx + (y - first.y) * dy) / lengthSquared));
    return { x: first.x + t * dx, y: first.y + t * dy };
  }

  function pointToSegmentDistanceSquared(x, y, first, last) {
    const projected = projectPointToSegment(x, y, first, last);
    const dx = x - projected.x;
    const dy = y - projected.y;
    return dx * dx + dy * dy;
  }

  function rasterizePolyline(points, width, height) {
    const cells = [];
    if (!Array.isArray(points)) return cells;
    function add(x, y) {
      x = Math.round(x);
      y = Math.round(y);
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const key = y * width + x;
        if (cells.indexOf(key) === -1) cells.push(key);
      }
    }
    for (let segment = 1; segment < points.length; segment += 1) {
      let x0 = Math.round(points[segment - 1].x);
      let y0 = Math.round(points[segment - 1].y);
      const x1 = Math.round(points[segment].x);
      const y1 = Math.round(points[segment].y);
      const dx = Math.abs(x1 - x0);
      const sx = x0 < x1 ? 1 : -1;
      const dy = -Math.abs(y1 - y0);
      const sy = y0 < y1 ? 1 : -1;
      let error = dx + dy;
      while (true) {
        add(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        const doubleError = 2 * error;
        if (doubleError >= dy) { error += dy; x0 += sx; }
        if (doubleError <= dx) { error += dx; y0 += sy; }
      }
    }
    return cells;
  }

  function getRoadNetworkMaps(config, width, height) {
    const network = config.roadNetwork;
    if (!network) return null;
    const roadCells = new Map();
    const roadById = new Map();
    network.roads.forEach(function (road) {
      roadById.set(road.id, road);
      rasterizePolyline(road.points, width, height).forEach(function (index) {
        if (!roadCells.has(index)) roadCells.set(index, []);
        const ids = roadCells.get(index);
        if (ids.indexOf(road.id) === -1) ids.push(road.id);
      });
    });

    const marketX = config.marketX;
    const marketY = config.marketY;
    const connected = new Set();
    network.roads.forEach(function (road) {
      for (let segment = 1; segment < road.points.length; segment += 1) {
        const distance = pointToSegmentDistanceSquared(
          marketX, marketY, road.points[segment - 1], road.points[segment]);
        if (distance <= 1.1 * 1.1) connected.add(road.id);
      }
    });

    let changed = true;
    while (changed) {
      changed = false;
      network.nodes.forEach(function (node) {
        if (!node.roadIds || node.roadIds.length < 2) return;
        const hasConnected = node.roadIds.some(function (roadId) { return connected.has(roadId); });
        if (!hasConnected) return;
        node.roadIds.forEach(function (roadId) {
          if (!connected.has(roadId)) {
            connected.add(roadId);
            changed = true;
          }
        });
      });
    }

    return { roadCells: roadCells, connected: connected, roadById: roadById, nodes: network.nodes };
  }

  function isValidCell(config, index) {
    return !config.validMask || config.validMask[index] === 1;
  }

  function createDistances(config, width, height) {
    if (height === undefined) height = width;
    const distance = new Float32Array(width * height);
    distance.fill(NaN);
    const market = config.marketPoint;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = getIndex(x, y, width);
        if (!isValidCell(config, index)) continue;
        if (config.cellCoordinates && market) {
          const dx = config.cellCoordinates[index * 2] - market.x;
          const dy = config.cellCoordinates[index * 2 + 1] - market.y;
          distance[index] = Math.hypot(dx, dy) / 1000;
        } else {
          const dx = x - config.marketX;
          const dy = y - config.marketY;
          distance[index] = Math.hypot(dx, dy) * config.cellKm;
        }
      }
    }
    return distance;
  }

  function createAccessibilityFactors(config, width, height) {
    if (height === undefined) height = width;
    const factors = new Float32Array(width * height);
    factors.fill(1);
    if (config.validMask) {
      for (let index = 0; index < factors.length; index += 1) {
        if (!isValidCell(config, index)) factors[index] = NaN;
      }
    }
    if (config.roadNetwork) {
      const networkMaps = getRoadNetworkMaps(config, width, height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          if (!isValidCell(config, index)) continue;
          let factor = 1;
          networkMaps.roadById.forEach(function (road) {
            if (!networkMaps.connected.has(road.id)) return;
            for (let segment = 1; segment < road.points.length; segment += 1) {
              const distanceSquared = pointToSegmentDistanceSquared(
                x, y, road.points[segment - 1], road.points[segment]);
              const reachKm = Number(road.reachKm || config.roadNetwork.reachKm || 8);
              const distanceKm = Math.sqrt(distanceSquared) * config.cellKm;
              if (distanceKm >= reachKm) continue;
              const remaining = 1 - distanceKm / reachKm;
              const roadFactor = 1 - Number(road.reduction || 0) * remaining;
              factor = Math.min(factor, roadFactor);
            }
          });
          factors[index] = factor;
        }
      }
      return factors;
    }
    if (!config.road || config.road.reduction === 0) return factors;

    const road = config.road;
    const first = road.points[0];
    const last = road.points[road.points.length - 1];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = getIndex(x, y, width);
        if (!isValidCell(config, index)) continue;
        const projected = projectPointToSegment(x, y, first, last);
        const distanceKm = Math.hypot(x - projected.x, y - projected.y) * config.cellKm;
        const remainingInfluence = Math.max(0, 1 - distanceKm / road.reachKm);
        factors[index] = 1 - road.reduction * remainingInfluence;
      }
    }
    return factors;
  }

  function createCostDistance(config, euclideanDistance, factors, width, height) {
    if (config.roadNetwork) {
      const count = width * height;
      const networkMaps = getRoadNetworkMaps(config, width, height);
      const distances = new Float64Array(count);
      distances.fill(Infinity);
      const visited = new Uint8Array(count);
      const heapIndexes = new Int32Array(count * 10);
      const heapDistances = new Float64Array(count * 10);
      let heapLength = 0;
      const start = getIndex(config.marketX, config.marketY, width);
      distances[start] = 0;

      function push(index, value) {
        let child = heapLength++;
        while (child > 0) {
          const parent = Math.floor((child - 1) / 2);
          if (heapDistances[parent] <= value) break;
          heapIndexes[child] = heapIndexes[parent];
          heapDistances[child] = heapDistances[parent];
          child = parent;
        }
        heapIndexes[child] = index;
        heapDistances[child] = value;
      }
      function pop() {
        const index = heapIndexes[0];
        const value = heapDistances[0];
        heapLength -= 1;
        if (heapLength > 0) {
          const lastIndex = heapIndexes[heapLength];
          const lastDistance = heapDistances[heapLength];
          let parent = 0;
          while (parent * 2 + 1 < heapLength) {
            let child = parent * 2 + 1;
            if (child + 1 < heapLength && heapDistances[child + 1] < heapDistances[child]) child += 1;
            if (heapDistances[child] >= lastDistance) break;
            heapIndexes[parent] = heapIndexes[child];
            heapDistances[parent] = heapDistances[child];
            parent = child;
          }
          heapIndexes[parent] = lastIndex;
          heapDistances[parent] = lastDistance;
        }
        return { index: index, distance: value };
      }

      push(start, 0);
      while (heapLength > 0) {
        const current = pop();
        if (visited[current.index]) continue;
        visited[current.index] = 1;
        const x = current.index % width;
        const y = Math.floor(current.index / width);
        for (let neighbor = 0; neighbor < NEIGHBORS.length; neighbor += 1) {
          const offset = NEIGHBORS[neighbor];
          const nextX = x + offset[0];
          const nextY = y + offset[1];
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const nextIndex = getIndex(nextX, nextY, width);
          if (!isValidCell(config, nextIndex) || visited[nextIndex]) continue;

          const currentRoads = networkMaps.roadCells.get(current.index) || [];
          const nextRoads = networkMaps.roadCells.get(nextIndex) || [];
          let commonConnectedRoad = null;
          currentRoads.forEach(function (roadId) {
            if (networkMaps.connected.has(roadId) && nextRoads.indexOf(roadId) !== -1) commonConnectedRoad = roadId;
          });
          const currentOnRoad = currentRoads.some(function (id) { return networkMaps.connected.has(id); });
          const nextOnRoad = nextRoads.some(function (id) { return networkMaps.connected.has(id); });
          if (currentOnRoad && nextOnRoad && !commonConnectedRoad) {
            const sharedNode = networkMaps.nodes.some(function (node) {
              if (Math.hypot(node.x - nextX, node.y - nextY) > 1.1) return false;
              return currentRoads.some(function (a) {
                return networkMaps.connected.has(a) && node.roadIds.indexOf(a) !== -1 &&
                  nextRoads.some(function (b) {
                    return networkMaps.connected.has(b) && node.roadIds.indexOf(b) !== -1;
                  });
              });
            });
            if (!sharedNode) continue;
          }

          const stepKm = offset[2] * config.cellKm;
          const stepCost = stepKm * (factors[current.index] + factors[nextIndex]) / 2;
          const candidate = current.distance + stepCost;
          if (candidate + 1e-10 < distances[nextIndex]) {
            distances[nextIndex] = candidate;
            push(nextIndex, candidate);
          }
        }
      }
      const effective = new Float32Array(count);
      for (let index = 0; index < count; index += 1) {
        effective[index] = isValidCell(config, index)
          ? Math.min(euclideanDistance[index], distances[index])
          : NaN;
      }
      return effective;
    }
    if (!config.road || config.road.reduction === 0) return euclideanDistance;

    const count = width * height;
    const distances = new Float64Array(count);
    distances.fill(Infinity);
    const visited = new Uint8Array(count);
    const heapIndexes = new Int32Array(count * 10);
    const heapDistances = new Float64Array(count * 10);
    let heapLength = 0;
    const start = getIndex(config.marketX, config.marketY, width);
    distances[start] = 0;

    function push(index, value) {
      let child = heapLength;
      heapLength += 1;
      while (child > 0) {
        const parent = Math.floor((child - 1) / 2);
        if (heapDistances[parent] <= value) break;
        heapIndexes[child] = heapIndexes[parent];
        heapDistances[child] = heapDistances[parent];
        child = parent;
      }
      heapIndexes[child] = index;
      heapDistances[child] = value;
    }

    function pop() {
      const index = heapIndexes[0];
      const value = heapDistances[0];
      heapLength -= 1;
      if (heapLength > 0) {
        const lastIndex = heapIndexes[heapLength];
        const lastDistance = heapDistances[heapLength];
        let parent = 0;
        while (parent * 2 + 1 < heapLength) {
          let child = parent * 2 + 1;
          if (child + 1 < heapLength && heapDistances[child + 1] < heapDistances[child]) child += 1;
          if (heapDistances[child] >= lastDistance) break;
          heapIndexes[parent] = heapIndexes[child];
          heapDistances[parent] = heapDistances[child];
          parent = child;
        }
        heapIndexes[parent] = lastIndex;
        heapDistances[parent] = lastDistance;
      }
      return { index: index, distance: value };
    }

    push(start, 0);
    while (heapLength > 0) {
      const current = pop();
      const index = current.index;
      if (visited[index]) continue;
      visited[index] = 1;
      const x = index % width;
      const y = Math.floor(index / width);

      for (let neighbor = 0; neighbor < NEIGHBORS.length; neighbor += 1) {
        const offset = NEIGHBORS[neighbor];
        const nextX = x + offset[0];
        const nextY = y + offset[1];
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        const nextIndex = getIndex(nextX, nextY, width);
        if (!isValidCell(config, nextIndex)) continue;
        if (visited[nextIndex]) continue;
        const stepKm = offset[2] * config.cellKm;
        const stepCost = stepKm * (factors[index] + factors[nextIndex]) / 2;
        const candidate = current.distance + stepCost;
        if (candidate + 1e-10 < distances[nextIndex]) {
          distances[nextIndex] = candidate;
          push(nextIndex, candidate);
        }
      }
    }

    const effective = new Float32Array(count);
    effective.fill(NaN);
    for (let index = 0; index < count; index += 1) {
      if (isValidCell(config, index)) {
        effective[index] = Math.min(euclideanDistance[index], distances[index]);
      }
    }
    return effective;
  }

  function createTransportCosts(activities, effectiveDistance, accessibility, width, height) {
    if (height === undefined) height = width;
    const count = width * height;
    const transportCosts = activities.map(function (activity) {
      const costs = new Float32Array(count);
      const unitCost = activity.t * 100 / accessibility;
      for (let index = 0; index < costs.length; index += 1) {
        costs[index] = unitCost * effectiveDistance[index];
      }
      return costs;
    });
    return transportCosts;
  }

  function createRentSurfaces(activities, transportCosts) {
    return activities.map(function (activity, index) {
      const rents = new Float32Array(transportCosts[index].length);
      for (let cell = 0; cell < rents.length; cell += 1) {
        rents[cell] = activity.A - transportCosts[index][cell];
      }
      return rents;
    });
  }

  function classifyProductiveUse(rentSurfaces) {
    const count = rentSurfaces[0].length;
    const specialization = new Int8Array(count);
    specialization.fill(NO_ACTIVITY);
    for (let cell = 0; cell < count; cell += 1) {
      let bestRent = 0;
      let bestActivity = NO_ACTIVITY;
      for (let activity = 0; activity < rentSurfaces.length; activity += 1) {
        const rent = rentSurfaces[activity][cell];
        // Strict comparison keeps the first-listed activity as the deterministic tie-breaker.
        if (rent > bestRent) {
          bestRent = rent;
          bestActivity = activity;
        }
      }
      specialization[cell] = bestActivity;
    }
    return specialization;
  }

  function createRaster(config) {
    validateConfig(config);
    const width = config.width === undefined ? DEFAULT_SIZE : config.width;
    const height = config.height === undefined ? DEFAULT_SIZE : config.height;
    const size = width === height ? width : null;
    const distance = createDistances(config, width, height);
    const accessibilityFactors = createAccessibilityFactors(config, width, height);
    const effectiveDistance = createCostDistance(config, distance, accessibilityFactors, width, height);
    const transportCosts = createTransportCosts(config.activities, effectiveDistance, config.accessibility, width, height);
    const rentSurfaces = createRentSurfaces(config.activities, transportCosts);
    const specialization = classifyProductiveUse(rentSurfaces);

    return {
      size: size,
      width: width,
      height: height,
      count: width * height,
      validCount: config.validMask
        ? config.validMask.reduce(function (sum, value) { return sum + (value === 1 ? 1 : 0); }, 0)
        : width * height,
      validMask: config.validMask || null,
      distance: distance,
      accessibilityFactors: accessibilityFactors,
      effectiveDistance: effectiveDistance,
      transportCosts: transportCosts,
      rentSurfaces: rentSurfaces,
      specialization: specialization,
      marketX: config.marketX,
      marketY: config.marketY,
      marketPoint: config.marketPoint || null,
      cellCoordinates: config.cellCoordinates || null,
      cellKm: config.cellKm,
      activities: config.activities,
      road: config.road || null,
      roadNetwork: config.roadNetwork || null
    };
  }

  function compareRasters(before, after) {
    if (before.count !== after.count || before.width !== after.width ||
        before.height !== after.height || before.activities.length !== after.activities.length) {
      throw new RangeError("Las superficies comparadas deben tener igual tamaño y actividades.");
    }
    const changed = new Uint8Array(before.count);
    const countsBefore = new Int32Array(before.activities.length + 1);
    const countsAfter = new Int32Array(after.activities.length + 1);
    const rentChange = new Float64Array(before.activities.length);
    let changedCells = 0;
    const validMask = before.validMask || after.validMask;
    if (before.validMask && after.validMask) {
      for (let cell = 0; cell < before.count; cell += 1) {
        if (before.validMask[cell] !== after.validMask[cell]) {
          throw new RangeError("Las superficies comparadas deben compartir la misma máscara válida.");
        }
      }
    }
    for (let cell = 0; cell < before.count; cell += 1) {
      if (validMask && validMask[cell] !== 1) continue;
      const oldClass = before.specialization[cell];
      const newClass = after.specialization[cell];
      countsBefore[oldClass < 0 ? before.activities.length : oldClass] += 1;
      countsAfter[newClass < 0 ? after.activities.length : newClass] += 1;
      if (oldClass !== newClass) {
        changed[cell] = 1;
        changedCells += 1;
      }
      for (let activity = 0; activity < before.activities.length; activity += 1) {
        rentChange[activity] += after.rentSurfaces[activity][cell] - before.rentSurfaces[activity][cell];
      }
    }
    return {
      changed: changed,
      changedCells: changedCells,
      changedPercent: changedCells / (before.validCount || before.count) * 100,
      countsBefore: countsBefore,
      countsAfter: countsAfter,
      rentChange: rentChange,
      cellAreaKm2: before.cellKm * before.cellKm,
      countViable: before.activities.length
    };
  }

  window.VonThunenMapAlgebra = Object.freeze({
    DEFAULT_SIZE: DEFAULT_SIZE,
    NO_ACTIVITY: NO_ACTIVITY,
    createRaster: createRaster,
    createDistances: createDistances,
    createAccessibilityFactors: createAccessibilityFactors,
    createCostDistance: createCostDistance,
    createTransportCosts: createTransportCosts,
    createRentSurfaces: createRentSurfaces,
    classifyProductiveUse: classifyProductiveUse,
    compareRasters: compareRasters,
    projectPointToSegment: projectPointToSegment
  });
}());
