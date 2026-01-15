import type { Particle } from "./types";
import { VectorField } from "./vectorField";

export class ParticleSystem {
  particles: Particle[] = [];

  constructor(
    private field: VectorField,
    private count = 8000,
    private maxAge = 100
  ) {
    this.spawn();
  }

  private spawn() {
    const { width, height } = this.field.grid;
    this.particles = Array.from({ length: this.count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      age: Math.random() * this.maxAge,
    }));
  }

  update(dt: number) {
    const { width, height } = this.field.grid;

    for (const p of this.particles) {
      if (p.age++ > this.maxAge) {
        p.x = Math.random() * width;
        p.y = Math.random() * height;
        p.age = 0;
        continue;
      }

      const v = this.field.sample(p.x, p.y);
      p.x += v.u * dt;
      p.y += v.v * dt;

      if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) {
        p.age = this.maxAge;
      }
    }
  }
}
