#!/usr/bin/env node

/**
 * Unified Chrome MCP setup script.
 *
 * Usage:
 *   node scripts/setup-chrome-mcp.mjs           # Run full setup (fix-permissions → register → doctor)
 *   node scripts/setup-chrome-mcp.mjs doctor    # Run a single sub-command
 */

import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

function shouldSkipSetup() {
  return (
    process.env.CLAUDE_CODE_SKIP_CHROME_MCP_SETUP === "1" ||
    process.env.npm_config_ignore_scripts === "true"
  );
}

function resolveInstalledCliPath() {
  try {
    const packageJsonPath = require.resolve("@go-hare/mcp-chrome-bridge/package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const binEntry = packageJson?.bin?.["mcp-chrome-bridge"];
    if (!binEntry) {
      return null;
    }
    const packageRoot = path.dirname(packageJsonPath);
    const candidate = path.resolve(packageRoot, binEntry);
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function resolveWorkspaceCliPath() {
  const candidate = path.join(
    projectRoot,
    "packages",
    "mcp-chrome-bridge",
    "dist",
    "cli.js",
  );
  return existsSync(candidate) ? candidate : null;
}

function resolveCliPath() {
  return resolveInstalledCliPath() ?? resolveWorkspaceCliPath();
}

if (shouldSkipSetup()) {
  console.log("[chrome-mcp] Setup skipped by environment.");
  process.exit(0);
}

const cliPath = resolveCliPath();
if (!cliPath) {
  console.log("[chrome-mcp] Optional bridge package not available, skipping setup.");
  process.exit(0);
}

const userArgs = process.argv.slice(2);

if (userArgs.length > 0) {
  execFileSync(process.execPath, [cliPath, ...userArgs], { stdio: "inherit" });
} else {
  const steps = [
    ["fix-permissions"],
    ["register", "--browser", "chrome"],
    ["doctor"],
  ];

  for (let i = 0; i < steps.length; i++) {
    const args = steps[i];
    const isLast = i === steps.length - 1;
    if (isLast) console.log(`\n[${i + 1}/${steps.length}] ${args.join(" ")}`);
    execFileSync(process.execPath, [cliPath, ...args], {
      stdio: isLast ? "inherit" : "pipe",
    });
  }

  console.log("\nChrome MCP setup complete!");
}
