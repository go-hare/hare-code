# Lane 6: Terminal And REPL Split

## Objective

Split terminal rendering from reusable REPL behavior so the CLI becomes a host
over runtime-owned interaction semantics.

## Source Evidence

- `src/screens/REPL.tsx`
- `src/components/**`
- `src/keybindings/**`
- `docs/task/task-019-kernelization-capability-matrix.md`

## Write Scope

Only edit:

- `src/hosts/terminal/**`
- `src/screens/REPL.tsx`
- minimal new runtime-facing interaction helpers if needed under
  `src/runtime/capabilities/commands/**`
- `docs/task/parallel-kernelization/lane-6-terminal-repl-split.md`

## Do Not Edit

- `src/query.ts`
- `src/QueryEngine.ts`
- `src/tools.ts`
- `src/services/mcp/client.ts`
- `src/bridge/**`
- `src/daemon/**`
- `src/server/**`

## Tasks

1. Identify REPL behavior that belongs to runtime interaction semantics.
2. Move terminal-only rendering and widget logic into `src/hosts/terminal/`.
3. Reduce `src/screens/REPL.tsx` ownership so it becomes a host composition
   layer instead of the main behavior owner.
4. Preserve the current visible REPL experience.

## Deliverables

- terminal host modules under `src/hosts/terminal/`
- thinner `src/screens/REPL.tsx`
- documented split between runtime interaction semantics and terminal rendering

## Dependencies

- Lane 1 state split should be known
- Lane 2 execution session interfaces should exist
- Lane 4 command/runtime action ownership should be mostly settled before final merge

## Acceptance Criteria

- REPL rendering remains intact
- reusable interaction behavior is no longer trapped in the terminal monolith
- terminal-specific code is clearly separated from kernel behavior

## Expected Reuse Posture

- terminal components: reuse as-is
- `REPL.tsx`: rewrite required structurally, but preserve behavior

## Blockers To Raise

- any runtime interaction contract missing from other lanes
- any need to change bridge/daemon/server code
