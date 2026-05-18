import * as fs from "fs";
import * as readline from "readline";

export interface Observation {
  type: "observation";
  entityId: string;
  latitude: number;
  longitude: number;
  time: number;
}

/**
 * Parse Athens CSV format where each row contains multiple observations
 * embedded as repeating fields: lat; lon; speed; lon_acc; lat_acc; time; ...
 *
 * Row format:
 * trackId; vehicleType; traveled_d; avg_speed; [lat; lon; speed; lon_acc; lat_acc; time;] repeated
 */
export async function parseAthensCSV(filePath: string): Promise<Observation[]> {
  const observations: Observation[] = [];
  const fileStream = fs.createReadStream(filePath);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let isFirstLine = true;
  let lineCount = 0;
  const MAX_OBSERVATIONS = 250000; // Limit to prevent memory issues

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip header row
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    lineCount++;
    const parts = trimmed.split(";").map((p) => p.trim());
    if (parts.length < 10) continue;

    const trackId = parts[0];
    /**
     * Structure:
     * [0] = trackId
     * [1] = vehicleType
     * [2] = traveled_d
     * [3] = avg_speed
     * [4+] = repeating: lat; lon; speed; lon_acc; lat_acc; time
     */

    const observationFieldsPerRecord = 6;
    let lineObsCount = 0;
    // Repeating observations start at index 4
    for (
      let i = 4;
      i + observationFieldsPerRecord <= parts.length &&
      observations.length < MAX_OBSERVATIONS;
      i += observationFieldsPerRecord
    ) {
      const lat = parseFloat(parts[i]);
      const lon = parseFloat(parts[i + 1]);
      // parts[i + 2] = speed (unused for vector field)
      // parts[i + 3] = lon_acc (unused)
      // parts[i + 4] = lat_acc (unused)
      const time = parseFloat(parts[i + 5]);

      // Skip invalid records
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        !Number.isFinite(time)
      ) {
        continue;
      }

      lineObsCount++;
      observations.push({
        type: "observation",
        entityId: trackId,
        latitude: lat,
        longitude: lon,
        time: time * 1000, // Convert to milliseconds
      });
    }

    if (observations.length >= MAX_OBSERVATIONS) {
      break;
    }
  }

  return observations;
}

/**
 * Main: parse a CSV file and write JSON output
 */
async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath || !outputPath) {
    console.error("Usage: ts-node parseAthensCSV.ts <input.csv> <output.json>");
    process.exit(1);
  }

  try {
    console.log(`Parsing ${inputPath}...`);
    const observations = await parseAthensCSV(inputPath);
    console.log(`Parsed ${observations.length} observations`);

    fs.writeFileSync(outputPath, JSON.stringify(observations, null, 2));
    console.log(`Written to ${outputPath}`);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

// Run main directly in ESM
main();
