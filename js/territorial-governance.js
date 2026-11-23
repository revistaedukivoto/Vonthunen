(function () {
  "use strict";

  const app = window.VonThunenTerritorialApp;
  const regulation = window.VonThunenTerritorialRegulation;
  const defaults = window.VonThunenModel.DEFAULT_ACTIVITIES;
  const state = app.getState();
  const tableBody = document.getElementById("rule-matrix");
  const numberFormat = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

  function format(value) {
    return numberFormat.format(value);
  }

  function makeOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function addActivityOptions() {
    const activitySelect = document.getElementById("governance-activity");
    const cellClass = document.getElementById("cell-soil-class");
    regulation.SOIL_CLASSES.forEach(function (soil) {
      makeOption(cellClass, soil.id, soil.label);
    });
    defaults.forEach(function (activity) {
      makeOption(activitySelect, activity.id, activity.name);
    });
    activitySelect.value = defaults[state.activity].id;
  }

  function setStatus(id, message, isError) {
    const element = document.getElementById(id);
    element.textContent = message;
    element.classList.toggle("is-error", Boolean(isError));
  }

  function renderRuleMatrix() {
    while (tableBody.firstChild) tableBody.removeChild(tableBody.firstChild);
    regulation.SOIL_CLASSES.forEach(function (soil) {
      defaults.forEach(function (activity) {
        let rule = regulation.findRule(state.rules, soil.id, activity.id);
        if (!state.rules.some(function (item) { return item.soilClass === soil.id && item.activityId === activity.id; })) {
          rule = Object.assign({}, rule, {
            id: "missing-" + soil.id + "-" + activity.id,
            soilClass: soil.id,
            activityId: activity.id
          });
          state.rules.push(rule);
        }
        const row = document.createElement("tr");
        const soilCell = document.createElement("td");
        soilCell.textContent = soil.label;
        const activityCell = document.createElement("td");
        activityCell.textContent = activity.name;
        const typeCell = document.createElement("td");
        const typeSelect = document.createElement("select");
        typeSelect.setAttribute("aria-label", "Categoría de uso para " + activity.name + " en " + soil.label);
        regulation.USE_TYPES.forEach(function (type) { makeOption(typeSelect, type.id, type.label); });
        typeSelect.value = regulation.USE_TYPES.some(function (type) { return type.id === rule.useType; })
          ? rule.useType : "conditioned";
        typeSelect.addEventListener("change", function () {
          rule.useType = typeSelect.value;
          updateAfterRuleEdit();
        });
        typeCell.appendChild(typeSelect);

        const conditionCell = document.createElement("td");
        const condition = document.createElement("input");
        condition.type = "text";
        condition.maxLength = 180;
        condition.value = rule.condition || "";
        condition.placeholder = "Condiciones";
        condition.setAttribute("aria-label", "Condiciones del uso");
        condition.addEventListener("change", function () {
          rule.condition = condition.value.trim();
          updateAfterRuleEdit();
        });
        conditionCell.appendChild(condition);

        const sourceCell = document.createElement("td");
        const source = document.createElement("input");
        source.type = "text";
        source.maxLength = 120;
        source.value = rule.source || "";
        source.placeholder = "Fuente";
        source.setAttribute("aria-label", "Fuente de la regla");
        source.addEventListener("change", function () {
          rule.source = source.value.trim();
          updateAfterRuleEdit();
        });
        sourceCell.appendChild(source);

        const articleCell = document.createElement("td");
        const article = document.createElement("input");
        article.type = "text";
        article.maxLength = 80;
        article.value = rule.article || "";
        article.placeholder = "Artículo";
        article.setAttribute("aria-label", "Artículo de referencia");
        article.addEventListener("change", function () {
          rule.article = article.value.trim();
          updateAfterRuleEdit();
        });
        articleCell.appendChild(article);

        const verifiedCell = document.createElement("td");
        const verified = document.createElement("input");
        verified.type = "checkbox";
        verified.checked = Boolean(rule.verified);
        verified.setAttribute("aria-label", "Marcar fuente como verificada por quien usa el simulador");
        verified.addEventListener("change", function () {
          rule.verified = verified.checked;
          updateAfterRuleEdit();
        });
        verifiedCell.appendChild(verified);
        [soilCell, activityCell, typeCell, conditionCell, sourceCell, articleCell, verifiedCell]
          .forEach(function (cell) { row.appendChild(cell); });
        tableBody.appendChild(row);
      });
    });
  }

  function updateAfterRuleEdit() {
    setStatus("rule-file-status", "Reglas editadas localmente. Su validez depende del instrumento territorial aplicable.", false);
    app.render();
  }

  function renderReferences() {
    const container = document.getElementById("legal-reference-list");
    regulation.NATIONAL_REFERENCES.forEach(function (reference) {
      const item = document.createElement("article");
      item.className = "legal-reference";
      const link = document.createElement("a");
      link.href = reference.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = reference.title + " · " + reference.publisher;
      const details = document.createElement("p");
      details.textContent = reference.articles + " " + reference.status;
      item.appendChild(link);
      item.appendChild(details);
      container.appendChild(item);
    });
  }

  function renderEditor() {
    const cell = state.selectedCell.y * state.territory.size + state.selectedCell.x;
    document.getElementById("cell-soil-class").value =
      regulation.SOIL_CLASSES[state.territory.soilClass[cell]].id;
    document.getElementById("cell-protection").checked = Boolean(state.territory.protection[cell]);
    document.getElementById("cell-restriction").checked = Boolean(state.territory.restriction[cell]);
  }

  function createMetric(label, value, note) {
    const card = document.createElement("div");
    card.className = "governance-metric";
    const heading = document.createElement("span");
    heading.textContent = label;
    const amount = document.createElement("b");
    amount.textContent = value;
    card.appendChild(heading);
    card.appendChild(amount);
    if (note) {
      const caption = document.createElement("small");
      caption.textContent = note;
      card.appendChild(caption);
    }
    return card;
  }

  function renderComparison() {
    const results = document.getElementById("governance-summary");
    const metrics = document.getElementById("governance-metrics");
    const legend = document.getElementById("integrated-legend");
    const interpretation = document.getElementById("governance-interpretation");
    while (results.firstChild) results.removeChild(results.firstChild);
    while (metrics.firstChild) metrics.removeChild(metrics.firstChild);
    while (legend.firstChild) legend.removeChild(legend.firstChild);

    const before = state.regulationBefore;
    const after = state.regulationAfter;
    const counts = after.counts;
    const cellCount = state.after.count;
    const changed = new Int32Array(regulation.RESULT_STATES.length);
    let changedCells = 0;
    for (let cell = 0; cell < cellCount; cell += 1) {
      if (before.resultState[cell] !== after.resultState[cell]) {
        changedCells += 1;
        changed[after.resultState[cell]] += 1;
      }
    }
    const selected = defaults[state.activity];
    results.appendChild(createMetric("Celdas rentables", format(counts.economicRentable) + " / " + format(cellCount),
      format(counts.economicRentable / cellCount * 100) + "% del territorio"));
    results.appendChild(createMetric("Renta y uso admisible", format(counts.admissible),
      format(counts.admissible / cellCount * 100) + "% de celdas con actividad rentable admisible"));
    results.appendChild(createMetric("Conflicto con uso prohibido", format(counts.conflict),
      "Celdas donde el líder económico o la actividad evaluada tienen uso rentable prohibido"));
    results.appendChild(createMetric("Cambio integrado por carretera", format(changedCells),
      format(changedCells / cellCount * 100) + "% de celdas cambió de estado respecto al escenario sin carretera"));

    regulation.RESULT_STATES.forEach(function (resultState, index) {
      const item = document.createElement("span");
      item.className = "integrated-legend-item";
      const swatch = document.createElement("i");
      swatch.style.backgroundColor = resultState.color;
      const label = document.createElement("span");
      label.textContent = resultState.label;
      item.appendChild(swatch);
      item.appendChild(label);
      legend.appendChild(item);
    });

    const areaTitle = document.createElement("h4");
    areaTitle.textContent = "Renta económica vs. usos admisibles por actividad (celdas)";
    metrics.appendChild(areaTitle);
    defaults.forEach(function (activity, index) {
      const row = document.createElement("div");
      row.className = "governance-activity-row";
      const name = document.createElement("span");
      name.textContent = activity.name;
      const econ = document.createElement("span");
      econ.textContent = "Rentable: " + format(before.counts.activityEconomic[index]) + " → " +
        format(after.counts.activityEconomic[index]);
      const allowed = document.createElement("b");
      allowed.textContent = "Admisible rentable: " + format(before.counts.activityAdmissible[index]) +
        " → " + format(after.counts.activityAdmissible[index]);
      [name, econ, allowed].forEach(function (item) { row.appendChild(item); });
      metrics.appendChild(row);
    });
    const note = document.createElement("p");
    note.className = "governance-note";
    note.textContent = "La capa integrada evalúa " + selected.name +
      ". La superficie de renta y el mapa de especialización económica siguen siendo independientes de esta clasificación.";
    metrics.appendChild(note);

    const statements = [];
    statements.push("En este escenario, " + format(counts.economicRentable) + " de " + format(cellCount) +
      " celdas presentan al menos una renta positiva; " + format(counts.admissible) +
      " tienen además una actividad rentable clasificada como principal o compatible por la matriz cargada.");
    if (counts.conflict > 0) {
      statements.push(format(counts.conflict) +
        " celdas tienen un líder económico con uso prohibido o la actividad evaluada resulta rentable pero prohibida; la renta no equivale a autorización.");
    } else {
      statements.push("No se detectaron celdas rentables clasificadas como conflicto de uso prohibido bajo las reglas actuales.");
    }
    if (changedCells > 0) {
      statements.push("Con la carretera, " + format(changedCells) + " celdas (" +
        format(changedCells / cellCount * 100) + "%) cambiaron de estado integrado frente al mapa sin carretera.");
    } else {
      statements.push("La carretera no cambió la clasificación integrada bajo los parámetros actuales; puede modificar rentas sin cruzar un límite de uso.");
    }
    statements.push("Las reglas no verificadas y el territorio de muestra son hipotéticos. Contrasta cada uso con el POT/PBOT/EOT, sus mapas y actos vigentes.");
    interpretation.textContent = statements.join(" ");
  }

  function readFile(file, callback, failure) {
    const reader = new FileReader();
    reader.onload = function () { callback(String(reader.result || "")); };
    reader.onerror = function () { failure("No fue posible leer el archivo seleccionado."); };
    reader.readAsText(file);
  }

  function bindFileInputs() {
    document.getElementById("rule-file").addEventListener("change", function (event) {
      const file = event.target.files[0];
      if (!file) return;
      readFile(file, function (contents) {
        try {
          const parsed = regulation.parseMatrixFile(contents, file.name);
          const unknown = parsed.find(function (rule) {
            return !defaults.some(function (activity) { return activity.id === rule.activityId; });
          });
          if (unknown) throw new TypeError("Actividad desconocida en la regla " + unknown.id + ".");
          state.rules = parsed;
          renderRuleMatrix();
          setStatus("rule-file-status", "Matriz importada: " + parsed.length +
            " reglas. Las combinaciones faltantes se consideran condicionadas, no autorizadas.", false);
          app.render();
        } catch (error) {
          setStatus("rule-file-status", error.message, true);
        }
        event.target.value = "";
      }, function (message) {
        setStatus("rule-file-status", message, true);
        event.target.value = "";
      });
    });
    document.getElementById("territory-file").addEventListener("change", function (event) {
      const file = event.target.files[0];
      if (!file) return;
      readFile(file, function (contents) {
        try {
          const result = regulation.parseGeoJson(contents, state.territory);
          state.territory = result.territory;
          setStatus("territory-file-status", result.featureCount + " polígonos leídos; " +
            result.affectedCells + " impactos celda-polígono. Coordenadas ajustadas a la cuadrícula sin transformación CRS.", false);
          app.render();
        } catch (error) {
          setStatus("territory-file-status", error.message, true);
        }
        event.target.value = "";
      }, function (message) {
        setStatus("territory-file-status", message, true);
        event.target.value = "";
      });
    });
  }

  function downloadRules() {
    const documentData = {
      metadata: {
        municipality: document.getElementById("territory-municipality").value,
        instrument: document.getElementById("territory-instrument").value,
        act: document.getElementById("territory-act").value,
        date: document.getElementById("territory-date").value,
        notice: "La clasificación y reglas requieren verificación con el instrumento territorial vigente."
      },
      rules: state.rules
    };
    const blob = new Blob([JSON.stringify(documentData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "matriz-ordenamiento-territorial.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function bindEditors() {
    document.getElementById("governance-activity").addEventListener("change", function (event) {
      const index = defaults.findIndex(function (activity) { return activity.id === event.target.value; });
      if (index >= 0) {
        document.getElementById("raster-activity").value = String(index);
        document.getElementById("raster-activity").dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    document.getElementById("cell-soil-class").addEventListener("change", function (event) {
      const cell = state.selectedCell.y * state.territory.size + state.selectedCell.x;
      state.territory.soilClass[cell] = regulation.SOIL_CLASSES.findIndex(function (soil) {
        return soil.id === event.target.value;
      });
      state.territory.source = "Editado por el usuario sobre el escenario didáctico.";
      app.render();
    });
    [["cell-protection", "protection"], ["cell-restriction", "restriction"]].forEach(function (pair) {
      document.getElementById(pair[0]).addEventListener("change", function (event) {
        const cell = state.selectedCell.y * state.territory.size + state.selectedCell.x;
        state.territory[pair[1]][cell] = event.target.checked ? 1 : 0;
        state.territory.source = "Editado por el usuario sobre el escenario didáctico.";
        app.render();
      });
    });
    document.getElementById("reset-territory").addEventListener("click", function () {
      state.territory = regulation.createDefaultTerritory(state.territory.size);
      setStatus("territory-file-status", "Restaurado el escenario didáctico hipotético.", false);
      app.render();
    });
    document.getElementById("download-rules").addEventListener("click", downloadRules);
    document.querySelectorAll(".governance-meta input, .governance-meta select").forEach(function (input) {
      input.addEventListener("change", function () {
        if (document.getElementById("territory-instrument").value !== "demo") {
          setStatus("rule-file-status", "Metadatos declarados por el usuario; no validan ni certifican el instrumento.", false);
        }
      });
    });
    window.addEventListener("territory:render", function () {
      renderEditor();
      renderComparison();
    });
    window.addEventListener("territory:reset", function () {
      state.territory = regulation.createDefaultTerritory(state.territory.size);
      state.rules = regulation.createDefaultRules(defaults);
      document.getElementById("territory-municipality").value = "Escenario didáctico hipotético";
      document.getElementById("territory-instrument").value = "demo";
      document.getElementById("territory-act").value = "";
      document.getElementById("territory-date").value = "";
      renderRuleMatrix();
      setStatus("rule-file-status", "La matriz actual es hipotética y editable.", false);
      setStatus("territory-file-status", "Escenario didáctico hipotético restaurado.", false);
    });
  }

  addActivityOptions();
  renderRuleMatrix();
  renderReferences();
  bindFileInputs();
  bindEditors();
  app.render();
}());
