(function () {
  "use strict";

  const SOIL_CLASSES = [
    { id: "urban", label: "Suelo urbano", color: "#b78383" },
    { id: "rural", label: "Suelo rural", color: "#d7c68e" },
    { id: "expansion", label: "Suelo de expansión", color: "#d5a467" }
  ];
  const USE_TYPES = [
    { id: "principal", label: "Principal" },
    { id: "compatible", label: "Compatible o complementario" },
    { id: "conditioned", label: "Condicionado o restringido" },
    { id: "prohibited", label: "Prohibido" }
  ];
  const RESULT_STATES = [
    { id: "admissible", label: "Rentable y admisible", color: "#347953" },
    { id: "conditioned", label: "Rentable y condicionado", color: "#e5aa50" },
    { id: "prohibited", label: "Rentable, pero prohibido", color: "#c75d56" },
    { id: "not-profitable", label: "Admisible, no rentable", color: "#78a5bd" },
    { id: "no-activity", label: "Sin actividad rentable", color: "#e7ebe5" }
  ];
  const NATIONAL_REFERENCES = [
    {
      id: "ley-388",
      title: "Ley 388 de 1997",
      publisher: "Función Pública · Gestor Normativo",
      url: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=339",
      articles: "Arts. 30–35: clasificación del territorio y suelo de protección; art. 8: acción urbanística y regulación específica de usos.",
      status: "Fuente oficial consultada; el simulador no certifica vigencia ni sustituye el POT."
    },
    {
      id: "decreto-1077",
      title: "Decreto 1077 de 2015",
      publisher: "Función Pública · versión integrada",
      url: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=77216",
      articles: "Decreto Único Reglamentario del sector Vivienda, Ciudad y Territorio; las disposiciones aplicables dependen del instrumento y sus modificaciones.",
      status: "Consultar versión consolidada y actos locales aplicables antes de interpretar el escenario."
    },
    {
      id: "ley-2294",
      title: "Ley 2294 de 2023",
      publisher: "Función Pública · Gestor Normativo",
      url: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=209510",
      articles: "Art. 32 modifica el art. 10 de la Ley 388 de 1997 sobre determinantes de ordenamiento territorial.",
      status: "Verificar texto vigente, decisiones judiciales y reglamentación concordante."
    }
  ];

  function createDefaultTerritory(size) {
    const soilClass = new Uint8Array(size * size);
    const protection = new Uint8Array(size * size);
    const restriction = new Uint8Array(size * size);
    const expansionClass = 2;

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = y * size + x;
        const dx = x - size / 2;
        const dy = y - size / 2;
        const radius = Math.hypot(dx, dy);
        soilClass[index] = radius < size * 0.095 ? 0 : 1;
        if (x > size * 0.57 && x < size * 0.75 && y > size * 0.39 && y < size * 0.61) {
          soilClass[index] = expansionClass;
        }
        const ridge = Math.abs(y - (size * 0.19 + x * 0.42));
        if ((x > size * 0.1 && x < size * 0.88 && ridge < size * 0.045) ||
            (x - size * 0.25) ** 2 + (y - size * 0.78) ** 2 < (size * 0.09) ** 2) {
          protection[index] = 1;
        }
        if ((x > size * 0.69 && x < size * 0.94 && y > size * 0.72) ||
            (x < size * 0.18 && y < size * 0.16)) {
          restriction[index] = 1;
        }
      }
    }
    return {
      size: size,
      soilClass: soilClass,
      protection: protection,
      restriction: restriction,
      source: "Escenario didáctico hipotético; geometrías sin valor geográfico ni normativo real."
    };
  }

  function createDefaultRules(activities) {
    const useBySoil = {
      urban: ["prohibited", "prohibited", "prohibited", "prohibited"],
      rural: ["compatible", "principal", "principal", "conditioned"],
      expansion: ["conditioned", "conditioned", "conditioned", "prohibited"]
    };
    const notes = {
      urban: "Regla de demostración; verificar el POT local.",
      rural: "Clasificación rural no implica permiso automático; verificar el POT local.",
      expansion: "Condición hipotética sujeta al instrumento municipal."
    };
    const rules = [];
    SOIL_CLASSES.forEach(function (soil) {
      activities.forEach(function (activity, activityIndex) {
        const useType = useBySoil[soil.id][activityIndex];
        rules.push({
          id: "demo-" + soil.id + "-" + activity.id,
          soilClass: soil.id,
          activityId: activity.id,
          useType: useType,
          condition: useType === "conditioned"
            ? soil.id === "rural"
              ? "Requiere revisar restricciones y condiciones del POT."
              : "Requiere instrumento y autorización aplicables."
            : "",
          source: "Escenario didáctico municipal hipotético",
          article: "",
          verified: false,
          observation: notes[soil.id],
          protectionUseType: "prohibited",
          protectionCondition: "Área de protección didáctica; verificar zonificación y régimen aplicable.",
          restrictionUseType: "conditioned",
          restrictionCondition: "Verificar estudios de amenaza, riesgo y determinantes aplicables."
        });
      });
    });
    return rules;
  }

  function findRule(rules, soilClass, activityId) {
    const rule = rules.find(function (candidate) {
      return candidate.soilClass === soilClass && candidate.activityId === activityId;
    });
    if (rule && USE_TYPES.some(function (item) { return item.id === rule.useType; })) return rule;
    return {
      useType: "conditioned",
      condition: "No hay una regla configurada para esta combinación; no se presume permiso.",
      source: "Sin regla cargada",
      article: "",
      verified: false,
      observation: "Se aplica el criterio conservador: uso condicionado."
    };
  }

  function getUsageTypeForCell(raster, territory, rules, activities, cell, activityIndex) {
    const soilClass = SOIL_CLASSES[territory.soilClass[cell]].id;
    const rule = Object.assign({}, findRule(rules, soilClass, activities[activityIndex].id));
    const candidates = [{ type: rule.useType, condition: rule.condition || "" }];
    if (territory.protection[cell]) {
      candidates.push({
        type: rule.protectionUseType || "conditioned",
        condition: rule.protectionCondition || "Verificar régimen del área de protección."
      });
    }
    if (territory.restriction[cell]) {
      candidates.push({
        type: rule.restrictionUseType || "conditioned",
        condition: rule.restrictionCondition || "Verificar restricciones territoriales aplicables."
      });
    }
    const priority = { principal: 0, compatible: 1, conditioned: 2, prohibited: 3 };
    const effective = candidates.reduce(function (strictest, candidate) {
      return priority[candidate.type] > priority[strictest.type] ? candidate : strictest;
    });
    rule.useType = effective.type;
    rule.condition = effective.condition;
    return rule;
  }

  function evaluateRaster(raster, territory, rules, activities, selectedActivityIndex) {
    const selectedIndex = selectedActivityIndex === undefined ? 0 : selectedActivityIndex;
    if (!raster || !Number.isInteger(raster.count) || !raster.rentSurfaces ||
        !territory || territory.size * territory.size !== raster.count ||
        territory.soilClass.length !== raster.count ||
        territory.protection.length !== raster.count ||
        territory.restriction.length !== raster.count ||
        !Array.isArray(activities) || !Array.isArray(rules) ||
        raster.rentSurfaces.length !== activities.length ||
        !Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= activities.length) {
      throw new TypeError("Las superficies raster, las capas territoriales y las actividades deben tener dimensiones compatibles.");
    }
    for (let cell = 0; cell < raster.count; cell += 1) {
      if (territory.soilClass[cell] < 0 || territory.soilClass[cell] >= SOIL_CLASSES.length) {
        throw new RangeError("La celda " + cell + " tiene una clase de suelo fuera del catálogo.");
      }
    }
    const count = raster.count;
    const economicLeader = new Int8Array(count);
    const admissibleLeader = new Int8Array(count);
    const selectedUseType = new Int8Array(count);
    const resultState = new Int8Array(count);
    const economicRentable = new Uint8Array(count);
    const admissible = new Uint8Array(count);
    const conditioned = new Uint8Array(count);
    const prohibited = new Uint8Array(count);
    const protectedCell = new Uint8Array(count);
    const restrictedCell = new Uint8Array(count);
    const conditions = new Array(count);
    economicLeader.fill(-1);
    admissibleLeader.fill(-1);
    selectedUseType.fill(-1);

    const counts = {
      economicRentable: 0,
      admissible: 0,
      conditioned: 0,
      prohibited: 0,
      notProfitable: 0,
      noActivity: 0,
      conflict: 0,
      integratedStates: new Int32Array(RESULT_STATES.length),
      activityAdmissible: new Int32Array(activities.length),
      activityEconomic: new Int32Array(activities.length),
      activityConditioned: new Int32Array(activities.length),
      activityProhibited: new Int32Array(activities.length)
    };

    for (let cell = 0; cell < count; cell += 1) {
      let bestRent = 0;
      let bestActivity = -1;
      let bestAllowedRent = 0;
      let bestAllowedActivity = -1;
      let economicConflict = false;
      const soilClass = SOIL_CLASSES[territory.soilClass[cell]].id;
      const isProtected = territory.protection[cell] === 1;
      const isRestricted = territory.restriction[cell] === 1;
      protectedCell[cell] = isProtected ? 1 : 0;
      restrictedCell[cell] = isRestricted ? 1 : 0;

      for (let activityIndex = 0; activityIndex < activities.length; activityIndex += 1) {
        const rent = raster.rentSurfaces[activityIndex][cell];
        if (rent > bestRent) {
          bestRent = rent;
          bestActivity = activityIndex;
        }
        if (rent <= 0) continue;

        const activity = activities[activityIndex];
        const rule = getUsageTypeForCell(raster, territory, rules, activities, cell, activityIndex);
        const useType = rule.useType;

        if ((useType === "principal" || useType === "compatible") && rent > bestAllowedRent) {
          bestAllowedRent = rent;
          bestAllowedActivity = activityIndex;
        }
      }

      economicLeader[cell] = bestActivity;
      admissibleLeader[cell] = bestAllowedActivity;
      if (bestActivity >= 0) {
        economicRentable[cell] = 1;
        counts.economicRentable += 1;
        counts.activityEconomic[bestActivity] += 1;
      }
      if (bestAllowedActivity >= 0) {
        admissible[cell] = 1;
        counts.admissible += 1;
        counts.activityAdmissible[bestAllowedActivity] += 1;
      }

      if (bestActivity >= 0) {
        const economicRule = getUsageTypeForCell(raster, territory, rules, activities, cell, bestActivity);
        if (economicRule.useType === "prohibited") {
          economicConflict = true;
        }
      }

      const selected = getUsageTypeForCell(raster, territory, rules, activities, cell, selectedIndex);
      const selectedRent = raster.rentSurfaces[selectedIndex][cell];
      const selectedIsAllowed = selected.useType === "principal" || selected.useType === "compatible";
      selectedUseType[cell] = USE_TYPES.findIndex(function (item) { return item.id === selected.useType; });
      if (selectedRent > 0 && selectedIsAllowed) {
        resultState[cell] = 0;
      } else if (selectedRent > 0 && selected.useType === "conditioned") {
        resultState[cell] = 1;
        conditioned[cell] = 1;
        counts.conditioned += 1;
      } else if (selectedRent > 0 && selected.useType === "prohibited") {
        prohibited[cell] = 1;
        counts.prohibited += 1;
        resultState[cell] = 2;
      } else if (selectedIsAllowed) {
        resultState[cell] = 3;
        counts.notProfitable += 1;
      } else {
        resultState[cell] = 4;
        counts.noActivity += 1;
      }
      if (economicConflict || (selectedRent > 0 && selected.useType === "prohibited")) {
        counts.conflict += 1;
      }
      counts.integratedStates[resultState[cell]] += 1;
      if (selected.useType === "conditioned") counts.activityConditioned[selectedIndex] += 1;
      if (selected.useType === "prohibited") counts.activityProhibited[selectedIndex] += 1;
      conditions[cell] = selected.condition || "";
    }

    return {
      economicLeader: economicLeader,
      admissibleLeader: admissibleLeader,
      selectedUseType: selectedUseType,
      resultState: resultState,
      economicRentable: economicRentable,
      admissible: admissible,
      conditioned: conditioned,
      prohibited: prohibited,
      protected: protectedCell,
      restricted: restrictedCell,
      counts: counts,
      conditions: conditions,
      selectedActivityIndex: selectedIndex
    };
  }

  function parseMatrixFile(contents, fileName) {
    let rows;
    if (/\.json$/i.test(fileName)) {
      const parsed = JSON.parse(contents);
      if (!parsed || !Array.isArray(parsed.rules)) {
        throw new TypeError("El JSON debe contener una lista `rules` de reglas de uso.");
      }
      rows = parsed.rules;
    } else {
      const table = parseCsv(contents.replace(/^\uFEFF/, ""));
      if (!table.length) throw new TypeError("El CSV está vacío.");
      const headers = table[0].map(function (value) { return value.trim(); });
      ["soilClass", "activityId", "useType"].forEach(function (field) {
        if (headers.indexOf(field) < 0) throw new TypeError("Falta la columna obligatoria `" + field + "`.");
      });
      rows = table.slice(1).filter(function (row) {
        return row.some(function (value) { return value.trim() !== ""; });
      }).map(function (row, rowIndex) {
        const record = {};
        headers.forEach(function (header, column) { record[header] = (row[column] || "").trim(); });
        record.id = record.id || "csv-" + rowIndex;
        if (record.verified !== undefined) record.verified = record.verified.toLowerCase() === "true";
        return record;
      });
    }

    if (!rows.length) throw new TypeError("La matriz no contiene reglas.");
    const seen = new Set();
    return rows.map(function (row, index) {
      if (!row || typeof row !== "object") throw new TypeError("La regla " + (index + 1) + " no es un objeto válido.");
      const id = row.id || "rule-" + index;
      const key = row.soilClass + ":" + row.activityId;
      if (!SOIL_CLASSES.some(function (item) { return item.id === row.soilClass; })) {
        throw new TypeError("Clasificación de suelo no válida en la regla " + id + ".");
      }
      if (!row.activityId || !USE_TYPES.some(function (item) { return item.id === row.useType; })) {
        throw new TypeError("Actividad o categoría de uso no válida en la regla " + id + ".");
      }
      if (seen.has(key)) throw new TypeError("Regla duplicada para " + key + ".");
      seen.add(key);
      ["protectionUseType", "restrictionUseType"].forEach(function (field) {
        if (row[field] !== undefined && !USE_TYPES.some(function (type) { return type.id === row[field]; })) {
          throw new TypeError("Categoría " + field + " no válida en la regla " + id + ".");
        }
      });
      ["condition", "source", "article", "observation", "protectionCondition", "restrictionCondition"]
        .forEach(function (field) {
          if (row[field] !== undefined && typeof row[field] !== "string") {
            throw new TypeError("El campo " + field + " debe ser texto en la regla " + id + ".");
          }
        });
      if (row.verified !== undefined && typeof row.verified !== "boolean" &&
          String(row.verified).toLowerCase() !== "true" && String(row.verified).toLowerCase() !== "false") {
        throw new TypeError("El campo verified de la regla " + id + " debe ser booleano.");
      }
      return Object.assign({
        condition: "",
        source: "Importado por el usuario",
        article: "",
        verified: false,
        observation: "",
        protectionUseType: "conditioned",
        protectionCondition: "Verificar el régimen del área protegida.",
        restrictionUseType: "conditioned",
        restrictionCondition: "Verificar las restricciones territoriales aplicables."
      }, row, {
        id: id,
        verified: row.verified === true || String(row.verified).toLowerCase() === "true"
      });
    });
  }

  function parseCsv(contents) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < contents.length; index += 1) {
      const character = contents[index];
      if (quoted) {
        if (character === '"' && contents[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
      } else if (character === '"' && field.length === 0) {
        quoted = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && contents[index + 1] === "\n") index += 1;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else {
        field += character;
      }
    }
    if (quoted) throw new TypeError("El CSV contiene un campo entre comillas sin cerrar.");
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function normalizeGeoJsonClass(value) {
    const aliases = {
      urban: "urban", urbano: "urban",
      rural: "rural",
      expansion: "expansion", "expansión": "expansion", "expansion urbana": "expansion"
    };
    return aliases[String(value || "").toLowerCase()] || null;
  }

  function parseGeoJsonFlag(value, propertyName, featureIndex) {
    if (value === undefined) return false;
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    const normalized = String(value).trim().toLowerCase();
    if (["true", "1", "si", "sí"].indexOf(normalized) >= 0) return true;
    if (["false", "0", "no"].indexOf(normalized) >= 0) return false;
    throw new TypeError("La propiedad " + propertyName + " debe ser booleana en la entidad " + featureIndex + ".");
  }

  function collectCoordinates(geometry, coordinates) {
    if (!Array.isArray(geometry)) throw new TypeError("Geometría GeoJSON inválida.");
    if (geometry.length >= 2 && Number.isFinite(geometry[0]) && Number.isFinite(geometry[1])) {
      coordinates.push([geometry[0], geometry[1]]);
      return;
    }
    geometry.forEach(function (child) { collectCoordinates(child, coordinates); });
  }

  function pointInRing(x, y, ring) {
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
      const first = ring[index];
      const last = ring[previous];
      const intersects = ((first[1] > y) !== (last[1] > y)) &&
        (x < (last[0] - first[0]) * (y - first[1]) / (last[1] - first[1]) + first[0]);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function pointInPolygon(x, y, polygon) {
    if (!polygon.length || !pointInRing(x, y, polygon[0])) return false;
    for (let ring = 1; ring < polygon.length; ring += 1) {
      if (pointInRing(x, y, polygon[ring])) return false;
    }
    return true;
  }

  function parseGeoJson(contents, baseTerritory) {
    const geojson = JSON.parse(contents);
    if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
      throw new TypeError("El GeoJSON debe ser una FeatureCollection.");
    }
    if (!geojson.features.length) throw new TypeError("La FeatureCollection no contiene polígonos.");
    const features = [];
    const allCoordinates = [];
    geojson.features.forEach(function (feature, index) {
      if (!feature || feature.type !== "Feature" || !feature.geometry ||
          (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) {
        throw new TypeError("La entidad " + (index + 1) + " debe ser Polygon o MultiPolygon.");
      }
      const coordinates = [];
      collectCoordinates(feature.geometry.coordinates, coordinates);
      if (coordinates.length < 3) throw new TypeError("El polígono " + (index + 1) + " no tiene coordenadas suficientes.");
      allCoordinates.push.apply(allCoordinates, coordinates);
      const properties = feature.properties || {};
      const soilClass = normalizeGeoJsonClass(properties.soilClass || properties.clase_suelo);
      const hasSoil = Boolean(properties.soilClass || properties.clase_suelo);
      if (hasSoil && !soilClass) throw new TypeError("Clase de suelo desconocida en la entidad " + (index + 1) + ".");
      const hasProtection = properties.protection !== undefined || properties.proteccion !== undefined;
      const hasRestriction = properties.restriction !== undefined || properties.restriccion !== undefined;
      const protection = parseGeoJsonFlag(
        properties.protection !== undefined ? properties.protection : properties.proteccion,
        "protection", index + 1);
      const restriction = parseGeoJsonFlag(
        properties.restriction !== undefined ? properties.restriction : properties.restriccion,
        "restriction", index + 1);
      if (!hasSoil && !hasProtection && !hasRestriction) {
        throw new TypeError("La entidad " + (index + 1) + " debe incluir soilClass, protection o restriction.");
      }
      features.push({
        geometry: feature.geometry,
        soilClass: soilClass,
        hasSoil: hasSoil,
        protection: protection,
        hasProtection: hasProtection,
        restriction: restriction,
        hasRestriction: hasRestriction
      });
    });

    const minX = Math.min.apply(null, allCoordinates.map(function (point) { return point[0]; }));
    const maxX = Math.max.apply(null, allCoordinates.map(function (point) { return point[0]; }));
    const minY = Math.min.apply(null, allCoordinates.map(function (point) { return point[1]; }));
    const maxY = Math.max.apply(null, allCoordinates.map(function (point) { return point[1]; }));
    const scale = Math.min((baseTerritory.size - 1) / Math.max(maxX - minX, 1e-12),
      (baseTerritory.size - 1) / Math.max(maxY - minY, 1e-12));
    const offsetX = (baseTerritory.size - 1 - (maxX - minX) * scale) / 2;
    const offsetY = (baseTerritory.size - 1 - (maxY - minY) * scale) / 2;
    function toSource(x, y) {
      return [(x - offsetX) / scale + minX, (y - offsetY) / scale + minY];
    }
    function featureContains(feature, x, y) {
      const coordinate = toSource(x, y);
      const polygons = feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
      return polygons.some(function (polygon) { return pointInPolygon(coordinate[0], coordinate[1], polygon); });
    }

    const territory = {
      size: baseTerritory.size,
      soilClass: new Uint8Array(baseTerritory.soilClass),
      protection: new Uint8Array(baseTerritory.protection),
      restriction: new Uint8Array(baseTerritory.restriction),
      source: "Capa importada GeoJSON; extensión ajustada al raster sin reproyección de coordenadas."
    };
    let affectedCells = 0;
    for (let y = 0; y < territory.size; y += 1) {
      for (let x = 0; x < territory.size; x += 1) {
        const cell = y * territory.size + x;
        features.forEach(function (feature) {
          if (!featureContains(feature, x, y)) return;
          affectedCells += 1;
          if (feature.hasSoil) {
            territory.soilClass[cell] = SOIL_CLASSES.findIndex(function (item) { return item.id === feature.soilClass; });
          }
          if (feature.hasProtection) territory.protection[cell] = feature.protection ? 1 : 0;
          if (feature.hasRestriction) territory.restriction[cell] = feature.restriction ? 1 : 0;
        });
      }
    }
    return { territory: territory, affectedCells: affectedCells, featureCount: features.length };
  }

  window.VonThunenTerritorialRegulation = Object.freeze({
    SOIL_CLASSES: SOIL_CLASSES,
    USE_TYPES: USE_TYPES,
    RESULT_STATES: RESULT_STATES,
    NATIONAL_REFERENCES: NATIONAL_REFERENCES,
    createDefaultTerritory: createDefaultTerritory,
    createDefaultRules: createDefaultRules,
    findRule: findRule,
    evaluateRaster: evaluateRaster,
    getUsageTypeForCell: getUsageTypeForCell,
    parseMatrixFile: parseMatrixFile,
    parseGeoJson: parseGeoJson
  });
}());
