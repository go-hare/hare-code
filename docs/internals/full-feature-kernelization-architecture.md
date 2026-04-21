# Full-Feature Kernelization Architecture

## 1. Background

This project already has a rich capability surface, but the capability graph is
anchored to the CLI bootstrap path instead of a reusable runtime core.

Today, the effective execution chain starts from:

- `src/entrypoints/cli.tsx:74` for startup path selection
- `src/main.tsx:1` for command graph, bootstrap, and REPL launch wiring
- `src/query.ts:1` for the streaming turn loop
- `src/QueryEngine.ts:1` for multi-turn state ownership
- `src/screens/REPL.tsx:1` for interactive terminal behavior
- `src/tools.ts:1` for tool registry assembly
- `src/services/mcp/client.ts:1` for MCP client lifecycle and MCP tool surface
- `src/bridge/bridgeMain.ts:1` for remote-control bridge execution
- `src/daemon/workerRegistry.ts:1` for long-running daemon workers

The problem is not lack of features. The problem is that the full feature set is
not organized around a stable runtime kernel that other hosts can embed.

The objective of kernelization is therefore:

- preserve the full feature set
- preserve CLI semantics
- extract a reusable runtime kernel without reducing capability
- reuse stable implementations wherever possible
- make CLI one host of the kernel, not the sole owner of behavior

This document defines the target architecture for that work.

## 2. Non-Goals

This effort explicitly does not aim to:

- remove or simplify existing product capabilities
- create a slim SDK that omits CLI behavior
- maintain parallel old/new execution paths long term
- treat terminal rendering details as part of kernel semantics
- move code into `packages/` before kernel boundaries are stable
- rewrite stable modules only for aesthetic reasons

## 3. Design Principles

1. Full feature parity is required. Kernelization that drops capabilities is invalid.
2. CLI semantics are kernel capabilities. Terminal rendering is not.
3. One execution core must serve CLI, headless, bridge, daemon, and future hosts.
4. Product operations must be layered on top of the kernel, not baked into it.
5. Capability modules must depend on runtime contracts, not CLI bootstrap state.
6. Kernel state must be instance-scoped, not process-global where avoidable.
7. A feature is only "kernelized" when two or more hosts can consume it through
   the same contract.
8. Prefer ownership transfer over rewrites. If an implementation is stable and
   feature-complete, move it behind a runtime contract before changing it.
9. Reuse code, but do not preserve accidental architecture. Stable behavior is
   worth reusing; CLI-centric ownership is not.

## 4. Current Capability Inventory

The existing codebase already exposes all major capability families needed for a
full kernel:

- CLI command graph and mode routing in `src/entrypoints/cli.tsx:74` and
  `src/main.tsx:1`
- conversational execution in `src/query.ts:1` and `src/QueryEngine.ts:1`
- interactive terminal experience in `src/screens/REPL.tsx:1`
- tool catalog assembly in `src/tools.ts:1`
- MCP connection, auth, transport, and tool exposure in
  `src/services/mcp/client.ts:1`
- remote control / bridge execution in `src/bridge/bridgeMain.ts:141`
- daemon worker execution in `src/daemon/workerRegistry.ts:26`
- provider integrations and API orchestration under `src/services/api/`
- app/session state under `src/state/` and `src/bootstrap/state.ts`
- agents, teams, coordinator, tasks, workflows, and skills via `src/commands/`,
  `src/tasks/`, `src/skills/`, and built-in tools

The target architecture must absorb all of those capability families.

## 5. Kernel Boundary Model

The new system is split into four layers:

### 5.1 Kernel API Layer

Purpose:

- expose stable public entrypoints for creating sessions, hosts, and services
- hide internal implementation layout from consumers

Target responsibilities:

- create interactive CLI host sessions
- create headless sessions
- create remote-control host sessions
- create daemon workers
- create runtime service registries

Suggested path:

- `src/kernel/`

This path does not currently exist in the source project and should be added as
the thin public API surface.

### 5.2 Runtime Core Layer

Purpose:

- own the runtime lifecycle
- manage conversations, turns, tasks, host events, and execution state

Target responsibilities:

- session manager
- turn coordinator
- event bus
- runtime host control
- background task orchestration
- team / agent orchestration
- cross-host state lifecycle

Suggested path:

- `src/runtime/core/`

### 5.3 Runtime Capability Layer

Purpose:

