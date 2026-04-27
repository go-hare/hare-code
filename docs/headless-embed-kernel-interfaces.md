# hare-code 公共 Kernel / CLI 能力接口清单

## 1. 目的

本文整理新 `claude-code` 内核要开放的公共接口与语言无关运行协议。

目标不是只适配桌面端。目标是把 CLI 背后的 runtime 能力整体从 CLI host 里抽出来，经由 `@go-hare/hare-code/kernel` 与常驻 runtime wire protocol 暴露给任意 host：CLI、desktop、daemon、remote、worker、Python/Go SDK、未来机器人宿主都走同一套能力面。

边界一句话：

- 要开放：CLI 的行为能力、协议、状态、事件、配置和扩展系统。
- 不开放：Ink/React 终端 UI、按键布局、终端组件渲染细节。

关联状态文档见 `docs/internals/kernelization-status.md`。

### 1.1 完整状态原则

本文描述的是 public kernel / runtime contract 的完整目标状态，不是 MVP、headless-only 方案或桌面端私有集成说明。

实现可以按风险拆分、按能力分批落地，但接口蓝图不能按 MVP 缩小目标。任何阶段性实现都必须回答它最终如何进入完整 contract：

- `@go-hare/hare-code/kernel` 的进程内 API。
- `KernelRuntimeWireProtocol` 的语言无关协议。
- `KernelEvent` 的统一语义事件面。
- `KernelRuntimeCapabilities` 的完整能力解析、加载、reload 与错误可观察性。

因此，文档中的 commands、tools、hooks、skills、plugins、MCP、agents、companion、Kairos、memory、sessions 都是完整状态下的 public runtime capability。阶段性实现只能标注完成度，不能把这些能力从目标 contract 中删除。

## 2. 当前结论

- JS/TS 进程内公共入口是 `@go-hare/hare-code/kernel`。
- 其它语言 host 的公共入口是常驻 `KernelRuntime` 进程暴露的 wire protocol；Python/Go/机器人 SDK 只是这个协议的 typed client。
- CLI 不再是这些能力的唯一 owner，而是 public kernel 的第一个 host。
- 新增给外部 host 用的能力必须从 `claude-code/src/kernel/index.ts` 导出，并进入 package `./kernel` surface。
- 外部 host 不直接 import `claude-code/src/runtime/*`、`src/bootstrap/*`、`src/screens/*`、`src/commands/*`、`src/utils/plugins/*`、`src/skills/*` 等内部源码路径。
- desktop worker 仍然建议保留，用来隔离进程级全局状态、stdout patch 和多会话并发；但 worker 内部也只 import `@go-hare/hare-code/kernel`。
- desktop worker 对 Electron Main 暴露的控制面不能写成桌面私有协议；它必须是 `KernelRuntimeWireProtocol` 的一个本地传输实现。
- 不把旧 SDK facade 扩成新的 public API：
  `createHeadlessChatSession()`、`session.stream()`、
  `electron/vendor/hare-code-sdk.js` 这套旧 facade 不作为新开放面恢复；
  但现有 SDK message / `stream-json` adapter 保留为 CLI、pipe、remote、
  ACP 的最终兼容投影，内部 runtime owner 链路不再以 SDK message 为事实源，
  任何迁移都不能导致 CLI 行为衰减。
- 任何对外接口都按完整 runtime contract 设计；不以“先能跑一个 headless turn”为接口边界。

### 2.1 当前内部落地点：runtime capability materializer / refresh bundle

当前先完成的是内部 kernel 完整性落点，不是 public API 扩面：

- runtime 新增 `src/runtime/capabilities/execution/headlessCapabilityMaterializer.ts`，负责把 headless / interactive CLI 执行需要的 `commands`、`tools`、`agents` 与 host intent materialize 成 execution-ready environment。`materializeRuntimeCommandAssembly(...)` 现在也是 interactive CLI command / agent assembly 的共享入口。
- CLI headless launcher 仍保留 CLI host 职责，但不再要求调用方必须预先传入 `commands/tools/agents` 全量对象；缺省时由 runtime materializer 从 `getCommands()`、`ToolPolicy.getTools()`、`getAgentDefinitionsWithOverrides()` 装配。
- 旧显式注入路径保留：测试、SDK-like 内部调用或特殊 host 仍可传入 `commands/tools/agents`，materializer 不会覆盖显式输入。
- CLI 专属能力不移除：`--agents` 以 `agentOverrides` 进入 materializer，coordinator tool filter 以 host intent 进入 materializer，structured output 的 synthetic tool 以 `extraTools` 追加。
- `main/commandAssembly.ts` 的 bundled skills / builtin plugins 预热已下沉到 `src/runtime/capabilities/commands/RuntimeCommandSources.ts`，CLI 继续复用同一入口，避免外部 headless 路径漏掉 bundled command sources。
- headless refresh 已收进 `src/runtime/capabilities/execution/internal/headlessRuntimeCapabilityBundle.ts`：`refresh()` 统一处理 plugin reload、command / agent materialization、plugin MCP diff 与 hook hot-reload setup；`refreshPlugins()` 仅作为旧调用兼容别名保留。
- MCP runtime ownership 已收进 `src/runtime/capabilities/mcp/RuntimeHeadlessMcpService.ts`：SDK seed、dynamic server、connect / reconnect / status 与 `mcp_set_servers` state mutation 不再散在 headless loop helper 中。
- interactive MCP connection lifecycle 已收进 `src/runtime/capabilities/mcp/RuntimeInteractiveMcpService.ts`：config load、pending reconciliation、stale cleanup、two-phase connect、manual reconnect、enable / disable、automatic reconnect、channel notification handler 注册 / 卸载与 `tools/prompts/resources list_changed` refresh 不再由 React hook 自持；channel allowlist 也改为 host option 注入，runtime service 不再直接 import `bootstrap/state`；`useManageMCPConnections(...)` 只保留 AppState batching、elicitation UI 写入、channel message 入队、channel permission resolve、blocked toast 与 bootstrap-backed allowlist 读取这些 interactive host callback。
- hook / plugin 初装配已新增 runtime service adapter：`src/runtime/capabilities/hooks/RuntimeHookService.ts` 负责 plugin hook reload / count / cache lifecycle，`src/runtime/capabilities/plugins/RuntimePluginService.ts` 负责 interactive REPL 初始 plugin commands / agents / hooks / MCP / LSP materialization。`useManagePlugins(...)` 只保留 React notification / telemetry adapter 职责。
- interactive CLI 启动期 command / agent preload 已下沉到 runtime
  materializer：`preloadRuntimeCommandAssembly(...)` 与
  `resolvePreloadedRuntimeCommandAssembly(...)` 拥有 `getCommands()` /
  `getAgentDefinitionsWithOverrides()` 的预加载与 fallback 语义；
  `main/commandAssembly.ts` 只保留 CLI wrapper。
