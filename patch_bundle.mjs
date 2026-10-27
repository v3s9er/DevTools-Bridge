import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const file = resolve(fileURLToPath(new URL(".", import.meta.url)), "vendor/devtools-app/chunk-jkp8hsn7.js");
const before = 'import*as FRe from"node:fs";import*as VRe from"node:url";import*as VV from"node:worker_threads";';
const after = 'const FRe={},VRe={},VV={};';
const source = readFileSync(file, "utf8");
if (source.includes(after)) {
  console.log("Bundled browser compatibility patch already applied.");
} else {
  if (source.split(before).length !== 2) {
    throw new Error("Expected Node import block was not found exactly once.");
  }
  writeFileSync(file, source.replace(before, after));
  console.log("Removed unused Node-only static imports from browser bundle.");
}
