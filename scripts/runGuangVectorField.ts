// scripts/runGuangVectorField.ts

import fs from "fs";
import path from "path";
import {
  Observation,
  observationsToGuangAfternoonVectorField,
  observationsToGuangMorningVectorField,
} from "./guangVectorField";

const ROOT = process.cwd();

const INPUT_PATH = path.join(ROOT, "data", "guang", "guang.json");
const OUTPUT_PATH = path.join(ROOT, "public", "guang-vector-field.json");

function run() {
  console.log("📥 Loading Guangzhou trajectory data...");
  const raw = fs.readFileSync(INPUT_PATH, "utf-8");
  const data = JSON.parse(raw);

  const observations: Observation[] = Array.isArray(data)
    ? data
    : Object.values(data);

  console.log(`🚕 Loaded ${observations.length} observations`);

  console.log("🧭 Building vector field...");
  const morning = observationsToGuangMorningVectorField(observations);
  const afternoon = observationsToGuangAfternoonVectorField(observations);

  fs.writeFileSync(
    "public/guang-vector-field-morning.json",
    JSON.stringify(morning),
  );

  fs.writeFileSync(
    "public/guang-vector-field-afternoon.json",
    JSON.stringify(afternoon),
  );

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  console.log("💾 Writing output...");

  console.log(`✅ Saved to ${OUTPUT_PATH}`);
}

run();
