import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const seedFiles = new Set([join(root, "supabase", "seed.sql")]);
const forbiddenTerms = [
  "Nation" + " Maid Agency",
  "Nation" + " Maid",
  "nation" + "maid.com.sg",
  "nation" + ".sg"
];
const scannedRoots = ["src", "scripts", "supabase/migrations"];

function files(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const violations = [];
for (const scannedRoot of scannedRoots) {
  for (const file of files(join(root, scannedRoot))) {
    if (seedFiles.has(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const term of forbiddenTerms) {
      if (text.includes(term)) {
        violations.push(`${file} contains first-project seed term: ${term}`);
      }
    }
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Architecture check passed: reusable code and migrations contain no first-project brand strings.");
