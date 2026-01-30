import fs from "fs";
import path from "path";
import {
  observationsToVectorField,
  Observation,
  TimeSlice,
} from "./taxiBeijingVectorField";

const ROOT = process.cwd();

const INPUT_PATH = path.join(ROOT, "data", "taxi-beijing.json");
const OUTPUT_DIR = path.join(ROOT, "public");

const SLICES: TimeSlice[] = ["morning", "midday", "evening"];

function run() {
  console.log("📥 Loading Beijing taxi data...");
  const raw = fs.readFileSync(INPUT_PATH, "utf-8");
  const data = JSON.parse(raw);

  const observations: Observation[] = Array.isArray(data)
    ? data
    : Object.values(data);

  console.log(`🚕 Loaded ${observations.length} observations`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const slice of SLICES) {
    console.log(`🧭 Building Beijing vector field (${slice})...`);

    const vectorField = observationsToVectorField(observations, slice);

    const outPath = path.join(
      OUTPUT_DIR,
      `taxi-beijing-vector-field-${slice}.json`,
    );

    fs.writeFileSync(outPath, JSON.stringify(vectorField), "utf-8");

    console.log(`✅ Saved ${outPath}`);
  }
}

run();
