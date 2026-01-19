import * as topojson from "topojson-client";
import { geoMercator, geoPath } from "d3-geo";
import { zoom, ZoomTransform, zoomIdentity } from "d3-zoom";
import { select } from "d3-selection";
import { FeatureCollection, Feature, Geometry } from "geojson";

import { parseWind } from "./core/parseWind";
import { VectorField } from "./core/vectorField";
import { ParticleSystem } from "./core/particleSystem";
import worldJson from "../data/world-110m.json";

// --------------------------------------------------
// TopoJSON setup
// --------------------------------------------------
const worldData = worldJson as any;
const rawCountries = topojson.feature(
  worldData,
  worldData.objects.countries
) as unknown;

let countriesFC: FeatureCollection<Geometry, any>;
if ((rawCountries as FeatureCollection<Geometry, any>).features) {
  countriesFC = rawCountries as FeatureCollection<Geometry, any>;
} else {
  countriesFC = {
    type: "FeatureCollection",
    features: [rawCountries as Feature<Geometry, any>],
  };
}

// --------------------------------------------------
// Main
// --------------------------------------------------
async function main() {
  // ---- Wind data ----
  const windData = await parseWind("/wind.json");
  const field = new VectorField(
    windData.header.nx,
    windData.header.ny,
    windData.data.u,
    windData.data.v
  );

  // ---- Visible canvas ----
  const canvas = document.createElement("canvas");
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  // ---- Offscreen canvases ----
  const bgCanvas = document.createElement("canvas");
  const bgCtx = bgCanvas.getContext("2d")!;

  const trailCanvas = document.createElement("canvas");
  const trailCtx = trailCanvas.getContext("2d")!;

  // ---- Projection ----
  const projection = geoMercator().translate([0, 0]);
  const path = geoPath<Geometry>().projection(projection).context(bgCtx);

  let currentTransform: ZoomTransform | null = null;

  // Base projection state (IMPORTANT)
  let baseScaleValue = 1;
  let baseTranslate: [number, number] = [0, 0];

  const baseScale = () => canvas.width / (2 * Math.PI);

  // --------------------------------------------------
  // Background drawing
  // --------------------------------------------------
  function redrawBackground() {
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

    // 1. Deep charcoal for the sea
    bgCtx.fillStyle = "#2d3135";
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    bgCtx.strokeStyle = "rgba(255, 255, 255, 0.2)"; // Very faint white outline
    bgCtx.lineWidth = 0.8;

    // 2. Lighter charcoal for the land
    bgCtx.fillStyle = "#41464bff";
    countriesFC.features.forEach((feature) => {
      bgCtx.beginPath();
      path(feature.geometry as any);
      bgCtx.fill();
      bgCtx.stroke();
    });
  }
  // --------------------------------------------------
  // Resize handling
  // --------------------------------------------------
  let particles: ParticleSystem;

  // --------------------------------------------------
  // Zoom behavior (CORRECT)
  // --------------------------------------------------
  const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
    .scaleExtent([0.5, 8])
    .on("start", () => {
      trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    })
    .on("zoom", (event) => {
      const t = event.transform;
      currentTransform = t;

      // Use t.x and t.y directly. They now contain the
      // centering offset AND the zoom-to-cursor offset.
      projection.scale(baseScaleValue * t.k).translate([t.x, t.y]);

      redrawBackground();
    });

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;
    trailCanvas.width = canvas.width;
    trailCanvas.height = canvas.height;

    baseScaleValue = baseScale();

    // 1. Create the "starting" transform: Centered on screen, scale at 1 (multiplier)
    const initialTransform = zoomIdentity
      .translate(canvas.width / 2, canvas.height / 2)
      .scale(1);

    // 2. Update the zoom behavior's internal state
    select(canvas).call(zoomBehavior.transform as any, initialTransform);

    // 3. Update projection to match this initial state immediately
    projection
      .scale(baseScaleValue * initialTransform.k)
      .translate([initialTransform.x, initialTransform.y]);

    if (particles) {
      particles.width = canvas.width;
      particles.height = canvas.height;
    }

    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    redrawBackground();
  }

  window.addEventListener("resize", resizeCanvas);

  // 🔑 Must resize BEFORE creating particles
  resizeCanvas();

  particles = new ParticleSystem(canvas.width, canvas.height, {
    numParticles: 5000,
    maxAge: 1200,
  });

  select(canvas).call(zoomBehavior as any);

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
  const SPEED_SCALE = 0.015;

  function frame() {
    ctx.drawImage(bgCanvas, 0, 0);

    // Fade trails
    trailCtx.globalCompositeOperation = "destination-out";
    trailCtx.fillStyle = "rgba(0,0,0,0.05)";
    trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
    trailCtx.globalCompositeOperation = "source-over";

    for (const p of particles.particles) {
      const coords = projection.invert([p.x, p.y]);
      if (!coords) continue;

      const [lon, lat] = coords;

      const adjLon = lon < 0 ? lon + 360 : lon;
      const gx = (adjLon / 360) * (field.nx - 1);
      const gy = ((90 - lat) / 180) * (field.ny - 1);

      const wind = field.sampleInterpolated(gx, gy);
      const speed = Math.sqrt(wind.u * wind.u + wind.v * wind.v);

      // Mercator correction
      const latRad = (lat * Math.PI) / 180;
      const cosLat = Math.cos(latRad);

      const zoomFactor = currentTransform?.k ?? 1;

      p.x += wind.u * cosLat * SPEED_SCALE * zoomFactor;
      p.y -= wind.v * SPEED_SCALE * zoomFactor;

      trailCtx.fillStyle = speedToColor(speed);
      trailCtx.beginPath();
      trailCtx.arc(p.x, p.y, 1.0, 0, Math.PI * 2);
      trailCtx.fill();
    }

    ctx.drawImage(trailCanvas, 0, 0);
    particles.update();
    requestAnimationFrame(frame);
  }

  frame();
}

main();