- interactive CLI 运行期 command / agent refresh 已收口到同一 materializer：
  `refreshRuntimeCommands(...)` 覆盖 skill watcher full refresh 与 GrowthBook
  memoized refresh，`refreshRuntimeAgentDefinitions(...)` 覆盖 resume /
  coordinator mode switch 后的 cache clear、reload 和 active agent recompute；
  `useSkillsChange.ts`、`REPL.tsx` 与 `ResumeConversation.tsx` 不再直接 import
  command / agent source loader。
- interactive CLI 启动期 MCP prefetch 与 startup hook warmup 已收进
  `RuntimeInteractiveStartupService`：runtime service 负责 local / Claude.ai
  MCP prefetch merge、startup hook promise 和 MCP startup warning message，
  `main.tsx` 只提供 host 条件与 warning renderer。
- 本地 OpenAI-compatible endpoint deep smoke 已通过：
  `http://127.0.0.1:8317/v1` 的 `/models` 可见 `gpt-5.4`，CLI pipe 在
  `CLAUDE_CODE_USE_OPENAI=1`、`OPENAI_BASE_URL`、`OPENAI_MODEL=gpt-5.4` 下走
  真实 endpoint 返回预期 JSON。
- `SessionRuntime` 已补齐 runtime-first 执行出口：
  `submitRuntimeTurn(...)` 输出 `turn.started`、`headless.sdk_message`、
  `turn.completed` / `turn.failed` runtime envelope；`submitMessage(...)` 与
  `ask(...)` 只保留为 SDK-compatible 投影，不再是唯一内部执行接口。
- headless stream 输出已改成 runtime-first publisher：
  `createHeadlessRuntimeStreamPublisher(...)` 先把 SDK payload 写入
  `RuntimeEventBus`，legacy `stream-json` stdout 再作为兼容写出。
- ACP prompt path 已开始走 runtime event envelope：`AcpAgent.prompt(...)` 把
  `QueryEngine.submitMessage(...)` 的 legacy SDK stream 先写入会话级
  `RuntimeEventBus`，再交给 ACP bridge 消费；`forwardSessionUpdates(...)`
  对直接传入的 legacy `SDKMessage` 也会先包成 `headless.sdk_message`
  runtime envelope，其中 `headless.sdk_message` 复用原 ACP 转换逻辑，纯
  `turn.output_delta` 输出 ACP 文本 chunk，`turn.completed` / `turn.failed`
  收敛 stopReason，避免 ACP 停留在 SDK-first execution stream。

这一步的边界是“runtime 拥有 headless 默认能力装配，CLI 是第一个 host”。它不声明新的外部 public surface，也不删除 CLI 现有路径。

## 3. 公共入口形态

公共入口分三层：

1. `@go-hare/hare-code/kernel`：JS/TS host 的进程内 API。
2. `KernelRuntimeWireProtocol`：非 JS host、desktop main/worker、机器人 host 共用的语言无关协议。
3. 各语言 SDK：Python/Go/Rust 等只做 wire protocol 的 typed client，不重新实现 CLI runtime 能力。

JS/TS host 示例：

示例：

```ts
import {
  createKernelRuntime,
  createKernelHeadlessController,
  createKernelHeadlessInputQueue,
  createKernelHeadlessProviderEnv,
  normalizeKernelHeadlessEvent,
  resolveKernelRuntimeCapabilities,
  reloadKernelRuntimeCapabilities,
} from '@go-hare/hare-code/kernel'
```

约束：

- `src/kernel/index.ts` 是源码层唯一 public 导出口。
- `@go-hare/hare-code/kernel` 是 package 级 semver surface。
- `src/kernel/*` 叶子模块可以存在，但外部 host 只依赖 package entry。
- runtime 内部 seam 可以继续演进；host contract 由 `@go-hare/hare-code/kernel` 承担。
- `KernelRuntimeWireProtocol` 的 schema 与 `KernelRuntime` / `KernelEvent` 同步演进；新增能力必须同时考虑 package API 与 wire protocol 可序列化形态。

## 4. 要开放的 CLI 能力范围

这些能力都属于 CLI runtime capability，不是桌面专用能力：

- 会话与执行：conversation、turn、stream-json、abort、resume、dispose、multi-session isolation。
- Provider 与认证：Anthropic/OpenAI-compatible provider 配置、model override、auth token/env 映射。
- Command 系统：slash commands、command metadata、command execution、command reload。
- Tool 系统：builtin tools、MCP tools、plugin tools、host-provided tools、tool policy、permission request。
- Hook 系统：SessionStart、PreToolUse、PostToolUse、PostToolUseFailure、Stop、SubagentStop、PreCompact、PostCompact。
- Skills：bundled/user/project/managed/MCP/plugin skills，prompt context 注入和 skill discovery。
- Plugins：marketplace、本地、managed、user/project scope plugins，及其 commands、agents、hooks、MCP、skills、tools。
- MCP：server config、client lifecycle、tool/prompts/resources 暴露、permission bridge。
- Agent / Coordinator / Subagent：agents、coordinator mode、subagent spawn、task tools、owned files/write guard、worker result。
- Pet / Companion：companion state、hatch/rehatch/mute/unmute/pet、reaction side request、reaction event。
- Kairos / Proactive：常驻助手、tick、brief、channel/webhook event、dream/memory、push notification。
- Memory / Context / Compaction：project/user memory、session transcript、context assembly、auto/manual compaction hooks。
- Session / Logs / Background：session list/resume、logs、background/daemon worker lifecycle。
- Events：把 CLI 内部 message、tool、hook、plugin、skill、companion、Kairos 状态统一转成 public kernel events。

## 5. Public Runtime 总入口

建议新增：`claude-code/src/kernel/runtime.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export function createKernelRuntime(
  options: KernelRuntimeOptions,
): Promise<KernelRuntime>

export type KernelRuntime = {
  readonly id: string
  readonly capabilities: KernelResolvedRuntimeCapabilities
  start(): Promise<void>
  createConversation(options: KernelConversationOptions): Promise<KernelConversation>
  reloadCapabilities(request?: KernelRuntimeCapabilityReloadRequest): Promise<KernelResolvedRuntimeCapabilities>
  dispose(reason?: string): Promise<void>
  onEvent(handler: (event: KernelEvent) => void): () => void
}
```

语义：

- `createKernelRuntime()` 是 CLI runtime 能力总入口。
- `createKernelHeadlessController()` 是 conversation/headless execution 的专用 facade，可以由 runtime 创建，也可以单独用于轻量 headless embed。
- CLI、desktop、daemon、remote host 的差异通过 `KernelRuntimeOptions.host` 和 capability intent 表达，而不是通过 import 不同内部模块表达。

## 6. 常驻 Runtime Wire Protocol

建议新增：

- `claude-code/src/kernel/wireProtocol.ts`
- `claude-code/src/entrypoints/kernel-runtime.ts` 或等价 runner

必须从 `@go-hare/hare-code/kernel` 导出协议类型，并提供一个可启动的常驻 runtime runner。

`KernelRuntimeWireProtocol` 是语言无关 contract，不是桌面端私有协议。它服务于：

- desktop main <-> conversation worker。
- Python / Go / Rust SDK。
- 机器人宿主进程。
- 未来 daemon / remote / worker host。

