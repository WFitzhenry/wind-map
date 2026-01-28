import mapboxgl, { Map } from "mapbox-gl";

import { parseWind } from "./core/parseWind";
import { VectorField } from "./core/vectorField";
import { ParticleSystem } from "./core/particleSystem";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// ---- Porto bounds for taxi data ----
const PORTO_BOUNDS = {
  latMin: 41.105,
  latMax: 41.215,
  lonMin: -8.74,
  lonMax: -8.52,
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
  ["wind", "taxi"].forEach((v) => {
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

  // ---- Max age ----
  const ageInput = styledInput("number");
  ageInput.min = "100";
  ageInput.max = "5000";
  ageInput.step = "100";
  ageInput.value = String(controls.maxAge);

  dataSelect.onchange = async () => {
    const source = dataSelect.value;

    windSpeedWrap.style.display = source === "wind" ? "flex" : "none";
    taxiSpeedWrap.style.display = source === "taxi" ? "flex" : "none";

    await loadVectorField(source);
  };
  panel.appendChild(labeled("Particles", particleInput));
  panel.appendChild(labeled("Max Age", ageInput));

  let field: VectorField;
  let particles: ParticleSystem;

  async function loadVectorField(source: string) {
    const data =
      source === "taxi"
        ? await fetch("/taxi-vector-field.json").then((r) => r.json())
        : await parseWind("/wind.json");

    field = new VectorField(
      data.header.nx,
      data.header.ny,
      data.data.u,
      data.data.v,
    );

    controls.dataSource = source;
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

    // Zoom to appropriate bounds
    if (source === "taxi") {
      // Zoom to Porto bounds
      map.fitBounds(
        [
          [PORTO_BOUNDS.lonMin, PORTO_BOUNDS.latMin],
          [PORTO_BOUNDS.lonMax, PORTO_BOUNDS.latMax],
        ],
        { padding: 50 },
      );
    } else {
      // Zoom to global view
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
    taxiSpeedWrap.style.display = source === "taxi" ? "flex" : "none";

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

        if (controls.dataSource === "taxi") {
          gx =
            ((lng - PORTO_BOUNDS.lonMin) /
              (PORTO_BOUNDS.lonMax - PORTO_BOUNDS.lonMin)) *
            (field.nx - 1);
          gy =
            ((lat - PORTO_BOUNDS.latMin) /
              (PORTO_BOUNDS.latMax - PORTO_BOUNDS.latMin)) *
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

        const scale =
          controls.dataSource === "taxi"
            ? controls.taxiSpeedScale
            : controls.speedScale;

        p.x += w.u * cosLat * scale * (zoomFactor / 256);
        p.y -= w.v * scale * (zoomFactor / 256);

        if (p.x < 0) p.x += canvas.width;
        if (p.x > canvas.width) p.x -= canvas.width;
        if (p.y < 0) p.y += canvas.height;
        if (p.y > canvas.height) p.y -= canvas.height;

        // Draw particle - use different styling for zero velocity cells
        const isZeroVelocity = w.u === 0 && w.v === 0;
        trailCtx.fillStyle = isZeroVelocity
          ? "rgba(255, 0, 0, 0)"
          : speedToColor(speed);
        trailCtx.beginPath();
        const particleSize = isZeroVelocity ? 1.5 : 1.0; // Slightly larger for zero velocity
        trailCtx.arc(p.x, p.y, particleSize, 0, Math.PI * 2);
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
