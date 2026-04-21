# REPL Kernelization Split Plan

See also:

- `docs/internals/full-feature-kernelization-architecture.md`
- `src/screens/REPL.tsx:1`
- `src/runtime/capabilities/execution/SessionRuntime.ts:185`

## 1. Background

`src/screens/REPL.tsx` is currently one of the largest and highest-coupling files in the project.

Today it mixes several different kinds of responsibilities:

- terminal UI composition and rendering
- user input and keybinding handling
- conversation turn execution
- permission prompt orchestration
- session lifecycle and recovery behavior
- teammate / swarm / worker-specific behavior
- navigation, transcript search, and background task handling
- integration glue for notifications, cost tracking, hooks, telemetry, and remote modes

This makes `REPL.tsx` expensive to change and hard to reuse as part of a kernel-oriented runtime architecture.

The goal of this split is not to merely reduce file length. The goal is to separate interactive terminal rendering from runtime orchestration so the REPL can become a host over the runtime kernel instead of a co-owner of execution behavior.

## 2. Objectives

This split should:

- reduce the architectural responsibility of `src/screens/REPL.tsx`
- define a clean boundary between REPL UI and execution/runtime logic
- make REPL execution align with `SessionRuntime` and runtime capability modules
- isolate host-specific interactive concerns from reusable session logic
- make future migration work incremental rather than all-or-nothing

## 3. Non-Goals

This effort should not:

- rewrite the REPL UI for cosmetic reasons
- force a full AppState redesign before extracting controllers
- require immediate migration of all REPL behavior onto new runtime contracts
- split JSX into many tiny presentation files without first removing orchestration logic
- change user-visible behavior unless required to preserve correctness during migration

## 4. Current Problem Shape

A quick scan of `src/screens/REPL.tsx:1` shows why this file is the main complexity hotspot:

- large import surface spanning hooks, components, state, telemetry, permissions, swarm, session, MCP, and keyboard handling
- heavy use of feature-gated conditional imports
- direct coupling to session bootstrap state in `src/bootstrap/state.ts`
- direct coupling to permission update logic and permission bridge logic
- direct coupling to teammate/local-agent behavior
- direct coupling to navigation and transcript selection behavior

In other words, this file is not only a screen. It is currently a screen, a controller, a host adapter, and a session orchestrator.

## 5. Target Architecture

The REPL path should be reorganized into three layers.

### 5.1 View Layer

Purpose:

- render terminal UI
- receive view models and callbacks
- stay ignorant of execution internals where possible

Examples of responsibilities:

- message list rendering
- prompt input rendering
- dialog composition
- tab / title / status display

### 5.2 Controller Layer

Purpose:

- own REPL-specific orchestration
- translate host interactions into runtime actions
- keep screen-level state grouped by responsibility instead of by historical placement

Examples of responsibilities:

- submit / cancel turn flow
- permission request lifecycle
- session restore and metadata handling
- transcript navigation and search
- teammate / swarm integration

### 5.3 Runtime Adapter Layer

Purpose:

- adapt REPL controllers onto runtime kernel contracts
- isolate transitional glue while `SessionRuntime` adoption is still partial

Examples of responsibilities:

- translate REPL app state into runtime execution calls
- bridge result streams back into UI state
- keep compatibility with existing query path while contracts stabilize

## 6. Suggested Directory Shape

A reasonable target shape is:

```text
src/screens/repl/
  REPLScreen.tsx
  controllers/
    useReplExecutionController.ts
    useReplPermissionController.ts
    useReplSessionController.ts
    useReplNavigationController.ts
    useReplTeammateController.ts
  adapters/
    useSessionRuntimeAdapter.ts
    useAppStateAdapter.ts
  views/
    REPLLayout.tsx
    REPLDialogs.tsx
    REPLStatusBar.tsx
  types.ts
```

This does not need to be created in one pass. The important part is the responsibility split, not the exact path layout.

## 7. Recommended Extraction Order

The recommended order is based on architectural leverage, not just line count.

### Phase 1: Execution Boundary First

Extract first:

- `useReplExecutionController`
- `useSessionRuntimeAdapter`

Reason:

This is the most kernel-relevant boundary. Execution flow is the part that most needs to converge with `src/runtime/capabilities/execution/SessionRuntime.ts:185`.

The execution controller should own:

- prompt submission
- cancel / abort behavior
- running / idle state
- turn completion flow
- turn-scoped usage and budget status
- runtime bridge calls

Suggested return shape:

```ts
{
  isRunning: boolean
  submitPrompt: (input: string) => Promise<void>
  cancelCurrentTurn: () => void
  lastError?: Error
}
```

### Phase 2: Permission Flow Isolation

Extract next:

- `useReplPermissionController`

Reason:

Permission flow is one of the biggest cross-cutting concerns in the file. It leaks into rendering, execution, worker sync, and dialog state.

The permission controller should own:

- active tool permission request state
- allow / deny / trust decisions
- exit-plan permission updates
- sandbox / worker permission bridging
- orphaned permission handling

This extraction usually shrinks the main screen file quickly and clarifies the execution boundary.

### Phase 3: Session Lifecycle Isolation

Extract next:

- `useReplSessionController`

Reason:

Session-level lifecycle is different from turn-level execution. It should not remain mixed into the same top-level screen body.

The session controller should own:

- session restore / resume state
- idle return behavior
- cost threshold and title/metadata-related session state
- interaction timestamps
- session switching / rehydration helpers

### Phase 4: Navigation and Transcript State

Extract next:

- `useReplNavigationController`

Reason:

