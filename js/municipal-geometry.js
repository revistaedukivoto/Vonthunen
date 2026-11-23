(function () {
  "use strict";

  const TARGET_EPSG = 9377;
  const SOURCE_EPSG = 4686;
  const MAX_CELLS = 250000;
  const SEMI_MAJOR = 6378137;
  const INVERSE_FLATTENING = 298.257222101;
  const FLATTENING = 1 / INVERSE_FLATTENING;
  const ECCENTRICITY_SQUARED = FLATTENING * (2 - FLATTENING);
  const SECOND_ECCENTRICITY_SQUARED =
    ECCENTRICITY_SQUARED / (1 - ECCENTRICITY_SQUARED);
  const CENTRAL_MERIDIAN = -73 * Math.PI / 180;
  const LATITUDE_OF_ORIGIN = 4 * Math.PI / 180;
  const SCALE = 0.9992;
  const FALSE_EASTING = 5000000;
  const FALSE_NORTHING = 2000000;

  function meridionalArc(latitude) {
    const e2 = ECCENTRICITY_SQUARED;
    const e4 = e2 * e2;
    const e6 = e4 * e2;
    return SEMI_MAJOR * (
      (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * latitude -
      (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * latitude) +
      (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * latitude) -
      35 * e6 / 3072 * Math.sin(6 * latitude)
    );
  }

  function projectLonLat(longitude, latitude) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) ||
        longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      throw new RangeError("La geometría debe usar coordenadas geográficas válidas.");
    }
    const phi = latitude * Math.PI / 180;
    const lambda = longitude * Math.PI / 180;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const tanPhi = Math.tan(phi);
    const n = SEMI_MAJOR / Math.sqrt(1 - ECCENTRICITY_SQUARED * sinPhi * sinPhi);
    const t = tanPhi * tanPhi;
    const c = SECOND_ECCENTRICITY_SQUARED * cosPhi * cosPhi;
    const a = cosPhi * (lambda - CENTRAL_MERIDIAN);
    const a2 = a * a;
    const a3 = a2 * a;
    const a4 = a2 * a2;
    const a5 = a4 * a;
    const a6 = a3 * a3;
    const x = FALSE_EASTING + SCALE * n * (
      a + (1 - t + c) * a3 / 6 +
      (5 - 18 * t + t * t + 72 * c - 58 * SECOND_ECCENTRICITY_SQUARED) * a5 / 120
    );
    const y = FALSE_NORTHING + SCALE * (
      meridionalArc(phi) - meridionalArc(LATITUDE_OF_ORIGIN) +
      n * tanPhi * (
        a2 / 2 + (5 - t + 9 * c + 4 * c * c) * a4 / 24 +
        (61 - 58 * t + t * t + 600 * c - 330 * SECOND_ECCENTRICITY_SQUARED) * a6 / 720
      )
    );
    return { x: x, y: y };
  }

  function unproject(x, y) {
    const e2 = ECCENTRICITY_SQUARED;
    const e4 = e2 * e2;
    const e6 = e4 * e2;
    const m = meridionalArc(LATITUDE_OF_ORIGIN) + (y - FALSE_NORTHING) / SCALE;
    const mu = m / (SEMI_MAJOR * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const e1Squared = e1 * e1;
    const e1Cubed = e1Squared * e1;
    const e1Fourth = e1Squared * e1Squared;
    const phi1 = mu +
      (3 * e1 / 2 - 27 * e1Cubed / 32) * Math.sin(2 * mu) +
      (21 * e1Squared / 16 - 55 * e1Fourth / 32) * Math.sin(4 * mu) +
      151 * e1Cubed / 96 * Math.sin(6 * mu) +
      1097 * e1Fourth / 512 * Math.sin(8 * mu);
    const sinPhi = Math.sin(phi1);
    const cosPhi = Math.cos(phi1);
    const tanPhi = Math.tan(phi1);
    const n1 = SEMI_MAJOR / Math.sqrt(1 - e2 * sinPhi * sinPhi);
    const r1 = SEMI_MAJOR * (1 - e2) /
      Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
    const t1 = tanPhi * tanPhi;
    const c1 = SECOND_ECCENTRICITY_SQUARED * cosPhi * cosPhi;
    const d = (x - FALSE_EASTING) / (n1 * SCALE);
    const d2 = d * d;
    const d3 = d2 * d;
    const d4 = d2 * d2;
    const d5 = d4 * d;
    const d6 = d3 * d3;
    const latitude = phi1 - n1 * tanPhi / r1 * (
      d2 / 2 -
      (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * SECOND_ECCENTRICITY_SQUARED) * d4 / 24 +
      (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * SECOND_ECCENTRICITY_SQUARED -
        3 * c1 * c1) * d6 / 720
    );
    const longitude = CENTRAL_MERIDIAN + (
      d - (1 + 2 * t1 + c1) * d3 / 6 +
      (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 +
        8 * SECOND_ECCENTRICITY_SQUARED + 24 * t1 * t1) * d5 / 120
    ) / cosPhi;
    return { longitude: longitude * 180 / Math.PI, latitude: latitude * 180 / Math.PI };
  }

  function signedArea(ring) {
    let sum = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
      const currentX = Array.isArray(ring[index]) ? ring[index][0] : ring[index].x;
      const currentY = Array.isArray(ring[index]) ? ring[index][1] : ring[index].y;
      const nextX = Array.isArray(ring[index + 1]) ? ring[index + 1][0] : ring[index + 1].x;
      const nextY = Array.isArray(ring[index + 1]) ? ring[index + 1][1] : ring[index + 1].y;
      sum += currentX * nextY - nextX * currentY;
    }
    return sum / 2;
  }

  function closeRing(input) {
    if (!Array.isArray(input) || input.length < 3) {
      throw new TypeError("Cada anillo del polígono debe tener al menos tres vértices.");
    }
    const ring = input.map(function (coordinate) {
      if (!Array.isArray(coordinate) || coordinate.length < 2 ||
          !Number.isFinite(Number(coordinate[0])) || !Number.isFinite(Number(coordinate[1]))) {
        throw new TypeError("La geometría contiene coordenadas inválidas.");
      }
      return [Number(coordinate[0]), Number(coordinate[1])];
    });
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first.slice());
    if (ring.length < 4 || Math.abs(signedArea(ring)) < 1e-14) {
      throw new TypeError("La geometría contiene un anillo degenerado.");
    }
    return ring;
  }

  function pointInRing(point, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = ring[i];
      const b = ring[j];
      const ax = Array.isArray(a) ? a[0] : a.x;
      const ay = Array.isArray(a) ? a[1] : a.y;
      const bx = Array.isArray(b) ? b[0] : b.x;
      const by = Array.isArray(b) ? b[1] : b.y;
      const cross = (point[1] - ay) * (bx - ax) - (point[0] - ax) * (by - ay);
      if (Math.abs(cross) < 1e-7 &&
          point[0] >= Math.min(ax, bx) - 1e-7 &&
          point[0] <= Math.max(ax, bx) + 1e-7 &&
          point[1] >= Math.min(ay, by) - 1e-7 &&
          point[1] <= Math.max(ay, by) + 1e-7) return true;
      const crosses = (ay > point[1]) !== (by > point[1]) &&
        point[0] < (bx - ax) * (point[1] - ay) / (by - ay) + ax;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function ringsToPolygons(rings) {
    const ordered = rings.map(function (ring) {
      const closed = closeRing(ring);
      return { ring: closed, area: Math.abs(signedArea(closed)), parent: null, depth: 0 };
    }).sort(function (a, b) { return b.area - a.area; });
    const polygons = [];
    const outerByRing = new Map();
    ordered.forEach(function (item, index) {
      let parent = null;
      for (let previous = 0; previous < index; previous += 1) {
        const candidate = ordered[previous];
        if (pointInRing(item.ring[0], candidate.ring) &&
            (!parent || candidate.area < parent.area)) parent = candidate;
      }
      item.parent = parent;
      item.depth = parent ? parent.depth + 1 : 0;
      if (item.depth % 2 === 0) {
        const polygon = [item.ring];
        polygons.push(polygon);
        outerByRing.set(item, polygon);
      } else {
        let outer = parent;
        while (outer && outer.depth % 2 !== 0) outer = outer.parent;
        const polygon = outer && outerByRing.get(outer);
        if (!polygon) throw new TypeError("No se pudo asociar un anillo interior a su polígono.");
        polygon.push(item.ring);
      }
    });
    return polygons;
  }

  function getEpsg(input, geometry) {
    const spatialReference = geometry && geometry.spatialReference;
    if (spatialReference) {
      return Number(spatialReference.latestWkid || spatialReference.wkid);
    }
    const crs = input && input.crs;
    const name = crs && crs.properties && (crs.properties.name || crs.properties.code);
    if (name) {
      const match = String(name).match(/(?:EPSG[:/]|::)(\d+)$/i);
      if (match) return Number(match[1]);
      if (/^urn:ogc:def:crs:EPSG::\d+$/i.test(String(name))) {
        return Number(String(name).split(":").pop());
      }
    }
    return 4326;
  }

  function normalizeGeometry(input) {
    if (!input || typeof input !== "object") {
      throw new TypeError("El archivo debe ser un GeoJSON Feature, FeatureCollection o geometría poligonal.");
    }
    let feature = input;
    if (input.type === "FeatureCollection") {
      if (!Array.isArray(input.features) || input.features.length !== 1) {
        throw new TypeError("El GeoJSON municipal debe contener exactamente una entidad poligonal.");
      }
      feature = input.features[0];
    }
    if (feature.type === "Feature") feature = feature.geometry;
    if (!feature) throw new TypeError("El GeoJSON no contiene una geometría.");
    const epsg = getEpsg(input, feature);
    if ([4326, SOURCE_EPSG, TARGET_EPSG].indexOf(epsg) < 0) {
      throw new RangeError("CRS no compatible. Use EPSG:4326, EPSG:4686 o EPSG:9377.");
    }
    let polygons;
    if (feature.type === "Polygon") {
      polygons = [feature.coordinates.map(closeRing)];
    } else if (feature.type === "MultiPolygon") {
      polygons = feature.coordinates.map(function (polygon) { return polygon.map(closeRing); });
    } else if (Array.isArray(feature.rings)) {
      polygons = ringsToPolygons(feature.rings);
    } else {
      throw new TypeError("Solo se admiten geometrías Polygon y MultiPolygon.");
    }
    if (!polygons.length || polygons.some(function (polygon) { return !polygon.length; })) {
      throw new TypeError("La geometría no contiene polígonos válidos.");
    }
    polygons.forEach(function (polygon) {
      polygon.slice(1).forEach(function (hole) {
        if (!pointInRing(hole[0], polygon[0])) {
          throw new TypeError("Un anillo interior está fuera de su polígono exterior.");
        }
      });
    });
    return { polygons: polygons, epsg: epsg };
  }

  function projectGeometry(geometry) {
    const polygons = geometry.polygons.map(function (polygon) {
      return polygon.map(function (ring) {
        return ring.map(function (coordinate) {
          if (geometry.epsg === TARGET_EPSG) {
            return { x: coordinate[0], y: coordinate[1] };
          }
          return projectLonLat(coordinate[0], coordinate[1]);
        });
      });
    });
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    polygons.forEach(function (polygon) {
      polygon.forEach(function (ring) {
        ring.forEach(function (point) {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        });
      });
    });
    const areaM2 = polygons.reduce(function (sum, polygon) {
      return sum + Math.max(0, Math.abs(signedArea(polygon[0])) -
        polygon.slice(1).reduce(function (holes, ring) {
          return holes + Math.abs(signedArea(ring));
        }, 0));
    }, 0);
    const perimeterM = polygons.reduce(function (sum, polygon) {
      return sum + polygon.reduce(function (perimeter, ring) {
        for (let index = 0; index < ring.length - 1; index += 1) {
          perimeter += Math.hypot(ring[index + 1].x - ring[index].x,
            ring[index + 1].y - ring[index].y);
        }
        return perimeter;
      }, 0);
    }, 0);
    if (!(areaM2 > 0) || ![minX, minY, maxX, maxY].every(Number.isFinite)) {
      throw new TypeError("La geometría proyectada no tiene un área válida.");
    }
    return {
      polygons: polygons,
      extent: { minX: minX, minY: minY, maxX: maxX, maxY: maxY },
      areaM2: areaM2,
      perimeterM: perimeterM
    };
  }

  function ringIntersections(ring, y) {
    const intersections = [];
    for (let index = 0; index < ring.length - 1; index += 1) {
      const first = ring[index];
      const last = ring[index + 1];
      if ((first.y <= y && last.y > y) || (last.y <= y && first.y > y)) {
        intersections.push(first.x + (y - first.y) * (last.x - first.x) / (last.y - first.y));
      }
    }
    intersections.sort(function (a, b) { return a - b; });
    return intersections;
  }

  function fillRingRow(mask, row, ring, grid) {
    const centerY = grid.originY + (row + 0.5) * grid.resolutionMeters;
    const intersections = ringIntersections(ring, centerY);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const firstColumn = Math.max(0, Math.ceil(
        (intersections[index] - grid.originX) / grid.resolutionMeters - 0.5
      ));
      const lastColumn = Math.min(grid.width - 1, Math.floor(
        (intersections[index + 1] - grid.originX) / grid.resolutionMeters - 0.5
      ));
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        mask[row * grid.width + column] = 1;
      }
    }
  }

  function createGrid(projected, resolutionMeters) {
    if (!Number.isFinite(resolutionMeters) || resolutionMeters < 50 || resolutionMeters > 50000) {
      throw new RangeError("La resolución raster debe estar entre 50 y 50.000 metros.");
    }
    const bounds = projected.extent;
    const originX = Math.floor(bounds.minX / resolutionMeters) * resolutionMeters;
    const originY = Math.floor(bounds.minY / resolutionMeters) * resolutionMeters;
    const width = Math.ceil((bounds.maxX - originX) / resolutionMeters);
    const height = Math.ceil((bounds.maxY - originY) / resolutionMeters);
    const count = width * height;
    if (!Number.isSafeInteger(count) || count > MAX_CELLS || width > 2000 || height > 2000) {
      throw new RangeError("La resolución genera más de 250.000 celdas; usa un tamaño mayor.");
    }
    const grid = {
      width: width,
      height: height,
      count: count,
      originX: originX,
      originY: originY,
      resolutionMeters: resolutionMeters,
      validMask: new Uint8Array(count),
      cellCoordinates: new Float64Array(count * 2)
    };
    for (let row = 0; row < height; row += 1) {
      const centerY = originY + (row + 0.5) * resolutionMeters;
      for (let column = 0; column < width; column += 1) {
        const index = row * width + column;
        grid.cellCoordinates[index * 2] = originX + (column + 0.5) * resolutionMeters;
        grid.cellCoordinates[index * 2 + 1] = centerY;
      }
    }
    projected.polygons.forEach(function (polygon) {
      const outerBounds = polygon.map(function (ring) {
        return ring.reduce(function (extent, point) {
          return {
            minY: Math.min(extent.minY, point.y),
            maxY: Math.max(extent.maxY, point.y)
          };
        }, { minY: Infinity, maxY: -Infinity });
      })[0];
      const firstRow = Math.max(0, Math.ceil(
        (outerBounds.minY - originY) / resolutionMeters - 0.5
      ));
      const lastRow = Math.min(height - 1, Math.floor(
        (outerBounds.maxY - originY) / resolutionMeters - 0.5
      ));
      for (let row = firstRow; row <= lastRow; row += 1) {
        fillRingRow(grid.validMask, row, polygon[0], grid);
        for (let hole = 1; hole < polygon.length; hole += 1) {
          const holeBounds = polygon[hole].reduce(function (extent, point) {
            return {
              minY: Math.min(extent.minY, point.y),
              maxY: Math.max(extent.maxY, point.y)
            };
          }, { minY: Infinity, maxY: -Infinity });
          if (centerYInBounds(originY, resolutionMeters, row, holeBounds)) {
            clearRingRow(grid.validMask, row, polygon[hole], grid);
          }
        }
      }
    });
    grid.validCount = grid.validMask.reduce(function (sum, value) { return sum + value; }, 0);
    if (grid.validCount === 0) {
      throw new RangeError("La resolución elegida no alcanza a representar celdas dentro del municipio.");
    }
    return grid;
  }

  function centerYInBounds(originY, resolution, row, bounds) {
    const y = originY + (row + 0.5) * resolution;
    return y >= bounds.minY && y <= bounds.maxY;
  }

  function clearRingRow(mask, row, ring, grid) {
    const centerY = grid.originY + (row + 0.5) * grid.resolutionMeters;
    const intersections = ringIntersections(ring, centerY);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const firstColumn = Math.max(0, Math.ceil(
        (intersections[index] - grid.originX) / grid.resolutionMeters - 0.5
      ));
      const lastColumn = Math.min(grid.width - 1, Math.floor(
        (intersections[index + 1] - grid.originX) / grid.resolutionMeters - 0.5
      ));
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        mask[row * grid.width + column] = 0;
      }
    }
  }

  function pointInGeometry(point, projected) {
    return projected.polygons.some(function (polygon) {
      if (!pointInRing([point.x, point.y], polygon[0])) return false;
      for (let hole = 1; hole < polygon.length; hole += 1) {
        if (pointInRing([point.x, point.y], polygon[hole])) return false;
      }
      return true;
    });
  }

  window.VonThunenMunicipalGeometry = Object.freeze({
    TARGET_EPSG: TARGET_EPSG,
    SOURCE_EPSG: SOURCE_EPSG,
    MAX_CELLS: MAX_CELLS,
    projectLonLat: projectLonLat,
    unproject: unproject,
    normalizeGeometry: normalizeGeometry,
    projectGeometry: projectGeometry,
    createGrid: createGrid,
    pointInGeometry: pointInGeometry,
    signedArea: signedArea
  });
}());
