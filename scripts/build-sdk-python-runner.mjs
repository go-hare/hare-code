#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const RELEASE_TARGETS = {
  "windows-x64": {
    bunTarget: "bun-windows-x64",
    assetName: "hare-sdk-python-windows-x64.exe",
  },
  "linux-x64": {
    bunTarget: "bun-linux-x64",
    assetName: "hare-sdk-python-linux-x64",
    toolchainPath: path.join(
      "dist",
      "toolchain",
      "bun-linux-x64",
      "bun-linux-x64",
      "bun",
    ),
  },
  "linux-x64-baseline": {
    bunTarget: "bun-linux-x64-baseline",
    assetName: "hare-sdk-python-linux-x64-baseline",
    toolchainPath: path.join(
      "dist",
      "toolchain",
      "bun-linux-x64-baseline",
      "bun-linux-x64-baseline",
      "bun",
    ),
  },
  "linux-arm64": {
    bunTarget: "bun-linux-arm64",
    assetName: "hare-sdk-python-linux-arm64",
    toolchainPath: path.join(
      "dist",
      "toolchain",
      "bun-linux-aarch64",
      "bun-linux-aarch64",
      "bun",
    ),
  },
  "darwin-x64": {
    bunTarget: "bun-darwin-x64",
    assetName: "hare-sdk-python-darwin-x64",
    toolchainPath: path.join(
      "dist",
      "toolchain",
      "bun-darwin-x64",
      "bun-darwin-x64",
      "bun",
    ),
  },
  "darwin-arm64": {
    bunTarget: "bun-darwin-arm64",
    assetName: "hare-sdk-python-darwin-arm64",
    toolchainPath: path.join(
      "dist",
      "toolchain",
      "bun-darwin-aarch64",
      "bun-darwin-aarch64",
      "bun",
    ),
  },
};

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value =
      argv[index + 1] && !argv[index + 1].startsWith("--")
        ? argv[++index]
        : "true";
    parsed[key] = value;
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(command),
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const args = parseArgs(process.argv.slice(2));
const targetId = args.target;

if (!targetId) {
  fail(`Missing --target. Supported targets: ${Object.keys(RELEASE_TARGETS).join(", ")}`);
}

const target = RELEASE_TARGETS[targetId];
if (!target) {
  fail(`Unsupported --target "${targetId}". Supported targets: ${Object.keys(RELEASE_TARGETS).join(", ")}`);
}

const packageRoot = process.cwd();
const outputDir = path.resolve(packageRoot, "dist", "release");
const outfile = path.resolve(
  packageRoot,
  args.outfile || path.join("dist", "release", target.assetName),
);

fs.mkdirSync(outputDir, { recursive: true });
if (fs.existsSync(outfile)) {
  fs.rmSync(outfile, { force: true });
}

const bunBinary = process.platform === "win32" ? "bun.exe" : "bun";
const buildArgs = [
  "build",
  "src/entrypoints/sdk-python.tsx",
  "--compile",
  `--target=${target.bunTarget}`,
  `--outfile=${outfile}`,
];

if (target.toolchainPath) {
  const resolvedToolchainPath = path.resolve(packageRoot, target.toolchainPath);
  if (fs.existsSync(resolvedToolchainPath)) {
    buildArgs.push(`--compile-executable-path=${resolvedToolchainPath}`);
  }
}

run(bunBinary, buildArgs);

if (process.platform !== "win32") {
  fs.chmodSync(outfile, 0o755);
}
