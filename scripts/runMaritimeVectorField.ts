// scripts/runMaritimeVectorField.ts

import fs from "fs";
import path from "path";
import { observationsToVectorField, Observation } from "./maritimeVectorField";

// Resolve paths relative to project root
const ROOT = process.cwd();

const INPUT_PATH = path.join(ROOT, "data", "maritime.json");
const OUTPUT_PATH = path.join(ROOT, "public", "maritime-vector-field.json");
const OBSERVATIONS_OUTPUT_PATH = path.join(
  ROOT,
  "public",
  "maritime-observations.json",
);

function run() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(
      `Missing maritime observations at ${INPUT_PATH}. The file should contain entities and observations.`,
    );
  }

  console.log("📥 Loading maritime data...");
  const raw = fs.readFileSync(INPUT_PATH, "utf-8");
  const data = JSON.parse(raw);

  // Extract observations from "observations" key
  const obsMap = data.observations || {};
  const observations: Observation[] = [];

  for (const [key, record] of Object.entries(obsMap) as [string, any][]) {
    if (record && typeof record === "object") {
      observations.push({
        type: "observation",
        entityId: record.entityId || key,
        latitude: record.latitude,
        longitude: record.longitude,
        time: record.time,
      });
    }
  }

  console.log(`⛵ Loaded ${observations.length} observations`);

  console.log("🧭 Building vector field...");
  const vectorField = observationsToVectorField(observations);

  console.log(`📐 Grid: ${vectorField.header.nx} × ${vectorField.header.ny}`);
  console.log(
    `📍 Bounds: [${vectorField.header.latMin.toFixed(2)}, ${vectorField.header.lonMin.toFixed(2)}] to [${(vectorField.header.latMin + vectorField.header.ny * vectorField.header.latStep).toFixed(2)}, ${(vectorField.header.lonMin + vectorField.header.nx * vectorField.header.lonStep).toFixed(2)}]`,
  );

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  console.log("💾 Writing output...");
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(vectorField), "utf-8");
  fs.writeFileSync(
    OBSERVATIONS_OUTPUT_PATH,
    JSON.stringify(observations),
    "utf-8",
  );

  console.log(`✅ Saved to ${OUTPUT_PATH}`);
  console.log(`✅ Saved to ${OBSERVATIONS_OUTPUT_PATH}`);
}

run();