协议消息必须是 JSON serializable，字段使用稳定 wire name，不暴露 TypeScript class、React/Ink object、runtime internal object、AbortController 或 bootstrap singleton。

### 6.1 Host -> KernelRuntime

```ts
export type KernelRuntimeCommand =
  | KernelRuntimeInitCommand
  | KernelRuntimeCreateConversationCommand
  | KernelRuntimeRunTurnCommand
  | KernelRuntimeAbortTurnCommand
  | KernelRuntimeDisposeConversationCommand
  | KernelRuntimeReloadCapabilitiesCommand
  | KernelRuntimePublishHostEventCommand
  | KernelRuntimeSubscribeEventsCommand
  | KernelRuntimePingCommand
```

基础命令集合：

- `init_runtime`
  - 字段：`requestId`、`host`、`workspacePath`、`provider`、`auth`、`model`、`capabilities`、`metadata`。
- `create_conversation`
  - 字段：`requestId`、`conversationId`、`workspacePath`、`sessionMeta`、`capabilityIntent`。
- `run_turn`
  - 字段：`requestId`、`conversationId`、`turnId`、`prompt`、`attachments`、`metadata`。
- `abort_turn`
  - 字段：`requestId`、`conversationId`、`turnId`、`reason`。
- `dispose_conversation`
  - 字段：`requestId`、`conversationId`、`reason`。
- `reload_capabilities`
  - 字段：`requestId`、`scope`、`capabilities`。
- `publish_host_event`
  - 字段：`requestId`、`event`。
- `subscribe_events`
  - 字段：`requestId`、`conversationId?`、`sinceEventId?`、`filters?`。
- `ping`
  - 字段：`requestId`。

### 6.2 KernelRuntime -> Host

```ts
export type KernelRuntimeEnvelope =
  | KernelRuntimeAckEnvelope
  | KernelRuntimeEventEnvelope
  | KernelRuntimeErrorEnvelope
  | KernelRuntimePongEnvelope
```

基础 envelope 类型：

- `runtime_ready`
- `conversation_ready`
- `turn_started`
- `event`
  - 字段：`eventId`、`conversationId?`、`turnId?`、`event: KernelEvent`。
- `turn_completed`
- `turn_aborted`
- `conversation_disposed`
- `capabilities_reloaded`
- `error`
- `pong`

### 6.3 Envelope 字段规范

所有 wire message 都必须包在稳定 envelope 中。transport 可以不同，但 envelope schema 不能变成 desktop / Python / robot 各自的私有格式。

```ts
export type KernelRuntimeEnvelopeBase = {
  schemaVersion: 'kernel.runtime.v1'
  messageId: string
  requestId?: string
  conversationId?: string
  turnId?: string
  eventId?: string
  sequence: number
  timestamp: string
  source: 'kernel_runtime'
  kind: KernelRuntimeEnvelopeKind
  payload?: unknown
  error?: KernelRuntimeErrorPayload
  metadata?: Record<string, unknown>
}

export type KernelRuntimeErrorPayload = {
  code: KernelRuntimeErrorCode
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}
```

字段语义：

- `schemaVersion` 用于协议升级，不跟 npm package version 混用。
- `messageId` 是 envelope 自身唯一 ID；`requestId` 用于关联 host command。
- `conversationId` / `turnId` 只在对应作用域内出现；runtime-level 事件可以为空。
- `eventId` 只用于可 replay 的语义事件；ack / pong 不强制分配 eventId。
- `sequence` 是当前 transport stream 内单调递增序号，用于乱序检测。
- `timestamp` 使用 ISO 8601 UTC 字符串。
- `source` 固定为 `kernel_runtime`；host 转发到 SSE / IPC 时不得改写语义来源。
- `payload` 必须 JSON serializable，不得包含 class instance、function、AbortController、React object、Ink object 或 bootstrap singleton。
- `error.code` 必须稳定，host 可以基于 code 做 UI、重试和审计。

### 6.4 传输与兼容

- 本地 desktop worker 可以用 stdin/stdout NDJSON、Node IPC 或 fork IPC 承载同一协议。
- 其它语言 SDK 默认连接常驻 kernel process；传输可以是 HTTP、WebSocket、stdio NDJSON 或 Unix socket，但消息 schema 必须一致。
- 若控制事件和 runtime stream 共用 stdout，必须使用 envelope 分流，例如 `source: "kernel_runtime"`，不能把 raw `StdoutMessage` 当作协议层事件。
- `KernelEvent` 是唯一语义事件面；desktop SSE、Python callback、机器人事件循环都只是 host 映射。
- 当前 public surface 已提供 `KernelRuntimeWireTransport` /
  `KernelRuntimeWireClient` wrapper；`in-process` 与 `stdio` 两个 transport
  共用同一套 command / event 语义，host 不应再手写 NDJSON requestId /
  ack 关联逻辑。
- 协议必须支持 event replay：`eventId` 单调递增，host 可通过 `sinceEventId` 恢复断线后的事件。
- 当前 internal runner 已支持 opt-in event journal：
  `HARE_KERNEL_RUNTIME_EVENT_JOURNAL=<path>` 或
  `KernelRuntimeWireProtocolOptions.eventJournalPath` 会持久化 replayable
  event，并在进程重启后重新 hydrate replay buffer。
- 当前 internal runner 已支持 opt-in conversation snapshot journal：
  `HARE_KERNEL_RUNTIME_CONVERSATION_JOURNAL=<path>` 或
  `KernelRuntimeWireProtocolOptions.conversationJournalPath` 会持久化每个
  conversation 的最新 snapshot；进程重启后再次 `create_conversation` 会按
  `conversationId` 恢复 snapshot，把 crash 前 `running / aborting`
  conversation 归一化为 `detached`，并保留 active turn lock，后续
  `run_turn` 必须返回 `busy`，或由 host 先 `abort_turn` 清理。
- 上述 journal 只恢复事件 replay 与 conversation / active turn 状态，不等同于
  恢复 active tool / model execution；真正的执行续跑仍需要 durable tool/model
  execution contract。
- 同一 conversation 同一时间只允许一个 active turn；并发 turn 必须返回 `busy` 或要求 host 先 `abort_turn`。

### 6.5 多会话隔离

完整状态必须支持多 conversation / 多 host / 多 worker 并存。隔离边界不能只靠 host 约定，必须写入 kernel contract。

- 每个 `KernelConversation` 拥有独立的 message state、tool permission context、MCP connection view、hook context、task registry view、event buffer 和 active turn lock。
- conversation-local state 不得通过 process-global singleton 暴露给 host；必须经 runtime-owned session state 或显式 provider seam 访问。
- 同一 runtime 可以管理多个 conversation，但同一 conversation 同一时间只能有一个 active turn。
- 不同 conversation 的 stdout/stderr、tool progress、permission request、hook result、companion reaction、Kairos event 必须带 `conversationId` 或明确标记为 runtime-level event。
- worker/process 级隔离用于处理 stdout patch、bootstrap singleton 和 native/global side effect；但 worker 内 API 仍只能依赖 `@go-hare/hare-code/kernel`。
- `dispose_conversation` 后必须停止该 conversation 的 tool execution、MCP subscriptions、hook callbacks、task updates 和 pending side request；不得影响其它 conversation。
- 当前 wire transport wrapper 已维护 client-local live subscription scope：
  host 订阅某个 conversation 后，`in-process` / `stdio` live event fan-out
  不再把其它 conversation 的 event 推给该 client；runtime-level event 仍可
  广播。`create_conversation` 已拒绝同 `conversationId` 下不同
  `sessionId` / `workspacePath` 的复用，journal recovery 遇到 `sessionId`
  不匹配会跳过旧 snapshot。