- implement full feature capabilities behind stable runtime contracts
- initially by wrapping and relocating existing proven implementations where possible

Target responsibilities:

- conversational execution
- tool registry and tool execution
- MCP registry and session binding
- provider selection and API model streaming
- permissions and policy evaluation
- persistence and recovery
- commands and command semantics
- skill registry
- bridge / remote control session execution
- daemon worker execution
- voice / computer use / browser control capability modules

Suggested path:

- `src/runtime/capabilities/`

### 5.4 Host Implementation Layer

Purpose:

- provide concrete experiences on top of runtime contracts

Target responsibilities:

- terminal rendering
- Commander wiring
- TTY interaction
- server sockets
- stdio ACP host adapters
- remote web / bridge adapters

Suggested path:

- `src/hosts/`

## 6. CLI Kernelization Model

CLI must be split into two parts:

### 6.1 CLI Kernel Capabilities

These belong in the kernel because they define reusable behavior:

- command graph semantics
- interactive conversation protocol
- slash command execution semantics
- pipe mode semantics
- attach / resume semantics
- background session semantics
- permission approval contract
- prompt submission lifecycle
- transcript export semantics

Current evidence:

- startup mode routing in `src/entrypoints/cli.tsx:74`
- command graph in `src/main.tsx:1`
- query lifecycle in `src/query.ts:1`
- multi-turn session ownership in `src/QueryEngine.ts:1`

### 6.2 Terminal-Only Implementations

These do not belong in the kernel:

- Ink component tree
- terminal widgets
- keyboard display and formatting
- visual tab state
- viewport management
- cursor control

Current evidence:

- `src/screens/REPL.tsx:1`
- `src/components/`
- `src/keybindings/`

## 7. Target Directory Layout

The target directory layout should be:

```text
src/
  kernel/
    index.ts
    cli.ts
    headless.ts
    bridge.ts
    daemon.ts

  runtime/
    core/
      RuntimeKernel.ts
      SessionManager.ts
      TurnManager.ts
      EventBus.ts
      HostCoordinator.ts
      TaskCoordinator.ts

    contracts/
      execution.ts
      command.ts
      tool.ts
      mcp.ts
      persistence.ts
      provider.ts
      permissions.ts
      host.ts

    capabilities/
      execution/
      commands/
      tools/
      mcp/
      providers/
      persistence/
      permissions/
      bridge/
      daemon/
      agents/
      teams/
      workflows/
      voice/
      computerUse/

  hosts/
    cli/
    headless/
    remote-control/
    daemon/
    acp/
    terminal/
```

## 8. Capability Mapping

The mapping below assumes a reuse-first strategy:

- if the current implementation is stable and feature-complete, move it behind
  runtime contracts first
- if the current implementation is tightly coupled to CLI-global state, split
  the state ownership before rewriting logic
- only rewrite modules that block multi-host reuse, instance-scoped state, or
  contract clarity

### 8.1 Execution Capability

Current owners:

- `src/query.ts`
- `src/QueryEngine.ts`

Target ownership:

- `src/runtime/capabilities/execution/`

Deliverables:

- turn engine
- streaming model execution
- tool-call loop orchestration
- compact / recovery / retry flow
- transcript event emission

Preferred reuse path:

- preserve turn-loop semantics from `src/query.ts`
- preserve multi-turn session ownership logic from `src/QueryEngine.ts`
- extract CLI-global state dependencies into injected runtime state providers

### 8.2 Command Capability

Current owners:

- `src/main.tsx`
- `src/commands/`

Target ownership:

- `src/runtime/capabilities/commands/`

Deliverables:

- command graph model
- command resolver
- command handlers on runtime contracts
- CLI-independent command invocation

Preferred reuse path:

- reuse existing command handlers from `src/commands/`
- separate command semantics from Commander binding in `src/main.tsx`
- avoid rewriting command behavior unless it depends on terminal-only details

### 8.3 Tool Capability

Current owners:

- `src/tools.ts`
- `packages/builtin-tools/`

Target ownership:

- registry and policy in `src/runtime/capabilities/tools/`
- concrete tool implementations may remain in packages or tool folders

Deliverables:

- tool catalog
- enablement gates
- permission filters
- tool execution context contracts

Preferred reuse path:

- retain tool implementations and current tool package layout
- move registry assembly and policy ownership out of CLI bootstrap
- do not rewrite individual tools unless contract mismatches force it

### 8.4 MCP Capability

Current owners:

