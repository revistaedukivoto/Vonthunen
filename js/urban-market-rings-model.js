(function () {
  "use strict";

  function pointInRing(point, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = ring[i];
      const b = ring[j];
      if ((a.y > point.y) !== (b.y > point.y)) {
        const intersectionX = (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
        if (point.x < intersectionX) inside = !inside;
      }
    }
    return inside;
  }

  function pointInPolygons(point, projected) {
    if (!projected || !Array.isArray(projected.polygons)) return false;
    return projected.polygons.some(function (polygon) {
      if (!pointInRing(point, polygon[0])) return false;
      for (let hole = 1; hole < polygon.length; hole += 1) {
        if (pointInRing(point, polygon[hole])) return false;
      }
      return true;
    });
  }

  function projectPointToSegment(point, first, last) {
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return { x: first.x, y: first.y };
    const t = Math.max(0, Math.min(1,
      ((point.x - first.x) * dx + (point.y - first.y) * dy) / lengthSquared));
    return { x: first.x + t * dx, y: first.y + t * dy };
  }

  function pointToRingDistance(point, ring) {
    let minimum = Infinity;
    for (let index = 0; index + 1 < ring.length; index += 1) {
      const projected = projectPointToSegment(point, ring[index], ring[index + 1]);
      minimum = Math.min(minimum, Math.hypot(point.x - projected.x, point.y - projected.y));
    }
    return minimum;
  }

  function distanceToUrbanPolygon(point, urbanGeometry) {
    if (!urbanGeometry || !Array.isArray(urbanGeometry.polygons)) return Infinity;
    if (pointInPolygons(point, urbanGeometry)) return 0;
    let minimum = Infinity;
    urbanGeometry.polygons.forEach(function (polygon) {
      polygon.forEach(function (ring) {
        minimum = Math.min(minimum, pointToRingDistance(point, ring));
      });
    });
    return minimum;
  }

  function distanceToFallback(point, marketPoint, radiusMeters) {
    if (!marketPoint) return Infinity;
    const distance = Math.hypot(point.x - marketPoint.x, point.y - marketPoint.y);
    return distance <= radiusMeters ? 0 : distance - radiusMeters;
  }

  function createBands(count, maxDistanceKm) {
    const safeCount = Math.max(2, Math.min(12, Math.round(count)));
    const safeMaximum = Math.max(1, Number(maxDistanceKm));
    const thresholds = [];
    for (let index = 1; index <= safeCount; index += 1) {
      thresholds.push(safeMaximum / safeCount * index);
    }
    return thresholds;
  }

  function getBandIndex(distanceKm, thresholds, maximumKm) {
    if (!Number.isFinite(distanceKm)) return -1;
    if (distanceKm > maximumKm) return -1;
    for (let index = 0; index < thresholds.length; index += 1) {
      if (distanceKm <= thresholds[index]) return index;
    }
    return -1;
  }

  function parseRoadNetworkGeoJson(geojson) {
    const crs = geojson && geojson.crs;
    const crsName = crs && (typeof crs === "string" ? crs :
      crs.properties && (crs.properties.name || crs.properties.code));
    if (!/EPSG(?::+|\/0\/)?9377$/i.test(String(crsName || "").replace(/\s/g, ""))) {
      throw new Error("La red vial debe declarar explícitamente el sistema de coordenadas EPSG:9377.");
    }
    if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
      throw new Error("La red vial debe ser una GeoJSON FeatureCollection.");
    }
    const roads = [];
    const roadIds = new Set();
    geojson.features.forEach(function (feature, featureIndex) {
      const geometry = feature && feature.geometry;
      if (!geometry || (geometry.type !== "LineString" && geometry.type !== "MultiLineString")) {
        throw new Error("Cada elemento de la red vial debe tener geometría LineString o MultiLineString.");
      }
      const properties = feature.properties || {};
      const featureId = feature.id !== undefined && feature.id !== null ? feature.id :
        properties.id !== undefined && properties.id !== null ? properties.id : "road-" + (featureIndex + 1);
      const id = String(featureId);
      if (roadIds.has(id)) throw new Error("La red vial contiene identificadores de carretera duplicados: " + id + ".");
      roadIds.add(id);
      const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
      if (!Array.isArray(lines) || !lines.length) {
        throw new Error("La carretera " + id + " no contiene trazados.");
      }
      const normalizedLines = lines.map(function (line) {
        if (!Array.isArray(line) || line.length < 2) {
          throw new Error("Cada trazado vial debe contener al menos dos coordenadas.");
        }
        return line.map(function (coordinate) {
          if (!Array.isArray(coordinate) || coordinate.length < 2 ||
              !Number.isFinite(Number(coordinate[0])) || !Number.isFinite(Number(coordinate[1]))) {
            throw new Error("La red vial contiene coordenadas proyectadas inválidas.");
          }
          return { x: Number(coordinate[0]), y: Number(coordinate[1]) };
        });
      });
      const speed = properties.speed === undefined ? 60 : Number(properties.speed);
      const circulationCost = properties.circulationCost === undefined ? 1 :
        Number(properties.circulationCost);
      const penalty = properties.penalty === undefined ? 0 : Number(properties.penalty);
      if (!(speed > 0) || !Number.isFinite(speed) || circulationCost < 0 ||
          !Number.isFinite(circulationCost) || penalty < 0 || !Number.isFinite(penalty)) {
        throw new Error("La velocidad, el costo de circulación o la penalización de " + id + " no son válidos.");
      }
      roads.push({
        id: id,
        name: String(properties.name || id),
        lines: normalizedLines,
        speed: speed,
        circulationCost: circulationCost,
        penalty: penalty
      });
    });
    if (!roads.length) throw new Error("La red vial no contiene carreteras.");

    const nodes = geojson.networkMetadata && geojson.networkMetadata.nodes;
    if (nodes !== undefined && !Array.isArray(nodes)) {
      throw new Error("Los nodos explícitos de la red vial deben estar en una lista.");
    }
    const normalizedNodes = (nodes || []).map(function (node, index) {
      if (!node || !Number.isFinite(Number(node.x)) || !Number.isFinite(Number(node.y)) ||
          !Array.isArray(node.roadIds) || node.roadIds.length < 2) {
        throw new Error("Cada nodo explícito debe tener coordenadas proyectadas y conectar al menos dos carreteras.");
      }
      const connectedRoadIds = Array.from(new Set(node.roadIds.map(String)));
      if (connectedRoadIds.length < 2) {
        throw new Error("Cada nodo explícito debe conectar al menos dos carreteras diferentes.");
      }
      connectedRoadIds.forEach(function (id) {
        if (!roadIds.has(id)) throw new Error("El nodo " + (node.id || index + 1) +
          " referencia una carretera inexistente: " + id + ".");
      });
      return {
        id: String(node.id || "node-" + (index + 1)),
        x: Number(node.x),
        y: Number(node.y),
        roadIds: connectedRoadIds
      };
    });
    const nodeIds = new Set();
    normalizedNodes.forEach(function (node) {
      if (nodeIds.has(node.id)) throw new Error("La red vial contiene identificadores de nodo duplicados.");
      nodeIds.add(node.id);
      node.roadIds.forEach(function (roadId) {
        const road = roads.find(function (item) { return item.id === roadId; });
        const isOnRoad = road.lines.some(function (line) {
          for (let segment = 1; segment < line.length; segment += 1) {
            if (projectPointToSegment(node, line[segment - 1], line[segment]).distance <= 1) return true;
          }
          return false;
        });
        if (!isOnRoad) {
          throw new Error("El nodo " + node.id + " no se encuentra sobre la carretera " + roadId + ".");
        }
      });
    });
    return { spatialReference: "EPSG:9377", roads: roads, nodes: normalizedNodes };
  }

  function projectPointToSegment(point, first, last) {
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((point.x - first.x) * dx + (point.y - first.y) * dy) / lengthSquared));
    const projected = { x: first.x + t * dx, y: first.y + t * dy, t: t };
    projected.distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    return projected;
  }

  function crossProduct(ax, ay, bx, by) {
    return ax * by - ay * bx;
  }

  function segmentIntersectionParameters(first, last, edgeFirst, edgeLast) {
    const rx = last.x - first.x;
    const ry = last.y - first.y;
    const sx = edgeLast.x - edgeFirst.x;
    const sy = edgeLast.y - edgeFirst.y;
    const denominator = crossProduct(rx, ry, sx, sy);
    if (Math.abs(denominator) < 1e-10) return [];
    const qx = edgeFirst.x - first.x;
    const qy = edgeFirst.y - first.y;
    const t = crossProduct(qx, qy, sx, sy) / denominator;
    const u = crossProduct(qx, qy, rx, ry) / denominator;
    return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9
      ? [Math.max(0, Math.min(1, t))] : [];
  }

  function fallbackIntersectionParameters(first, last, market, radius) {
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const fx = first.x - market.x;
    const fy = first.y - market.y;
    const a = dx * dx + dy * dy;
    if (a === 0) return [];
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return [];
    const root = Math.sqrt(discriminant);
    return [(-b - root) / (2 * a), (-b + root) / (2 * a)]
      .filter(function (value) { return value >= 0 && value <= 1; });
  }

  function buildRoadGraph(roadNetwork, urbanGeometry, fallbackMarket, fallbackRadiusMeters) {
    const graph = new Map();
    const edges = [];
    const targetKeys = new Set();
    const snapToleranceMeters = 1;

    function ensureNode(key, point) {
      if (!graph.has(key)) graph.set(key, { key: key, x: point.x, y: point.y, edges: [] });
      return graph.get(key);
    }

    function addTarget(key) {
      targetKeys.add(key);
    }

    roadNetwork.roads.forEach(function (road) {
      const impedance = 60 / road.speed * road.circulationCost * (1 + road.penalty);
      road.lines.forEach(function (line, lineIndex) {
        for (let segmentIndex = 0; segmentIndex < line.length - 1; segmentIndex += 1) {
          const first = line[segmentIndex];
          const last = line[segmentIndex + 1];
          const stops = [
            { t: 0, key: "v:" + JSON.stringify([road.id, lineIndex, segmentIndex]), point: first },
            { t: 1, key: "v:" + JSON.stringify([road.id, lineIndex, segmentIndex + 1]), point: last }
          ];
          roadNetwork.nodes.forEach(function (node) {
            if (node.roadIds.indexOf(road.id) === -1) return;
            const projection = projectPointToSegment(node, first, last);
            if (projection.distance <= snapToleranceMeters) {
              stops.push({
                t: projection.t,
                key: "n:" + JSON.stringify(node.id),
                point: { x: projection.x, y: projection.y }
              });
            }
          });

          let boundaryParameters = [];
          if (urbanGeometry) {
            urbanGeometry.polygons.forEach(function (polygon) {
              polygon.forEach(function (ring) {
                for (let index = 0; index < ring.length - 1; index += 1) {
                  boundaryParameters = boundaryParameters.concat(
                    segmentIntersectionParameters(first, last, ring[index], ring[index + 1]));
                }
              });
            });
          } else if (fallbackMarket) {
            boundaryParameters = fallbackIntersectionParameters(
              first, last, fallbackMarket, fallbackRadiusMeters);
          }
          boundaryParameters.forEach(function (t) {
            const point = { x: first.x + (last.x - first.x) * t,
              y: first.y + (last.y - first.y) * t };
            const sampleDelta = Math.min(1e-6,
              Math.max(1e-10, 0.25 / Math.max(1, Math.hypot(last.x - first.x, last.y - first.y))));
            const before = { x: first.x + (last.x - first.x) * Math.max(0, t - sampleDelta),
              y: first.y + (last.y - first.y) * Math.max(0, t - sampleDelta) };
            const after = { x: first.x + (last.x - first.x) * Math.min(1, t + sampleDelta),
              y: first.y + (last.y - first.y) * Math.min(1, t + sampleDelta) };
            const entersUrban = urbanGeometry
              ? pointInPolygons(before, urbanGeometry) || pointInPolygons(after, urbanGeometry) ||
                pointInPolygons(point, urbanGeometry)
              : distanceToFallback(before, fallbackMarket, fallbackRadiusMeters) === 0 ||
                distanceToFallback(after, fallbackMarket, fallbackRadiusMeters) === 0 ||
                distanceToFallback(point, fallbackMarket, fallbackRadiusMeters) <= 1e-4;
            if (!entersUrban) return;
            const key = t <= 1e-9
              ? "v:" + JSON.stringify([road.id, lineIndex, segmentIndex])
              : t >= 1 - 1e-9
                ? "v:" + JSON.stringify([road.id, lineIndex, segmentIndex + 1])
                : "u:" + JSON.stringify([road.id, lineIndex, segmentIndex, t.toFixed(10)]);
            stops.push({ t: t, key: key, point: point, target: true });
          });

          stops.sort(function (a, b) { return a.t - b.t; });
          const uniqueStops = [];
          stops.forEach(function (stop) {
            const previous = uniqueStops[uniqueStops.length - 1];
            if (previous && Math.abs(stop.t - previous.t) < 1e-9) {
              if (stop.key.indexOf("n:") === 0) previous.key = stop.key;
              previous.target = previous.target || stop.target;
              return;
            }
            uniqueStops.push(stop);
          });
          uniqueStops.forEach(function (stop) {
            ensureNode(stop.key, stop.point);
            const isUrban = urbanGeometry ? pointInPolygons(stop.point, urbanGeometry) :
              fallbackMarket && distanceToFallback(stop.point, fallbackMarket, fallbackRadiusMeters) === 0;
            if (stop.target || isUrban) addTarget(stop.key);
          });
          for (let index = 1; index < uniqueStops.length; index += 1) {
            const start = uniqueStops[index - 1];
            const end = uniqueStops[index];
            const length = Math.hypot(end.point.x - start.point.x, end.point.y - start.point.y);
            if (length <= 1e-8 || start.key === end.key) continue;
            const edge = {
              a: start.key,
              b: end.key,
              ax: start.point.x,
              ay: start.point.y,
              bx: end.point.x,
              by: end.point.y,
              cost: length * impedance,
              insideUrban: urbanGeometry
                ? pointInPolygons({ x: (start.point.x + end.point.x) / 2,
                  y: (start.point.y + end.point.y) / 2 }, urbanGeometry)
                : fallbackMarket && distanceToFallback(
                  { x: (start.point.x + end.point.x) / 2, y: (start.point.y + end.point.y) / 2 },
                  fallbackMarket, fallbackRadiusMeters) === 0,
              roadId: road.id
            };
            edges.push(edge);
            graph.get(edge.a).edges.push({ key: edge.b, cost: edge.cost });
            graph.get(edge.b).edges.push({ key: edge.a, cost: edge.cost });
          }
        }
      });
    });
    return { graph: graph, edges: edges, targetKeys: targetKeys };
  }

  function calculateRoadDistanceToUrban(config) {
    const grid = config.grid;
    const result = new Float32Array(grid.count);
    result.fill(Infinity);
    if (!config.roadNetwork || !config.roadNetwork.roads.length) {
      return { distanceMeters: result, reachableRoadCount: 0, status: "network-unavailable" };
    }
    const network = buildRoadGraph(config.roadNetwork, config.urbanGeometry,
      config.fallbackMarket, config.fallbackRadiusMeters);
    if (!network.targetKeys.size) {
      return { distanceMeters: result, reachableRoadCount: 0, status: "network-no-urban-connection" };
    }

    const distances = new Map();
    const heap = [];
    function push(key, distance) {
      let child = heap.length;
      heap.push({ key: key, distance: distance });
      while (child > 0) {
        const parent = Math.floor((child - 1) / 2);
        if (heap[parent].distance <= distance) break;
        heap[child] = heap[parent];
        child = parent;
      }
      heap[child] = { key: key, distance: distance };
    }
    function pop() {
      const minimum = heap[0];
      const last = heap.pop();
      if (heap.length) {
        let parent = 0;
        while (parent * 2 + 1 < heap.length) {
          let child = parent * 2 + 1;
          if (child + 1 < heap.length && heap[child + 1].distance < heap[child].distance) child += 1;
          if (heap[child].distance >= last.distance) break;
          heap[parent] = heap[child];
          parent = child;
        }
        heap[parent] = last;
      }
      return minimum;
    }
    network.targetKeys.forEach(function (key) {
      distances.set(key, 0);
      push(key, 0);
    });
    while (heap.length) {
      const current = pop();
      if (current.distance !== distances.get(current.key)) continue;
      const node = network.graph.get(current.key);
      node.edges.forEach(function (edge) {
        const candidate = current.distance + edge.cost;
        if (candidate < (distances.has(edge.key) ? distances.get(edge.key) : Infinity)) {
          distances.set(edge.key, candidate);
          push(edge.key, candidate);
        }
      });
    }

    const reachableEdges = network.edges.filter(function (edge) {
      return Number.isFinite(distances.get(edge.a)) || Number.isFinite(distances.get(edge.b));
    });
    const reachableRoadIds = new Set(reachableEdges.map(function (edge) { return edge.roadId; }));
    if (!reachableEdges.length) {
      return { distanceMeters: result, reachableRoadCount: 0, status: "network-no-urban-connection" };
    }

    const resolution = grid.resolutionMeters;
    const bucketSize = Math.max(1000, resolution * 16);
    const extentMinX = grid.originX;
    const extentMinY = grid.originY;
    const extentMaxX = extentMinX + grid.width * resolution;
    const extentMaxY = extentMinY + grid.height * resolution;
    const bucketColumns = Math.max(1, Math.ceil(grid.width * resolution / bucketSize));
    const bucketRows = Math.max(1, Math.ceil(grid.height * resolution / bucketSize));
    const buckets = new Map();
    reachableEdges.forEach(function (edge, edgeIndex) {
      const minX = Math.min(edge.ax, edge.bx);
      const maxX = Math.max(edge.ax, edge.bx);
      const minY = Math.min(edge.ay, edge.by);
      const maxY = Math.max(edge.ay, edge.by);
      if (maxX < extentMinX || minX > extentMaxX || maxY < extentMinY || minY > extentMaxY) return;
      const firstColumn = Math.max(0, Math.floor((minX - extentMinX) / bucketSize));
      const lastColumn = Math.min(bucketColumns - 1, Math.floor((maxX - extentMinX) / bucketSize));
      const firstRow = Math.max(0, Math.floor((minY - extentMinY) / bucketSize));
      const lastRow = Math.min(bucketRows - 1, Math.floor((maxY - extentMinY) / bucketSize));
      for (let row = firstRow; row <= lastRow; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const key = row * bucketColumns + column;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(edgeIndex);
        }
      }
    });

    const edgeMarks = new Int32Array(reachableEdges.length);
    let epoch = 0;
    for (let index = 0; index < grid.count; index += 1) {
      if (grid.validMask[index] !== 1) continue;
      const point = grid.cellCoordinates
        ? { x: grid.cellCoordinates[index * 2], y: grid.cellCoordinates[index * 2 + 1] }
        : { x: grid.originX + ((index % grid.width) + 0.5) * resolution,
          y: grid.originY + (Math.floor(index / grid.width) + 0.5) * resolution };
      const centerColumn = Math.max(0, Math.min(bucketColumns - 1,
        Math.floor((point.x - extentMinX) / bucketSize)));
      const centerRow = Math.max(0, Math.min(bucketRows - 1,
        Math.floor((point.y - extentMinY) / bucketSize)));
      let best = Infinity;
      epoch += 1;
      for (let radius = 0; radius < Math.max(bucketColumns, bucketRows); radius += 1) {
        const minColumn = Math.max(0, centerColumn - radius);
        const maxColumn = Math.min(bucketColumns - 1, centerColumn + radius);
        const minRow = Math.max(0, centerRow - radius);
        const maxRow = Math.min(bucketRows - 1, centerRow + radius);
        for (let row = minRow; row <= maxRow; row += 1) {
          for (let column = minColumn; column <= maxColumn; column += 1) {
            if (radius > 0 && row !== minRow && row !== maxRow &&
                column !== minColumn && column !== maxColumn) continue;
            const list = buckets.get(row * bucketColumns + column);
            if (!list) continue;
            list.forEach(function (edgeIndex) {
              if (edgeMarks[edgeIndex] === epoch) return;
              edgeMarks[edgeIndex] = epoch;
              const edge = reachableEdges[edgeIndex];
              const projected = projectPointToSegment(point,
                { x: edge.ax, y: edge.ay }, { x: edge.bx, y: edge.by });
              const fromA = distances.get(edge.a) + projected.t * edge.cost;
              const fromB = distances.get(edge.b) + (1 - projected.t) * edge.cost;
              const roadDistance = edge.insideUrban ? 0 : Math.min(fromA, fromB);
              const candidate = projected.distance + roadDistance;
              if (candidate < best) best = candidate;
            });
          }
        }
        if (Number.isFinite(best)) {
          const left = extentMinX + minColumn * bucketSize;
          const right = Math.min(extentMaxX, extentMinX + (maxColumn + 1) * bucketSize);
          const bottom = extentMinY + minRow * bucketSize;
          const top = Math.min(extentMaxY, extentMinY + (maxRow + 1) * bucketSize);
          const lowerBound = Math.min(point.x - left, right - point.x,
            point.y - bottom, top - point.y);
          if (lowerBound > best || (minColumn === 0 && maxColumn === bucketColumns - 1 &&
              minRow === 0 && maxRow === bucketRows - 1)) break;
        }
      }
      result[index] = best;
    }
    return {
      distanceMeters: result,
      reachableRoadCount: reachableRoadIds.size,
      status: reachableRoadIds.size ? "available" : "network-no-urban-connection"
    };
  }

  function calculateMunicipalUrbanRaster(config) {
    const grid = config.grid;
    const urbanGeometry = config.urbanGeometry;
    const fallbackMarket = config.fallbackMarket;
    const fallbackRadiusMeters = config.fallbackRadiusMeters;
    const thresholds = createBands(config.bandCount, config.maximumKm);
    const urbanMask = new Uint8Array(grid.count);
    const ruralMask = new Uint8Array(grid.count);
    const distanceMeters = new Float32Array(grid.count);
    distanceMeters.fill(Infinity);
    const band = new Int16Array(grid.count);
    band.fill(-1);
    const roadResult = config.distanceMode === "road"
      ? calculateRoadDistanceToUrban(config) : null;

    for (let row = 0; row < grid.height; row += 1) {
      for (let column = 0; column < grid.width; column += 1) {
        const index = row * grid.width + column;
        if (grid.validMask[index] !== 1) continue;
        const point = {
          x: grid.originX + (column + 0.5) * grid.resolutionMeters,
          y: grid.originY + (row + 0.5) * grid.resolutionMeters
        };
        let distanceM;
        if (urbanGeometry) {
          distanceM = distanceToUrbanPolygon(point, urbanGeometry);
        } else if (fallbackMarket) {
          distanceM = distanceToFallback(point, fallbackMarket, fallbackRadiusMeters);
        } else {
          distanceM = Infinity;
        }
        const isUrban = distanceM === 0;
        if (roadResult) {
          distanceM = isUrban ? 0 : roadResult.distanceMeters[index];
        } else if (config.distanceMode === "economic" && Number.isFinite(distanceM)) {
          const speed = Number(config.roadSpeed || 60);
          const operationCost = Number(config.roadCost || 1);
          const transitability = Math.max(0.1, 60 / Math.max(5, speed));
          distanceM *= transitability * Math.max(0.1, operationCost);
        }
        if (isUrban) urbanMask[index] = 1;
        else ruralMask[index] = 1;
        distanceMeters[index] = distanceM;
        band[index] = getBandIndex(distanceM / 1000, thresholds, config.maximumKm);
      }
    }
    return {
      urbanMask: urbanMask,
      ruralMask: ruralMask,
      distanceMeters: distanceMeters,
      band: band,
      thresholdsKm: thresholds,
      bandCount: thresholds.length,
      roadNetworkStatus: roadResult ? roadResult.status : null,
      reachableRoadCount: roadResult ? roadResult.reachableRoadCount : 0
    };
  }

  window.VonThunenUrbanMarketRings = Object.freeze({
    pointInRing: pointInRing,
    pointInPolygons: pointInPolygons,
    distanceToUrbanPolygon: distanceToUrbanPolygon,
    distanceToFallback: distanceToFallback,
    createBands: createBands,
    getBandIndex: getBandIndex,
    parseRoadNetworkGeoJson: parseRoadNetworkGeoJson,
    calculateRoadDistanceToUrban: calculateRoadDistanceToUrban,
    calculateMunicipalUrbanRaster: calculateMunicipalUrbanRaster
  });
}());