### 6.6 Abort 与竞态语义

`abort_turn` 不是 best-effort UI 操作，而是协议级状态转换。以下竞态必须有稳定结果：

- abort-before-start：如果 `turnId` 尚未进入 running，返回 `turn_aborted` 或 `turn_not_started`，不得随后再发送 `turn_started`。
- abort-during-model-stream：停止模型 stream，发送 `turn_aborted`，并标记是否已有 partial output。
- abort-during-tool：优先触发 tool cancellation；无法取消的 tool 必须继续隔离执行结果，不得把结果写回已 aborted turn。
- abort-after-complete：返回幂等 ack，不能把 completed turn 回退成 aborted。
- duplicate abort：同一 `turnId` 多次 abort 必须幂等，后续 envelope 复用最终状态。
- host disconnect：runtime 根据 conversation policy 决定 detach、continue 或 abort，并通过 replayable event 记录结果；当前 wire command 已提供 `connect_host` / `disconnect_host`，默认 policy 为 `detach`，可显式使用 `abort_active_turns` 终止 active turn。
- runtime dispose：必须先阻止新 turn，再 abort / drain active turn，最后释放 conversation resources。

### 6.7 与 JS API 的关系

- `createKernelRuntime()` 是 JS in-process API。
- `KernelRuntimeWireProtocol` 是同一语义 contract 的 out-of-process 形态。
- JS worker runner 可以用 `createKernelRuntime()` 实现 wire protocol。
- Python/Go/机器人 SDK 只认 wire protocol，不 import TS package，不读取 `src/*`。

## 7. 会话与 Headless 执行接口

建议文件：

- `claude-code/src/kernel/headlessController.ts`
- `claude-code/src/kernel/headlessInputQueue.ts`
- `claude-code/src/kernel/headlessProvider.ts`
- `claude-code/src/kernel/events.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelHeadlessController = {
  readonly sessionId: string
  readonly state: KernelHeadlessControllerState
  start(): Promise<void>
  runTurn(request: KernelHeadlessRunTurnRequest): Promise<KernelHeadlessTurnStarted>
  abortTurn(request?: KernelHeadlessAbortRequest): Promise<void>
  dispose(reason?: string): Promise<void>
  onEvent(handler: (event: KernelHeadlessEvent) => void): () => void
}

export type KernelHeadlessInputQueue = AsyncIterable<string> & {
  pushUserTurn(turn: KernelHeadlessQueuedUserTurn): void
  pushInterrupt(request: KernelHeadlessQueuedInterrupt): void
  close(reason?: string): void
}
```

要求：

- `abortTurn()` 优先通过 SDK control `interrupt` 实现。
- controller 保证同一 conversation 单 active turn。
- raw `StdoutMessage` 必须归一化为 public `KernelHeadlessEvent`，不能要求 host 理解 runtime 内部对象。

## 8. Runtime Capabilities

建议文件：`claude-code/src/kernel/capabilities.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelRuntimeCapabilitiesInput = {
  commands?: boolean | KernelCommandsCapabilityOptions
  tools?: boolean | KernelToolsCapabilityOptions
  hooks?: boolean | KernelHooksCapabilityOptions
  skills?: boolean | KernelSkillsCapabilityOptions
  plugins?: boolean | KernelPluginsCapabilityOptions
  mcp?: boolean | KernelMcpCapabilityOptions
  agents?: boolean | KernelAgentsCapabilityOptions
  companion?: boolean | KernelCompanionCapabilityOptions
  kairos?: boolean | KernelKairosCapabilityOptions
  memory?: boolean | KernelMemoryCapabilityOptions
  sessions?: boolean | KernelSessionsCapabilityOptions
}

export type KernelResolvedRuntimeCapabilities = {
  commands: KernelCommandRegistry
  tools: KernelToolCatalog
  hooks: KernelHookRegistry
  skills: KernelSkillCatalog
  plugins: KernelPluginManager
  mcp: KernelMcpManager
  agents: KernelAgentRegistry
  companion: KernelCompanionRuntime | null
  kairos: KernelKairosRuntime | null
  memory: KernelMemoryManager
  sessions: KernelSessionManager
}
```

要求：

- `KernelRuntimeOptions.capabilities` 接收 host intent；具体加载和合并由 kernel 内部 resolver 完成。
- `reloadKernelRuntimeCapabilities()` 是通用 reload，不绑定 CLI `/reload-plugins` 命令。
- capability resolver 可以复用现有 CLI 加载逻辑，但不能要求 host import CLI 内部路径。
- capability 设计必须覆盖完整 CLI 能力全集；lazy loading 只是加载策略，不是缩减 public surface 的理由。
- 当前 wire router 已开始消费 `create_conversation.capabilityIntent`：host
  intent 会映射到 resolver `requireCapability(...)`，成功后产生
  `capabilities.required` runtime event；package declaration 已暴露
  `KernelRuntimeWireCapabilityResolver` 注入点。headless eager assembly 已迁入
  runtime materializer / refresh bundle；interactive MCP lifecycle、
  startup warmup、command / agent preload、skill / GrowthBook command refresh
  与 resume agent refresh 已进入 runtime-owned service / materializer。当前
  `src/hooks` / `src/screens` 不再直接拥有 command / agent source loader。

### 8.1 Capability lazy loading

完整状态下，capability resolver 必须同时支持完整声明与按需加载。

```ts
export type KernelCapabilityDescriptor = {
  name: KernelCapabilityName
  status: 'declared' | 'loading' | 'ready' | 'degraded' | 'failed' | 'disabled'
  lazy: boolean
  dependencies: KernelCapabilityName[]
  reloadable: boolean
  error?: KernelCapabilityError
}
```

加载语义：

- `resolveKernelRuntimeCapabilities()` 返回完整 descriptor 集合，即使某些 capability 尚未加载。
- host intent 决定启用范围；kernel policy 决定默认、依赖和安全降级。
- lazy capability 可以在 command execution、tool lookup、event subscription、host request 或 reload 时触发加载。
- 加载失败必须进入 descriptor、manager API 和 public event；不能只写 debug log。
- reload 必须有作用域：单 capability、依赖闭包、workspace scope、runtime scope。
- capability 之间的依赖由 resolver 管理；host 不直接 import 内部 loader 或手工拼装 CLI 加载顺序。
- 禁用 capability 时，相关 commands/tools/hooks/events 必须给出稳定的 unavailable error，而不是消失成空列表。

## 9. Command 系统

