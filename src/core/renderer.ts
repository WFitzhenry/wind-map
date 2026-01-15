import { ParticleSystem } from "./particles";

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  fade() {
    this.ctx.globalAlpha = 0.9;
    this.ctx.fillStyle = "rgba(0,0,0,0.9)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(ps: ParticleSystem) {
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = "white";
    for (const p of ps.particles) {
      this.ctx.fillRect(p.x, p.y, 1, 1);
    }
  }
}
