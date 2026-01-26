export interface WindData {
  header: { nx: number; ny: number };
  data: { u: number[]; v: number[] };
}

/**
 * Load final wind.json in browser
 */
export async function parseWind(url: string): Promise<WindData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch wind data: ${res.statusText}`);

  const raw = await res.json();

  if (!raw || !raw.header || !raw.data || !raw.data.u || !raw.data.v) {
    throw new Error(
      "Invalid wind.json format: expected { header, data: { u, v } }",
    );
  }

  const { nx, ny } = raw.header;
  const { u, v } = raw.data;

  if (u.length !== nx * ny || v.length !== nx * ny) {
    throw new Error(
      `U/V array length mismatch. Expected ${nx * ny}, got ${u.length} / ${
        v.length
      }`,
    );
  }

  return {
    header: { nx, ny },
    data: { u, v },
  };
}
