export class VectorField {
  nx: number;
  ny: number;
  u: number[];
  v: number[];

  constructor(nx: number, ny: number, u: number[], v: number[]) {
    this.nx = nx;
    this.ny = ny;
    this.u = u;
    this.v = v;
  }

  /**
   * Sample the vector field at fractional coordinates (x, y)
   */
  sample(ix: number, iy: number): { u: number; v: number } {
    const index = iy * this.nx + ix;
    return { u: this.u[index], v: this.v[index] };
  }
}
