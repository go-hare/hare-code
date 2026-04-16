# hare-code SDK 化方案文档

## 1. 文档目标

本文档定义 `hare-code` 从当前的 Bun CLI 产品形态，重构为“可被多方宿主引入的通用 runtime SDK”的目标架构、边界划分与模块拆分原则。

这里的“宿主”是通用概念，不特指机器人，也不特指桌面端。未来可接入的宿主包括但不限于：

- CLI host
- Desktop host
- Embedded host
- Server host
- Remote bridge client
- Robot runtime

## 2. 核心结论

`hare-code` 应被重构为：

- `runtime-types`：统一协议与类型
- `runtime-core`：生命周期、会话、事件流、任务、协调、记忆的运行时内核
- `runtime-tools-default`：默认工具池与默认能力装配
- `runtime-bridge`：远程接入协议与桥接层
- `hare-code`：CLI 产品壳

一句话：

**CLI 不再拥有 runtime；CLI 只是 runtime 的一个宿主。**

## 3. 当前问题

当前 `hare-code` 已经具备很多 SDK 所需原件，例如：

- query 主链
- coordinator mode
- background task / teammate task
- bridge / remote control
- memdir / memory
- 任务面板与任务状态

但这些能力当前仍主要附着在 CLI 主循环、UI 状态和 bridge 产品逻辑中，导致：

1. runtime 能力无法被通用宿主直接复用
2. CLI、desktop、Python、远端 bridge 都容易各自复制一套运行时语义
3. 事件、任务、工具、宿主状态的协议没有收敛成统一边界
4. 多语言接入时只能围绕 executable 包装，而不是围绕 runtime 协议接入

## 4. 重构目标

本次 SDK 化目标不是“把 CLI 导出成库”，而是：

1. 抽离一个通用 runtime core
2. 统一输入、事件、任务、工具协议
3. 让宿主可以内嵌接入 runtime
4. 让 bridge / executable 成为 runtime 的一种适配层
5. 保持现有 CLI 功能可继续演进，不阻断当前用户路径

## 5. 非目标

以下内容不属于第一阶段 SDK 化目标：

- 直接做跨语言全量 SDK
- 立刻拆成多个 npm workspace 包并发布
- 重写终端 UI
- 重写 bridge 产品体验
- 立即消除所有 Bun/CLI 历史依赖

第一阶段只要求做到：

**runtime 可以被明确抽象、被 CLI 反向消费、被其他宿主复用。**

## 6. 设计原则

### 6.1 协议优先

先统一 runtime 协议，再决定语言绑定和外部包装。

### 6.2 内核与产品分离

runtime core 不应依赖：

- Commander
- Ink / React 终端 UI
- Electron
- WeChat bridge
- 某一种具体宿主状态树

### 6.3 默认能力可插拔

“coding assistant 默认工具池”不应等同于 runtime 本体。默认工具是一个能力包，不是内核。

### 6.4 宿主中立

所有抽象都应使用“host / runtime host / adapter / bridge”这类通用概念，不将机器人、桌面端、CLI 任何一方写死在 SDK 主接口中。

### 6.5 支持两类工具执行

通用 SDK 必须同时支持：

- in-process tool：runtime 进程内直接执行
- host-resolved tool：runtime 发起工具调用，宿主异步回传结果

否则 runtime 无法同时支撑内嵌宿主与远程宿主。

## 7. 目标分层

## 7.1 runtime-types

职责：

- 定义统一输入协议
- 定义统一事件协议
- 定义统一任务协议
- 定义统一工具协议
- 定义 runtime 状态协议

建议包含的核心类型：

- `UserInput`
- `HostEvent`
- `RuntimeEvent`
- `RuntimeState`
- `ToolDefinition`
- `ToolCall`
- `ToolResult`
- `TaskState`
- `TaskAction`
- `TaskControlResult`
- `SessionConfig`
- `CoordinatorModeState`

要求：

- 尽量少依赖第三方
- 无 Bun / CLI / UI 依赖
- 可被 TS、bridge、未来其他语言绑定共同复用

## 7.2 runtime-core

职责：

- lifecycle：`start()` / `stop()`
- session / conversation 管理
- turn 提交：`submitInput(...)`
- interrupt / resume
- 事件总线
- query orchestration
- coordinator mode
- background task orchestration
- memory wiring
- host event 注入

建议主接口：

```ts
interface RuntimeCore {
  start(): Promise<void>
  stop(): Promise<void>

  submitInput(input: UserInput): string
  interrupt(turnId?: string): Promise<boolean>

  publishHostEvent(event: HostEvent): void

  onEvent(cb: (event: RuntimeEvent) => void): () => void
  pollEvent(): RuntimeEvent | null
  waitEvent(timeoutMs?: number): Promise<RuntimeEvent | null>
  drainEvents(): RuntimeEvent[]

  submitGoal(goal: GoalInput): string
  listTasks(opts?: { includeCompleted?: boolean }): TaskState[]
  controlTask(taskId: string, action: TaskAction): Promise<TaskControlResult>
}
```

## 7.3 runtime-tools-default

职责：

- 装配默认 coding 工具池
- 装配默认 coordinator 工具池
- 装配默认 worker 工具池
- 保留当前 `hare-code` 产品默认行为

这层不属于 core 的必要部分。宿主应可选择：

- 不加载任何默认工具
- 只加载默认工具的一部分
- 使用自己的工具集合

## 7.4 runtime-bridge

职责：

- 暴露远程接入协议
- 支持 HTTP / SSE / WebSocket
- 维护 session
- 转发 runtime event
- 支持任务查询和任务控制

