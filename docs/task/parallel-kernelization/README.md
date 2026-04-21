# Parallel Kernelization Work Pack

## Purpose

This folder splits the kernelization backlog into parallel implementation lanes
that can be handed to different AI workers.

Source planning documents:

- `docs/internals/full-feature-kernelization-architecture.md`
- `docs/task/task-017-full-feature-kernelization-execution.md`
- `docs/task/task-018-kernelization-command-matrix.md`
- `docs/task/task-019-kernelization-capability-matrix.md`
- `docs/task/task-020-kernelization-implementation-backlog.md`

## Shared Rules

1. Reuse stable implementations before rewriting.
2. Do not create a second execution core.
3. Do not move code into `packages/`.
4. Do not change user-visible behavior unless the lane explicitly permits it.
5. Do not edit files outside your lane write scope.
6. If a needed change crosses lane boundaries, stop and record a blocker instead
   of editing another lane's files.
7. Do not revert or normalize unrelated code.

## Recommended AI Assignment

- AI 1: `lane-1-contracts-and-state.md`
- AI 2: `lane-2-execution-core.md`
- AI 3: `lane-3-tools-and-mcp.md`
- AI 4: `lane-4-commands-and-cli-host.md`
- AI 5: `lane-5-persistence-bridge-daemon-server.md`
- AI 6: `lane-6-terminal-repl-split.md`

## Merge Order

1. Lane 1
2. Lane 3
3. Lane 2
4. Lane 5
5. Lane 4
6. Lane 6

Reason:

- Lane 1 defines the contracts and state boundaries.
- Lane 3 can proceed early once contract names are stable.
- Lane 2 depends on contracts/state more directly than the tool lane.
- Lane 5 depends on execution and persistence boundaries.
- Lane 4 depends on command contracts and early runtime ownership.
- Lane 6 should land after execution and command ownership are clearer.

## Coordinator Checklist

The coordinator should check, for every lane:

- write scope was respected
- blockers were documented instead of solved by cross-lane edits
- `reuse as-is` and `reuse with isolation` modules were preserved where possible
- new code compiles in isolation
- no lane introduced a parallel runtime path

## Deliverables

Each worker should return:

1. files changed
2. blockers
3. verification run
4. behavior changes, if any
