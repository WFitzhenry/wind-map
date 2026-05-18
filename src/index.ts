import mapboxgl, { Map } from "mapbox-gl";

import { parseWind } from "./core/parseWind";
import { VectorField } from "./core/vectorField";
import { ParticleSystem } from "./core/particleSystem";
import {
  observationsToVectorField,
  Observation,
} from "./core/taxiObservationsVectorField";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// ---- Porto bounds for taxi data ----
const PORTO_BOUNDS = {
  latMin: 41.03,
  latMax: 41.315,
  lonMin: -8.74,
  lonMax: -8.3,
};

// ---- Beijing bounds for taxi data ----
const BEIJING_BOUNDS = {
  latMin: 39.2,
  latMax: 40.7,
  lonMin: 115.5,
  lonMax: 117.55,
};

// ---- Guangzhou bounds for taxi data ----
const GUANG_BOUNDS = {
  latMin: 21.6,
  latMax: 23.2,
  lonMin: 113.4,
  lonMax: 114.4,
};

// ---- Athens bounds for taxi data ----
const ATHENS_BOUNDS = {
  latMin: 37.7,
  latMax: 38.1,
  lonMin: 23.5,
  lonMax: 24.0,
};

// ---- Maritime bounds (USA-focused) ----
const MARITIME_BOUNDS = {
  latMin: 12.5,
  latMax: 47.0,
  lonMin: -160.0,
  lonMax: -65.0,
};

const MARITIME_SPEED_MULTIPLIER = 120;

const EUROPE_BOUNDS = {
  latMin: 39.105,
  latMax: 60.215,
  lonMin: -2.74,
  lonMax: -20.52,
};

type TaxiFieldHeader = {
  nx: number;
  ny: number;
  latMin: number;
  lonMin: number;
  latStep: number;
  lonStep: number;
};

type TaxiFieldData = {
  header: TaxiFieldHeader;
  data: {
    u: number[];
    v: number[];
    count?: number[];
  };
};

