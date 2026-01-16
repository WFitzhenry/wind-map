import fs from "fs";
import path from "path";

const INPUT_FILE = path.resolve("data/gfs.json");
const OUTPUT_FILE = path.resolve("public/wind.json");

const gfsArray: any[] = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

// Extract U and V components
const uObj = gfsArray.find((o) => o.header.parameterNumber === 2);
const vObj = gfsArray.find((o) => o.header.parameterNumber === 3);

if (!uObj || !vObj) {
  throw new Error("Cannot find U or V component in GFS JSON");
}

// Verify grid sizes match
if (uObj.header.nx !== vObj.header.nx || uObj.header.ny !== vObj.header.ny) {
  throw new Error("U/V grid sizes do not match");
}

// Build wind.json in the app format
const windJson = {
  header: { nx: uObj.header.nx, ny: uObj.header.ny },
  data: {
    u: uObj.data,
    v: vObj.data,
  },
};

// Ensure output directory exists
fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

// Write wind.json
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(windJson, null, 2));

console.log(`✅ wind.json created: ${OUTPUT_FILE}`);
console.log(`Grid size: ${uObj.header.nx} × ${uObj.header.ny}`);
console.log(`First U vector: ${windJson.data.u[0]}`);
console.log(`First V vector: ${windJson.data.v[0]}`);
