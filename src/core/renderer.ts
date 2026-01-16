import { ParticleSystem } from "./particleSystem";

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
    this.ctx.globalAlpha = 0.8;
    this.ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (const p of ps.particles) {
      this.ctx.fillRect(p.x, p.y, 2, 2);
    }
  }
}
