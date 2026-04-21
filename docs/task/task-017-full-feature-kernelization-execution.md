# Task 017: Full-Feature Kernelization Execution Plan

## 1. Goal

Transform the original full CLI project into a reusable kernel without losing
features and without creating a permanent compatibility architecture.

The end state is:

- full feature parity
- one execution core
- CLI remains a first-class capability surface
- terminal rendering becomes a host implementation
- stable existing implementations are reused whenever they do not block runtime ownership

## 2. Scope

This plan covers:

- command semantics
- conversation execution
- tools
- MCP
- provider routing
- persistence and recovery
- bridge / remote-control
- daemon workers
- CLI host migration

This plan does not cover:

- packaging into standalone workspace packages
- long-term API versioning policy
- external SDK release mechanics

## 3. Evidence Base

The plan is grounded in the current implementation:

- startup routing in `src/entrypoints/cli.tsx:74`
- command graph in `src/main.tsx:1`
- turn loop in `src/query.ts:1`
- session engine in `src/QueryEngine.ts:1`
- terminal REPL host in `src/screens/REPL.tsx:1`
- tool registry in `src/tools.ts:1`
- MCP lifecycle in `src/services/mcp/client.ts:1`
- bridge execution in `src/bridge/bridgeMain.ts:141`
- daemon worker execution in `src/daemon/workerRegistry.ts:26`

## 4. Required Deliverables

The implementation must produce:

1. `src/kernel/` public API layer
2. `src/runtime/core/` runtime lifecycle layer
3. `src/runtime/contracts/` stable internal contracts
4. `src/runtime/capabilities/` capability modules
5. `src/hosts/` host-specific wiring
6. contract tests for runtime-host interactions
7. migration of CLI, bridge, and daemon to runtime-backed execution

Implementation policy:

- reuse existing stable implementations first
- move ownership before rewriting logic
- rewrite only where multi-host reuse, contract clarity, or instance-scoped
  state requires it

## 5. Phases

## Phase 0: Inventory and Freeze

Objective:

- create a complete capability inventory before structural moves

Tasks:

- enumerate all top-level commands from `src/main.tsx`
- enumerate all fast paths from `src/entrypoints/cli.tsx`
- enumerate all tool families from `src/tools.ts`
- enumerate all provider integrations under `src/services/api/`
- enumerate all MCP-related entrypoints under `src/services/mcp/`
- enumerate bridge/daemon/session execution entrypoints

Outputs:

- command matrix
- capability matrix
- host matrix

Reference:

- `docs/task/task-018-kernelization-command-matrix.md`
- `docs/task/task-019-kernelization-capability-matrix.md`

Acceptance criteria:

- every top-level command has an owning target layer
- every fast path has an owning target layer
- every runtime-critical service is mapped to a future capability module
- every mapped capability is labeled as `reuse as-is`, `reuse with isolation`,
  or `rewrite required`

## Phase 1: Contracts First

Objective:

- define the runtime interfaces before moving code

Tasks:

- create `src/runtime/contracts/execution.ts`
- create `src/runtime/contracts/command.ts`
- create `src/runtime/contracts/tool.ts`
- create `src/runtime/contracts/mcp.ts`
- create `src/runtime/contracts/provider.ts`
- create `src/runtime/contracts/persistence.ts`
- create `src/runtime/contracts/permissions.ts`
- create `src/runtime/contracts/host.ts`

Rules:

- contracts must not import Commander, Ink, or terminal components
- contracts may depend only on stable runtime types

Acceptance criteria:

- contracts compile with `bun run typecheck`
- contracts can express all current CLI semantics needed by hosts
- contracts can wrap current implementations without forcing immediate rewrites

## Phase 2: Execution Core Extraction

Objective:

- move the conversational kernel behind runtime ownership with maximal reuse

Tasks:

- wrap the current query loop semantics from `src/query.ts` behind runtime contracts
- wrap multi-turn state ownership from `src/QueryEngine.ts` behind runtime-owned state providers
- create `src/runtime/capabilities/execution/TurnEngine.ts`
- create `src/runtime/capabilities/execution/SessionRuntime.ts`
- move compact/retry/recovery orchestration behind execution contracts
- defer internal rewrites until state and host coupling are reduced

Key constraint:

- preserve current stop/retry/tool-call semantics

Acceptance criteria:

- a runtime session can submit a prompt and stream events without importing
  CLI rendering modules
- the same execution module can be called by at least two hosts

## Phase 3: Tool and MCP Capability Extraction

Objective:

- make tools and MCP runtime-native capabilities

Tasks:

- split `src/tools.ts` into:
  - capability registry logic
  - host-facing preset wiring
- build `src/runtime/capabilities/tools/ToolCatalog.ts`
- build `src/runtime/capabilities/tools/ToolExecutionContext.ts`
- build `src/runtime/capabilities/mcp/McpRegistry.ts`
- build `src/runtime/capabilities/mcp/McpSessionBinding.ts`
- move host-independent MCP logic out of ad hoc CLI bootstrapping
- preserve current MCP transport/auth/reconnect logic unless it blocks the new contracts

Acceptance criteria:

- tool enablement and permission filtering work without `src/main.tsx`
- MCP clients can be attached per runtime session
- tool and MCP capabilities are consumable by CLI and bridge paths

## Phase 4: Command Semantics Extraction

Objective:

- preserve CLI behavior while removing command ownership from Commander wiring

Tasks:

- model command graph as runtime data
- separate command semantics from command-line parsing
- move reusable command handlers to `src/runtime/capabilities/commands/`
- keep Commander only as a parser/dispatcher in `src/hosts/cli/`
- preserve current command handler implementations when they are not terminal-bound