- `src/services/mcp/client.ts`
- `src/commands/mcp/`

Target ownership:

- `src/runtime/capabilities/mcp/`

Deliverables:

- config resolution
- client lifecycle
- auth refresh
- prompt/resource/tool exposure
- per-session MCP binding

Preferred reuse path:

- keep transport, auth refresh, reconnection, and error handling logic from
  `src/services/mcp/client.ts`
- progressively extract session binding and host-independent coordination into
  runtime capability modules

### 8.5 Remote Control / Bridge Capability

Current owners:

- `src/bridge/bridgeMain.ts`
- `src/daemon/workerRegistry.ts`

Target ownership:

- execution semantics in `src/runtime/capabilities/bridge/`
- host endpoints in `src/hosts/remote-control/` and `src/hosts/daemon/`

Deliverables:

- session spawning semantics
- heartbeat semantics
- worker execution loop
- bridge session contract

Preferred reuse path:

- preserve business behavior from `src/bridge/bridgeMain.ts`
- preserve worker orchestration behavior from `src/daemon/workerRegistry.ts`
- move process wiring and session ownership behind runtime contracts

### 8.6 Persistence Capability

Current owners:

- `src/utils/sessionStorage.js`
- `src/utils/conversationRecovery.js`
- `src/bootstrap/state.ts`

Target ownership:

- `src/runtime/capabilities/persistence/`

Deliverables:

- transcript storage
- session snapshots
- resume/recovery
- host-independent state restoration

Preferred reuse path:

- preserve current transcript and recovery behavior
- replace process-global ownership with runtime-scoped providers
- rewrite only storage boundaries that cannot support multi-host reuse

## 9. State Architecture

The current project mixes reusable runtime state with CLI-global process state.
The kernel target should separate state into three planes:

### 9.1 Kernel State

- session registry
- task registry
- event stream
- capability registry
- host bindings

### 9.2 Execution State

- messages
- turn budget
- tool call state
- permission requests
- current provider request state
- abort / recovery metadata

### 9.3 Host State

- terminal tabs
- selected UI pane
- scroll position
- active prompt mode
- keyboard focus

Only the first two belong to the kernel. Host state remains outside.

## 10. Public API Shape

The public API should be explicit and host-agnostic.

Examples:

```ts
type Kernel = {
  createCliSession(options: CliSessionOptions): CliSession
  createHeadlessSession(options: HeadlessSessionOptions): HeadlessSession
  createBridgeSession(options: BridgeSessionOptions): BridgeSession
  createDaemonWorker(options: DaemonWorkerOptions): DaemonWorker
}

type HeadlessSession = {
  submit(input: UserInput): AsyncIterable<KernelEvent>
  interrupt(): Promise<boolean>
  snapshot(): Promise<SessionSnapshot>
  close(): Promise<void>
}
```

The exact names can change. The invariants must not.

## 11. Migration Strategy

This architecture is intended for the original full project, not a reduced fork.

Migration must happen by ownership transfer, not by introducing permanent
adapter layers.

Required strategy:

1. define runtime contracts first
2. place existing stable implementations behind those contracts with minimal behavior changes
3. migrate state ownership from CLI-global/process-global locations into runtime-owned providers
4. convert CLI, bridge, and daemon to runtime consumers
5. remove direct imports from hosts into capability internals
6. add public kernel APIs only after contracts stabilize

Prohibited strategy:

- building a parallel "lite runtime"
- introducing a long-lived `legacy` namespace
- keeping duplicate turn engines
- keeping duplicate tool catalogs
- rewriting mature modules before proving they block kernelization

## 12. Acceptance Criteria

The architecture work is complete only when all of the following are true:

- CLI, headless, bridge, and daemon use the same execution core
- command semantics can execute without importing Commander
- the main turn loop is owned by runtime capability code, not CLI bootstrap
- MCP lifecycle is session-bound and host-independent
- persistence and recovery work without `src/bootstrap/state.ts` owning the
  source of truth
- REPL terminal rendering becomes a host implementation over kernel contracts
- no long-lived adapter/legacy execution path remains
- stable existing implementations are preserved where they do not block the new
  ownership model

## 13. Recommended Documentation Set

This architecture should be accompanied by:

- this architecture document
- an execution plan document
- a host-contract document
- a migration checklist document
- a verification plan document

The execution plan is captured in:

- `docs/task/task-017-full-feature-kernelization-execution.md`
