# Task 018: Kernelization Command Matrix

## 1. Purpose

This document classifies the current CLI command surface for full-feature
kernelization.

It answers four questions for each first-level command or bootstrap fast path:

1. what behavior exists today
2. where it currently lives
3. where it should live after kernelization
4. whether it should be reused directly, reused with isolation, or rewritten

This matrix is the command-side output of Phase 0 from:

- `docs/task/task-017-full-feature-kernelization-execution.md`

## 2. Classification Rules

### `reuse as-is`

Use the current implementation with minimal relocation.

Conditions:

- behavior is stable
- logic is not tightly coupled to CLI-global state
- logic is not terminal-rendering-specific

### `reuse with isolation`

Keep the business behavior, but move state ownership, host ownership, or boot
ordering behind runtime contracts.

Conditions:

- behavior is valuable and stable
- implementation is entangled with Commander, bootstrap, or process-global state
- semantics should survive but ownership must move

### `rewrite required`

Current implementation cannot become a reusable kernel capability without major
structural change.

Conditions:

- implementation owns a parallel execution core
- host-specific control flow is fused with runtime semantics
- session ownership cannot be transferred cleanly

## 3. Bootstrap Fast-Path Matrix

These paths are intercepted in `src/entrypoints/cli.tsx` before the full CLI
graph is loaded.

| Path | Evidence | Current owner | Future owner | Classification | Notes |
| --- | --- | --- | --- | --- | --- |
| `--version`, `-v`, `-V` | `src/entrypoints/cli.tsx:79` | bootstrap entrypoint | `hosts/cli` | `reuse as-is` | Simple host utility; no kernel semantics beyond version exposure. |
| `--dump-system-prompt` | `src/entrypoints/cli.tsx:95` | bootstrap + prompt assembly | `runtime/capabilities/commands` + `hosts/cli` | `reuse with isolation` | Reuse prompt-building logic, isolate config/bootstrap calls. |
| `--claude-in-chrome-mcp` | `src/entrypoints/cli.tsx:109` | bootstrap + browser MCP launcher | `runtime/capabilities/mcp` + `hosts/cli` | `reuse with isolation` | Preserve launcher behavior, migrate host ownership. |
| `--chrome-native-host` | `src/entrypoints/cli.tsx:116` | bootstrap + browser host launcher | `runtime/capabilities/bridge` or browser capability + `hosts/cli` | `reuse with isolation` | Stable host behavior, but should not stay in bootstrap. |
| `--computer-use-mcp` | `src/entrypoints/cli.tsx:123` | bootstrap + computer-use MCP launcher | `runtime/capabilities/computerUse` + `hosts/cli` | `reuse with isolation` | Keep capability, move dispatch to kernel-aware host layer. |
| `--acp` | `src/entrypoints/cli.tsx:136` | bootstrap + ACP agent entry | `runtime/capabilities/bridge` + `hosts/acp` | `reuse with isolation` | ACP is a host protocol over kernel sessions. |
| `weixin` | `src/entrypoints/cli.tsx:143` | dedicated host integration | `hosts/weixin` | `reuse as-is` | Separate host surface; keep behavior, rebind to runtime contracts later. |
| `--daemon-worker=<kind>` | `src/entrypoints/cli.tsx:173` | bootstrap + daemon worker router | `hosts/daemon` + `runtime/capabilities/daemon` | `reuse with isolation` | Preserve worker semantics, move worker execution behind runtime-owned services. |
| `remote-control`, `rc`, `remote`, `sync`, `bridge` | `src/entrypoints/cli.tsx:186` | bootstrap interception + `bridgeMain` | `hosts/remote-control` + `runtime/capabilities/bridge` | `reuse with isolation` | Current behavior is valuable; ownership must leave bootstrap. |
| `daemon` | `src/entrypoints/cli.tsx:241` | bootstrap daemon dispatch | `hosts/daemon` + `runtime/capabilities/daemon` | `reuse with isolation` | Keep command semantics, isolate daemon supervisor state. |
| `ps`, `logs`, `attach`, `kill`, `--bg` family | `src/entrypoints/cli.tsx:275` | bootstrap background-session shim | `runtime/capabilities/daemon` + `hosts/cli` | `reuse with isolation` | Preserve BG session semantics, replace bootstrap routing with runtime contracts. |
| `job` | `src/entrypoints/cli.tsx:297` | bootstrap template job dispatch | `runtime/capabilities/workflows` + `hosts/cli` | `reuse with isolation` | Likely reusable job capability with host parser retained. |
| `new`, `list`, `reply` template aliases | `src/entrypoints/cli.tsx:310` | bootstrap alias rewrite | `runtime/capabilities/workflows` + `hosts/cli` | `reuse with isolation` | Keep alias behavior, make job resolution runtime-owned. |
| `environment-runner` | `src/entrypoints/cli.tsx:324` | bootstrap dedicated host | `hosts/environment-runner` | `reuse as-is` | Keep as product host unless future kernel consumers need it. |
| `self-hosted-runner` | `src/entrypoints/cli.tsx:336` | bootstrap dedicated host | `hosts/self-hosted-runner` | `reuse as-is` | Same as environment-runner. |
| `--update`, `--upgrade` | `src/entrypoints/cli.tsx:375` | bootstrap utility path | `hosts/cli` + product operations | `reuse as-is` | Product lifecycle utility, not kernel behavior. |

## 4. Primary Command Matrix

These are the first-level commands registered in `src/main.tsx`.

