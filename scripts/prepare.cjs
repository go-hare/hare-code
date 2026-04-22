#!/usr/bin/env node

const { spawnSync } = require("node:child_process")

function run(command, args) {
  return spawnSync(command, args, {
    stdio: "pipe",
    windowsHide: true,
  })
}

function insideGitWorkTree() {
  const result = run("git", ["rev-parse", "--is-inside-work-tree"])
  return result.status === 0 && result.stdout.toString().trim() === "true"
}

function main() {
  if (!insideGitWorkTree()) {
    console.log("[prepare] Not inside a git worktree, skipping hooks setup.")
    return
  }

  const result = run("git", ["config", "core.hooksPath", ".githooks"])
  if (result.status !== 0) {
    const message =
      result.stderr.toString().trim() || "failed to configure git hooks path"
    console.warn(`[prepare] Skipping hooks setup: ${message}`)
    return
  }

  console.log("[prepare] Configured git hooks path to .githooks")
}

main()
