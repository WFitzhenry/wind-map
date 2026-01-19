import * as topojson from "topojson-client";
import { geoMercator, geoPath } from "d3-geo";
import { FeatureCollection, Feature, Geometry } from "geojson";
import { parseWind } from "./core/parseWind";
import { VectorField } from "./core/vectorField";
import { ParticleSystem } from "./core/particleSystem";
import worldJson from "../data/world-110m.json";

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

async function main() {
  const windData = await parseWind("/wind.json");
  const field = new VectorField(
    windData.header.nx,
    windData.header.ny,
    windData.data.u,
    windData.data.v
  );

  const canvas = document.createElement("canvas");
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  const bgCanvas = document.createElement("canvas");
  const bgCtx = bgCanvas.getContext("2d")!;

  const trailCanvas = document.createElement("canvas");
  const trailCtx = trailCanvas.getContext("2d")!;

  const projection = geoMercator();
  const path = geoPath<Geometry>().projection(projection).context(bgCtx);

  const particles = new ParticleSystem(window.innerWidth, window.innerHeight, {
    numParticles: 8000,
    maxAge: 900,
  });

  function speedToColor(speed: number) {
    const h = Math.max(0, 240 - speed * 10);
    return `hsl(${h}, 100%, 70%)`;
  }

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

    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

    bgCtx.fillStyle = "#001f3f";
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    bgCtx.fillStyle = "#0a3d62";
    countriesFC.features.forEach((feature) => {
      bgCtx.beginPath();
      path(feature.geometry as any);
      bgCtx.fill();
    });
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  const SPEED_SCALE = 0.02;

  function frame() {
    ctx.drawImage(bgCanvas, 0, 0);

    trailCtx.globalCompositeOperation = "destination-out";
    trailCtx.fillStyle = "rgba(0,0,0,0.1)";
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

      const latRad = (lat * Math.PI) / 180;
      const cosLat = Math.cos(latRad);

      p.x += wind.u * cosLat * SPEED_SCALE;
      p.y -= wind.v * SPEED_SCALE;

      trailCtx.fillStyle = speedToColor(speed);
      trailCtx.fillRect(p.x, p.y, 1.5, 1.5);
    }

    ctx.drawImage(trailCanvas, 0, 0);
    particles.update();
    requestAnimationFrame(frame);
  }

  frame();
}

main();
