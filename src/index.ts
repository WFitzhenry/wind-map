import mapboxgl, { Map } from "mapbox-gl";

import { parseWind } from "./core/parseWind";
import { VectorField } from "./core/vectorField";
import { ParticleSystem } from "./core/particleSystem";

// Set your Mapbox access token here (or use environment variable)
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// ---- Porto bounds for taxi data ----
const PORTO_BOUNDS = {
  latMin: 41.105,
  latMax: 41.215,
  lonMin: -8.74,
  lonMax: -8.52,
};

// --------------------------------------------------
// Main
// --------------------------------------------------
async function main() {
  // ---- Initialize Mapbox map ----
  const mapContainer = document.getElementById("map");
  if (!mapContainer) {
    throw new Error("Map container not found");
  }

  const map = new Map({
    container: mapContainer,
    projection: "naturalEarth",
    style: "mapbox://styles/mapbox/standard-satellite",
    center: [-8.7, 41.16],
    zoom: 4,
  });

  // ---- Canvas setup for wind particles ----
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.pointerEvents = "none";
  mapContainer.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;

  // ---- Data source dropdown ----
  const dropdownContainer = document.createElement("div");
  dropdownContainer.style.position = "absolute";
  dropdownContainer.style.top = "10px";
  dropdownContainer.style.right = "10px";
  dropdownContainer.style.zIndex = "10";
  dropdownContainer.style.display = "flex";
  dropdownContainer.style.alignItems = "center";
  dropdownContainer.style.gap = "8px";

  const label = document.createElement("label");
  label.textContent = "Data Source:";
  label.style.color = "white";
  label.style.fontSize = "12px";
  label.style.fontFamily = "monospace";

  const select = document.createElement("select");
  select.style.padding = "6px 10px";
  select.style.borderRadius = "4px";
  select.style.border = "1px solid #ccc";
  select.style.fontSize = "12px";
  select.style.fontFamily = "monospace";
  select.style.cursor = "pointer";
  select.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  select.style.color = "white";

  const windOption = document.createElement("option");
  windOption.value = "wind";
  windOption.textContent = "Wind";

  const taxiOption = document.createElement("option");
  taxiOption.value = "taxi";
  taxiOption.textContent = "Taxi Vector Field";

  select.appendChild(windOption);
  select.appendChild(taxiOption);
  select.value = "wind"; // Default selection

  dropdownContainer.appendChild(label);
  dropdownContainer.appendChild(select);
  mapContainer.appendChild(dropdownContainer);

  // State for current data source and field
  let currentDataSource = "wind";
  let field: VectorField;

  // Function to load vector field data
  async function loadVectorField(dataSource: string) {
    let vectorFieldData: { header: any; data: { u: number[]; v: number[] } };

    if (dataSource === "taxi") {
      vectorFieldData = await fetch("/taxi-vector-field.json").then((r) =>
        r.json(),
      );
    } else {
      vectorFieldData = await parseWind("/wind.json");
    }

    field = new VectorField(
      vectorFieldData.header.nx,
      vectorFieldData.header.ny,
      vectorFieldData.data.u,
      vectorFieldData.data.v,
    );
    currentDataSource = dataSource;
  }

  // Load initial wind data
  await loadVectorField("wind");

  // ---- Trail canvas ----
  const trailCanvas = document.createElement("canvas");
  const trailCtx = trailCanvas.getContext("2d")!;

  // --------------------------------------------------
  // Canvas resize
  // --------------------------------------------------
  let particles: ParticleSystem;

  function resizeCanvas() {
    const rect = mapContainer.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    trailCanvas.width = rect.width;
    trailCanvas.height = rect.height;

    if (particles) {
      particles.width = canvas.width;
      particles.height = canvas.height;
    }

    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
  }

  // Resize on window resize
  window.addEventListener("resize", resizeCanvas);

  // ---- Dropdown change listener ----
  select.addEventListener("change", async (e) => {
    const newDataSource = (e.target as HTMLSelectElement).value;
    if (newDataSource !== currentDataSource) {
      await loadVectorField(newDataSource);
      // Clear trails when switching data sources
      trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

      // Zoom to appropriate bounds
      if (newDataSource === "taxi") {
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
            [-180, -85],
            [180, 85],
          ],
          { padding: 50 },
        );
      }
    }
  });

  // Wait for map to load before starting animation
  map.on("load", () => {
    resizeCanvas();

    particles = new ParticleSystem(canvas.width, canvas.height, {
      numParticles: 8000,
      maxAge: 1200,
    });

    // --------------------------------------------------
    // Color mapping
    // --------------------------------------------------
    function speedToColor(speed: number) {
      const h = Math.max(0, 240 - speed * 10);
      return `hsl(${h}, 100%, 70%)`;
    }

    // --------------------------------------------------
    // Animation loop
    // --------------------------------------------------
    const SPEED_SCALE = 0.8;
    const TAXI_SPEED_SCALE = 0.01; // Much smaller scale for m/s velocities

    function frame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Fade trails
      trailCtx.globalCompositeOperation = "destination-out";
      trailCtx.fillStyle = "rgba(0,0,0,0.05)";
      trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
      trailCtx.globalCompositeOperation = "source-over";

      for (const p of particles.particles) {
        // Convert screen coordinates to lng/lat
        const lngLat = map.unproject([p.x, p.y]);
        const [lng, lat] = [lngLat.lng, lngLat.lat];

        // Calculate grid coordinates based on data source bounds
        let gx: number, gy: number;

        if (currentDataSource === "taxi") {
          // Taxi data bounds from the actual data
          const latMin = field.ny > 0 ? PORTO_BOUNDS.latMin : 0;
          const latMax = field.ny > 0 ? PORTO_BOUNDS.latMax : 0;
          const lonMin = field.nx > 0 ? PORTO_BOUNDS.lonMin : 0;
          const lonMax = field.nx > 0 ? PORTO_BOUNDS.lonMax : 0;

          // Map lat/lon to grid coordinates (match generation in taxiVectorField.ts)
          gx = ((lng - lonMin) / (lonMax - lonMin)) * (field.nx - 1);
          gy = ((lat - latMin) / (latMax - latMin)) * (field.ny - 1);
        } else {
          // Wind data is global
          const adjLon = lng < 0 ? lng + 360 : lng;
          gx = (adjLon / 360) * (field.nx - 1);
          gy = ((90 - lat) / 180) * (field.ny - 1);
        }

        const wind = field.sampleInterpolated(gx, gy);
        const speed = Math.sqrt(wind.u * wind.u + wind.v * wind.v);

        // Mercator correction
        const latRad = (lat * Math.PI) / 180;
        const cosLat = Math.cos(latRad);

        // Get zoom level for scaling
        const zoomFactor = Math.pow(2, map.getZoom());

        // Use appropriate speed scale based on data source
        const effectiveSpeedScale =
          currentDataSource === "taxi" ? TAXI_SPEED_SCALE : SPEED_SCALE;

        // Apply velocity
        if (currentDataSource === "taxi") {
          // For taxi data: u is eastward (longitude), v is northward (latitude)
          // y increases downward on screen, so we subtract v to go north
          p.x += wind.u * cosLat * effectiveSpeedScale * (zoomFactor / 256);
          p.y -= wind.v * effectiveSpeedScale * (zoomFactor / 256);
        } else {
          // For wind data (global)
          p.x += wind.u * cosLat * effectiveSpeedScale * (zoomFactor / 256);
          p.y -= wind.v * effectiveSpeedScale * (zoomFactor / 256);
        }

        // Wrap particles that go off-screen
        const rect = mapContainer.getBoundingClientRect();
        if (p.x < 0) p.x += rect.width;
        if (p.x >= rect.width) p.x -= rect.width;
        if (p.y < 0) p.y += rect.height;
        if (p.y >= rect.height) p.y -= rect.height;

        // Draw particle - use different styling for zero velocity cells
        const isZeroVelocity = wind.u === 0 && wind.v === 0;
        trailCtx.fillStyle = isZeroVelocity
          ? "rgba(255, 0, 0, 0.8)"
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
