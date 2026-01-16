import { VectorField } from "./vectorField";

export interface Particle {
  x: number;
  y: number;
  age: number;
}

export interface ParticleSystemOptions {
  numParticles?: number;
  maxAge?: number;
  speed?: number;
  respawnFraction?: number;
}

export class ParticleSystem {
  particles: Particle[];
  field: VectorField;
  width: number;
  height: number;
  maxAge: number;
  speed: number;
  respawnFraction: number;

  constructor(
    field: VectorField,
    width: number,
    height: number,
    options: ParticleSystemOptions = {}
  ) {
    this.field = field;
    this.width = width;
    this.height = height;

    this.maxAge = options.maxAge ?? 100;
    this.speed = options.speed ?? 0.5;
    this.respawnFraction = options.respawnFraction ?? 0.01;

    const numParticles = options.numParticles ?? 5000;
    this.particles = Array.from({ length: numParticles }, () =>
      this.createParticle()
    );
  }

  private createParticle(): Particle {
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      age: Math.floor(Math.random() * this.maxAge),
    };
  }

  /** Convert canvas Y coordinate to grid Y coordinate (top = North Pole) */
  private canvasYToGridY(y: number): number {
    return ((this.height - y) / this.height) * (this.field.ny - 1);
  }

  update() {
    // Move all particles according to wind
    for (const p of this.particles) {
      const gx = (p.x / this.width) * (this.field.nx - 1);
      const gy = this.canvasYToGridY(p.y);

      const { u, v } = this.field.sampleInterpolated(gx, gy);

      p.x += u * this.speed;
      p.y -= v * this.speed;
      p.age++;

      // Wrap around canvas edges
      if (p.x < 0) p.x += this.width;
      if (p.x >= this.width) p.x -= this.width;
      if (p.y < 0) p.y += this.height;
      if (p.y >= this.height) p.y -= this.height;

      // Reset individual particle if it exceeds maxAge
      if (p.age > this.maxAge) Object.assign(p, this.createParticle());
    }

    // Reset a small fraction of random particles to fill empty areas
    const respawnCount = Math.floor(
      this.particles.length * this.respawnFraction
    );
    for (let i = 0; i < respawnCount; i++) {
      const idx = Math.floor(Math.random() * this.particles.length);
      Object.assign(this.particles[idx], this.createParticle());
    }
  }
}