建议文件：`claude-code/src/kernel/commands.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelCommandRegistry = {
  list(): KernelCommandDescriptor[]
  resolve(name: string): KernelCommandDescriptor | null
  execute(request: KernelCommandExecuteRequest): Promise<KernelCommandResult>
  reload(request?: KernelCommandReloadRequest): Promise<KernelCommandRegistrySnapshot>
}
```

范围：

- 内置 slash commands。
- plugin commands。
- skills/commands 目录派生出的命令。
- host-provided commands。

要求：

- command metadata、参数 schema、执行结果进入 public API。
- CLI 的菜单、快捷键、Ink 渲染不进入 public API。

## 10. Tool / Permission / MCP 系统

建议文件：

- `claude-code/src/kernel/tools.ts`
- `claude-code/src/kernel/permissions.ts`
- `claude-code/src/kernel/mcp.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelToolCatalog = {
  list(): KernelToolDescriptor[]
  resolve(name: string): KernelToolDescriptor | null
  withPolicy(policy: KernelToolPolicy): KernelToolCatalog
}

export type KernelPermissionBridge = {
  request(request: KernelPermissionRequest): Promise<KernelPermissionDecision>
}

export type KernelMcpManager = {
  listServers(): KernelMcpServerDescriptor[]
  listTools(): KernelToolDescriptor[]
  connect(request?: KernelMcpConnectRequest): Promise<KernelMcpConnectionSnapshot>
  disconnect(serverName: string): Promise<void>
}
```

范围：

- builtin tools。
- MCP tools。
- plugin tools。
- host-provided tools。
- tool allow/deny policy。
- permission request/decision schema。

要求：

- permission UI 属于 host；permission request/decision schema 属于 kernel。
- MCP server lifecycle 与 tool catalog 要能被 host 查询和 reload。

### 10.1 Permission 决策生命周期

permission 是 kernel 与 host 之间的协议，不是 UI callback。完整状态必须覆盖请求、展示、决策、超时、审计和回放。

```ts
export type KernelPermissionRequest = {
  permissionRequestId: string
  conversationId: string
  turnId?: string
  toolName: string
  action: string
  argumentsPreview: unknown
  risk: KernelPermissionRisk
  policySnapshot: KernelToolPolicySnapshot
  timeoutMs?: number
  metadata?: Record<string, unknown>
}

export type KernelPermissionDecision = {
  permissionRequestId: string
  decision: 'allow' | 'deny' | 'allow_once' | 'allow_session' | 'abort'
  decidedBy: 'host' | 'policy' | 'timeout' | 'runtime'
  reason?: string
  expiresAt?: string
  metadata?: Record<string, unknown>
}
```

要求：

- permission request 必须以 `KernelPermissionEvent` 形式可观察，并可由 wire protocol 传给 host。
- 当前 wire protocol 已提供 `decide_permission` command，字段复用
  `KernelPermissionDecision`：`permissionRequestId`、`decision`、`decidedBy`、
  `reason?`、`expiresAt?`、`metadata?`。host 不需要 import runtime 内部
  broker，只通过 wire command 提交决策。
- `KernelRuntimeWireClient.decidePermission(...)` 已覆盖 `in-process` 与
  `stdio` transport；未知 `permissionRequestId` 必须返回 stable `not_found`，
  不得静默成功。
- `KernelRuntimeWireTurnExecutionContext.permissionBroker` 让 in-process
  executor 可以直接挂起在 runtime broker 上；host 通过同一个
  `decide_permission` command 推进执行。旧 SDK / REPL prompt path 必须
  收敛成 compatibility adapter，而不是继续自持不可 replay 的 pending
  permission state。
- 当前 source-level 统一注册点是 `hasPermissionsToUseTool(...)`。host 在
  `ToolUseContext.runtimePermission` 注入会话级 `RuntimePermissionBroker` 后，
  ask 决策会先注册 `KernelPermissionRequest`，allow / deny 决策会在
  permission evaluation 层完成 audit finalization；这避免 REPL、SDK、
  headless、ACP 各自维护独立 pending map。
- `ToolUseContext.runtimePermission` 是 legacy permission pipeline 与 runtime
  permission contract 之间的兼容 seam。它可以携带 `permissionBroker`、
  `getConversationId()`、`getTurnId()` 和 request controller registry；host
  只注入 context，不直接调用 runtime 内部 adapter。
- SDK stdio / structured IO 的 compatibility layer 已按 broker-first
  语义改造：`StructuredIO.createCanUseTool(...)` 可以注入共享
  `RuntimePermissionBroker`，legacy `control_request` / `control_response`
  只负责兼容旧 host protocol；外部 host 通过 broker / wire decision
  resolve 时，runtime 会取消旧 stdio prompt，避免双 source of truth。
- MCP `--permission-prompt-tool` 和 sandbox network ask 已按同一原则接入
  broker-first glue；legacy MCP tool call 与 synthetic stdout `can_use_tool`
  只保留为 compatibility transport，决策仍归一到
  `KernelPermissionDecision` / `permissionRequestId`。
- remote / direct-connect / SSH compatibility transports 必须保留并传递
  `toolUseID` 与 decision classification；direct-connect 还必须消费
  `control_cancel_request` 清理本地 pending prompt，避免用户响应 stale
  permission request。
- REPL local permission queue 与 bridge remote permission response 已按
  compatibility adapter 方式接入 runtime broker：REPL 仍保留现有 Ink UI 与
  bridge callback protocol，但 `KernelPermissionRequest` 先以 `toolUseID`
  注册，最终 allow / deny / abort 归一成 `KernelPermissionDecision`；bridge
  remote response metadata 保留 `resolvedBy = repl_bridge_remote` 与原始
  permission tool output。
- ACP session 已给 `QueryEngine` 注入会话级 runtime permission context，避免
  ACP 的 `canUseTool` path 绕过统一 broker。direct-connect / remote / SSH
  继续保留现有 transport message，但必须传递 `toolUseID` 和 decision
  classification，让 broker 可以按同一 `permissionRequestId` 审计。
- host 负责展示和采集用户决策；kernel 负责 policy evaluation、默认拒绝、超时处理和审计事件。
- timeout 未决时默认拒绝或 abort，不能默认 allow。
- decision 必须绑定 `permissionRequestId`，不能只靠 toolName / turnId 推断。
- 允许范围必须显式区分 once、session、workspace、policy rule；不得把一次同意扩展成长期授权。
- permission error、deny、timeout、host disconnect 都必须产生稳定 public event。

## 11. Hooks 系统

建议文件：`claude-code/src/kernel/hooks.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelHookRegistry = {
  list(eventName?: KernelHookEventName): KernelHookDefinition[]
  register(hook: KernelHookDefinition): Promise<KernelHookRegistration>
  unregister(registrationId: string): Promise<void>
  run(request: KernelHookRunRequest): Promise<KernelHookRunResult>
}

export type KernelHookEventName =
  | 'SessionStart'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Stop'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PostCompact'
```

要求：