async function main() {
  const PORTO_GRID_DEFAULT = 120;
  const PORTO_GRID_MIN = 40;
  const PORTO_GRID_MAX = 420;
  const ATHENS_GRID_DEFAULT = 120;
  const ATHENS_GRID_MIN = 40;
  const ATHENS_GRID_MAX = 420;
  const MARITIME_GRID_DEFAULT = 220;
  const MARITIME_GRID_MIN = 100;
  const MARITIME_GRID_MAX = 1700;

  const mapContainer = document.getElementById("map");
  if (!mapContainer) throw new Error("Map container not found");

  const map = new Map({
    container: mapContainer,
    projection: "naturalEarth",
    style: "mapbox://styles/mapbox/standard-satellite",
    center: [-8.7, 41.16],
    zoom: 4,
  });

  // ---- Canvas setup ----
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.pointerEvents = "none";
  mapContainer.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;

  const trailCanvas = document.createElement("canvas");
  const trailCtx = trailCanvas.getContext("2d")!;

  // ---- Control state ----
  const controls = {
    dataSource: "wind",
    layer: "standard-satellite",
    speedScale: 0.8,
    taxiSpeedScale: 0.005,
    disableAutoGrid: false,
    gridStepValue: PORTO_GRID_DEFAULT,
    showGrid: false,
    showDensity: false,
    densityLogScale: 1,
    numParticles: 12000,
    maxAge: 1200,
  };

  // ---- Control panel ----
  const panel = document.createElement("div");
  Object.assign(panel.style, {
    position: "absolute",
    top: "10px",
    right: "10px",
    zIndex: "10",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "10px",
    background: "rgba(0,0,0,0.7)",
    borderRadius: "6px",
    fontFamily: "monospace",
  });
  mapContainer.appendChild(panel);

  function labeled(label: string, el: HTMLElement) {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "2px";

    const l = document.createElement("label");
    l.textContent = label;
    l.style.color = "white";
    l.style.fontSize = "11px";

    wrap.appendChild(l);
    wrap.appendChild(el);
    return wrap;
  }

  function styledSelect() {
    const s = document.createElement("select");
    Object.assign(s.style, {
      padding: "4px",
      fontSize: "11px",
      background: "black",
      color: "white",
      border: "1px solid #555",
    });
    return s;
  }

  function styledInput(type: string) {
    const i = document.createElement("input");
    i.type = type;
    Object.assign(i.style, {
      fontSize: "11px",
    });
    return i;
  }

  // ---- Data source ----
  const dataSelect = styledSelect();
  [
    "wind",
    "maritime",
    "taxi-porto",
    "taxi-athens",
    "athens-2",
    "taxi-beijing-morning",
    "taxi-beijing-midday",
    "taxi-beijing-evening",
    "taxi-shenzhen",
    "taxi-shenzhen-afternoon",
    "taxi-shenzhen-morning",
  ].forEach((v) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    dataSelect.appendChild(o);
  });

  panel.appendChild(labeled("Data Source", dataSelect));

  // ---- Layer ----
  const layerSelect = styledSelect();
  [
    "standard-satellite",
    "light-v11",
    "dark-v11",
    "navigation-night-v1",
    "satellite-v9",
  ].forEach((s) => {
    const o = document.createElement("option");
    o.value = s;
    o.textContent = s;
    layerSelect.appendChild(o);
  });

  layerSelect.onchange = () => {
    controls.layer = layerSelect.value;
    map.setStyle(`mapbox://styles/mapbox/${controls.layer}`);
  };

  panel.appendChild(labeled("Layer", layerSelect));

  // ---- Speed ----
  const windSpeedInput = styledInput("range");
  windSpeedInput.min = "0.1";
  windSpeedInput.max = "2";
  windSpeedInput.step = "0.1";
  windSpeedInput.value = String(controls.speedScale);

  windSpeedInput.oninput = () => {
    controls.speedScale = Number(windSpeedInput.value);
  };

  const windSpeedWrap = labeled("Wind Speed", windSpeedInput);
  panel.appendChild(windSpeedWrap);

  // ---- Taxi Speed ----
  const taxiSpeedInput = styledInput("range");
  taxiSpeedInput.min = "0.001";
  taxiSpeedInput.max = "0.010";
  taxiSpeedInput.step = "0.001";
  taxiSpeedInput.value = String(controls.taxiSpeedScale);

  const taxiSpeedMin = Number(taxiSpeedInput.min);
  const taxiSpeedMax = Number(taxiSpeedInput.max);
  const taxiSpeedReferenceZoom = 4;
  let taxiSpeedBase = controls.taxiSpeedScale;

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function applyTaxiSpeedForZoom() {
    const zoom = map.getZoom();
    const zoomFactor = Math.pow(2, (taxiSpeedReferenceZoom - zoom) * 0.35);
    const adjusted = clamp(
      taxiSpeedBase * zoomFactor,
      taxiSpeedMin,
      taxiSpeedMax,
    );
    controls.taxiSpeedScale = adjusted;
    taxiSpeedInput.value = adjusted.toFixed(3);
  }

  taxiSpeedInput.oninput = () => {
    taxiSpeedBase = Number(taxiSpeedInput.value);
    applyTaxiSpeedForZoom();
  };

  const taxiSpeedWrap = labeled("Taxi Speed", taxiSpeedInput);
  taxiSpeedWrap.style.display = "none";
  panel.appendChild(taxiSpeedWrap);

  function isDynamicGridSource(source: string) {
    return (
      source === "taxi-porto" ||
      source === "taxi-athens" ||
      source === "athens-2" ||
      source === "maritime"
    );
  }

  function isTaxiLikeSource(source: string) {
    return source.startsWith("taxi") || source === "athens-2";
  }

  function getGridDefaultsForSource(source: string) {
    if (source === "maritime") {
      return {
        min: MARITIME_GRID_MIN,
        max: MARITIME_GRID_MAX,
        value: MARITIME_GRID_DEFAULT,
      };
    }
    if (source === "taxi-athens" || source === "athens-2") {
      return {
        min: ATHENS_GRID_MIN,
        max: ATHENS_GRID_MAX,
        value: ATHENS_GRID_DEFAULT,
      };
    }

    return {
      min: PORTO_GRID_MIN,
      max: PORTO_GRID_MAX,
      value: PORTO_GRID_DEFAULT,
    };
  }

  const disableAutoGridInput = styledInput("checkbox");
  disableAutoGridInput.checked = controls.disableAutoGrid;

  const disableAutoGridWrap = labeled(
    "Disable Auto Grid",
    disableAutoGridInput,
  );
  disableAutoGridWrap.style.display = "none";
  panel.appendChild(disableAutoGridWrap);

  const gridStepInput = styledInput("range");
  gridStepInput.step = "1";
  gridStepInput.value = String(controls.gridStepValue);

  const gridStepValue = document.createElement("div");
  Object.assign(gridStepValue.style, {
    color: "white",
    fontSize: "10px",
    opacity: "0.8",
    textAlign: "right",
  });

  function refreshGridUi() {
    const source = controls.dataSource;
    const shouldShow = isDynamicGridSource(source);
    disableAutoGridWrap.style.display = shouldShow ? "flex" : "none";
    gridStepWrap.style.display = shouldShow ? "flex" : "none";
    gridStepInput.disabled = !controls.disableAutoGrid;
    gridStepInput.style.opacity = controls.disableAutoGrid ? "1" : "0.55";
    gridStepValue.textContent = String(Math.round(controls.gridStepValue));
  }

  function applyGridDefaultsForSource(source: string) {
    const defaults = getGridDefaultsForSource(source);
    controls.gridStepValue = defaults.value;
    gridStepInput.min = String(defaults.min);
    gridStepInput.max = String(defaults.max);
    gridStepInput.value = String(defaults.value);
    refreshGridUi();
  }

  const gridStepWrap = labeled("Grid Step", gridStepInput);
  gridStepWrap.appendChild(gridStepValue);
  gridStepWrap.style.display = "none";
  panel.appendChild(gridStepWrap);

  disableAutoGridInput.onchange = () => {
    controls.disableAutoGrid = disableAutoGridInput.checked;
    refreshGridUi();

    if (controls.dataSource === "taxi-porto") {
      void rebuildPortoFieldForView();
    }
    if (controls.dataSource === "taxi-athens") {
      void rebuildAthensFieldForView();
    }
    if (controls.dataSource === "athens-2") {
      void rebuildAthensFieldForView();
    }
    if (controls.dataSource === "maritime") {
      void rebuildMaritimeFieldForView();
    }
  };

  gridStepInput.oninput = () => {
    controls.gridStepValue = Number(gridStepInput.value);
    refreshGridUi();
  };

  gridStepInput.onchange = () => {
    if (!controls.disableAutoGrid) return;

    if (controls.dataSource === "taxi-porto") {
      void rebuildPortoFieldForView();
    }
    if (controls.dataSource === "taxi-athens") {
      void rebuildAthensFieldForView();
    }
    if (controls.dataSource === "athens-2") {
      void rebuildAthensFieldForView();
    }
    if (controls.dataSource === "maritime") {
      void rebuildMaritimeFieldForView();
    }
  };

  const showGridInput = styledInput("checkbox");
  showGridInput.checked = controls.showGrid;
  showGridInput.onchange = () => {
    controls.showGrid = showGridInput.checked;
    refreshDensityUi();
  };
  panel.appendChild(labeled("Show Grid", showGridInput));

  const showDensityInput = styledInput("checkbox");
  showDensityInput.checked = controls.showDensity;
  showDensityInput.onchange = () => {
    controls.showDensity = showDensityInput.checked;
    refreshDensityUi();
  };
  const showDensityWrap = labeled("Show Density", showDensityInput);
  showDensityWrap.style.display = "none";
  panel.appendChild(showDensityWrap);

  const densityLogScaleInput = styledInput("range");
  densityLogScaleInput.min = "0.2";
  densityLogScaleInput.max = "5";
  densityLogScaleInput.step = "0.1";
  densityLogScaleInput.value = String(controls.densityLogScale);

  const densityLogScaleValue = document.createElement("div");
  Object.assign(densityLogScaleValue.style, {
    color: "white",
    fontSize: "10px",
    opacity: "0.8",
    textAlign: "right",
  });

  const densityLogScaleWrap = labeled(
    "Density Log Scale",
    densityLogScaleInput,
  );
  densityLogScaleWrap.appendChild(densityLogScaleValue);
  densityLogScaleWrap.style.display = "none";
  panel.appendChild(densityLogScaleWrap);

  densityLogScaleInput.oninput = () => {
    controls.densityLogScale = Number(densityLogScaleInput.value);
    refreshDensityUi();
  };

  function refreshDensityUi() {
    const source = controls.dataSource;
    const canShowDensity =
      controls.showGrid &&
      isDynamicGridSource(source) &&
      Array.isArray(activeGridCount) &&
      activeGridCount.length > 0;
    showDensityWrap.style.display =
      controls.showGrid && isDynamicGridSource(source) ? "flex" : "none";
    densityLogScaleWrap.style.display =
      canShowDensity && controls.showDensity ? "flex" : "none";
    densityLogScaleValue.textContent = controls.densityLogScale.toFixed(1);
    densityLogScaleInput.style.opacity = controls.showDensity ? "1" : "0.55";

    const shouldShowLegend = canShowDensity && controls.showDensity;
    densityLegend.style.display = shouldShowLegend ? "flex" : "none";
    if (!shouldShowLegend || !activeGridCount) {
      densityLegendStats.textContent = "min -- | med -- | max --";
      return;
    }

    const stats = computeDensityStats(activeGridCount);
    if (!stats) {
      densityLegendStats.textContent = "min -- | med -- | max --";
      return;
    }

    densityLegendStats.textContent = `min ${formatCount(stats.min)} | med ${formatCount(stats.median)} | max ${formatCount(stats.max)}`;
  }

  function computeDensityStats(counts: number[]) {
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (let i = 0; i < counts.length; i += 1) {
      const c = counts[i] ?? 0;
      if (c <= 0) continue;
      if (c < min) min = c;
      if (c > max) max = c;
    }

    if (!Number.isFinite(min) || max <= 0) {
      return null;
    }

    const maxSamples = 20_000;
    const stride = Math.max(1, Math.ceil(counts.length / maxSamples));
    const samples: number[] = [];
    for (let i = 0; i < counts.length; i += stride) {
      const c = counts[i] ?? 0;
      if (c > 0) {
        samples.push(c);
      }
    }

    if (samples.length === 0) {
      return {
        min,
        median: min,
        max,
      };
    }

    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length * 0.5)];
    return {
      min,
      median,
      max,
    };
  }

  function formatCount(value: number) {
    if (value >= 1000) {
      return value.toLocaleString();
    }
    return String(value);
  }

  // ---- Particles ----
  const particleInput = styledInput("number");
  particleInput.min = "1000";
  particleInput.max = "50000";
  particleInput.step = "1000";
  particleInput.value = String(controls.numParticles);

  const ageInput = styledInput("number");
  ageInput.min = "100";
  ageInput.max = "5000";
  ageInput.step = "100";
  ageInput.value = String(controls.maxAge);

  panel.appendChild(labeled("Particles", particleInput));
  panel.appendChild(labeled("Max Age", ageInput));

  let field: VectorField;
  let particles: ParticleSystem;
  let activeTaxiHeader: TaxiFieldHeader | null = null;
  let activeGridCount: number[] | null = null;
  let isUpdatingPortoField = false;
  let portoObservations: Observation[] | null = null;
  let portoObservationsLoadAttempted = false;
  let athensObservations: Observation[] | null = null;
  let athensObservationsLoadAttempted = false;
  let athens2Observations: Observation[] | null = null;
  let athens2ObservationsLoadAttempted = false;
  let maritimeObservations: Observation[] | null = null;
  let maritimeObservationsLoadAttempted = false;
  let portoUpdateRequestId = 0;
  let athensUpdateRequestId = 0;
  let maritimeUpdateRequestId = 0;
  let suppressNextPortoZoomRefresh = false;
  let suppressNextAthensZoomRefresh = false;
  let suppressNextMaritimeZoomRefresh = false;
  let isCameraInteracting = false;

  const runtimeStatus = document.createElement("div");
  Object.assign(runtimeStatus.style, {
    position: "absolute",
    top: "10px",
    left: "10px",
    zIndex: "10",
    padding: "6px 8px",
    background: "rgba(0,0,0,0.7)",
    borderRadius: "6px",
    color: "white",
    fontSize: "11px",
    fontFamily: "monospace",
    display: "none",
  });
  runtimeStatus.textContent = "Updating Porto vector field...";
  mapContainer.appendChild(runtimeStatus);

  const densityLegend = document.createElement("div");
  Object.assign(densityLegend.style, {
    position: "absolute",
    top: "54px",
    left: "10px",
    zIndex: "10",
    padding: "7px 9px",
    background: "rgba(0,0,0,0.68)",
    borderRadius: "6px",
    color: "white",
    fontSize: "10px",
    fontFamily: "monospace",
    display: "none",
    flexDirection: "column",
    gap: "4px",
  });

  const densityLegendTitle = document.createElement("div");
  densityLegendTitle.textContent = "Density";
  densityLegendTitle.style.opacity = "0.9";

  const densityLegendRamp = document.createElement("div");
  Object.assign(densityLegendRamp.style, {
    width: "130px",
    height: "8px",
    borderRadius: "4px",
    border: "1px solid rgba(255,255,255,0.25)",
    background:
      "linear-gradient(to right, rgba(255,255,255,0.06), rgba(255,255,255,0.50))",
  });

  const densityLegendStats = document.createElement("div");
  densityLegendStats.style.opacity = "0.9";
  densityLegendStats.textContent = "min -- | med -- | max --";

  densityLegend.appendChild(densityLegendTitle);
  densityLegend.appendChild(densityLegendRamp);
  densityLegend.appendChild(densityLegendStats);
  mapContainer.appendChild(densityLegend);

  function syncParticleLayerVisibility() {
    const hideParticles = isUpdatingPortoField || isCameraInteracting;
    canvas.style.display = hideParticles ? "none" : "block";
  }

  function setCameraInteractionUi(isInteracting: boolean) {
    isCameraInteracting = isInteracting;
    if (isInteracting) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    }
    syncParticleLayerVisibility();
  }

  function setPortoUpdateUi(isUpdating: boolean) {
    isUpdatingPortoField = isUpdating;
    runtimeStatus.style.display = isUpdating ? "block" : "none";
    syncParticleLayerVisibility();
  }

  async function loadPortoObservations(): Promise<Observation[] | null> {
    if (portoObservations) return portoObservations;
    if (portoObservationsLoadAttempted) return null;

    portoObservationsLoadAttempted = true;

    const candidates = [
      "/taxi-observations.json",
      "/taxi.json",
      "/data/taxi.json",
    ];
    for (const path of candidates) {
      try {
        const res = await fetch(path);
        if (!res.ok) continue;
        const raw = await res.json();
        const list: Observation[] = Array.isArray(raw)
          ? raw
          : (Object.values(raw) as Observation[]);
        portoObservations = list;
        return list;
      } catch {
        // Try the next candidate.
      }
    }

    console.warn(
      "Porto observations were not found. Runtime Porto updates are disabled. Add /taxi-observations.json (or /taxi.json) to enable runtime Porto updates.",
    );
    return null;
  }

  async function loadAthensObservations(
    source: string,
  ): Promise<Observation[] | null> {
    const isAthens2 = source === "athens-2";

    if (isAthens2) {
      if (athens2Observations) return athens2Observations;
      if (athens2ObservationsLoadAttempted) return null;
      athens2ObservationsLoadAttempted = true;
    } else {
      if (athensObservations) return athensObservations;
      if (athensObservationsLoadAttempted) return null;
      athensObservationsLoadAttempted = true;
    }

    const candidates = isAthens2
      ? [
          "/athens-observations-2.json",
          "/data/athens/athens-observations-2.json",
        ]
      : ["/athens-observations.json", "/data/athens/athens-observations.json"];
    for (const path of candidates) {
      try {
        const res = await fetch(path);
        if (!res.ok) continue;
        const raw = await res.json();
        const list: Observation[] = Array.isArray(raw)
          ? raw
          : (Object.values(raw) as Observation[]);
        if (isAthens2) {
          athens2Observations = list;
        } else {
          athensObservations = list;
        }
        return list;
      } catch {
        // Try the next candidate.
      }
    }

    console.warn(
      `Athens observations were not found for ${source}. Runtime Athens updates are disabled. Run parseAthensCSV to generate observations.`,
    );
    return null;
  }

  async function loadMaritimeObservations(): Promise<Observation[] | null> {
    if (maritimeObservations) return maritimeObservations;
    if (maritimeObservationsLoadAttempted) return null;

    maritimeObservationsLoadAttempted = true;

    const candidates = [
      "/maritime-observations.json",
      "/maritime.json",
      "/data/maritime.json",
    ];
    for (const path of candidates) {
      try {
        const res = await fetch(path);
        if (!res.ok) continue;
        const raw = await res.json();
        const list: Observation[] = Array.isArray(raw)
          ? raw
          : (Object.values(raw) as Observation[]);
        maritimeObservations = list;
        return list;
      } catch {
        // Try the next candidate.
      }
    }

    console.warn(
      "Maritime observations were not found. Add /maritime-observations.json to enable runtime maritime updates.",
    );
    return null;
  }

  function getScreenClampedBounds(sourceBounds: {
    latMin: number;
    latMax: number;
    lonMin: number;
    lonMax: number;
  }) {
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) {
      return { ...sourceBounds };
    }

    const corners = [
      map.unproject([0, 0]),
      map.unproject([w, 0]),
      map.unproject([0, h]),
      map.unproject([w, h]),
    ];

    const lats = corners.map((c) => c.lat).filter((v) => Number.isFinite(v));
    const lons = corners.map((c) => c.lng).filter((v) => Number.isFinite(v));

    if (lats.length === 0 || lons.length === 0) {
      const b = map.getBounds();
      if (!b) return { ...sourceBounds };
      return {
        latMin: Math.max(sourceBounds.latMin, b.getSouth()),
        latMax: Math.min(sourceBounds.latMax, b.getNorth()),
        lonMin: Math.max(sourceBounds.lonMin, b.getWest()),
        lonMax: Math.min(sourceBounds.lonMax, b.getEast()),
      };
    }

    const viewLatMin = Math.min(...lats);
    const viewLatMax = Math.max(...lats);
    const viewLonMin = Math.min(...lons);
    const viewLonMax = Math.max(...lons);

    return {
      latMin: Math.max(sourceBounds.latMin, viewLatMin),
      latMax: Math.min(sourceBounds.latMax, viewLatMax),
      lonMin: Math.max(sourceBounds.lonMin, viewLonMin),
      lonMax: Math.min(sourceBounds.lonMax, viewLonMax),
    };
  }

  function getPortoViewportGridConfig() {
    const manualGridSize = clamp(
      Math.round(controls.gridStepValue),
      PORTO_GRID_MIN,
      PORTO_GRID_MAX,
    );

    const { latMin, latMax, lonMin, lonMax } =
      getScreenClampedBounds(PORTO_BOUNDS);

    // Keep at least a tiny overlap when the camera strays outside Porto.
    const safeLatMin = Math.min(latMin, latMax - 1e-6);
    const safeLatMax = Math.max(latMax, latMin + 1e-6);
    const safeLonMin = Math.min(lonMin, lonMax - 1e-6);
    const safeLonMax = Math.max(lonMax, lonMin + 1e-6);

    let targetNx = manualGridSize;
    let targetNy = manualGridSize;

    if (!controls.disableAutoGrid) {
      const zoom = map.getZoom();
      const baseCellPx = 24;
      const zoomBoost = Math.max(0.35, 1 - Math.max(0, zoom - 10) * 0.08);
      const targetCellPx = baseCellPx * zoomBoost;
      targetNx = Math.max(
        PORTO_GRID_MIN,
        Math.min(PORTO_GRID_MAX, Math.round(canvas.width / targetCellPx)),
      );
      targetNy = Math.max(
        PORTO_GRID_MIN,
        Math.min(PORTO_GRID_MAX, Math.round(canvas.height / targetCellPx)),
      );
    }

    return {
      bounds: {
        latMin: safeLatMin,
        latMax: safeLatMax,
        lonMin: safeLonMin,
        lonMax: safeLonMax,
      },
      latStep: (safeLatMax - safeLatMin) / targetNy,
      lonStep: (safeLonMax - safeLonMin) / targetNx,
    };
  }

  function getAthensViewportGridConfig() {
    const manualGridSize = clamp(
      Math.round(controls.gridStepValue),
      ATHENS_GRID_MIN,
      ATHENS_GRID_MAX,
    );

    const { latMin, latMax, lonMin, lonMax } =
      getScreenClampedBounds(ATHENS_BOUNDS);

    const safeLatMin = Math.min(latMin, latMax - 1e-6);
    const safeLatMax = Math.max(latMax, latMin + 1e-6);
    const safeLonMin = Math.min(lonMin, lonMax - 1e-6);
    const safeLonMax = Math.max(lonMax, lonMin + 1e-6);

    let targetNx = manualGridSize;
    let targetNy = manualGridSize;

    if (!controls.disableAutoGrid) {
      const zoom = map.getZoom();
      const baseCellPx = 24;
      const zoomBoost = Math.max(0.35, 1 - Math.max(0, zoom - 10) * 0.08);
      const targetCellPx = baseCellPx * zoomBoost;
      targetNx = Math.max(
        ATHENS_GRID_MIN,
        Math.min(ATHENS_GRID_MAX, Math.round(canvas.width / targetCellPx)),
      );
      targetNy = Math.max(
        ATHENS_GRID_MIN,
        Math.min(ATHENS_GRID_MAX, Math.round(canvas.height / targetCellPx)),
      );
    }

    return {
      bounds: {
        latMin: safeLatMin,
        latMax: safeLatMax,
        lonMin: safeLonMin,
        lonMax: safeLonMax,
      },
      latStep: (safeLatMax - safeLatMin) / targetNy,
      lonStep: (safeLonMax - safeLonMin) / targetNx,
    };
  }

  function getMaritimeViewportGridConfig() {
    const manualGridSize = clamp(
      Math.round(controls.gridStepValue),
      MARITIME_GRID_MIN,
      MARITIME_GRID_MAX,
    );

    const { latMin, latMax, lonMin, lonMax } =
      getScreenClampedBounds(MARITIME_BOUNDS);

    const safeLatMin = Math.min(latMin, latMax - 1e-6);
    const safeLatMax = Math.max(latMax, latMin + 1e-6);
    const safeLonMin = Math.min(lonMin, lonMax - 1e-6);
    const safeLonMax = Math.max(lonMax, lonMin + 1e-6);

    let targetNx = manualGridSize;
    let targetNy = manualGridSize;

    if (!controls.disableAutoGrid) {
      const zoom = map.getZoom();
      const baseCellPx = 20;
      const zoomDelta = Math.max(0, zoom - 7);
      const zoomBoost = Math.max(0.16, Math.pow(0.86, zoomDelta));
      const extremeZoomBoost =
        zoom >= 11.5 ? Math.max(0.65, 1 - (zoom - 11.5) * 0.2) : 1;
      const targetCellPx = Math.max(
        1.2,
        baseCellPx * zoomBoost * extremeZoomBoost,
      );
      const maxGrid =
        zoom >= 12.5 ? 1700 : zoom >= 11.5 ? 1400 : zoom >= 10 ? 1000 : 800;
      targetNx = Math.max(
        MARITIME_GRID_MIN,
        Math.min(maxGrid, Math.round(canvas.width / targetCellPx)),
      );
      targetNy = Math.max(
        MARITIME_GRID_MIN,
        Math.min(maxGrid, Math.round(canvas.height / targetCellPx)),
      );
    }

    return {
      bounds: {
        latMin: safeLatMin,
        latMax: safeLatMax,
        lonMin: safeLonMin,
        lonMax: safeLonMax,
      },
      latStep: (safeLatMax - safeLatMin) / targetNy,
      lonStep: (safeLonMax - safeLonMin) / targetNx,
    };
  }

  async function rebuildPortoFieldForView() {
    if (controls.dataSource !== "taxi-porto") return;

    const requestId = ++portoUpdateRequestId;
    setPortoUpdateUi(true);

    try {
      const observations = await loadPortoObservations();
      if (!observations) return;

      const config = getPortoViewportGridConfig();

      // Yield once so the UI can hide particles before heavy recomputation.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );

      const data = observationsToVectorField(observations, config);
      if (requestId !== portoUpdateRequestId) return;

      field = new VectorField(
        data.header.nx,
        data.header.ny,
        data.data.u,
        data.data.v,
      );
      activeTaxiHeader = data.header;
      activeGridCount = data.data.count ?? null;
      refreshDensityUi();
      trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      rebuildParticles();
    } catch (err) {
      console.warn(err);
    } finally {
      if (requestId === portoUpdateRequestId) {
        setPortoUpdateUi(false);
      }
    }
  }

  async function rebuildAthensFieldForView() {
    if (
      controls.dataSource !== "taxi-athens" &&
      controls.dataSource !== "athens-2"
    )
      return;

    const requestId = ++athensUpdateRequestId;
    setPortoUpdateUi(true);

    try {
      const observations = await loadAthensObservations(controls.dataSource);
      if (!observations) return;

      const config = getAthensViewportGridConfig();

      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );

      const data = observationsToVectorField(observations, config);
      if (requestId !== athensUpdateRequestId) return;

      field = new VectorField(
        data.header.nx,
        data.header.ny,
        data.data.u,
        data.data.v,
      );
      activeTaxiHeader = data.header;
      activeGridCount = data.data.count ?? null;
      refreshDensityUi();
      trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      rebuildParticles();
    } catch (err) {
      console.warn(err);
    } finally {
      if (requestId === athensUpdateRequestId) {
        setPortoUpdateUi(false);
      }
    }
  }

  async function rebuildMaritimeFieldForView() {
    if (controls.dataSource !== "maritime") return;

    const requestId = ++maritimeUpdateRequestId;
    runtimeStatus.textContent = "Updating maritime vector field...";
    setPortoUpdateUi(true);

    try {
      const observations = await loadMaritimeObservations();
      if (!observations) return;

      const config = getMaritimeViewportGridConfig();

      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );

      const data = observationsToVectorField(observations, config);
      if (requestId !== maritimeUpdateRequestId) return;

      field = new VectorField(
        data.header.nx,
        data.header.ny,
        data.data.u,
        data.data.v,
      );
      activeTaxiHeader = data.header;
      activeGridCount = data.data.count ?? null;
      refreshDensityUi();
      trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      rebuildParticles();
    } catch (err) {
      console.warn(err);
    } finally {
      if (requestId === maritimeUpdateRequestId) {
        runtimeStatus.textContent = "Updating Porto vector field...";
        setPortoUpdateUi(false);
      }
    }
  }

  async function loadVectorField(source: string) {
    let data: TaxiFieldData | any;

    if (source === "maritime") {
      data = await fetch("/maritime-vector-field.json").then((r) => r.json());
    } else if (source === "taxi-porto") {
      data = await fetch("/taxi-vector-field.json").then((r) => r.json());
    } else if (source === "taxi-athens" || source === "athens-2") {
      // Try to fetch precomputed file, or fall back to runtime generation
      const vectorFieldPath =
        source === "athens-2"
          ? "/athens-vector-field-2.json"
          : "/athens-vector-field.json";
      try {
        data = await fetch(vectorFieldPath).then((r) => r.json());
      } catch {
        // Will fall back to runtime generation in rebuildAthensFieldForView
        data = { header: {}, data: { u: [], v: [] } };
      }
    } else if (source === "taxi-shenzhen") {
      data = await fetch("/guang-vector-field.json").then((r) => r.json());
    } else if (source === "taxi-shenzhen-morning") {
      data = await fetch("/guang-vector-field-morning.json").then((r) =>
        r.json(),
      );
    } else if (source === "taxi-shenzhen-afternoon") {
      data = await fetch("/guang-vector-field-afternoon.json").then((r) =>
        r.json(),
      );
    } else if (source.startsWith("taxi-beijing")) {
      const slice = source.replace("taxi-beijing-", "");
      data = await fetch(`/taxi-beijing-vector-field-${slice}.json`).then((r) =>
        r.json(),
      );
    } else {
      data = await parseWind("/wind.json");
    }

    field = new VectorField(
      data.header.nx,
      data.header.ny,
      data.data.u,
      data.data.v,
    );
    activeTaxiHeader =
      isTaxiLikeSource(source) || source === "maritime" ? data.header : null;
    activeGridCount =
      isTaxiLikeSource(source) || source === "maritime"
        ? Array.isArray(data?.data?.count)
          ? data.data.count
          : null
        : null;
    refreshDensityUi();

    controls.dataSource = source;
    applyGridDefaultsForSource(source);
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

    if (source === "maritime") {
      suppressNextMaritimeZoomRefresh = true;
      map.fitBounds(
        [
          [MARITIME_BOUNDS.lonMin, MARITIME_BOUNDS.latMin],
          [MARITIME_BOUNDS.lonMax, MARITIME_BOUNDS.latMax],
        ],
        { padding: 50 },
      );
      await rebuildMaritimeFieldForView();
    } else if (source === "taxi-porto") {
      suppressNextPortoZoomRefresh = true;
      map.fitBounds(
        [
          [PORTO_BOUNDS.lonMin, PORTO_BOUNDS.latMin],
          [PORTO_BOUNDS.lonMax, PORTO_BOUNDS.latMax],
        ],
        { padding: 50 },
      );

      await rebuildPortoFieldForView();
    } else if (source === "taxi-athens" || source === "athens-2") {
      suppressNextAthensZoomRefresh = true;
      map.fitBounds(
        [
          [ATHENS_BOUNDS.lonMin, ATHENS_BOUNDS.latMin],
          [ATHENS_BOUNDS.lonMax, ATHENS_BOUNDS.latMax],
        ],
        { padding: 50 },
      );

      await rebuildAthensFieldForView();
    } else if (
      source === "taxi-shenzhen" ||
      source === "taxi-shenzhen-morning" ||
      source === "taxi-shenzhen-afternoon"
    ) {
      map.fitBounds(
        [
          [GUANG_BOUNDS.lonMin, GUANG_BOUNDS.latMin],
          [GUANG_BOUNDS.lonMax, GUANG_BOUNDS.latMax],
        ],
        { padding: 50 },
      );
    } else if (source.startsWith("taxi-beijing")) {
      map.fitBounds(
        [
          [BEIJING_BOUNDS.lonMin, BEIJING_BOUNDS.latMin],
          [BEIJING_BOUNDS.lonMax, BEIJING_BOUNDS.latMax],
        ],
        { padding: 50 },
      );
    } else {
      map.fitBounds(
        [
          [EUROPE_BOUNDS.lonMin, EUROPE_BOUNDS.latMin],
          [EUROPE_BOUNDS.lonMax, EUROPE_BOUNDS.latMax],
        ],
        { padding: 50 },
      );
    }
  }

  dataSelect.onchange = async () => {
    const source = dataSelect.value;

    windSpeedWrap.style.display = source === "wind" ? "flex" : "none";
    taxiSpeedWrap.style.display =
      isTaxiLikeSource(source) || source === "maritime" ? "flex" : "none";

    if (source === "wind") {
      controls.layer = "standard-satellite";
    } else if (source === "maritime") {
      controls.layer = "satellite-v9";
    } else {
      controls.layer = "dark-v11";
    }

    layerSelect.value = controls.layer;
    map.setStyle(`mapbox://styles/mapbox/${controls.layer}`);

    await loadVectorField(source);
    refreshGridUi();
  };

  await loadVectorField("wind");

  function rebuildParticles() {
    particles = new ParticleSystem(canvas.width, canvas.height, {
      numParticles: controls.numParticles,
      maxAge: controls.maxAge,
    });
  }

  particleInput.onchange = () => {
    controls.numParticles = Number(particleInput.value);
    rebuildParticles();
  };

  ageInput.onchange = () => {
    controls.maxAge = Number(ageInput.value);
    rebuildParticles();
  };

  function resize() {
    const r = mapContainer!.getBoundingClientRect();
    canvas.width = r.width;
    canvas.height = r.height;
    trailCanvas.width = r.width;
    trailCanvas.height = r.height;
    rebuildParticles();
  }

  window.addEventListener("resize", resize);

  map.on("load", () => {
    resize();

    map.on("zoomstart", () => {
      setCameraInteractionUi(true);
    });

    map.on("dragstart", () => {
      setCameraInteractionUi(true);
    });

    map.on("zoomend", () => {
      setCameraInteractionUi(false);
      if (
        controls.dataSource === "taxi-porto" &&
        suppressNextPortoZoomRefresh
      ) {
        suppressNextPortoZoomRefresh = false;
        return;
      }
      if (
        (controls.dataSource === "taxi-athens" ||
          controls.dataSource === "athens-2") &&
        suppressNextAthensZoomRefresh
      ) {
        suppressNextAthensZoomRefresh = false;
        return;
      }
      if (
        controls.dataSource === "maritime" &&
        suppressNextMaritimeZoomRefresh
      ) {
        suppressNextMaritimeZoomRefresh = false;
        return;
      }
      void rebuildPortoFieldForView();
      void rebuildAthensFieldForView();
      void rebuildMaritimeFieldForView();
    });

    map.on("dragend", () => {
      setCameraInteractionUi(false);
      void rebuildPortoFieldForView();
      void rebuildAthensFieldForView();
      void rebuildMaritimeFieldForView();
    });

    map.on("zoom", () => {
      applyTaxiSpeedForZoom();
    });

    applyTaxiSpeedForZoom();

    function speedToColor(s: number, source: string) {
      if (source === "maritime") {
        const maritimeSpeed = s * MARITIME_SPEED_MULTIPLIER;
        const normalized = clamp(maritimeSpeed / 140, 0, 1);
        const intensity = Math.pow(normalized, 1.8);
        const hue = 225 - intensity * 215;
        const saturation = 90 + intensity * 10;
        const lightness = 72 - intensity * 16;
        const alpha = 0.18 + intensity * 0.72;
        return `hsla(${hue},${saturation}%,${lightness}%,${alpha})`;
      }
      return `hsl(${240 - s * 10},100%,70%)`;
    }

    function respawnParticleInActiveBounds(p: {
      x: number;
      y: number;
      age: number;
    }) {
      if (!activeTaxiHeader) {
        p.x = Math.random() * canvas.width;
        p.y = Math.random() * canvas.height;
        p.age = 0;
        return;
      }

      const lon =
        activeTaxiHeader.lonMin +
        Math.random() *
          activeTaxiHeader.lonStep *
          Math.max(0, activeTaxiHeader.nx - 1);
      const lat =
        activeTaxiHeader.latMin +
        Math.random() *
          activeTaxiHeader.latStep *
          Math.max(0, activeTaxiHeader.ny - 1);
      const projected = map.project([lon, lat]);

      if (Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
        p.x = projected.x;
        p.y = projected.y;
      } else {
        p.x = Math.random() * canvas.width;
        p.y = Math.random() * canvas.height;
      }
      p.age = 0;
    }

    function drawVectorGridOverlay() {
      if (!controls.showGrid || !activeTaxiHeader) return;
      if (
        !(
          isTaxiLikeSource(controls.dataSource) ||
          controls.dataSource === "maritime"
        )
      ) {
        return;
      }

      const { nx, ny, lonMin, latMin, lonStep, latStep } = activeTaxiHeader;
      if (nx < 2 || ny < 2 || lonStep === 0 || latStep === 0) return;

      const latMax = latMin + latStep * (ny - 1);
      const lonMax = lonMin + lonStep * (nx - 1);

      if (
        controls.showDensity &&
        activeGridCount &&
        activeGridCount.length === nx * ny
      ) {
        const maxDensityCells = 7000;
        const stride = Math.max(
          1,
          Math.ceil(Math.sqrt((nx * ny) / maxDensityCells)),
        );
        const sampledMax = (() => {
          let m = 0;
          for (let gy = 0; gy < ny; gy += stride) {
            const row = gy * nx;
            for (let gx = 0; gx < nx; gx += stride) {
              const c = activeGridCount[row + gx] ?? 0;
              if (c > m) m = c;
            }
          }
          return m;
        })();

        if (sampledMax > 0) {
          const logScale = Math.max(0.2, controls.densityLogScale);
          const denom = Math.log1p(sampledMax * logScale);
          ctx.save();
          for (let gy = 0; gy < ny; gy += stride) {
            const lat0 = latMin + latStep * gy;
            const lat1 = latMin + latStep * Math.min(gy + stride, ny - 1);
            for (let gx = 0; gx < nx; gx += stride) {
              const count = activeGridCount[gy * nx + gx] ?? 0;
              if (count <= 0) continue;

              const density = Math.log1p(count * logScale) / denom;
              const alpha = 0.06 + 0.44 * Math.pow(density, 0.9);
              ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;

              const lon0 = lonMin + lonStep * gx;
              const lon1 = lonMin + lonStep * Math.min(gx + stride, nx - 1);

              const p00 = map.project([lon0, lat0]);
              const p10 = map.project([lon1, lat0]);
              const p11 = map.project([lon1, lat1]);
              const p01 = map.project([lon0, lat1]);

              ctx.beginPath();
              ctx.moveTo(p00.x, p00.y);
              ctx.lineTo(p10.x, p10.y);
              ctx.lineTo(p11.x, p11.y);
              ctx.lineTo(p01.x, p01.y);
              ctx.closePath();
              ctx.fill();
            }
          }
          ctx.restore();
        }
      }

      const maxLinesPerAxis = 80;
      const lonLineStride = Math.max(1, Math.ceil(nx / maxLinesPerAxis));
      const latLineStride = Math.max(1, Math.ceil(ny / maxLinesPerAxis));
      const segmentsPerLine = 16;

      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.24)";
      ctx.lineWidth = 0.6;

      for (let x = 0; x < nx; x += lonLineStride) {
        const lon = lonMin + lonStep * x;
        ctx.beginPath();
        for (let s = 0; s <= segmentsPerLine; s += 1) {
          const t = s / segmentsPerLine;
          const lat = latMin + (latMax - latMin) * t;
          const p = map.project([lon, lat]);
          if (s === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      for (let y = 0; y < ny; y += latLineStride) {
        const lat = latMin + latStep * y;
        ctx.beginPath();
        for (let s = 0; s <= segmentsPerLine; s += 1) {
          const t = s / segmentsPerLine;
          const lon = lonMin + (lonMax - lonMin) * t;
          const p = map.project([lon, lat]);
          if (s === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      ctx.restore();
    }

    function frame() {
      const GRID_EDGE_EPSILON = 0.02;
      const SCREEN_EDGE_EPSILON_PX = 2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      trailCtx.globalCompositeOperation = "destination-out";
      trailCtx.fillStyle = "rgba(0,0,0,0.10)";
      trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
      trailCtx.globalCompositeOperation = "source-over";

      for (const p of particles.particles) {
        if (isUpdatingPortoField) {
          continue;
        }

        // Skip invalid particle positions
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
          continue;
        }

        const { lng, lat } = map.unproject([p.x, p.y]);

        // Skip if unproject failed
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
          continue;
        }

        let gx: number, gy: number;

        if (
          (isTaxiLikeSource(controls.dataSource) ||
            controls.dataSource === "maritime") &&
          activeTaxiHeader
        ) {
          gx = (lng - activeTaxiHeader.lonMin) / activeTaxiHeader.lonStep;
          gy = (lat - activeTaxiHeader.latMin) / activeTaxiHeader.latStep;
        } else {
          const adjLon = lng < 0 ? lng + 360 : lng;
          gx = (adjLon / 360) * (field.nx - 1);
          gy = ((90 - lat) / 180) * (field.ny - 1);
        }

        const isBoundedFlow =
          (isTaxiLikeSource(controls.dataSource) ||
            controls.dataSource === "maritime") &&
          activeTaxiHeader;
        if (
          isBoundedFlow &&
          (gx < -GRID_EDGE_EPSILON ||
            gx > field.nx - 1 + GRID_EDGE_EPSILON ||
            gy < -GRID_EDGE_EPSILON ||
            gy > field.ny - 1 + GRID_EDGE_EPSILON)
        ) {
          respawnParticleInActiveBounds(p);
          continue;
        }

        if (isBoundedFlow) {
          gx = clamp(gx, 0, field.nx - 1);
          gy = clamp(gy, 0, field.ny - 1);
        }

        let w = field.sampleInterpolated(gx, gy);
        if (controls.dataSource === "maritime") {
          const speed0 = Math.hypot(w.u, w.v);
          if (speed0 < 0.0025) {
            const offsets = [
              [-1, 0],
              [1, 0],
              [0, -1],
              [0, 1],
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1],
            ];
            let sumU = w.u;
            let sumV = w.v;
            let count = 1;

            for (const [ox, oy] of offsets) {
              const candidate = field.sampleInterpolated(gx + ox, gy + oy);
              const candidateSpeed = Math.hypot(candidate.u, candidate.v);
              if (candidateSpeed > 0) {
                sumU += candidate.u;
                sumV += candidate.v;
                count += 1;
              }
            }

            w = {
              u: sumU / count,
              v: sumV / count,
            };
          }
        }
        const speed = Math.hypot(w.u, w.v);
        const cosLat = Math.cos((lat * Math.PI) / 180);
        const zoomFactor = Math.pow(2, map.getZoom());

        const scale = isTaxiLikeSource(controls.dataSource)
          ? controls.taxiSpeedScale
          : controls.dataSource === "maritime"
            ? controls.taxiSpeedScale * MARITIME_SPEED_MULTIPLIER
            : controls.speedScale;

        p.x += w.u * cosLat * scale * (zoomFactor / 256);
        p.y -= w.v * scale * (zoomFactor / 256);

        if (isBoundedFlow) {
          if (
            p.x < -SCREEN_EDGE_EPSILON_PX ||
            p.x > canvas.width + SCREEN_EDGE_EPSILON_PX ||
            p.y < -SCREEN_EDGE_EPSILON_PX ||
            p.y > canvas.height + SCREEN_EDGE_EPSILON_PX
          ) {
            respawnParticleInActiveBounds(p);
            continue;
          }
        } else {
          if (p.x < 0) p.x += canvas.width;
          if (p.x > canvas.width) p.x -= canvas.width;
          if (p.y < 0) p.y += canvas.height;
          if (p.y > canvas.height) p.y -= canvas.height;
        }

        const isZeroVelocity = w.u === 0 && w.v === 0;
        trailCtx.fillStyle = isZeroVelocity
          ? "rgba(255,0,0,0)"
          : speedToColor(speed, controls.dataSource);

        trailCtx.beginPath();
        trailCtx.arc(p.x, p.y, isZeroVelocity ? 1.5 : 1.0, 0, Math.PI * 2);
        trailCtx.fill();
      }

      ctx.drawImage(trailCanvas, 0, 0);
      drawVectorGridOverlay();
      particles.update();
      requestAnimationFrame(frame);
    }

    frame();
  });
}

main();
