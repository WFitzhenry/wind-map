export interface Vector {
  u: number;
  v: number;
}

export interface Grid {
  width: number;
  height: number;
  data: Vector[];
}

export interface Particle {
  x: number;
  y: number;
  age: number;
}
