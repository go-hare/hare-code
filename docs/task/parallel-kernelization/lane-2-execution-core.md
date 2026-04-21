# Lane 2: Execution Core

## Objective

Wrap the current turn loop and session engine behind runtime-owned execution
capabilities while preserving behavior.

## Source Evidence

- `src/query.ts`
- `src/QueryEngine.ts`
- `docs/task/task-019-kernelization-capability-matrix.md`

## Write Scope

Only edit:

- `src/runtime/capabilities/execution/**`
- `src/runtime/core/**` only if required for execution scaffolding
- minimal imports in `src/query.ts` and `src/QueryEngine.ts` if needed to route
  through wrappers
- `docs/task/parallel-kernelization/lane-2-execution-core.md`

## Do Not Edit

- `src/tools.ts`
- `src/services/mcp/client.ts`
- `src/main.tsx`
- `src/screens/REPL.tsx`
- `src/bridge/**`
- `src/daemon/**`
- `src/server/**`

## Tasks

1. Create `TurnEngine` wrapper in `src/runtime/capabilities/execution/`.
2. Create `SessionRuntime` wrapper in `src/runtime/capabilities/execution/`.
3. Move ownership boundaries so runtime execution can be invoked through
   contracts from Lane 1.
4. Preserve compact, retry, recovery, and stop semantics.
5. Minimize logic rewrites. Prefer wrappers and injected state/providers.

## Deliverables

- `src/runtime/capabilities/execution/TurnEngine.ts`
- `src/runtime/capabilities/execution/SessionRuntime.ts`
- any small support modules needed for runtime-owned execution

## Dependencies

- Lane 1 contract names should be stable before finalizing imports

## Acceptance Criteria

- a runtime session can submit a prompt and stream events
- no second turn loop is introduced
- current behavior from `query.ts` and `QueryEngine.ts` is preserved

## Expected Reuse Posture

- `src/query.ts`: reuse with isolation
- `src/QueryEngine.ts`: reuse with isolation

## Blockers To Raise

- any reliance on `bootstrap/state.ts` that cannot be moved behind providers
- any execution behavior that requires changing files in another lane
