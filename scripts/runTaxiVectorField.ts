// scripts/runTaxiVectorField.ts

import fs from "fs";
import path from "path";
import { observationsToVectorField, Observation } from "./taxiVectorField";

// Resolve paths relative to project root
const ROOT = process.cwd();

const INPUT_PATH = path.join(ROOT, "data", "taxi.json");
const OUTPUT_PATH = path.join(ROOT, "public", "taxi-vector-field.json");
const OBSERVATIONS_OUTPUT_PATH = path.join(
  ROOT,
  "public",
  "taxi-observations.json",
);

function run() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(
      `Missing Porto observations at ${INPUT_PATH}. Add the file, then rerun npm run taxi:update to publish /public/taxi-observations.json for zoom-based runtime rebuilds.`,
    );
  }

  console.log("📥 Loading taxi data...");
  const raw = fs.readFileSync(INPUT_PATH, "utf-8");
  const data = JSON.parse(raw);

  // Convert from object format to array
  const observations: Observation[] = Array.isArray(data)
    ? data
    : Object.values(data);

  console.log(`🚕 Loaded ${observations.length} observations`);

  console.log("🧭 Building vector field...");
  const vectorField = observationsToVectorField(observations);

  console.log(`📐 Grid: ${vectorField.header.nx} × ${vectorField.header.ny}`);

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
