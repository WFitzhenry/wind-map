import { VectorField } from "./vectorField";
import { ParticleSystem } from "./particles";
import { Renderer } from "./renderer";
import type { Grid } from "./types";

export class EarthApp {
  private last = 0;
  private particles!: ParticleSystem;
  private renderer: Renderer;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
  }

  async load(url: string) {
    const res = await fetch(url);
    const grid = (await res.json()) as Grid;
    const field = new VectorField(grid);
    this.particles = new ParticleSystem(field);
  }

  start() {
    requestAnimationFrame(this.frame);
  }

  private frame = (time: number) => {
    const dt = (time - this.last) * 0.001;
    this.last = time;

    this.particles.update(dt);
    this.renderer.fade();
    this.renderer.draw(this.particles);

    requestAnimationFrame(this.frame);
  };
}
