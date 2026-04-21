# Project Positioning

## Core Definition

This project is a full-feature agent system built around a reusable
`runtime/kernel`, with the CLI serving as its first official host capability.

That means:

- the kernel owns core execution, session, tool, MCP, bridge, daemon, server,
  and headless behavior
- the CLI remains a first-class product surface and the primary user entrypoint
- the CLI no longer needs to be the sole owner of underlying behavior
- other hosts can consume the same kernel through stable entrypoints

In short:

> the CLI is not being replaced; it is being repositioned as the first official
> host of the kernel

## What The Project Is Not

This project is not:

- a slim SDK that drops CLI semantics
- a CLI wrapper around a separate toy runtime
- a migration that treats the CLI as legacy baggage
- a package-extraction exercise whose goal is code motion by itself

Kernelization here means:

- preserving the full existing capability surface
- reorganizing ownership around reusable runtime/kernel contracts
- allowing CLI, headless, direct-connect, server, and remote-control paths to
  share the same underlying capability model

## Architectural Stance

The intended layering is:

```text
kernel/runtime
  -> official hosts
    -> CLI
    -> headless
    -> direct-connect/server
    -> remote-control/bridge
    -> daemon workers
```

The key policy is:

- new reusable behavior should land in `src/kernel` or `src/runtime`
- CLI-specific rendering and product UX can remain in CLI-facing code
- CLI semantics are kernel concerns; terminal rendering is not

## Practical Implication

When deciding where code belongs:

- if the behavior should be shareable across CLI and another host, it belongs in
  kernel/runtime
- if the behavior is only about terminal presentation or CLI product UX, it can
  stay in CLI-facing code
- if a feature already works and is stable, prefer transferring ownership into
  kernel/runtime over rewriting it

## Current Program Direction

The current kernelization effort is therefore aimed at:

1. establishing stable public kernel entrypoints
2. moving reusable headless/server/bridge/daemon capabilities under kernel/runtime
3. keeping CLI as the first official host capability
4. reducing CLI-exclusive ownership, not reducing CLI importance

This is the governing project definition for the current architecture work.