这层应被视为 runtime 的 transport / adapter，而不是产品逻辑。

## 7.5 product shells

包括：

- `hare-code` CLI
- desktop
- Python wrapper
- future embedded hosts

这些产品壳只做：

- 参数解析
- UI 呈现
- 宿主工具绑定
- runtime 装配

对于第一批接入，建议先补“host adapter”薄层，而不是直接侵入产品入口。比如：

- `runtime/hosts/cli/*`：把 `RuntimeCore` 的事件与状态投影成 CLI 可消费的 view model
- 后续其他宿主也可按同样模式补 `runtime/hosts/<host>/*`

## 8. 建议目录结构

第一阶段不强制拆 workspace，但建议先在单仓库内做结构性重组：

```text
src/
  runtime/
    types/
      input.ts
      events.ts
      tasks.ts
      tools.ts
      state.ts
    core/
      Runtime.ts
      EventBus.ts
      SessionManager.ts
      QueryRuntime.ts
      HostEvents.ts
    coordinator/
      CoordinatorRuntime.ts
      WorkerRuntime.ts
    tasks/
      TaskRuntime.ts
      TaskController.ts
    memory/
      MemoryRuntime.ts
      MemdirAdapter.ts
      SessionMemoryAdapter.ts
    bridge/
      protocol/
      server/
      client/
    hosts/
      cli/
        CliRuntimeHostAdapter.ts
        types.ts
    tools-default/
      coding.ts
      coordinator.ts
      worker.ts
  cli/
    main.tsx
    commands.ts
    repl/
    ui/
```

## 9. 现有代码到目标层的映射

### 9.1 runtime-core 候选来源

- `src/query.ts`
- `src/query/*`
- `src/coordinator/coordinatorMode.ts`
- `src/coordinator/workerAgent.ts`
- `src/tasks/*`
- `src/memdir/*`
- `src/services/SessionMemory/*`
- `src/services/extractMemories/*`
- `src/services/autoDream/*`

### 9.2 runtime-bridge 候选来源

- `src/bridge/*`

### 9.3 runtime-tools-default 候选来源

- `src/tools/*`
- `src/tools.js`
- `src/commands.ts` 中与默认工具装配强耦合的逻辑

### 9.4 CLI shell 候选来源

- `src/main.tsx`
- `src/screens/*`
- `src/components/*`
- `src/ink/*`
- `src/commands.ts`

## 10. 关键协议建议

## 10.1 输入协议

建议统一为：

```ts
type UserInput = {
  conversationId?: string
  turnId?: string
  text: string
  userId?: string
  metadata?: Record<string, unknown>
  attachments?: HostAttachment[]
}
```

## 10.2 宿主事件协议

建议统一为：

```ts
type HostEvent = {
  conversationId?: string
  turnId?: string
  eventType: string
  role?: 'system' | 'user' | 'assistant'
  text?: string
  metadata?: Record<string, unknown>
  attachments?: HostAttachment[]
}
```

## 10.3 运行时事件协议

建议统一为：

```ts
type RuntimeEvent =
  | AssistantDeltaEvent
  | AssistantDoneEvent
  | ToolCallEvent
  | ToolProgressEvent
  | ToolResultEvent
  | TaskStartedEvent
  | TaskProgressEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | RuntimeNotificationEvent
  | RuntimeErrorEvent
```

所有事件尽量统一携带：

- `conversationId`
- `turnId`
- `runId`
- `taskId`
- `toolUseId`
- `metadata`

## 10.4 工具协议

SDK 层必须支持两种工具：

### A. in-process tool

适合内嵌宿主直接执行。

### B. host-resolved tool

适合 bridge / 远程前端 / 异步宿主执行。

建议协议上为 host-resolved tool 明确定义：

- `PendingToolCall`
- `submitToolResults(...)`

## 10.5 任务协议

任务必须从一开始就是 runtime 协议的一部分，而不是 UI 私有状态。

至少应统一：

- `TaskState`
- `TaskProgress`
- `TaskAction`
- `TaskControlResult`

## 11. 多方接入场景

SDK 需要原生支持以下接入模式：

### 11.1 CLI host

- 本地交互式终端
- 带默认 coding 工具池

### 11.2 Desktop host

- 本地 GUI
- 工具部分宿主执行
- 事件流驱动 UI

### 11.3 Embedded host

- 任意宿主进程内嵌
- 可共享一份 runtime state

### 11.4 Remote host

- 通过 bridge 协议远程接入
- 适合手机、Web、控制台、其他语言绑定

## 12. 分阶段拆包建议

不建议一开始就拆成独立 npm workspace 发布。

建议顺序：

1. 先在单仓库内完成 runtime 抽象
2. 再让 CLI 反向依赖 runtime
3. 再拆成内部 workspace
4. 最后才考虑对外发布 SDK 包

## 13. 成功标准

当满足以下条件时，可以认为 `hare-code` 已完成第一阶段 SDK 化：

1. CLI 可以通过一个明确的 `RuntimeCore` 对象运行
2. `main.tsx` 不再直接拥有 query、task、bridge、memory 的核心逻辑
3. runtime 协议可脱离 CLI 被其他宿主复用
4. 默认工具池与 runtime core 明确分离
5. bridge 成为 runtime adapter，而不是 CLI 附属逻辑

## 14. 最终判断

`hare-code` 的下一阶段不应继续围绕“更强 CLI”组织，而应围绕“更清晰 runtime”组织。

从这个角度看，SDK 化不是额外工作，而是当前仓库复杂度继续增长前必须做的一次结构性治理。
