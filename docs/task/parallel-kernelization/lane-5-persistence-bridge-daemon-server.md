# Lane 5: Persistence, Bridge, Daemon, And Server

## Objective

Move persistence ownership and long-running remote/session hosts onto runtime
contracts.

## Source Evidence

- session persistence and recovery helpers currently used by execution
- `src/bridge/bridgeMain.ts`
- `src/daemon/workerRegistry.ts`
- `src/server/**`
- `docs/task/task-018-kernelization-command-matrix.md`
- `docs/task/task-019-kernelization-capability-matrix.md`

## Write Scope

Only edit:

- `src/runtime/capabilities/persistence/**`
- `src/runtime/capabilities/bridge/**`
- `src/runtime/capabilities/daemon/**`
- `src/hosts/remote-control/**`
- `src/hosts/daemon/**`
- `src/hosts/server/**`
- minimal routing edits in `src/bridge/bridgeMain.ts`
- minimal routing edits in `src/daemon/workerRegistry.ts`
- minimal routing edits in `src/server/**`
- `docs/task/parallel-kernelization/lane-5-persistence-bridge-daemon-server.md`

## Do Not Edit

- `src/main.tsx`
- `src/screens/REPL.tsx`
- `src/tools.ts`
- `src/services/mcp/client.ts`
- `src/commands.ts`

## Tasks

1. Create persistence capability modules for transcript storage and recovery.
2. Create bridge capability wrappers that preserve current heartbeat/spawn logic.
3. Create daemon capability wrappers that preserve worker semantics.
4. Start replacing direct-connect/server parallel session ownership with runtime
   session ownership.
5. Keep host-specific process wiring in host layers.

## Deliverables

- persistence capability modules
- bridge capability modules
- daemon capability modules
- host wrappers for remote-control, daemon, and server

## Dependencies

- Lane 1 contracts should be available
- Lane 2 runtime session interface should be available before final server/bridge binding

## Acceptance Criteria

- bridge and daemon execution are runtime-backed
- server session ownership is converging on the runtime core
- persistence and recovery can be consumed outside CLI

## Expected Reuse Posture

- persistence helpers: reuse with isolation
- `bridgeMain.ts`: reuse with isolation
- `workerRegistry.ts`: reuse with isolation
- `src/server/**`: rewrite required where it owns a parallel session core

## Blockers To Raise

- any missing runtime session contract needed by bridge/server
- any cross-lane dependency on command or REPL code
