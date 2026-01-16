import { parseWind } from "./parseWind";
import { VectorField } from "./vectorField";
import { ParticleSystem } from "./particleSystem";

async function main() {
  // Load wind data asynchronously
  const windData = await parseWind("/wind.json");

  // Now windData is WindData type
  const vectorField = new VectorField(
    windData.header.nx,
    windData.header.ny,
    windData.data.u,
    windData.data.v
  );

  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

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
