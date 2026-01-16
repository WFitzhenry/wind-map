import { VectorField } from "./vectorField";

interface Particle {
  x: number;
  y: number;
  age: number;
}

export class ParticleSystem {
  particles: Particle[];
  field: VectorField;
  width: number;
  height: number;

  constructor(
    field: VectorField,
    numParticles: number,
    width: number,
    height: number
  ) {
    this.field = field;
    this.width = width;
    this.height = height;
    this.particles = Array.from({ length: numParticles }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      age: Math.floor(Math.random() * 100),
    }));
  }

  update() {
    for (const p of this.particles) {
      const ix = Math.floor((p.x / this.width) * this.field.nx);
      const iy = Math.floor((p.y / this.height) * this.field.ny);

      const { u, v } = this.field.sample(ix, iy);

      // Update particle position (scale factor can be adjusted)
      p.x += u * 0.05;
      p.y -= v * 0.05; // invert Y if needed
      p.age++;

      // Wrap around
      if (p.x < 0) p.x += this.width;
      if (p.x > this.width) p.x -= this.width;
      if (p.y < 0) p.y += this.height;
      if (p.y > this.height) p.y -= this.height;
    }
  }
}
