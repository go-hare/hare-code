# Task 019: Kernelization Capability Matrix

## 1. Purpose

This document classifies the core capability domains of the current project for
full-feature kernelization.

It complements the command-side matrix in:

- `docs/task/task-018-kernelization-command-matrix.md`

The command matrix answers "what the CLI exposes".

This capability matrix answers "what implementation domains power those
surfaces" and whether each domain should be:

- reused directly
- reused with ownership/state isolation
- rewritten

## 2. Classification Rules

### `reuse as-is`

Use the existing implementation with minimal relocation.

### `reuse with isolation`

Preserve the current business behavior but move one or more of the following:

- state ownership
- host ownership
- lifecycle ownership
- contract boundaries

### `rewrite required`

The current implementation cannot become a reusable kernel capability without a
substantial structural redesign.

## 3. Capability Matrix

| Capability domain | Evidence | Current owner | Future owner | Classification | Rationale |
| --- | --- | --- | --- | --- | --- |
| Turn loop and streaming execution | `src/query.ts:1` | CLI-centered conversation pipeline | `runtime/capabilities/execution` | `reuse with isolation` | The turn loop is core product value and should be preserved. Its ownership must move off CLI bootstrap and global session state. |
| Multi-turn session engine | `src/QueryEngine.ts:1` | session engine bound to current app/bootstrap model | `runtime/capabilities/execution` | `reuse with isolation` | The class already models reusable session behavior. Main issue is ownership coupling, not business logic quality. |
| Tool registry assembly | `src/tools.ts:1` | CLI/runtime bootstrap hybrid | `runtime/capabilities/tools` | `reuse with isolation` | Tool catalog logic is valuable and mature. Move registry/policy ownership; keep concrete tool implementations. |
| Concrete built-in tools | `src/tools.ts:1`, `packages/builtin-tools/` | tool packages and tool folders | `runtime/capabilities/tools` + tool packages | `reuse as-is` | Tool implementations are already modular enough. Do not rewrite tools unless a specific contract mismatch appears. |
| MCP client lifecycle | `src/services/mcp/client.ts:1` | CLI/global session oriented service | `runtime/capabilities/mcp` | `reuse with isolation` | Connection, auth refresh, reconnect, and resource/tool exposure logic should be preserved, but session ownership must be runtime-scoped. |
| Provider/API orchestration | `src/query.ts:1`, `src/services/api/` | execution loop plus service layer | `runtime/capabilities/providers` | `reuse with isolation` | Provider routing and API semantics are reusable. Ownership must shift behind runtime contracts. |
| Command registry and slash-command loading | `src/commands.ts:1` | CLI command assembly with feature-gated imports | `runtime/capabilities/commands` | `reuse with isolation` | Existing command modules are reusable, but `commands.ts` currently mixes runtime semantics, feature gates, and CLI ownership. |
| Command implementations in `src/commands/` | `src/commands/` | CLI command modules | `runtime/capabilities/commands` or product operations | `reuse as-is` | Most command handlers can be preserved and reclassified by owner. The main task is routing and ownership transfer. |
| Bundled skills registration | `src/skills/bundled/index.ts:1` | startup-driven registration | `runtime/capabilities/skills` | `reuse with isolation` | Skill registration logic is already modular. The issue is bootstrap ownership and lifecycle timing. |
| Task model and local/agent task execution | `src/tasks/` | UI/runtime mixed ownership | `runtime/core` + `runtime/capabilities/agents` + `runtime/capabilities/workflows` | `reuse with isolation` | Task semantics are valuable, but current files mix UI-facing and runtime-facing responsibilities. |
| Bridge / remote-control execution | `src/bridge/bridgeMain.ts:141` | bridge host owning remote session orchestration | `runtime/capabilities/bridge` + `hosts/remote-control` | `reuse with isolation` | Heartbeat, spawn, reconnect, and worker semantics should be preserved; ownership should move behind runtime contracts. |
| Daemon worker dispatch | `src/daemon/workerRegistry.ts:26` | daemon host utility | `runtime/capabilities/daemon` + `hosts/daemon` | `reuse with isolation` | Worker semantics are stable. Main change is migrating execution ownership away from ad hoc host loops. |
| Global bootstrap state | `src/bootstrap/state.ts:1` | process-global singleton source of truth | `runtime/core` state providers + host-local state | `rewrite required` | This is the main structural blocker. The current singleton design prevents clean multi-host runtime ownership. |
| App state store | `src/state/AppStateStore.ts:1` | REPL/CLI state owner | split into `runtime state` and `host state` | `rewrite required` | The current app state shape contains both reusable kernel state and terminal/UI state; it must be decomposed. |
| Session persistence and transcript recording | evidence via `src/query.ts:84`, `src/QueryEngine.ts:77`, bootstrap/session helpers referenced from execution | utility/storage layer under current CLI ownership | `runtime/capabilities/persistence` | `reuse with isolation` | Preserve transcript and recovery behavior, but move ownership behind runtime contracts and session-scoped providers. |
| Conversation recovery | evidence via `src/QueryEngine.ts` imports and session recovery flow | utility layer tied to current session/bootstrap ownership | `runtime/capabilities/persistence` | `reuse with isolation` | Recovery semantics should survive. State and storage ownership need to move. |
| REPL interaction semantics | `src/screens/REPL.tsx:1` | mixed UI + behavior ownership | split between `runtime/capabilities/commands/execution` and `hosts/terminal` | `rewrite required` | The current file mixes terminal rendering, input handling, and reusable behavior. Behavior can be preserved, but the implementation shape must be split. |
| Terminal rendering components | `src/screens/REPL.tsx:1`, `src/components/` | terminal host | `hosts/terminal` | `reuse as-is` | Terminal components should remain terminal components. They are host implementations, not kernel code. |
| Remote session / direct-connect server session ownership | `src/main.tsx:5857`, `src/server/` | ad hoc server path | `runtime/core` + `hosts/server` | `rewrite required` | Session creation and ownership should converge with the same kernel session core, not remain a separate path. |
| Product operations (`auth`, `install`, `update`, `doctor`, plugin ops) | `src/main.tsx:6072`, `src/main.tsx:6133`, `src/main.tsx:6477`, `src/main.tsx:6538`, `src/main.tsx:6556` | CLI/product command layer | product operations layer + selected runtime capabilities | `reuse as-is` | Keep these stable. They are not the first kernel extraction target. |

