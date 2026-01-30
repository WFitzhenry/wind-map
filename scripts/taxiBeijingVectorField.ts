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

export type TimeSlice = "morning" | "midday" | "evening";

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

function inTimeSlice(timeMs: number, slice: TimeSlice): boolean {
  const d = new Date(timeMs);
  const hour = d.getHours();

  switch (slice) {
    case "morning":
      return hour < 9;
    case "midday":
      return hour >= 9 && hour < 15;
    case "evening":
      return hour >= 15;
  }
}

///////////////////////////
// Grid definition (Beijing)
///////////////////////////

/**
 * Covers urban Beijing where taxi trajectories exist.
 * Adjust if you want tighter cropping.
 */
const BEIJING_BOUNDS = {
  latMin: 39.2,
  latMax: 40.7,
  lonMin: 115.5,
  lonMax: 117.55,
};

// ~150m resolution
const LAT_STEP = 0.0018; // ≈ 200 m (200 / 111,320)
const LON_STEP = 0.00235; // ≈ 200 m at ~40° latitude

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
  slice: TimeSlice,
): VectorField {
  const filtered = observations.filter((o) => inTimeSlice(o.time, slice));
  // 1. Group observations by taxi (entityId)
  const tracks = new Map<string, Observation[]>();

  for (const obs of filtered) {
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
  const nx = Math.ceil(
    (BEIJING_BOUNDS.lonMax - BEIJING_BOUNDS.lonMin) / LON_STEP,
  );
  const ny = Math.ceil(
    (BEIJING_BOUNDS.latMax - BEIJING_BOUNDS.latMin) / LAT_STEP,
  );

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

      const MAX_DT = 90; // seconds
      if (dt > MAX_DT) continue;

      const dLat = p1.latitude - p0.latitude;
      const dLon = p1.longitude - p0.longitude;

      const midLat = (p0.latitude + p1.latitude) * 0.5;
      const midLon = (p0.longitude + p1.longitude) * 0.5;

      // Convert to meters per second
      const v = (dLat * METERS_PER_DEG_LAT) / dt;
      const u = (dLon * metersPerDegLon(midLat)) / dt;

      const speed = Math.hypot(u, v);
      if (speed > 45) continue;

      // Grid cell index
      const ix = Math.floor((midLon - BEIJING_BOUNDS.lonMin) / LON_STEP);
      const iy = Math.floor((midLat - BEIJING_BOUNDS.latMin) / LAT_STEP);

      if (ix < 0 || ix >= nx || iy < 0 || iy >= ny) continue;

      const idx = ix + iy * nx;
      sumU[idx] += u;
      sumV[idx] += v;
      count[idx]++;
    }
  }

  // 5. Average velocities per cell
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

  // 6. Return wind-style vector field JSON
  return {
    header: {
      nx,
      ny,
      latMin: BEIJING_BOUNDS.latMin,
      lonMin: BEIJING_BOUNDS.lonMin,
      latStep: LAT_STEP,
      lonStep: LON_STEP,
    },
    data: {
      u: Array.from(u),
      v: Array.from(v),
    },
  };
}
