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
      maxAge: 900,
      speed: 0.05,
      respawnFraction: 0.01,
    }
  );

  // --- Map wind speed to color ---
  function speedToColor(speed: number) {
    // Map speed 0-25m/s to Hue 240 (Blue) down to 0 (Red)
    const h = Math.max(0, 240 - speed * 10);
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

  function frame() {
    ctx.drawImage(bgCanvas, 0, 0);

    // 1. Clear trails with transparency (from previous fix)
    trailCtx.globalCompositeOperation = "destination-out";
    trailCtx.fillStyle = "rgba(0,0,0,0.1)";
    trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
    trailCtx.globalCompositeOperation = "source-over";

    for (const p of particles.particles) {
      // 2. Use the built-in D3 invert function
      // Converts pixel [x, y] -> [longitude, latitude]
      const coords = projection.invert([p.x, p.y]);

      if (coords) {
        const [lon, lat] = coords;

        // 3. Map Lon/Lat to your Wind Grid Indices
        // Longitude: -180 to 180 (Total 360 degrees)
        // Latitude: 90 (North) to -90 (South) (Total 180 degrees)

        // Standardize longitude to 0-360 if your data starts at 0 (Atlantic)
        const adjustedLon = lon < 0 ? lon + 360 : lon;

        const gridX = (adjustedLon / 360) * windData.header.nx;
        const gridY = ((90 - lat) / 180) * windData.header.ny;

        // 4. Sample the field using the calculated grid coordinates
        const wind = field.sampleInterpolated(gridX, gridY);

        if (wind) {
          const speed = Math.sqrt(wind.u * wind.u + wind.v * wind.v);

          // 5. Apply Color
          trailCtx.fillStyle = speedToColor(speed);

          // Use a slightly larger pixel (1.5 to 2) so the color is visible
          trailCtx.fillRect(p.x, p.y, 1.5, 1.5);
        }
      }
    }

    ctx.drawImage(trailCanvas, 0, 0);
    particles.update();
    requestAnimationFrame(frame);
  }

  frame();
}

main();
