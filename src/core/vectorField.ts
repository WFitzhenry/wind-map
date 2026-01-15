import type { Grid, Vector } from "./types";

export class VectorField {
  constructor(public readonly grid: Grid) {}

  private index(x: number, y: number): number {
    return y * this.grid.width + x;
  }

  sample(x: number, y: number): Vector {
    const { width, height, data } = this.grid;

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);

    const a = data[this.index(x0, y0)];
    const b = data[this.index(x1, y0)];
    const c = data[this.index(x0, y1)];
    const d = data[this.index(x1, y1)];

    const tx = x - x0;
    const ty = y - y0;

    return {
      u:
        a.u * (1 - tx) * (1 - ty) +
        b.u * tx * (1 - ty) +
        c.u * (1 - tx) * ty +
        d.u * tx * ty,
      v:
        a.v * (1 - tx) * (1 - ty) +
        b.v * tx * (1 - ty) +
        c.v * (1 - tx) * ty +
        d.v * tx * ty,
    };
  }
}