## 4. Domain-Level Conclusions

### 4.1 Strong `reuse with isolation` domains

These are the primary kernelization lanes:

- turn loop and session engine
- tool registry assembly
- MCP lifecycle
- provider/API orchestration
- command registry and slash-command semantics
- bundled skills
- tasks
- bridge / remote-control
- daemon worker dispatch
- persistence / recovery

These domains already contain valuable working behavior. The main work is moving
ownership, contracts, and state boundaries.

### 4.2 Clear `rewrite required` domains

These are the structural blockers:

- `src/bootstrap/state.ts`
- `src/state/AppStateStore.ts` and the current app-state ownership model
- `src/screens/REPL.tsx` as a mixed UI/behavior monolith
- direct-connect/server session ownership as a separate execution path

These are the places where kernelization will fail if ownership is not changed.

### 4.3 Strong `reuse as-is` domains

These should not be rewritten early:

- concrete tool implementations
- most command handlers in `src/commands/`
- bundled skill registration functions
- terminal components
- product operation commands

## 5. Recommended Work Priority

The highest-value order is:

1. global state decomposition
2. execution/session contracts
3. tool + MCP isolation
4. command registry isolation
5. persistence/recovery isolation
6. bridge/daemon isolation
7. REPL split into behavior vs terminal rendering

This order follows the actual blockers in the matrix rather than surface-level
command count.

## 6. Reuse Policy Derived From This Matrix

For the current codebase, the default policy should be:

- `bootstrap/state` and mixed app-state ownership: redesign
- runtime behavior modules: preserve semantics and isolate
- host rendering modules: preserve and relocate only if necessary
- product operation commands: preserve and defer

In short:

- preserve behavior
- move ownership
- rewrite only the architectural choke points

## 7. Next Use

This matrix should feed:

- Phase 0 and Phase 2-7 of `task-017`
- the future runtime contract document
- the host contract document
- the implementation backlog by workstream

The next useful artifact after this one is:

- a concrete workstream backlog that turns `task-017`, `task-018`, and
  `task-019` into implementation tickets