- hooks 可以来自 settings、agent frontmatter、plugins、host-provided hooks。
- `registeredHooks` 进入 runtime bootstrap seam，不让 host 直接写 bootstrap singleton。
- hook 运行过程和结果要输出 public event。

## 12. Skills / Plugins 系统

建议文件：

- `claude-code/src/kernel/skills.ts`
- `claude-code/src/kernel/plugins.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelSkillCatalog = {
  list(): KernelSkillDescriptor[]
  resolve(name: string): KernelSkillDescriptor | null
  getPromptContext(names?: string[]): Promise<KernelSkillPromptContext>
  reload(request?: KernelSkillReloadRequest): Promise<KernelSkillCatalogSnapshot>
}

export type KernelPluginManager = {
  list(): KernelPluginDescriptor[]
  getErrors(): KernelPluginError[]
  reload(request?: KernelPluginReloadRequest): Promise<KernelPluginReloadResult>
}
```

要求：

- skills 加载覆盖 bundled、user、project、managed、MCP、plugin skills。
- plugins 加载覆盖 marketplace、本地、managed、user/project scope plugins。
- plugin 产生的 commands、agents、hooks、MCP、skills、tools 必须进入统一 capability resolver；当前 commands / agents / hooks / plugin MCP diff 已有 runtime-owned adapter，interactive MCP connection manager 的 config/connect/reconnect/toggle/channel/list_changed lifecycle 已进入 `RuntimeInteractiveMcpService`，channel allowlist 由 host option 注入，React 层只保留 UI adapter callback。
- loading errors 必须通过 public manager API 和 public event 暴露。

## 13. Agents / Coordinator / Task 系统

建议文件：

- `claude-code/src/kernel/agents.ts`
- `claude-code/src/kernel/tasks.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelAgentRegistry = {
  list(): KernelAgentDescriptor[]
  resolve(name: string): KernelAgentDescriptor | null
  spawn(request: KernelAgentSpawnRequest): Promise<KernelAgentHandle>
}

export type KernelTaskManager = {
  create(request: KernelTaskCreateRequest): Promise<KernelTask>
  update(request: KernelTaskUpdateRequest): Promise<KernelTask>
  list(filter?: KernelTaskListFilter): Promise<KernelTask[]>
  get(taskId: string): Promise<KernelTask | null>
}
```

范围：

- built-in agents。
- project/user/plugin agents。
- coordinator mode。
- subagent spawn。
- task tools。
- owned files / write guard。
- worker result validation。

要求：

- coordinator prompt、allowed tools、task APIs、write guard 必须作为同一个 contract 验证。
- host 可以自己展示 agent/team UI；kernel 负责 agent/task 行为和事件。

## 14. Pet / Companion 系统

建议文件：`claude-code/src/kernel/companion.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelCompanionRuntime = {
  getState(): Promise<KernelCompanionState | null>
  dispatch(action: KernelCompanionAction): Promise<KernelCompanionState | null>
  reactToTurn(request: KernelCompanionReactionRequest): Promise<void>
  onEvent(handler: (event: KernelCompanionEvent) => void): () => void
}
```

范围：

- companion state。
- hatch / rehatch。
- mute / unmute。
- pet action。
- turn 后 reaction。

要求：

- companion reaction 是 side request，不阻塞主 turn。
- reaction 失败必须以 public event 或 error event 可见，不能静默吞掉。
- sprite、头像、气泡、终端像素画属于 host renderer，不属于 kernel API。

## 15. Kairos / Proactive 系统

建议文件：`claude-code/src/kernel/kairos.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelKairosRuntime = {
  getStatus(): KernelKairosStatus
  enqueueEvent(event: KernelKairosExternalEvent): Promise<void>
  tick(request?: KernelKairosTickRequest): Promise<void>
  suspend(reason?: string): Promise<void>
  resume(reason?: string): Promise<void>
  onEvent(handler: (event: KernelKairosEvent) => void): () => void
}
```

范围：

- `kairosEnabled`。
- proactive tick。
- brief 输出。
- channel/webhook event。
- dream / memory consolidation。
- push notification。
- long-running assistant mode。

要求：

- Kairos 不应只是 boolean flag；它要成为可观察、可暂停、可恢复、可注入事件的 public capability。
- host 决定展示为通知、日志、频道消息、后台任务还是 UI badge。

## 16. Memory / Context / Session 系统

建议文件：

- `claude-code/src/kernel/memory.ts`
- `claude-code/src/kernel/context.ts`
- `claude-code/src/kernel/sessions.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelMemoryManager = {
  list(): Promise<KernelMemoryDescriptor[]>
  read(id: string): Promise<KernelMemoryDocument>
  update(request: KernelMemoryUpdateRequest): Promise<KernelMemoryDocument>
}

export type KernelSessionManager = {
  list(filter?: KernelSessionListFilter): Promise<KernelSessionDescriptor[]>
  resume(sessionId: string): Promise<KernelConversation>
  getTranscript(sessionId: string): Promise<KernelTranscript>
}
```

范围：

- AGENTS.md / project context。
- user/project memory。
- transcript。
- compaction。
- session list/resume。
- background/daemon session status。

要求：

- context assembly 和 compaction hook 结果要可观察。
- host 可以自己展示 memory/session UI；kernel 负责数据和行为 contract。

## 17. Event Surface

建议文件：`claude-code/src/kernel/events.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelEvent =
  | KernelHeadlessEvent
  | KernelCommandEvent
  | KernelToolEvent
  | KernelPermissionEvent
  | KernelHookEvent
  | KernelSkillEvent
  | KernelPluginEvent
  | KernelMcpEvent
  | KernelAgentEvent
  | KernelTaskEvent
  | KernelCompanionEvent
  | KernelKairosEvent
  | KernelMemoryEvent
  | KernelSessionEvent
  | KernelErrorEvent
```

要求：

- 不把 CLI 内部 message/render object 泄漏给 host。
- 文本流、工具进度、权限请求、hook 结果、plugin error、companion reaction、Kairos tick 都通过统一 event surface 出来。
- 桌面端 SSE 只是 `KernelEvent` 的一个 host 映射，不是内核协议本身。
- 所有事件都必须能被 `KernelRuntimeEnvelope` 承载，且具备稳定 replay / ordering / scope 语义。
- compatibility transport 可以继续发送旧 `SDKMessage` / `control_*`，但
  runtime-owned events 必须以 `type: "kernel_runtime_event"` 包装
  `KernelRuntimeEnvelope` 双写；host 入口必须把它路由到 runtime event sink，
  不得把它当未知 UI message 丢弃。

### 17.1 Event ordering 与 replay

