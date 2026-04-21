# Lane 4: Commands And CLI Host

## Objective

Separate command semantics from Commander ownership and move CLI into a host
layer over runtime actions.

## Source Evidence

- `src/main.tsx`
- `src/commands.ts`
- `src/commands/**`
- `docs/task/task-018-kernelization-command-matrix.md`

## Write Scope

Only edit:

- `src/runtime/capabilities/commands/**`
- `src/hosts/cli/**`
- `src/commands.ts`
- minimal routing edits in `src/main.tsx`
- `docs/task/parallel-kernelization/lane-4-commands-and-cli-host.md`

## Do Not Edit

- `src/query.ts`
- `src/QueryEngine.ts`
- `src/tools.ts`
- `src/services/mcp/client.ts`
- `src/screens/REPL.tsx`
- `src/bridge/**`
- `src/daemon/**`

## Tasks

1. Model the command graph as runtime-owned data.
2. Re-home reusable command handlers into runtime capability modules or product
   operations ownership.
3. Create `src/hosts/cli/` for Commander-only wiring.
4. Reduce `main.tsx` ownership so it becomes parsing/dispatch glue.
5. Preserve command behavior.

## Deliverables

- runtime command graph model
- CLI host wiring under `src/hosts/cli/`
- reduced Commander ownership in `main.tsx`

## Dependencies

- Lane 1 contract names should be stable
- Lane 2 execution actions should exist before final command dispatch is wired

## Acceptance Criteria

- command semantics are runtime-owned
- Commander acts as parser/dispatcher only
- top-level command behavior remains unchanged

## Expected Reuse Posture

- `src/commands.ts`: reuse with isolation
- most `src/commands/**`: reuse as-is
- `src/main.tsx`: reuse with isolation

## Blockers To Raise

- any command that still requires direct UI ownership
- any command flow that depends on REPL monolith internals
