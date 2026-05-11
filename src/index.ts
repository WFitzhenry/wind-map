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

async function main() {
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
  let isUpdatingPortoField = false;
  let portoObservations: Observation[] | null = null;
  let portoObservationsLoadAttempted = false;
  let maritimeObservations: Observation[] | null = null;
  let maritimeObservationsLoadAttempted = false;
  let portoUpdateRequestId = 0;
  let maritimeUpdateRequestId = 0;
  let suppressNextPortoZoomRefresh = false;
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

  function getPortoViewportGridConfig() {
    const b = map.getBounds();
    if (!b) {
      const latSpan = PORTO_BOUNDS.latMax - PORTO_BOUNDS.latMin;
      const lonSpan = PORTO_BOUNDS.lonMax - PORTO_BOUNDS.lonMin;
      return {
        bounds: { ...PORTO_BOUNDS },
        latStep: latSpan / 120,
        lonStep: lonSpan / 120,
      };
    }

    const latMin = Math.max(PORTO_BOUNDS.latMin, b.getSouth());
    const latMax = Math.min(PORTO_BOUNDS.latMax, b.getNorth());
    const lonMin = Math.max(PORTO_BOUNDS.lonMin, b.getWest());
    const lonMax = Math.min(PORTO_BOUNDS.lonMax, b.getEast());

    // Keep at least a tiny overlap when the camera strays outside Porto.
    const safeLatMin = Math.min(latMin, latMax - 1e-6);
    const safeLatMax = Math.max(latMax, latMin + 1e-6);
    const safeLonMin = Math.min(lonMin, lonMax - 1e-6);
    const safeLonMax = Math.max(lonMax, lonMin + 1e-6);

    const zoom = map.getZoom();
    const baseCellPx = 24;
    const zoomBoost = Math.max(0.35, 1 - Math.max(0, zoom - 10) * 0.08);
    const targetCellPx = baseCellPx * zoomBoost;
    const targetNx = Math.max(
      40,
      Math.min(420, Math.round(canvas.width / targetCellPx)),
    );
    const targetNy = Math.max(
      40,
      Math.min(420, Math.round(canvas.height / targetCellPx)),
    );

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
    const b = map.getBounds();
    if (!b) {
      const latSpan = MARITIME_BOUNDS.latMax - MARITIME_BOUNDS.latMin;
      const lonSpan = MARITIME_BOUNDS.lonMax - MARITIME_BOUNDS.lonMin;
      return {
        bounds: { ...MARITIME_BOUNDS },
        latStep: latSpan / 220,
        lonStep: lonSpan / 220,
      };
    }

    const latMin = Math.max(MARITIME_BOUNDS.latMin, b.getSouth());
    const latMax = Math.min(MARITIME_BOUNDS.latMax, b.getNorth());
    const lonMin = Math.max(MARITIME_BOUNDS.lonMin, b.getWest());
    const lonMax = Math.min(MARITIME_BOUNDS.lonMax, b.getEast());

    const safeLatMin = Math.min(latMin, latMax - 1e-6);
    const safeLatMax = Math.max(latMax, latMin + 1e-6);
    const safeLonMin = Math.min(lonMin, lonMax - 1e-6);
    const safeLonMax = Math.max(lonMax, lonMin + 1e-6);

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
    const targetNx = Math.max(
      100,
      Math.min(maxGrid, Math.round(canvas.width / targetCellPx)),
    );
    const targetNy = Math.max(
      100,
      Math.min(maxGrid, Math.round(canvas.height / targetCellPx)),
    );

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
    let data: any;

    if (source === "maritime") {
      data = await fetch("/maritime-vector-field.json").then((r) => r.json());
    } else if (source === "taxi-porto") {
      data = await fetch("/taxi-vector-field.json").then((r) => r.json());
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
      source.startsWith("taxi") || source === "maritime" ? data.header : null;

    controls.dataSource = source;
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
      source.startsWith("taxi") || source === "maritime" ? "flex" : "none";

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
        controls.dataSource === "maritime" &&
        suppressNextMaritimeZoomRefresh
      ) {
        suppressNextMaritimeZoomRefresh = false;
        return;
      }
      void rebuildPortoFieldForView();
      void rebuildMaritimeFieldForView();
    });

    map.on("dragend", () => {
      setCameraInteractionUi(false);
      void rebuildPortoFieldForView();
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

    function frame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      trailCtx.globalCompositeOperation = "destination-out";
      trailCtx.fillStyle = "rgba(0,0,0,0.10)";
      trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
      trailCtx.globalCompositeOperation = "source-over";

      for (const p of particles.particles) {
        if (isUpdatingPortoField) {
          continue;
        }

        const { lng, lat } = map.unproject([p.x, p.y]);
        let gx: number, gy: number;

        if (
          (controls.dataSource.startsWith("taxi") ||
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

        const scale = controls.dataSource.startsWith("taxi")
          ? controls.taxiSpeedScale
          : controls.dataSource === "maritime"
            ? controls.taxiSpeedScale * MARITIME_SPEED_MULTIPLIER
            : controls.speedScale;

        p.x += w.u * cosLat * scale * (zoomFactor / 256);
        p.y -= w.v * scale * (zoomFactor / 256);

        if (p.x < 0) p.x += canvas.width;
        if (p.x > canvas.width) p.x -= canvas.width;
        if (p.y < 0) p.y += canvas.height;
        if (p.y > canvas.height) p.y -= canvas.height;

        const isZeroVelocity = w.u === 0 && w.v === 0;
        trailCtx.fillStyle = isZeroVelocity
          ? "rgba(255,0,0,0)"
          : speedToColor(speed, controls.dataSource);

        trailCtx.beginPath();
        trailCtx.arc(p.x, p.y, isZeroVelocity ? 1.5 : 1.0, 0, Math.PI * 2);
        trailCtx.fill();
      }

      ctx.drawImage(trailCanvas, 0, 0);
      particles.update();
      requestAnimationFrame(frame);
    }

    frame();
  });
}

main();
