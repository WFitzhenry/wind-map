import mapboxgl, { Map } from "mapbox-gl";

import { parseWind } from "./core/parseWind";
import { VectorField } from "./core/vectorField";
import { ParticleSystem } from "./core/particleSystem";

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

const EUROPE_BOUNDS = {
  latMin: 39.105,
  latMax: 60.215,
  lonMin: -2.74,
  lonMax: -20.52,
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

  taxiSpeedInput.oninput = () => {
    controls.taxiSpeedScale = Number(taxiSpeedInput.value);
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

  async function loadVectorField(source: string) {
    let data: any;

    if (source === "taxi-porto") {
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

    controls.dataSource = source;
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

    if (source === "taxi-porto") {
      map.fitBounds(
        [
          [PORTO_BOUNDS.lonMin, PORTO_BOUNDS.latMin],
          [PORTO_BOUNDS.lonMax, PORTO_BOUNDS.latMax],
        ],
        { padding: 50 },
      );
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
    taxiSpeedWrap.style.display = source.startsWith("taxi") ? "flex" : "none";

    if (source === "wind") {
      controls.layer = "standard-satellite";
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
    const r = mapContainer.getBoundingClientRect();
    canvas.width = r.width;
    canvas.height = r.height;
    trailCanvas.width = r.width;
    trailCanvas.height = r.height;
    rebuildParticles();
  }

  window.addEventListener("resize", resize);

  map.on("load", () => {
    resize();

    function speedToColor(s: number) {
      return `hsl(${240 - s * 10},100%,70%)`;
    }

    function frame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      trailCtx.globalCompositeOperation = "destination-out";
      trailCtx.fillStyle = "rgba(0,0,0,0.05)";
      trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
      trailCtx.globalCompositeOperation = "source-over";

      for (const p of particles.particles) {
        const { lng, lat } = map.unproject([p.x, p.y]);
        let gx: number, gy: number;

        if (controls.dataSource === "taxi-porto") {
          gx =
            ((lng - PORTO_BOUNDS.lonMin) /
              (PORTO_BOUNDS.lonMax - PORTO_BOUNDS.lonMin)) *
            (field.nx - 1);
          gy =
            ((lat - PORTO_BOUNDS.latMin) /
              (PORTO_BOUNDS.latMax - PORTO_BOUNDS.latMin)) *
            (field.ny - 1);
        } else if (
          controls.dataSource === "taxi-shenzhen" ||
          controls.dataSource === "taxi-shenzhen-morning" ||
          controls.dataSource === "taxi-shenzhen-afternoon"
        ) {
          gx =
            ((lng - GUANG_BOUNDS.lonMin) /
              (GUANG_BOUNDS.lonMax - GUANG_BOUNDS.lonMin)) *
            (field.nx - 1);
          gy =
            ((lat - GUANG_BOUNDS.latMin) /
              (GUANG_BOUNDS.latMax - GUANG_BOUNDS.latMin)) *
            (field.ny - 1);
        } else if (controls.dataSource.startsWith("taxi-beijing")) {
          gx =
            ((lng - BEIJING_BOUNDS.lonMin) /
              (BEIJING_BOUNDS.lonMax - BEIJING_BOUNDS.lonMin)) *
            (field.nx - 1);
          gy =
            ((lat - BEIJING_BOUNDS.latMin) /
              (BEIJING_BOUNDS.latMax - BEIJING_BOUNDS.latMin)) *
            (field.ny - 1);
        } else {
          const adjLon = lng < 0 ? lng + 360 : lng;
          gx = (adjLon / 360) * (field.nx - 1);
          gy = ((90 - lat) / 180) * (field.ny - 1);
        }

        const w = field.sampleInterpolated(gx, gy);
        const speed = Math.hypot(w.u, w.v);
        const cosLat = Math.cos((lat * Math.PI) / 180);
        const zoomFactor = Math.pow(2, map.getZoom());

        const scale = controls.dataSource.startsWith("taxi")
          ? controls.taxiSpeedScale
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
          : speedToColor(speed);

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
