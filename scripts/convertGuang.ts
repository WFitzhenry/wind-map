// scripts/convertGuangCSV.ts

import fs from "fs";
import path from "path";
import readline from "readline";

// Paths
const ROOT = process.cwd();
const INPUT_CSV_DIR = path.join(ROOT, "data", "guang");
const OUTPUT_JSON_FILE = path.join(ROOT, "data", "guang", "guang.json");

// Interface for an observation
interface Observation {
  type: "observation";
  entityId: number;
  latitude: number;
  longitude: number;
  time: number; // milliseconds since epoch
  speed?: number;
}

async function main() {
  const files = fs.readdirSync(INPUT_CSV_DIR).filter((f) => f.endsWith(".csv"));
  const result: Record<string, Observation> = {};
  let globalIndex = 1; // Unique key for each observation

  for (const file of files) {
    const filePath = path.join(INPUT_CSV_DIR, file);
    console.log(`📥 Reading file: ${filePath}`);

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let firstLine = true;

    for await (const line of rl) {
      // Skip header
      if (firstLine) {
        firstLine = false;
        continue;
      }

      const [idStr, lonStr, latStr, timeStr, speedStr] = line.split(",");

      if (!idStr || !latStr || !lonStr || !timeStr) continue;

      const entityId = parseInt(idStr, 10);
      const latitude = parseFloat(latStr);
      const longitude = parseFloat(lonStr);
      const time = new Date(timeStr).getTime();
      const speed = speedStr ? parseFloat(speedStr) : undefined;

      result[globalIndex.toString()] = {
        type: "observation",
        entityId,
        latitude,
        longitude,
        time,
        speed,
      };

      globalIndex++;
    }
  }

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(OUTPUT_JSON_FILE), { recursive: true });

  // Write JSON
  fs.writeFileSync(OUTPUT_JSON_FILE, JSON.stringify(result, null, 2), "utf-8");
  console.log(`✅ Saved JSON to: ${OUTPUT_JSON_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
