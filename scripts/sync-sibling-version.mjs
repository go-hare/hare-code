#!/usr/bin/env node

import path from "node:path";
import fs from "node:fs";
import {
  readJson,
  selectSiblingPackages,
  writeJson,
} from "./sibling-packages.mjs";

const sdkRoot = process.cwd();
const sdkPackagePath = path.join(sdkRoot, "package.json");
const sdkPackage = readJson(sdkPackagePath);
const siblingTargets = selectSiblingPackages(process.argv.slice(2));

if (siblingTargets.length === 0) {
  console.error("No matching sibling packages for sync.");
  process.exit(1);
}
const nextVersion = sdkPackage.version;

if (!nextVersion) {
  console.error(`Missing version in ${sdkPackagePath}`);
  process.exit(1);
}

let updatedCount = 0;

for (const sibling of siblingTargets) {
  if (!fs.existsSync(sibling.packagePath)) {
    console.error(
      `Sibling package not found for ${sibling.name}: ${sibling.packagePath}`,
    );
    process.exit(1);
  }

  const siblingPackage = readJson(sibling.packagePath);
  if (siblingPackage.version === nextVersion) {
    console.log(`${sibling.name} already synced at ${nextVersion}`);
    continue;
  }

  siblingPackage.version = nextVersion;
  writeJson(sibling.packagePath, siblingPackage);
  updatedCount += 1;
  console.log(`Synced ${sibling.name} version to ${nextVersion}`);
}

if (updatedCount === 0) {
  console.log(`All selected sibling packages already synced at ${nextVersion}`);
}
