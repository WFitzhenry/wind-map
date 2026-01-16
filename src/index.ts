import * as topojson from "topojson-client";
import { geoMercator, geoPath } from "d3-geo";
import { parseWind } from "./core/parseWind";
import { VectorField } from "./core/vectorField";
import { ParticleSystem } from "./core/particleSystem";
import worldJson from "../data/world-110m.json";

// --- Cast JSON to TopoJSON Topology ---
const worldData = worldJson as unknown as any;

// --- Extract countries as FeatureCollection ---
const countries = topojson.feature(
  worldData,
  worldData.objects.countries
) as any as { features: any[] };

async function main() {
  // --- Load wind data ---
  const windData = await parseWind("/wind.json");
  const field = new VectorField(
    windData.header.nx,
    windData.header.ny,
    windData.data.u,
    windData.data.v
  );

  // --- Setup canvas ---
  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  // --- Setup Mercator projection with canvas context ---
  const projection = geoMercator()
    .scale(canvas.width / (2 * Math.PI))
    .translate([canvas.width / 2, canvas.height / 2]);
  const path = geoPath().projection(projection).context(ctx);

  // --- Particle system ---
  const particles = new ParticleSystem(field, canvas.width, canvas.height, {
    numParticles: 8000,
    maxAge: 400,
    speed: 0.02,
    respawnFraction: 0.001,
  });

  // --- Animation loop ---
  function frame() {
    // Draw ocean background
    ctx.fillStyle = "#001f3f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw land
    ctx.fillStyle = "#0a3d62";
    countries.features.forEach((feature) => {
      ctx.beginPath();
      path(feature); // now draws on canvas
      ctx.fill();
    });

    // Fade trails slightly
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw particles
    ctx.fillStyle = "white";
    for (const p of particles.particles) {
      ctx.fillRect(p.x, p.y, 1, 1);
    }

    // Update particle positions
    particles.update();

    requestAnimationFrame(frame);
  }

  frame();
}

main();
