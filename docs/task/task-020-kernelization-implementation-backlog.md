# Task 020: Kernelization Implementation Backlog

## 1. Purpose

This document turns the architecture and matrix work into a concrete execution
backlog.

It is derived from:

- `docs/internals/full-feature-kernelization-architecture.md`
- `docs/task/task-017-full-feature-kernelization-execution.md`
- `docs/task/task-018-kernelization-command-matrix.md`
- `docs/task/task-019-kernelization-capability-matrix.md`

The backlog is organized as implementation tickets. Each ticket has:

- purpose
- key inputs
- outputs
- dependencies
- acceptance criteria

## 2. Execution Rules

Apply these rules to every ticket:

1. reuse stable implementations before rewriting
2. move ownership before changing behavior
3. preserve visible product semantics unless the ticket explicitly authorizes a behavior change
4. do not open a parallel execution core
5. keep CLI, bridge, daemon, and server converging on the same runtime contracts

## 3. Workstreams

- Workstream A: contracts and type boundaries
- Workstream B: state decomposition
- Workstream C: execution core
- Workstream D: tools and MCP
- Workstream E: command semantics
- Workstream F: persistence and recovery
- Workstream G: bridge, daemon, and server
- Workstream H: CLI host migration
- Workstream I: kernel API surface

## 4. Ticket Backlog

### A1. Define runtime contract package inside `src/runtime/contracts`

Purpose:

- create the internal contracts that future hosts and capability modules depend on

Key inputs:

- `src/query.ts`
- `src/QueryEngine.ts`
- `src/commands.ts`
- `src/tools.ts`
- `src/services/mcp/client.ts`
- `task-017`
- `task-019`

Outputs:

- `src/runtime/contracts/execution.ts`
- `src/runtime/contracts/command.ts`
- `src/runtime/contracts/tool.ts`
- `src/runtime/contracts/mcp.ts`
- `src/runtime/contracts/provider.ts`
- `src/runtime/contracts/persistence.ts`
- `src/runtime/contracts/permissions.ts`
- `src/runtime/contracts/host.ts`

Dependencies:

- none

Acceptance criteria:

- contracts compile with `bun run typecheck`
- contracts do not import Commander, Ink, or terminal components
- contracts can describe current CLI semantics without forcing rewrites

### B1. Inventory `bootstrap/state.ts` ownership and split targets

Purpose:

- identify which fields belong to runtime core, execution, or host-only state

Key inputs:

- `src/bootstrap/state.ts`
- `src/state/AppStateStore.ts`
- `task-019`

Outputs:

- field-by-field ownership map
- destination map: runtime core vs execution state vs host state

Dependencies:

- A1

Acceptance criteria:

- every global field in `bootstrap/state.ts` has a future owner
- blockers are explicitly marked

### B2. Introduce runtime-scoped state providers

Purpose:

- replace direct global ownership with injectable state providers

Key inputs:

- output of B1
- `src/query.ts`
- `src/QueryEngine.ts`

Outputs:

- `src/runtime/core/state/` provider interfaces and initial implementations

Dependencies:

- A1
- B1

Acceptance criteria:

- new provider layer exists
- at least one execution path can depend on provider interfaces instead of raw globals

### B3. Decompose AppState into runtime state and host state

Purpose:

- separate reusable runtime state from terminal-only state

Key inputs:

- `src/state/AppStateStore.ts`
- `src/screens/REPL.tsx`
- output of B1

Outputs:

- runtime state model
- host state model
- migration notes for REPL consumers

Dependencies:

- A1
- B1

Acceptance criteria:

- AppState fields are classified
- a proposed split exists and is type-checkable in new runtime types

### C1. Wrap current query loop behind execution contract

Purpose:

- make the existing turn loop callable through runtime contracts

Key inputs:

- `src/query.ts`
- A1
- B2

Outputs:

- `src/runtime/capabilities/execution/TurnEngine.ts`

Dependencies:

- A1
- B2

Acceptance criteria:

- turn execution can be invoked through the new execution contract
- turn-loop semantics are preserved

### C2. Wrap current `QueryEngine` behind runtime session contract

Purpose:

- preserve multi-turn session behavior while transferring ownership

Key inputs:

- `src/QueryEngine.ts`
- C1
- B2

Outputs:

- `src/runtime/capabilities/execution/SessionRuntime.ts`

Dependencies:

- A1
- B2
- C1

Acceptance criteria:

- a runtime session abstraction exists
- the session abstraction can own multiple turns without CLI-only dependencies

### C3. Isolate compact/retry/recovery orchestration

Purpose:

- keep current execution safety behavior while removing CLI-centric ownership

Key inputs:

- `src/query.ts`
- C1
- C2

Outputs:

- execution support modules for compact/retry/recovery under `src/runtime/capabilities/execution/`

Dependencies:

- C1
- C2

Acceptance criteria:

- compact/retry logic is reachable through the execution capability layer
- existing stop/retry behavior is preserved

### D1. Move tool registry ownership into runtime capability layer

Purpose:

- keep current tool behavior but move registry assembly out of CLI ownership

Key inputs:

- `src/tools.ts`
- A1

Outputs:

- `src/runtime/capabilities/tools/ToolCatalog.ts`
- `src/runtime/capabilities/tools/ToolPolicy.ts`

Dependencies:

- A1

Acceptance criteria:

- tool catalog can be resolved without importing `src/main.tsx`
- concrete tool implementations are unchanged unless necessary

### D2. Move MCP lifecycle ownership into runtime capability layer

Purpose:

- preserve current MCP behavior while making it session-bound and host-independent

Key inputs:

- `src/services/mcp/client.ts`
- A1
- B2

Outputs:

- `src/runtime/capabilities/mcp/McpRegistry.ts`
- `src/runtime/capabilities/mcp/McpSessionBinding.ts`

Dependencies:

- A1
- B2

Acceptance criteria:

- MCP clients can be attached to runtime sessions
- auth refresh and reconnect behavior are preserved

### D3. Standardize provider/runtime service boundaries

Purpose:

- isolate provider/API orchestration behind runtime service contracts

Key inputs:

- `src/query.ts`
- `src/services/api/`
- A1

Outputs:

- provider runtime interfaces and service adapters under `src/runtime/capabilities/providers/`

Dependencies:

- A1
- C1

Acceptance criteria:

- execution layer depends on provider contracts, not ad hoc service imports

### E1. Model command graph as runtime-owned data

Purpose:

- separate command semantics from Commander-specific binding

Key inputs:

- `src/main.tsx`
- `src/commands.ts`
- `task-018`

Outputs:

- runtime command graph model

Dependencies:

- A1

Acceptance criteria:

- top-level commands can be represented without Commander
- command graph ownership is no longer conceptually bound to `main.tsx`

### E2. Re-home reusable command handlers

Purpose:

- keep command behavior intact while moving ownership to runtime capabilities or product operations

Key inputs:

- `src/commands/`
- E1
- `task-018`

Outputs:

- migration of command handlers into:
  - `src/runtime/capabilities/commands/`
  - product operations area for non-kernel commands

Dependencies:

- E1

Acceptance criteria:

- handlers marked `reuse as-is` remain largely intact
- handlers marked `reuse with isolation` run through runtime command contracts

### F1. Wrap transcript storage and session recovery behind persistence contracts

Purpose:

- preserve current storage behavior while making it host-independent

Key inputs:

- persistence/recovery helpers currently consumed by `query.ts` and `QueryEngine.ts`
- A1
- B2

Outputs:

- `src/runtime/capabilities/persistence/TranscriptStore.ts`
- `src/runtime/capabilities/persistence/SessionRecovery.ts`

Dependencies:

- A1
- B2
- C2

Acceptance criteria:

- sessions can be snapshotted and resumed through runtime contracts
- CLI and bridge can share the same persistence layer

### G1. Re-home bridge session semantics into runtime capability layer

Purpose:

- keep bridge business behavior while removing bespoke session ownership

Key inputs:

- `src/bridge/bridgeMain.ts`
- D2
- F1

Outputs:

- `src/runtime/capabilities/bridge/`
- bridge host wrapper in `src/hosts/remote-control/`

Dependencies:

- A1
- B2
- D2
- F1

Acceptance criteria:

- bridge session execution is runtime-backed
- heartbeat/spawn behavior remains intact

### G2. Re-home daemon worker semantics into runtime capability layer

Purpose:

- keep worker behavior while making daemon a host over runtime capabilities

Key inputs:

- `src/daemon/workerRegistry.ts`
- G1

Outputs:

- `src/runtime/capabilities/daemon/`
- daemon host wrapper in `src/hosts/daemon/`

Dependencies:

- A1
- G1

Acceptance criteria:

- daemon workers use runtime-backed execution
- worker kind dispatch is still available

### G3. Replace direct-connect/server parallel session ownership

Purpose:

- eliminate the separate server-side session core

Key inputs:

- `src/main.tsx:5857`
- `src/server/`
- C2
- F1

Outputs:

- server host backed by runtime sessions

Dependencies:

- A1
- C2
- F1

Acceptance criteria:

- server sessions are created from the same runtime core as CLI and bridge

### H1. Split REPL behavior from terminal rendering

Purpose:

- preserve current interactive semantics while removing mixed ownership

Key inputs:

- `src/screens/REPL.tsx`
- B3
- C2
- E2

Outputs:

- terminal-only host module under `src/hosts/terminal/`
- runtime interaction layer under `src/runtime/capabilities/commands/` or execution

Dependencies:

- B3
- C2
- E2

Acceptance criteria:

- REPL behavior is no longer trapped inside one terminal monolith
- terminal rendering remains intact

### H2. Move Commander wiring to host layer

Purpose:

- make Commander a host parser/dispatcher rather than a behavior owner

Key inputs:

- `src/main.tsx`
- E1
- E2

Outputs:

- `src/hosts/cli/`

Dependencies:

- E1
- E2
- H1

Acceptance criteria:

- Commander only maps argv to runtime actions
- command semantics are runtime-owned

### I1. Add public kernel API surface

Purpose:

- expose the reusable kernel after the runtime core stabilizes

Key inputs:

- outputs from C, D, E, F, G, and H

Outputs:

- `src/kernel/index.ts`
- `src/kernel/cli.ts`
- `src/kernel/headless.ts`
- `src/kernel/bridge.ts`
- `src/kernel/daemon.ts`

Dependencies:

- H2
- G3

Acceptance criteria:

- the public API surface is thin
- all major hosts create sessions through the same runtime core

## 5. Critical Path

The critical path is:

1. A1
2. B1
3. B2
4. C1
5. C2
6. D2
7. F1
8. G1
9. G2
10. G3
11. B3
12. E1
13. E2
14. H1
15. H2
16. I1

## 6. First Three Tickets To Start

If implementation starts now, begin with:

1. A1
2. B1
3. C1

Reason:

- A1 creates the contract vocabulary
- B1 identifies the main structural blocker
- C1 starts extracting the highest-value runtime behavior with reuse-first discipline

## 7. Exit Condition

This backlog is complete only when:

- every `rewrite required` domain from `task-019` has an active migration owner
- every `reuse with isolation` domain has a contract-bound target implementation plan
- the CLI, bridge, daemon, and server share the same runtime session core
