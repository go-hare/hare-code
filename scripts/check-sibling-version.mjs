#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { readJson, selectSiblingPackages } from "./sibling-packages.mjs";

const sdkRoot = process.cwd();
const sdkPackagePath = path.join(sdkRoot, "package.json");
const siblingTargets = selectSiblingPackages(process.argv.slice(2));

if (siblingTargets.length === 0) {
  console.error("No matching sibling packages for version check.");
  process.exit(1);
}

const sdkVersion = readJson(sdkPackagePath).version;
const mismatches = [];

for (const sibling of siblingTargets) {
  if (!fs.existsSync(sibling.packagePath)) {
    console.error(
      `Sibling package not found for ${sibling.name}: ${sibling.packagePath}`,
    );
    process.exit(1);
  }

  const siblingVersion = readJson(sibling.packagePath).version;
  if (sdkVersion !== siblingVersion) {
    mismatches.push(`${sibling.name}=${siblingVersion}`);
  }
}

if (mismatches.length > 0) {
  console.error(
    `Version mismatch: hare-code=${sdkVersion}, ${mismatches.join(
      ", ",
    )}. Run "node scripts/sync-sibling-version.mjs" from hare-code.`,
  );
  process.exit(1);
}

console.log(
  `Version check passed: hare-code=${sdkVersion}, siblings=${siblingTargets
    .map((item) => item.name)
    .join(", ")}`,
);
