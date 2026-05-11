// maritimeVectorField.ts

///////////////////////////
// Types
///////////////////////////

export interface Observation {
  type: "observation";
  entityId: string;
  latitude: number;
  longitude: number;
  time: number; // ms since epoch
}

export interface VectorField {
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

///////////////////////////
// Helpers
///////////////////////////

const MARITIME_BOUNDS = {
  latMin: 12.5,
  latMax: 47.0,
  lonMin: -160.0,
  lonMax: -65.0,
};

const METERS_PER_DEG_LAT = 111_320;
const MAX_DT_SECONDS = 2 * 60 * 60;
const MAX_SPEED_MPS = 25;

function metersPerDegLon(lat: number): number {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

function detectBounds(observations: Observation[]): {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
} {
  let latMin = Infinity,
    latMax = -Infinity;
  let lonMin = Infinity,
    lonMax = -Infinity;

  for (const obs of observations) {
    latMin = Math.min(latMin, obs.latitude);
    latMax = Math.max(latMax, obs.latitude);
    lonMin = Math.min(lonMin, obs.longitude);
    lonMax = Math.max(lonMax, obs.longitude);
  }

  // Add 0.5% padding
  const latPad = (latMax - latMin) * 0.005;
  const lonPad = (lonMax - lonMin) * 0.005;

  return {
    latMin: latMin - latPad,
    latMax: latMax + latPad,
    lonMin: lonMin - lonPad,
    lonMax: lonMax + lonPad,
  };
}

///////////////////////////
// Core function
///////////////////////////

export function observationsToVectorField(
  observations: Observation[],
  options: VectorFieldBuildOptions = {},
): VectorField {
  const bounds = options.bounds ?? MARITIME_BOUNDS;
  // ~2km resolution
  const latStep = options.latStep ?? 0.02;
  const lonStep = options.lonStep ?? 0.02;

  // 1. Group by entityId
  const tracks = new Map<string, Observation[]>();

  for (const obs of observations) {
    if (!tracks.has(obs.entityId)) {
      tracks.set(obs.entityId, []);
    }
    tracks.get(obs.entityId)!.push(obs);
  }

  // 2. Sort each trajectory by time
  for (const track of tracks.values()) {
    track.sort((a, b) => a.time - b.time);
  }

  // 3. Grid setup
  const nx = Math.ceil((bounds.lonMax - bounds.lonMin) / lonStep);
  const ny = Math.ceil((bounds.latMax - bounds.latMin) / latStep);

  const size = nx * ny;
  const sumU = new Float32Array(size);
  const sumV = new Float32Array(size);
  const count = new Uint32Array(size);

  // 4. Build velocity samples
  for (const track of tracks.values()) {
    for (let i = 1; i < track.length; i++) {
      const p0 = track[i - 1];
      const p1 = track[i];

      const dt = (p1.time - p0.time) / 1000; // seconds
      if (dt <= 0 || dt > MAX_DT_SECONDS) continue;

      const dLat = p1.latitude - p0.latitude;
      const dLon = p1.longitude - p0.longitude;

      const midLat = (p0.latitude + p1.latitude) * 0.5;
      const midLon = (p0.longitude + p1.longitude) * 0.5;

      // Convert to meters / second
      const v = (dLat * METERS_PER_DEG_LAT) / dt;
      const u = (dLon * metersPerDegLon(midLat)) / dt;
      if (Math.hypot(u, v) > MAX_SPEED_MPS) continue;

      // Grid cell
      const ix = Math.floor((midLon - bounds.lonMin) / lonStep);
      const iy = Math.floor((midLat - bounds.latMin) / latStep);

      if (ix < 0 || ix >= nx || iy < 0 || iy >= ny) continue;

      const idx = ix + iy * nx;
      sumU[idx] += u;
      sumV[idx] += v;
      count[idx]++;
    }
  }

  // 5. Average per cell
  const u = new Float32Array(size);
  const v = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    if (count[i] > 0) {
      u[i] = sumU[i] / count[i];
      v[i] = sumV[i] / count[i];
    } else {
      u[i] = 0;
      v[i] = 0;
    }
  }

  // 6. Return wind-style JSON
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
    },
  };
}
