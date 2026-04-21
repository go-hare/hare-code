# Lane 3: Tools And MCP

## Objective

Move tool registry ownership and MCP lifecycle ownership into runtime capability
modules while preserving current behavior.

## Source Evidence

- `src/tools.ts`
- `src/services/mcp/client.ts`
- `packages/builtin-tools/`
- `docs/task/task-019-kernelization-capability-matrix.md`

## Write Scope

Only edit:

- `src/runtime/capabilities/tools/**`
- `src/runtime/capabilities/mcp/**`
- minimal import wiring in `src/tools.ts`
- minimal import wiring in `src/services/mcp/client.ts`
- `docs/task/parallel-kernelization/lane-3-tools-and-mcp.md`

## Do Not Edit

- `src/query.ts`
- `src/QueryEngine.ts`
- `src/main.tsx`
- `src/screens/REPL.tsx`
- `src/bridge/**`
- `src/daemon/**`
- concrete tool implementation files unless a contract mismatch forces it

## Tasks

1. Create tool catalog ownership under `src/runtime/capabilities/tools/`.
2. Move tool policy/filtering ownership there as well.
3. Create MCP registry and MCP session binding modules under
   `src/runtime/capabilities/mcp/`.
4. Preserve current MCP auth refresh, reconnect, and transport behavior.
5. Avoid rewriting concrete tools.

## Deliverables

- `ToolCatalog.ts`
- `ToolPolicy.ts` or equivalent
- `McpRegistry.ts`
- `McpSessionBinding.ts`

## Dependencies

- Lane 1 contracts should exist before final interface names are locked

## Acceptance Criteria

- tool catalog can be resolved without `main.tsx`
- MCP clients can be bound per runtime session
- current MCP behavior remains intact

## Expected Reuse Posture

- `src/tools.ts`: reuse with isolation
- `src/services/mcp/client.ts`: reuse with isolation
- concrete tools: reuse as-is

## Blockers To Raise

- any need to change execution/session ownership
- any MCP session behavior that depends on files outside write scope
- Current MCP transport binding still has to read session id / cwd from
  `src/bootstrap/state.ts` via an adapter because runtime session identity and
  root ownership have not yet moved behind a lane-1/lane-2 runtime contract.
