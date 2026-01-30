///////////////////////////
// Types
///////////////////////////

export interface Observation {
  type: "observation";
  entityId: number;
  latitude: number;
  longitude: number;
  time: number; // ms since epoch
  speed?: number; // meters / second
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
// Grid definition (Shenzhen)
///////////////////////////

const GUANG_BOUNDS = {
  latMin: 21.6,
  latMax: 23.2,
  lonMin: 113.4,
  lonMax: 114.4,
};

// ~500m resolution
const LAT_STEP = 0.005; // ≈ 555 m
const LON_STEP = 0.0055; // ≈ 520 m at ~23° lat

///////////////////////////
// Helpers
///////////////////////////

const METERS_PER_DEG_LAT = 111_320;
const MAX_DELTA_T = 2 * 60 * 1000; // 2 minutes (ms)

function metersPerDegLon(lat: number): number {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

function isMorning(time: number): boolean {
  const h = new Date(time).getHours();
  return h < 12;
}

function isAfternoon(time: number): boolean {
  const h = new Date(time).getHours();
  return h >= 12;
}

///////////////////////////
// Core shared builder
///////////////////////////

function buildVectorField(observations: Observation[]): VectorField {
  // 1. Group by entityId
  const tracks = new Map<number, Observation[]>();

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
  const nx = Math.ceil((GUANG_BOUNDS.lonMax - GUANG_BOUNDS.lonMin) / LON_STEP);
  const ny = Math.ceil((GUANG_BOUNDS.latMax - GUANG_BOUNDS.latMin) / LAT_STEP);

  const size = nx * ny;
  const sumU = new Float32Array(size);
  const sumV = new Float32Array(size);
  const count = new Uint32Array(size);

  // 4. Build velocity samples
  for (const track of tracks.values()) {
    for (let i = 1; i < track.length; i++) {
      const p0 = track[i - 1];
      const p1 = track[i];

      const dt = p1.time - p0.time;
      if (dt > MAX_DELTA_T) continue;

      if (p1.speed == null || p1.speed <= 0) continue;

      const dLat = p1.latitude - p0.latitude;
      const dLon = p1.longitude - p0.longitude;

      const dist = Math.hypot(
        dLat * METERS_PER_DEG_LAT,
        dLon * metersPerDegLon(p0.latitude),
      );

      if (dist === 0) continue;

      // Direction unit vector
      const dirLat = (dLat * METERS_PER_DEG_LAT) / dist;
      const dirLon = (dLon * metersPerDegLon(p0.latitude)) / dist;

      // Velocity from speed (m/s)
      const v = dirLat * p1.speed;
      const u = dirLon * p1.speed;

      const midLat = (p0.latitude + p1.latitude) * 0.5;
      const midLon = (p0.longitude + p1.longitude) * 0.5;

      const ix = Math.floor((midLon - GUANG_BOUNDS.lonMin) / LON_STEP);
      const iy = Math.floor((midLat - GUANG_BOUNDS.latMin) / LAT_STEP);

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
    }
  }

  return {
    header: {
      nx,
      ny,
      latMin: GUANG_BOUNDS.latMin,
      lonMin: GUANG_BOUNDS.lonMin,
      latStep: LAT_STEP,
      lonStep: LON_STEP,
    },
    data: {
      u: Array.from(u),
      v: Array.from(v),
    },
  };
}

///////////////////////////
// Public API
///////////////////////////

export function observationsToGuangMorningVectorField(
  observations: Observation[],
): VectorField {
  return buildVectorField(observations.filter((o) => isMorning(o.time)));
}

export function observationsToGuangAfternoonVectorField(
  observations: Observation[],
): VectorField {
  return buildVectorField(observations.filter((o) => isAfternoon(o.time)));
}