- `KernelEvent` 是语义事件；`KernelRuntimeEnvelope` 是传输 envelope。两者不能混用。
- 每个 replayable event 必须有 `eventId`，并在 conversation scope 内保持单调。
- runtime-level event 与 conversation-level event 使用不同 scope；host 订阅时可以按 scope 过滤。
- replay 必须支持 `sinceEventId`，并明确返回 gap / expired / unavailable 错误。
- partial text、tool progress、permission request、hook result、compaction、companion reaction、Kairos tick 都必须标明是否 replayable。
- event payload 必须可序列化；host renderer 专用字段只能放在 host mapping 层。
- 当前 internal headless stream-json verbose 已输出 `kernel_runtime_event`，
  覆盖 permission audit、conversation / turn lifecycle 和
  `headless.sdk_message`；direct-connect、remote、SSH、bridge ingress 已接入
  runtime envelope adapter。direct-connect 已在保留 raw NDJSON backlog 的同时
  通过 runtime-owned `KernelRuntimeEventFacade` 提供 runtime envelope sidecar
  backlog / replay facade；REPL transport ingress 也使用同一个 facade 进行
  ingest / dedupe / replay 语义归一。remote / direct-connect / SSH host hooks
  已开始直接消费 `turn.completed` / `turn.failed` 作为 terminal loading
  signal，并把 runtime event 作为 remote timeout heartbeat；`headless.sdk_message`
  也会进入同一个 host-side SDK render handler，按稳定 `uuid` / assistant
  message id 去重，避免 compatibility stream 与 runtime event 双写 UI。
  对不携带 SDK payload 的纯 semantic `turn.output_delta`，REPL transport
  host 也已通过同一 host adapter 做文本预览与 terminal 落盘。bridge core
  现在正式暴露 `onRuntimeEvent` sink，`headless.sdk_message` payload 会回落到
  legacy SDK ingress，避免 envelope 到 bridge 后只 log 或静默吞掉。
  ACP bridge 也已进入同一 event model：ACP prompt producer 会通过会话级
  `RuntimeEventBus` 生成 `turn.started`、`headless.sdk_message` 与 terminal
  turn envelope，ACP forwarding 层消费 runtime envelope 并按稳定 SDK
  `uuid` / assistant message id 去重，保留旧 ACP `session/update` 输出语义。
  direct-connect print host (`runConnectHeadlessRuntime`) 也已接入同一 helper：
  `headless.sdk_message` 可作为 SDK result fallback，纯 `turn.output_delta`
  可在 terminal event 后生成文本输出。RCS bridge normalize 与 WS outbound /
  worker SSE path 已把
  `kernel_runtime_event.envelope` 作为 first-class 字段保真传递。
  `@go-hare/hare-code/kernel` 已开放
  `createKernelRuntimeEventFacade(...)`、`toKernelRuntimeEventMessage(...)`、
  `getKernelRuntimeEnvelopeFromMessage(...)` 与
  `consumeKernelRuntimeEventMessage(...)`，host 可以把这些 compatibility
  event 统一 ingest / subscribe / replay。

## 18. 安全模型与权限边界

完整状态的 kernel 不是无条件执行器。host、workspace、tool、MCP、plugin、secret 都必须进入 public contract 的安全模型。

必须定义：

- host identity：`KernelRuntimeOptions.host` 必须包含 host type、host id、transport kind、trust level 和 declared capabilities。
- workspace boundary：所有 conversation、tool、MCP、hook、memory、session 操作都必须绑定 workspace 或明确声明跨 workspace 权限。
- tool policy：allow/deny、read/write/network/shell/MCP 等风险分类必须是 kernel policy，而不是 UI 文案。
- MCP trust：MCP server 来源、scope、auth 状态、tool exposure 必须可查询、可禁用、可审计。
- plugin trust：marketplace、本地、managed、user/project plugin 的来源、版本、权限和加载错误必须可观察。
- secret handling：auth token、API key、env、MCP credential、tool arguments 中的 secret 必须 redaction 后进入 event/log。
- command / hook / skill provenance：public descriptor 必须能说明来源，避免 host 把不同来源能力展示成同等信任。
- audit events：permission decision、tool execution、MCP connect、plugin load、hook run、memory update、session resume 都必须产生可选审计事件。
- fail closed：未知 host、未知 capability、权限超时、policy conflict、schema mismatch 默认拒绝或 degraded，不默认 allow。

## 19. 不开放的内容

明确不开放：

- Ink / React component。
- 终端快捷键与布局。
- CLI 菜单状态机。
- bootstrap singleton 的直接读写。
- runtime internal abort controller。
- `HeadlessManagedSession` 等内部实现对象。
- 旧 SDK session facade 作为新增 public API。现有 SDK message /
  `stream-json` adapter 只作为最终兼容 transport 保留，不是 runtime
  source of truth，也不是新开放面。

## 20. 文件级接口清单

### claude-code

- `claude-code/src/kernel/runtime.ts`
  - 新增 `createKernelRuntime()` 总入口。
- `claude-code/src/kernel/wireProtocol.ts`
  - 新增 `KernelRuntimeWireProtocol` 的命令、响应、错误和 envelope schema。
  - 当前已在 `src/runtime/contracts/wire.ts` 与 `src/runtime/core/wire/*`
    落地 internal command/router/codec skeleton，并在
    `src/kernel/wireProtocol.ts` 提供 package root 可导出的 kernel leaf
    assembly。
- `claude-code/src/kernel/capabilities.ts`
  - 新增 capability resolver / reload。
- `claude-code/src/kernel/headlessController.ts`
  - 新增 headless conversation facade。
- `claude-code/src/kernel/headlessInputQueue.ts`
  - 新增 public input queue。
- `claude-code/src/kernel/headlessProvider.ts`
  - 新增 provider env/run options helper。
- `claude-code/src/kernel/events.ts`
  - 新增统一 public event union。
- `claude-code/src/kernel/commands.ts`
  - 开放 CLI command runtime。
- `claude-code/src/kernel/tools.ts`
  - 开放 tool catalog。
- `claude-code/src/kernel/permissions.ts`
  - 开放 permission request/decision schema。
- `claude-code/src/kernel/mcp.ts`
  - 开放 MCP manager。
- `claude-code/src/kernel/hooks.ts`
  - 开放 hook registry。
- `claude-code/src/kernel/skills.ts`
  - 开放 skill catalog。
- `claude-code/src/kernel/plugins.ts`
  - 开放 plugin manager。
- `claude-code/src/kernel/agents.ts`
  - 开放 agents/coordinator/subagent registry。
- `claude-code/src/kernel/tasks.ts`
  - 开放 task manager。
- `claude-code/src/kernel/companion.ts`
  - 开放 pet/companion runtime。
- `claude-code/src/kernel/kairos.ts`
  - 开放 Kairos/proactive runtime。
- `claude-code/src/kernel/memory.ts`
  - 开放 memory manager。
- `claude-code/src/kernel/context.ts`
  - 开放 context assembly facade。
- `claude-code/src/kernel/sessions.ts`
  - 开放 session/log/transcript manager。
- `claude-code/src/kernel/index.ts`
  - 统一导出上述 public API。
- `claude-code/src/entrypoints/kernel-runtime.ts`
  - 新增常驻 runtime runner，承载 wire protocol，可供其它语言 SDK 与本地 worker 启动。
  - 当前已有 source-level stdin/stdout NDJSON runner，并由
    `tests/integration/kernel-runtime-wire-smoke.test.ts` 覆盖；`package.json`
    已新增 `hare-kernel-runtime` bin，package smoke 覆盖 npm pack/install 后
    的 bin ping。

