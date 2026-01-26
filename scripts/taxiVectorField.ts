// taxiVectorField.ts

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

///////////////////////////
// Grid definition (Porto)
///////////////////////////

const PORTO_BOUNDS = {
  latMin: 41.105,
  latMax: 41.215,
  lonMin: -8.74,
  lonMax: -8.52,
};

// ~125m resolution (doubled precision)
const LAT_STEP = 0.00125;
const LON_STEP = 0.0015;

///////////////////////////
// Helpers
///////////////////////////

const METERS_PER_DEG_LAT = 111_320;

function metersPerDegLon(lat: number): number {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

///////////////////////////
// Core function
///////////////////////////

export function observationsToVectorField(
  observations: Observation[],
): VectorField {
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
  const nx = Math.ceil((PORTO_BOUNDS.lonMax - PORTO_BOUNDS.lonMin) / LON_STEP);
  const ny = Math.ceil((PORTO_BOUNDS.latMax - PORTO_BOUNDS.latMin) / LAT_STEP);

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
      if (dt <= 0) continue;

      const dLat = p1.latitude - p0.latitude;
      const dLon = p1.longitude - p0.longitude;

      const midLat = (p0.latitude + p1.latitude) * 0.5;
      const midLon = (p0.longitude + p1.longitude) * 0.5;

      // Convert to meters / second
      const v = (dLat * METERS_PER_DEG_LAT) / dt;
      const u = (dLon * metersPerDegLon(midLat)) / dt;

      // Grid cell
      const ix = Math.floor((midLon - PORTO_BOUNDS.lonMin) / LON_STEP);
      const iy = Math.floor((midLat - PORTO_BOUNDS.latMin) / LAT_STEP);

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
      latMin: PORTO_BOUNDS.latMin,
      lonMin: PORTO_BOUNDS.lonMin,
      latStep: LAT_STEP,
      lonStep: LON_STEP,
    },
    data: {
      u: Array.from(u),
      v: Array.from(v),
    },
  };
}
