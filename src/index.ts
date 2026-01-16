import { parseWind } from "./core/parseWind";
import { VectorField } from "./core/vectorField";
import { ParticleSystem } from "./core/particleSystem";

async function main() {
  // Canvas setup
  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Load wind.json from public folder
  const windData = await parseWind("/wind.json");

  const vectorField = new VectorField(
    windData.header.nx,
    windData.header.ny,
    windData.data.u,
    windData.data.v
  );

  const particleSystem = new ParticleSystem(
    vectorField,
    5000,
    canvas.width,
    canvas.height
  );

  function frame() {
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "white";
    for (const p of particleSystem.particles) {
      ctx.fillRect(p.x, p.y, 1, 1);
    }

    particleSystem.update();
    requestAnimationFrame(frame);
  }

  frame();
}

main();