Acceptance criteria:

- a command can be invoked through runtime contracts without Commander
- CLI parsing still routes to the same behavior

## Phase 5: Persistence and Recovery Extraction

Objective:

- move persistence ownership out of CLI-global state while preserving behavior

Tasks:

- wrap transcript recording behind persistence contracts
- wrap session snapshot storage behind persistence contracts
- wrap resume/recovery logic behind persistence contracts
- define host-independent recovery contracts
- reduce reliance on `src/bootstrap/state.ts` as source-of-truth storage

Acceptance criteria:

- sessions can be resumed through runtime APIs
- bridge and CLI consume the same recovery mechanism

## Phase 6: Bridge and Daemon Replatforming

Objective:

- convert long-running remote flows into runtime-backed hosts with reused bridge logic

Tasks:

- move bridge execution semantics behind runtime contracts
- rewire `src/bridge/bridgeMain.ts` to consume runtime capabilities
- rewire `src/daemon/workerRegistry.ts` to consume runtime capabilities
- isolate host-specific process wiring from session semantics
- preserve current heartbeat/spawn/worker behavior unless runtime ownership requires change

Acceptance criteria:

- bridge sessions no longer own bespoke execution logic
- daemon workers launch runtime-backed workers

## Phase 7: CLI Host Migration

Objective:

- make terminal CLI a host on top of the kernel

Tasks:

- move Commander wiring into `src/hosts/cli/`
- move terminal rendering specifics into `src/hosts/terminal/`
- have REPL consume runtime events and runtime actions
- preserve current visible CLI behavior
- reuse current REPL behavior and UI flow while moving ownership boundaries

Acceptance criteria:

- terminal UI imports runtime contracts rather than owning core execution
- CLI startup path uses the kernel API layer

## Phase 8: Kernel API Surface

Objective:

- create the stable public API only after internals are stable

Tasks:

- add `src/kernel/index.ts`
- add `src/kernel/cli.ts`
- add `src/kernel/headless.ts`
- add `src/kernel/bridge.ts`
- add `src/kernel/daemon.ts`

Acceptance criteria:

- public APIs are thin composition roots
- all host creation flows resolve through one runtime core

## 6. Work Breakdown Structure

Recommended workstreams:

- Workstream A: contracts + types
- Workstream B: execution core
- Workstream C: tools + MCP
- Workstream D: command semantics
- Workstream E: persistence + recovery
- Workstream F: bridge + daemon
- Workstream G: CLI host migration

These streams can overlap only where contracts are already stable.

## 7. Order of Execution

Mandatory order:

1. inventory
2. contracts
3. execution core
4. tools and MCP
5. command semantics
6. persistence
7. bridge and daemon
8. CLI host migration
9. public kernel API

This order is required because the CLI host must migrate onto a real runtime,
not onto placeholders.

Operational rule:

- in each phase, prefer `wrap -> isolate state -> transfer ownership -> simplify`
- use `rewrite` only when the existing implementation cannot satisfy runtime contracts

## 8. Risks

### Risk 1: Hidden CLI-global state coupling

Signal:

- moved modules still require `src/bootstrap/state.ts`

Mitigation:

- audit state reads/writes during each extraction
- replace implicit globals with runtime-scoped state providers
- keep business logic intact while swapping state ownership, to avoid mixing
  architectural change with behavioral change

### Risk 2: Command behavior drift

Signal:

- commands parse correctly but no longer behave the same

Mitigation:

- snapshot command semantics before moving handlers
- add behavior-focused tests for top-level commands
- reuse existing handlers instead of reinterpreting command intent from scratch

### Risk 3: Tool permission regressions

Signal:

- approval flow changes across CLI, bridge, or daemon

Mitigation:

- define permission contracts early
- test CLI and remote flows against the same permission matrix

### Risk 4: MCP session lifecycle regressions

Signal:

- reconnect, auth refresh, or resource enumeration break after extraction

Mitigation:

- separate transport lifecycle from host lifecycle
- add reconnect and auth-expiry integration tests
- preserve current reconnect/auth code paths until the new contracts prove equivalent

### Risk 5: Bridge and daemon divergence

Signal:

- bridge and CLI end up using different execution modules

Mitigation:

- do not let bridge retain its own execution core
- force bridge and daemon through runtime session contracts

## 9. Test Strategy

### Unit

- contract conformance tests
- command graph tests
- tool registry tests
- MCP binding tests
- persistence serializer tests

### Integration

- prompt -> tool -> prompt turn loop
- CLI command -> runtime action
- bridge worker -> runtime session
- daemon worker -> runtime session
- session resume across hosts

### End-to-End

- interactive CLI conversation
- pipe mode conversation
- MCP-backed session
- remote-control session
- daemon remote-control worker

### Observability

- startup timing before/after extraction
- turn latency before/after extraction
- tool latency before/after extraction
- MCP reconnect success metrics

## 10. Acceptance Criteria

The execution plan is complete only when:

- all current top-level product capabilities still exist
- no host owns a separate execution engine
- CLI, bridge, and daemon all run through the same runtime contracts
- command semantics are reusable outside Commander
- `bun run typecheck` passes
- critical feature smoke tests pass
- modules marked `reuse as-is` or `reuse with isolation` remain reused unless a
  documented blocker required rewriting them

## 11. Suggested Documentation Sequence

Write and maintain these in parallel:

1. architecture document
2. command matrix
3. capability matrix
4. host contract doc
5. verification checklist
6. migration changelog

This file is the execution document for the overall transformation. The
architecture definition lives in:

- `docs/internals/full-feature-kernelization-architecture.md`
- `docs/task/task-020-kernelization-implementation-backlog.md`
