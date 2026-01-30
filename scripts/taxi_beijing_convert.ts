import * as fs from "fs";
import * as path from "path";

const ROOT = process.cwd();

const INPUT_DIR = path.join(ROOT, "data", "taxi-beijing");
const OUTPUT_FILE = path.join(ROOT, "data", "taxi-beijing.json");

interface Observation {
  type: "observation";
  entityId: number;
  latitude: number;
  longitude: number;
  time: number;
}

function main() {
  const files = fs.readdirSync(INPUT_DIR).filter((f) => f.endsWith(".txt"));

  const result: Record<string, Observation> = {};
  let counter = 1;

  for (const file of files) {
    const filePath = path.join(INPUT_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");

    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const [idStr, timestampStr, lonStr, latStr] = trimmed.split(",");

      const id = Number(idStr);
      const longitude = Number(lonStr);
      const latitude = Number(latStr);
      const time = new Date(timestampStr).getTime();

      if (Number.isNaN(id) || Number.isNaN(time)) continue;

      result[counter.toString()] = {
        type: "observation",
        entityId: id,
        latitude,
        longitude,
        time,
      };

      counter++;
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), "utf-8");
  console.log(`✅ Converted ${counter - 1} observations to ${OUTPUT_FILE}`);
}

main();