| Command | Evidence | Current owner | Future owner | Classification | Notes |
| --- | --- | --- | --- | --- | --- |
| root interactive / print mode | `src/main.tsx:5728` | `main.tsx` + `launchRepl` + `QueryEngine` + `REPL` | `runtime/capabilities/execution` + `runtime/capabilities/commands` + `hosts/cli` | `reuse with isolation` | This is the highest-value lane. Preserve behavior, move ownership out of CLI bootstrap. |
| `mcp` | `src/main.tsx:5742` | command graph + `cli/handlers/mcp.js` + `services/mcp` | `runtime/capabilities/mcp` + `runtime/capabilities/commands` + `hosts/cli` | `reuse with isolation` | Reuse MCP business logic and config flows, isolate from Commander and trust/bootstrap coupling. |
| `server` | `src/main.tsx:5857` | direct-connect host with its own session manager/backend wiring | `hosts/server` + `runtime/core` | `rewrite required` | Reuse banner, lockfile, auth-token, and startup helpers; replace session ownership with kernel sessions. |
| `ssh <host> [dir]` | `src/main.tsx:5969` | CLI stub + argv rewrite + remote session flow | `runtime/capabilities/bridge` or remote host capability + `hosts/cli` | `reuse with isolation` | Preserve remote-session semantics, remove dependence on argv rewriting hacks. |
| `open <cc-url>` | `src/main.tsx:6006` | direct-connect headless path | `hosts/server` + `runtime/core` | `reuse with isolation` | Strong candidate for reuse once connect/session creation is runtime-owned. |
| `auth` | `src/main.tsx:6072` | `cli/handlers/auth.js` + auth services | product operations + `runtime/capabilities/providers` | `reuse as-is` | Product auth commands can stay mostly unchanged while provider/auth services are shared. |
| `plugin` | `src/main.tsx:6133` | `cli/handlers/plugins.js` + plugin services | product operations + extensibility capability | `reuse as-is` | Not core session behavior; keep handler semantics and relocate only if plugin runtime contracts are needed. |
| `setup-token` | `src/main.tsx:6360` | utility handler + Ink root setup | product operations | `reuse as-is` | Stable support command; minimal kernel relevance. |
| `agents` | `src/main.tsx:6375` | handler + agent definition loading | `runtime/capabilities/agents` + `hosts/cli` | `reuse with isolation` | Listing semantics should survive, but agent definition ownership belongs in runtime capability code. |
| `auto-mode` | `src/main.tsx:6392` | classifier config handlers | product operations + policy capability | `reuse as-is` | Inspection/config surface can remain mostly intact. |
| hidden `remote-control` command stub | `src/main.tsx:6442` | help-only fallback to `bridgeMain` | `hosts/remote-control` | `reuse with isolation` | Keep help surface, but real execution should be fully host/runtime based. |
| `assistant [sessionId]` | `src/main.tsx:6457` | CLI stub for bridge viewer attach | `hosts/cli` + `runtime/capabilities/bridge` | `rewrite required` | Existing implementation is a placeholder around argv rewrite. The real attach flow should become a first-class host command. |
| `doctor` | `src/main.tsx:6477` | utility handler + Ink root | product operations | `reuse as-is` | Operational utility; low kernel impact. |
| `up` | `src/main.tsx:6494` | ant-only environment utility | product operations | `reuse as-is` | Keep as product command. |
| `rollback` | `src/main.tsx:6508` | ant-only release utility | product operations | `reuse as-is` | Keep as product command. |
| `install [target]` | `src/main.tsx:6538` | install utility | product operations | `reuse as-is` | Keep as product command. |
| `update` | `src/main.tsx:6556` | update utility | product operations | `reuse as-is` | Keep as product command. |
| `log` | `src/main.tsx:6572` | ant-only log viewer | product support tooling | `reuse as-is` | Keep as support utility unless transcript APIs are later generalized. |
| `error` | `src/main.tsx:6586` | ant-only error viewer | product support tooling | `reuse as-is` | Same as log. |
| `export` | `src/main.tsx:6602` | ant-only transcript export | product support tooling + persistence capability | `reuse with isolation` | Export logic should eventually consume runtime transcript contracts. |
| `task` | `src/main.tsx:6626` | ant-only local task list handlers | product support tooling or future task capability | `reuse with isolation` | Business behavior may be reusable, but current ownership is CLI/ant specific. |
| hidden `completion <shell>` | `src/main.tsx:6731` | CLI completion generator | `hosts/cli` | `reuse as-is` | Host-only command, no kernel semantics. |

## 5. Immediate Conclusions

### Highest-priority `reuse with isolation` lanes

- root interactive / print mode
- `mcp`
- `open`
- `agents`
- `export`
- daemon / bridge / BG session fast paths

These lanes preserve the most valuable behavior while transferring ownership to
runtime contracts.

### Highest-priority `rewrite required` lanes

- `server`
- `assistant [sessionId]`

These are the clearest places where current host ownership is too tightly bound
to ad hoc session management or argv-rewrite placeholders.

### Strong `reuse as-is` lanes

- `auth`
- `plugin`
- `setup-token`
- `doctor`
- `install`
- `update`
- `completion`

These commands are primarily product operations. They should stay available, but
they do not need to drive the first kernel extraction milestones.

## 6. Next Use

This matrix should directly feed:

- Phase 0 and Phase 4 of `task-017-full-feature-kernelization-execution.md`
- the future capability matrix
- the runtime host contract document

The next document to write after this one should be:

- a capability matrix that maps `query`, `QueryEngine`, tools, MCP, bridge,
  daemon, persistence, and command handlers into `reuse as-is`,
  `reuse with isolation`, and `rewrite required`