### hare-code-desktop

- `hare-code-desktop/electron/kernel-runtime-manager.cjs`
  - conversation -> worker 的注册和调度。
- `hare-code-desktop/electron/kernel-worker-wrapper.cjs`
  - worker 启停、stdout/IPC 处理；worker runner 只 import `@go-hare/hare-code/kernel`。
- `hare-code-desktop/electron/kernel-protocol.cjs`
  - Electron Main 到 worker 的本地传输封装，schema 必须复用 `KernelRuntimeWireProtocol`。
- `hare-code-desktop/electron/kernel-event-mapper.cjs`
  - public `KernelEvent` -> 当前前端 SSE event。
- `hare-code-desktop/electron/main.cjs`
  - 旧桌面 SDK session 管理退出主 owner，接入 worker registry；
    SDK message / `stream-json` 兼容 adapter 保留，避免 CLI 与现有调用方
    行为衰减。

## 21. 验证要求

### claude-code

- source-level：`src/kernel/*` 覆盖 runtime、capabilities、controller、events、commands、tools、hooks、skills、plugins、MCP、agents、companion、Kairos。
- wire-level：`KernelRuntimeWireProtocol` 的 command/envelope/error/event replay schema 有 contract 测试。
- 当前 checkpoint：internal `KernelRuntimeWireRouter` 已覆盖 `ping`、
  `create_conversation`、`run_turn`、`abort_turn`、`subscribe_events`、
  `reload_capabilities`、`publish_host_event`、`schema_mismatch`、scoped
  `sinceEventId` replay、missing cursor `not_found`、expired cursor
  `unavailable/retryable`，且 replay 失败前不发 subscription ack；
  `run_turn` 已支持 router-level `runTurnExecutor` streaming contract，可输出
  `turn.output_delta`、`turn.completed`、`turn.failed`，并在 `abort_turn` 时触发
  active executor 的 abort signal；默认 runner 已新增 process-isolated
  headless executor，可通过 `HARE_KERNEL_RUNTIME_HEADLESS_EXECUTOR=process`
  复用现有 headless `stream-json` 子进程并把 SDK stdout 归一化为 runtime
  event；host lifecycle 已新增 `connect_host` / `disconnect_host`，支持
  runtime-scoped reconnect cursor replay、`detach` 默认断开策略与
  `abort_active_turns` 主动中止 active turn；event replay recovery 已新增
  opt-in journal，可用 `HARE_KERNEL_RUNTIME_EVENT_JOURNAL` 跨
  `kernel-runtime` 进程重启恢复 replayable events；conversation snapshot
  recovery 已新增 opt-in journal，可用
  `HARE_KERNEL_RUNTIME_CONVERSATION_JOURNAL` 或 `conversationJournalPath` 在
  重启后恢复 latest conversation snapshot、归一化 `detached` 状态并保留
  active turn lock；conversation snapshot journal 也会持久化 active
  `run_turn` command，恢复 running active turn 时自动重启 executor，hard kill
  后 durable model/tool execution resume 已有 integration 覆盖；
  multi transport wrapper 已新增 `createKernelRuntimeWireClient()`、
  `createKernelRuntimeInProcessWireTransport()` 与
  `createKernelRuntimeStdioWireTransport()`，并用同一条 host conversation
  contract 覆盖 `in-process` / `stdio`；transport wrapper 已覆盖
  client-local live subscription scope，`create_conversation` 已覆盖
  `sessionId` / `workspacePath` reuse guard，transport integration 已覆盖
  in-process / stdio 下两个 conversation 同时 active、targeted `abort_turn`
  只中断目标 turn、另一个 conversation 仍保持 busy active lock，
  `capabilityIntent` 已覆盖 resolver demand-load；
  source-level `kernel-runtime` runner 已覆盖 stdin/stdout smoke；package
  root 已导出 wire runner / default router / command schema version，package
  bin 已覆盖。
- package-level：构建后 smoke `import('@go-hare/hare-code/kernel')`，确认新增导出真实可用。
- runner-level：常驻 `kernel-runtime` runner 可启动、响应 `init_runtime` / `ping`，并能通过协议创建 conversation。
- CLI parity：CLI 使用 public kernel capability 后，原有 commands/tools/hooks/skills/plugins/MCP/agents/pet/Kairos 行为不回退。
- host isolation：desktop/worker 测试只能依赖 `@go-hare/hare-code/kernel`，不能 import `claude-code/src/*`。
- surface guard：每新增一个 public export，必须同步更新 `src/kernel/__tests__/surface.test.ts`、`src/kernel/__tests__/packageEntry.test.ts`、`tests/integration/kernel-package-smoke.test.ts` 的导出集合。
- concurrency：多 conversation、并发 `run_turn`、duplicate `abort_turn`、host reconnect / process-level event replay recovery / conversation snapshot recovery / active execution durable resume 必须有 contract 测试；router-level event replay gap、host reconnect/disconnect、长 turn executor abort streaming、process-backed executor runner smoke、event journal after restart smoke、conversation snapshot after hard kill smoke、durable execution resume after hard kill、cross-transport host conversation smoke 与 cross-transport multi-conversation targeted abort smoke 已有 contract 测试。
- security：permission timeout、deny、policy conflict、secret redaction、MCP/plugin trust 降级必须有 contract 测试；REPL / bridge compatibility adapter 必须覆盖 host allow / deny 元数据不丢失。

### hare-code-desktop

- worker wrapper 测试只能依赖 `@go-hare/hare-code/kernel`。
- `kernel-protocol.cjs` 测试只能验证 `KernelRuntimeWireProtocol` 的传输封装，不定义桌面私有 schema。
- `ConversationRuntimeRegistry` 生命周期测试。
- `TurnStreamRegistry` ring buffer / reconnect 测试。
- `KernelEvent` -> desktop SSE mapper 测试。
- stop 只作用于目标 worker 的测试。

## 22. 完整状态执行顺序

以下是完整状态的落地顺序，不是 MVP 范围裁剪。任何阶段都不能把最终 public capability 从 contract 蓝图中移除。

1. 先定义 `KernelRuntime`、`KernelRuntimeCapabilities`、`KernelEvent`、`KernelRuntimeWireProtocol` 四个总 contract。
2. 新增常驻 `kernel-runtime` runner，让非 JS host 有稳定进程边界。
3. 把 headless controller/input queue/provider/events 接到总 contract 和 wire protocol。
4. 依次开放 commands、tools/permissions/MCP、hooks、skills/plugins、agents/tasks。
5. 再开放 companion、Kairos、memory/context/sessions。
6. 增加 package-level smoke，确保 `@go-hare/hare-code/kernel` 可导入新增接口。
7. 增加 runner/wire smoke，确保常驻 runtime 可被 Python/Go/机器人 host 通过协议使用。
8. 桌面端实现 worker wrapper，worker 代码只 import `@go-hare/hare-code/kernel`，对 main 暴露 `KernelRuntimeWireProtocol`。
9. 桌面端替换旧 SDK session 路径，保留 SSE/reconnect 的外层行为。
