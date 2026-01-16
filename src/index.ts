import * as topojson from "topojson-client";
import { geoMercator, geoPath } from "d3-geo";
import { FeatureCollection, Feature, Geometry } from "geojson";
import { parseWind } from "./core/parseWind";
import { VectorField } from "./core/vectorField";
import { ParticleSystem } from "./core/particleSystem";
import worldJson from "../data/world-110m.json";

// --- TopoJSON feature collection ---
const worldData = worldJson as unknown as any;
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

async function main() {
  // --- Load wind data ---
  const windData = await parseWind("/wind.json");
  const field = new VectorField(
    windData.header.nx,
    windData.header.ny,
    windData.data.u,
    windData.data.v
  );

  // --- Fullscreen main canvas ---
  const canvas = document.createElement("canvas");
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.overflow = "hidden";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  // --- Background canvas for map ---
  const bgCanvas = document.createElement("canvas");
  const bgCtx = bgCanvas.getContext("2d")!;

  // --- Trail canvas for particles ---
  const trailCanvas = document.createElement("canvas");
  const trailCtx = trailCanvas.getContext("2d")!;

  // --- Mercator projection ---
  const projection = geoMercator();
  const path = geoPath<Geometry>().projection(projection).context(bgCtx);

  // --- Particle system ---
  const particles = new ParticleSystem(
    field,
    window.innerWidth,
    window.innerHeight,
    {
      numParticles: 8000,
      maxAge: 400,
      speed: 0.02,
      respawnFraction: 0.001,
    }
  );

  // --- Map wind speed to color ---
  function speedToColor(speed: number) {
    const h = Math.min(240 - (speed / 20) * 240, 240);
    return `hsl(${h}, 100%, 70%)`;
  }

  // --- Resize canvas and redraw map ---
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;

    trailCanvas.width = canvas.width;
    trailCanvas.height = canvas.height;

    projection
      .scale(canvas.width / (2 * Math.PI))
      .translate([canvas.width / 2, canvas.height / 2]);

    // Clear the trail canvas on resize
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

    // Draw background map
    bgCtx.fillStyle = "#001f3f"; // ocean
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    bgCtx.fillStyle = "#0a3d62"; // land
    countriesFC.features.forEach((feature) => {
      bgCtx.beginPath();
      path(feature.geometry as any); // TS-safe
      bgCtx.fill();
    });
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // --- Animation loop ---
  function frame() {
    // 1. Draw the static background map onto the main canvas
    ctx.drawImage(bgCanvas, 0, 0);

    // 2. FADE EFFECT (The fix)
    // Instead of painting black, we "rub out" a bit of the old trails
    trailCtx.globalCompositeOperation = "destination-out"; // This makes new drawing erase existing pixels
    trailCtx.fillStyle = "rgba(0,0,0,0.1)"; // Adjust this (0.1 = faster fade, 0.01 = long trails)
    trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);

    // 3. Reset composite operation to draw normally
    trailCtx.globalCompositeOperation = "source-over";

    // 4. Draw particles on trail canvas
    for (const p of particles.particles) {
      const wind = field.sample(p.x, p.y);
      const speed = Math.sqrt(wind.u * wind.u + wind.v * wind.v);

      trailCtx.fillStyle = speedToColor(speed);

      // Draw the particle
      trailCtx.fillRect(p.x, p.y, 1.5, 1.5);
    }

    // 5. Overlay the transparent trail canvas on top of the main canvas (map)
    ctx.drawImage(trailCanvas, 0, 0);

    particles.update();
    requestAnimationFrame(frame);
  }

  frame();
}

main();
