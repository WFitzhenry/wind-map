export interface Observation {
  type: "observation";
  entityId: string;
  latitude: number;
  longitude: number;
  time: number;
}

export interface VectorFieldJson {
  header: {
    nx: number;
    ny: number;
    latMin: number;
    lonMin: number;
    latStep: number;
    lonStep: number;
  };
  data: {
    u: number[];
    v: number[];
    count?: number[];
  };
}

export interface VectorFieldBuildOptions {
  bounds?: {
    latMin: number;
    latMax: number;
    lonMin: number;
    lonMax: number;
  };
  latStep?: number;
  lonStep?: number;
}

const DEFAULT_PORTO_BOUNDS = {
  latMin: 41.03,
  latMax: 41.315,
  lonMin: -8.74,
  lonMax: -8.3,
};

const DEFAULT_LAT_STEP = 0.00125;
const DEFAULT_LON_STEP = 0.0015;
const METERS_PER_DEG_LAT = 111_320;

function metersPerDegLon(lat: number): number {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

export function observationsToVectorField(
  observations: Observation[],
  options: VectorFieldBuildOptions = {},
): VectorFieldJson {
  const bounds = options.bounds ?? DEFAULT_PORTO_BOUNDS;
  const latStep = options.latStep ?? DEFAULT_LAT_STEP;
  const lonStep = options.lonStep ?? DEFAULT_LON_STEP;

  // +1 ensures the final grid node reaches the requested max bound.
  const nx = Math.max(
    2,
    Math.ceil((bounds.lonMax - bounds.lonMin) / lonStep) + 1,
  );
  const ny = Math.max(
    2,
    Math.ceil((bounds.latMax - bounds.latMin) / latStep) + 1,
  );

  const size = nx * ny;
  const sumU = new Float32Array(size);
  const sumV = new Float32Array(size);
  const count = new Uint32Array(size);

  const tracks = new Map<string, Observation[]>();
  for (const obs of observations) {
    if (!tracks.has(obs.entityId)) {
      tracks.set(obs.entityId, []);
    }
    tracks.get(obs.entityId)!.push(obs);
  }

  for (const track of tracks.values()) {
    track.sort((a, b) => a.time - b.time);
  }

  for (const track of tracks.values()) {
    for (let i = 1; i < track.length; i++) {
      const p0 = track[i - 1];
      const p1 = track[i];

      const dt = (p1.time - p0.time) / 1000;
      if (dt <= 0) continue;

      const dLat = p1.latitude - p0.latitude;
      const dLon = p1.longitude - p0.longitude;

      const midLat = (p0.latitude + p1.latitude) * 0.5;
      const midLon = (p0.longitude + p1.longitude) * 0.5;

      const v = (dLat * METERS_PER_DEG_LAT) / dt;
      const u = (dLon * metersPerDegLon(midLat)) / dt;

      const ix = Math.floor((midLon - bounds.lonMin) / lonStep);
      const iy = Math.floor((midLat - bounds.latMin) / latStep);

      if (ix < 0 || ix >= nx || iy < 0 || iy >= ny) continue;

      const idx = ix + iy * nx;
      sumU[idx] += u;
      sumV[idx] += v;
      count[idx]++;
    }
  }

  const u = new Float32Array(size);
  const v = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    if (count[i] > 0) {
      u[i] = sumU[i] / count[i];
      v[i] = sumV[i] / count[i];
    }
  }

  return {
    header: {
      nx,
      ny,
      latMin: bounds.latMin,
      lonMin: bounds.lonMin,
      latStep,
      lonStep,
    },
    data: {
      u: Array.from(u),
      v: Array.from(v),
      count: Array.from(count),
    },
  };
}
