(function () {
  "use strict";

  function interpretComparison(result, activities, roadIsActive) {
    const explanations = [];
    const changedArea = result.changedCells * result.cellAreaKm2;
    explanations.push(
      result.changedCells.toLocaleString("es-ES") + " de " +
      (result.changed.length).toLocaleString("es-ES") + " celdas (" +
      result.changedPercent.toFixed(1).replace(".", ",") + "%; " +
      changedArea.toFixed(2).replace(".", ",") + " km²) cambian de especialización " +
      "al comparar el territorio base con el escenario actual."
    );
    if (result.changedCells > 0 && roadIsActive) {
      explanations.push(
        "La carretera reduce el costo efectivo principalmente cerca de su trazado. " +
        "Las celdas que cambian de color son aquellas donde ese ahorro modifica la actividad " +
        "con mayor renta positiva."
      );
    } else if (result.changedCells === 0 && roadIsActive) {
      explanations.push(
        "La carretera reduce la distancia de costo en su zona de influencia, pero con estos " +
        "parámetros no basta para cambiar la actividad dominante de ninguna celda."
      );
    } else if (result.changedCells === 0) {
      explanations.push(
        "Las superficies antes y después coinciden porque no hay una carretera activa; " +
        "el mapa y las rentas representan los parámetros económicos y territoriales actuales."
      );
    }

    const changes = activities.map(function (activity, index) {
      const cells = result.countsAfter[index] - result.countsBefore[index];
      return { activity: activity, cells: cells };
    });
    const gains = changes.filter(function (item) { return item.cells > 0; })
      .sort(function (a, b) { return b.cells - a.cells; });
    const losses = changes.filter(function (item) { return item.cells < 0; })
      .sort(function (a, b) { return a.cells - b.cells; });
    if (gains.length) {
      explanations.push(gains[0].activity.name + " gana " +
        gains[0].cells.toLocaleString("es-ES") + " celdas netas; " +
        (losses.length
          ? losses[0].activity.name + " pierde " + Math.abs(losses[0].cells).toLocaleString("es-ES") + " celdas netas."
          : "ninguna actividad pierde superficie neta.")
      );
    } else if (losses.length) {
      explanations.push("Las actividades productivas pierden superficie; aumentan las celdas sin renta positiva.");
    } else {
      explanations.push("El número de celdas por actividad permanece igual al escenario de referencia.");
    }
    return explanations.join(" ");
  }

  window.VonThunenMapInterpretation = Object.freeze({
    interpretComparison: interpretComparison
  });
}());
