import { geoMercator } from "d3-geo";

export class Projection {
  private projection;

  constructor(width: number, height: number) {
    this.projection = geoMercator()
      .scale(width / 2 / Math.PI)
      .translate([width / 2, height / 2]);
  }

  project(lat: number, lon: number): [number, number] {
    return this.projection([lon, lat]) as [number, number];
  }
}
