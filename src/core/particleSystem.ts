export interface Particle {
  x: number;
  y: number;
  age: number;
}

export interface ParticleSystemOptions {
  numParticles?: number;
  maxAge?: number;
}

export class ParticleSystem {
  particles: Particle[];
  width: number;
  height: number;
  maxAge: number;

  constructor(
    width: number,
    height: number,
    options: ParticleSystemOptions = {}
  ) {
    this.width = width;
    this.height = height;
    this.maxAge = options.maxAge ?? 100;

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

  update() {
    for (const p of this.particles) {
      p.age++;

      if (p.x < 0) p.x += this.width;
      if (p.x >= this.width) p.x -= this.width;
      if (p.y < 0) p.y += this.height;
      if (p.y >= this.height) p.y -= this.height;

      if (p.age > this.maxAge) {
        Object.assign(p, this.createParticle());
      }
    }
  }
}