Search, transcript navigation, message selection, and background task navigation are large but not core to execution. They are good candidates for isolation once execution and permission boundaries are clean.

The navigation controller should own:

- transcript search input and highlighting
- selected message / transcript modal state
- jump handle state
- background task navigation
- export / transcript external-editor helpers where applicable

### Phase 5: Advanced Mode Isolation

Extract next:

- `useReplTeammateController`

Reason:

Teammate, swarm, leader/worker permission sync, and local-agent task flows add significant complexity to the default REPL path. They should be isolated so normal REPL execution is not structurally polluted by advanced collaboration modes.

The teammate controller should own:

- teammate message injection
- local-agent task append / queue state
- leader permission bridge registration
- worker permission mailbox sync
- teammate auto-exit and related transitions

### Phase 6: View Cleanup Last

Only after the earlier phases, split view concerns into:

- `REPLLayout`
- `REPLDialogs`
- `REPLStatusBar`

Reason:

If view extraction happens too early, the code gets redistributed but not simplified. The underlying orchestration complexity remains.

## 8. What Should Stay in the Top-Level REPL Screen

The final top-level screen should mostly do composition:

- create controllers and adapters
- assemble view models
- pass callbacks into the layout
- render dialogs and major UI sections
- own only minimal top-level mount/unmount wiring

A healthy end state looks more like a composition root than an execution owner.

## 9. Transitional Architecture Guidance

This migration should be incremental.

### 9.1 Prefer Adapter Before Rewrite

If a behavior already works but is wired directly into `REPL.tsx`, first move it behind a controller or adapter boundary. Do not rewrite behavior simply because the file is large.

### 9.2 Keep REPL Host-Specific Concerns in Controllers

Not everything in REPL belongs in the runtime kernel. Host-specific concerns such as terminal focus behavior, notification affordances, and UI selection state should remain REPL-side.

### 9.3 Move Execution Semantics Toward Runtime Contracts

Behavior that defines what a session turn means should migrate toward runtime capabilities and `SessionRuntime`, not remain embedded in the screen.

### 9.4 Avoid Early AppState Re-platforming

`src/state/AppState.tsx:34` already indicates migration intent away from React-heavy imports. That work matters, but it should not block extraction of REPL controllers.

## 10. First Concrete Extraction Targets

The first three files worth creating are:

1. `src/screens/repl/controllers/useReplExecutionController.ts`
2. `src/screens/repl/controllers/useReplPermissionController.ts`
3. `src/screens/repl/adapters/useSessionRuntimeAdapter.ts`

Why these three first:

- they attack the highest-coupling logic
- they improve kernel alignment instead of only cosmetic modularity
- they create a stable base for later session and navigation splits

## 11. Migration Checklist

Use this checklist during implementation.

### Step A

Create `useSessionRuntimeAdapter` and move runtime execution glue behind it.

Success criteria:

- REPL no longer directly owns the lowest-level execution wiring
- submit/cancel entrypoints are callable via adapter/controller boundaries

### Step B

Create `useReplExecutionController` and move turn lifecycle state into it.

Success criteria:

- top-level REPL stops directly managing primary execution callbacks
- execution state is returned as a grouped controller result

### Step C

Create `useReplPermissionController` and move permission dialog state + actions into it.

Success criteria:

- permission flow no longer spans unrelated screen sections
- worker/leader permission sync registration is localized

### Step D

Create `useReplSessionController` and isolate session lifecycle state.

Success criteria:

- restore/idle/cost/session metadata logic is grouped by responsibility
- REPL top-level effects become materially smaller

### Step E

Create `useReplNavigationController` and isolate transcript/search/background navigation behavior.

Success criteria:

- navigation state is no longer mixed with execution state
- transcript features can evolve independently of query execution

### Step F

Create `useReplTeammateController` and isolate advanced collaboration mode behavior.

Success criteria:

- default REPL path becomes easier to reason about without swarm logic in the middle
- advanced mode logic has one clear owner

### Step G

Split view-level layout and dialogs only after the earlier controllers are stable.

Success criteria:

- view extraction reduces remaining top-level noise instead of hiding orchestration complexity

## 12. Risks and Failure Modes

### 12.1 Superficial Modularization

Failure mode:

- splitting JSX and helper functions without moving responsibility boundaries

Result:

- more files, same architecture problem

### 12.2 Runtime/UI Boundary Drift

Failure mode:

- controllers become thin wrappers over unchanged REPL-local logic without converging on runtime contracts

Result:

- the code looks cleaner but kernelization does not advance

### 12.3 Big-Bang Rewrite

Failure mode:

- trying to replace all REPL execution with a new runtime path in one patch

Result:

- regression risk becomes too high

### 12.4 Premature State-System Rewrite

Failure mode:

- turning the REPL split into a full app-state redesign

Result:

- scope expands and the REPL file remains large for too long

## 13. Success Criteria

This effort is succeeding when:

- `src/screens/REPL.tsx` becomes primarily a composition shell
- execution lifecycle is owned outside the screen body
- permission flow is owned outside the screen body
- session lifecycle is owned outside the screen body
- teammate/swarm logic no longer pollutes the default REPL path
- at least part of the REPL execution path clearly aligns with runtime kernel contracts rather than bespoke screen logic

## 14. Bottom Line

The REPL split should be treated as kernelization work, not UI cleanup.

The correct first move is to extract execution and permission orchestration, then session and navigation state, then advanced-mode isolation, and only then clean up layout/view structure.

If done in that order, the project gets both:

- a smaller and more maintainable REPL host
- a clearer path toward a reusable runtime kernel
