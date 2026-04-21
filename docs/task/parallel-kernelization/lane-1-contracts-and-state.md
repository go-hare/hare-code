# Lane 1: Contracts And State

## Objective

Define runtime contracts and break the current process-global state model into
future runtime-owned and host-owned state.

## Source Evidence

- `src/bootstrap/state.ts`
- `src/state/AppStateStore.ts`
- `src/query.ts`
- `src/QueryEngine.ts`
- `docs/task/task-019-kernelization-capability-matrix.md`

## Write Scope

Only edit:

- `src/runtime/contracts/**`
- `src/runtime/core/state/**`
- `src/runtime/types/**` if needed
- `docs/task/parallel-kernelization/lane-1-contracts-and-state.md`
- small additive helper types if required by the above

## Do Not Edit

- `src/query.ts`
- `src/QueryEngine.ts`
- `src/tools.ts`
- `src/services/mcp/client.ts`
- `src/main.tsx`
- `src/screens/REPL.tsx`
- `src/bridge/**`
- `src/daemon/**`

## Tasks

1. Create runtime contract files under `src/runtime/contracts/`.
2. Define execution, command, tool, MCP, provider, persistence, permissions,
   and host interfaces.
3. Create a state ownership map from `src/bootstrap/state.ts`.
4. Introduce runtime-scoped state provider interfaces under
   `src/runtime/core/state/`.
5. Define the first pass split between runtime state and host state.

## Deliverables

- contract files created
- state provider interfaces created
- state ownership notes added to this lane doc or adjacent comments

## Acceptance Criteria

- `bun run typecheck` passes for the new contracts
- contracts do not import Commander, Ink, or UI components
- the state provider layer is usable by execution code without relying directly
  on `bootstrap/state.ts`

## Expected Reuse Posture

- `bootstrap/state.ts`: analyze and redesign ownership
- `AppStateStore.ts`: decompose, do not preserve as a final owner

## Blockers To Raise

- any contract that cannot represent current execution semantics
- any state field whose owner is ambiguous
