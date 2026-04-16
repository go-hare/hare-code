#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const distDir = path.resolve(projectRoot, "dist");

fs.mkdirSync(distDir, { recursive: true });

for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
  if (entry.isFile()) {
    fs.rmSync(path.join(distDir, entry.name), { force: true });
  }
}

const bunBinary = process.platform === "win32" ? "bun.exe" : "bun";
const result = spawnSync(
  bunBinary,
  ["build", "src/entrypoints/sdk.ts", "--outdir", "dist", "--target", "node"],
  {
    stdio: "inherit",
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(bunBinary),
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
