export interface Vector {
  u: number;
  v: number;
}

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
   * Sample the wind vector at integer grid coordinates
   * ix: 0..nx-1, iy: 0..ny-1
   */
  sample(ix: number, iy: number): Vector {
    // Clamp coordinates just in case
    const x = Math.max(0, Math.min(ix, this.nx - 1));
    const y = Math.max(0, Math.min(iy, this.ny - 1));
    const index = y * this.nx + x;
    return { u: this.u[index], v: this.v[index] };
  }

  /**
   * Optional: bilinear interpolation for smoother flow
   */
  sampleInterpolated(x: number, y: number): Vector {
    // Map float coordinates to grid
    const gx = Math.max(0, Math.min(x, this.nx - 1));
    const gy = Math.max(0, Math.min(y, this.ny - 1));

    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = Math.min(x0 + 1, this.nx - 1);
    const y1 = Math.min(y0 + 1, this.ny - 1);

    const sx = gx - x0;
    const sy = gy - y0;

    const i00 = y0 * this.nx + x0;
    const i10 = y0 * this.nx + x1;
    const i01 = y1 * this.nx + x0;
    const i11 = y1 * this.nx + x1;

    const u =
      this.u[i00] * (1 - sx) * (1 - sy) +
      this.u[i10] * sx * (1 - sy) +
      this.u[i01] * (1 - sx) * sy +
      this.u[i11] * sx * sy;

    const v =
      this.v[i00] * (1 - sx) * (1 - sy) +
      this.v[i10] * sx * (1 - sy) +
      this.v[i01] * (1 - sx) * sy +
      this.v[i11] * sx * sy;

    return { u, v };
  }
}
