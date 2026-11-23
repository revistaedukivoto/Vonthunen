(function () {
  "use strict";

  const DEFAULT_ACTIVITIES = [
    { id: "horticultura", name: "Horticultura", A: 500, t: 22, roadReduction: 25, color: "#e58b50" },
    { id: "lecheria", name: "Producción lechera", A: 380, t: 9, roadReduction: 35, color: "#6d9fc0" },
    { id: "cereales", name: "Cultivos de cereales", A: 220, t: 4, roadReduction: 15, color: "#b79b55" },
    { id: "ganaderia", name: "Ganadería extensiva", A: 120, t: 1.5, roadReduction: 10, color: "#73946d" }
  ];
  const MAX_DISTANCE = 80;
  const EPSILON = 1e-8;

  function calculateRent(activity, distance) {
    return activity.A - activity.t * distance;
  }

  function getDominantActivity(activities, distance) {
    let best = null;
    let bestRent = 0;
    activities.forEach(function (activity) {
      const rent = calculateRent(activity, distance);
      if (rent > bestRent + EPSILON) {
        best = activity;
        bestRent = rent;
      }
    });
    return best;
  }

  function getZones(activities, maxDistance) {
    if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
      throw new RangeError("La distancia máxima debe ser mayor que cero.");
    }

    const lines = activities.concat([{ id: null, A: 0, t: 0 }]);
    const breakpoints = [0, maxDistance];
    for (let first = 0; first < lines.length; first += 1) {
      for (let second = first + 1; second < lines.length; second += 1) {
        const slopeDifference = lines[first].t - lines[second].t;
        if (Math.abs(slopeDifference) <= EPSILON) continue;
        const intersection = (lines[first].A - lines[second].A) / slopeDifference;
        if (intersection > EPSILON && intersection < maxDistance - EPSILON) {
          breakpoints.push(intersection);
        }
      }
    }

    breakpoints.sort(function (a, b) { return a - b; });
    const uniqueBreakpoints = breakpoints.filter(function (value, index) {
      return index === 0 || Math.abs(value - breakpoints[index - 1]) > EPSILON;
    });
    const zones = [];

    for (let index = 0; index < uniqueBreakpoints.length - 1; index += 1) {
      const start = uniqueBreakpoints[index];
      const end = uniqueBreakpoints[index + 1];
      const winner = getDominantActivity(activities, (start + end) / 2);
      const id = winner ? winner.id : null;
      const previous = zones[zones.length - 1];
      if (previous && previous.id === id) {
        previous.end = end;
      } else {
        zones.push({ id: id, start: start, end: end });
      }
    }
    return zones;
  }

  function getActivityRange(zones, activityId) {
    const zone = zones.find(function (item) { return item.id === activityId; });
    return zone ? { start: zone.start, end: zone.end } : null;
  }

  window.VonThunenModel = Object.freeze({
    DEFAULT_ACTIVITIES: DEFAULT_ACTIVITIES,
    MAX_DISTANCE: MAX_DISTANCE,
    calculateRent: calculateRent,
    getDominantActivity: getDominantActivity,
    getZones: getZones,
    getActivityRange: getActivityRange
  });
}());
