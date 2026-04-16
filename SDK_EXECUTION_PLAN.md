# hare-code SDK 化执行文档

## 1. 文档目标

本文档把 `SDK_ARCHITECTURE.md` 中的目标架构拆成可执行的分步计划。每一步都明确：

- 目标
- 具体动作
- 影响文件
- 产出物
- 验收标准
- 风险与回滚点

本执行文档遵循一个原则：

**先抽边界，再迁逻辑；先让 CLI 消费 runtime，再考虑拆包发布。**

## 2. 总执行策略

执行分为 7 个阶段：

1. Phase 0：冻结协议与命名
2. Phase 1：抽 `runtime-types`
3. Phase 2：抽 `runtime-core`
4. Phase 3：抽 `runtime-tools-default`
5. Phase 4：抽 `runtime-bridge`
6. Phase 5：让 CLI 反向消费 runtime
7. Phase 6：SDK / CLI 产品化

### 2.1 当前执行状态

- Phase 0：已完成，命名和宿主口径已冻结
- Phase 1：已完成，`src/runtime/types/*` 已落地
- Phase 2：已完成，`RuntimeCore`、`EventBus`、`SessionManager`、`QueryRuntime`、`HostEvents`、`TaskRuntime`、`CoordinatorRuntime` 已落地并接入主链
- Phase 3：已完成，默认工具装配真相源已切到 `src/runtime/tools-default/*`，内部不再依赖旧 façade
- Phase 4：已完成，`runtime-bridge` 的 protocol/server/client 与 SDK 入口已落地
- Phase 5：已完成，CLI 已从 `hare-code` 主包边界移出；`hare-code` 为 SDK-only，CLI sibling 包为 `../hare-cli`
- Phase 6：进行中，开始把 `hare-cli` 与 `hare-code-desktop` 做成建立在 SDK 之上的 sibling 产品包（发布链、版本策略、安装说明）
- 当前验证基线：`bun x tsc --noEmit`、`bun run build`、`bun run smoke:sdk` 全部通过

## 3. 执行原则

### 3.1 不一次性大爆炸迁移

每一步都应：

- 可编译
- 可回退
- 可通过现有 CLI 路径验证

### 3.2 不先拆 workspace

在 runtime 边界不稳定前，不做多包发布和 npm workspace 拆分。

### 3.3 不先搬 UI

先处理内核和协议，UI 留到后面。

### 3.4 通用宿主口径

所有新文件、接口、命名统一使用：

- `host`
- `runtime`
- `adapter`
- `bridge`

避免引入：

- `robotHost`
- `desktopHost`
- `cliOnlyRuntime`

除非该模块本身就是具体宿主实现。

## 4. Phase 0：冻结协议与命名

## 4.1 目标

先统一术语，避免后续改来改去。

## 4.2 动作

1. 明确以下术语：
   - `RuntimeCore`
   - `RuntimeEvent`
   - `HostEvent`
   - `TaskState`
   - `ToolDefinition`
   - `ToolCall`
   - `ToolResult`
2. 明确 “宿主” 使用通用概念，不绑定机器人或桌面端。
3. 明确 runtime 主接口最小集合。

## 4.3 产出物

- 本文档
- `SDK_ARCHITECTURE.md`

## 4.4 验收标准

- 团队内部对命名不再存在歧义
- 后续新代码按统一口径落地

## 4.5 风险

- 如果协议命名不稳，后面所有目录都会返工

---

## 5. Phase 1：抽 `runtime-types`

## 5.1 目标

把运行时协议从产品逻辑中抽出来，形成最小共享类型层。

## 5.2 建议新建目录

```text
src/runtime/types/
  input.ts
  events.ts
  tasks.ts
  tools.ts
  state.ts
  index.ts
```

## 5.3 动作

### Step 1.1 新建 `input.ts`

定义：

- `UserInput`
- `HostEvent`
- `HostAttachment`

### Step 1.2 新建 `events.ts`

定义统一 `RuntimeEvent` 联合类型：

- `assistant_delta`
- `assistant_done`
- `tool_call`
- `tool_progress`
- `tool_result`
- `task_started`
- `task_progress`
- `task_completed`
- `task_failed`
- `notification`
- `error`

### Step 1.3 新建 `tasks.ts`

定义：

- `TaskState`
- `TaskProgress`
- `TaskAction`
- `TaskControlResult`

### Step 1.4 新建 `tools.ts`

定义：

- `ToolDefinition`
- `ToolCall`
- `ToolResult`
- `PendingToolCall`

### Step 1.5 新建 `state.ts`

定义：

- `RuntimeState`
- `CoordinatorModeState`

## 5.4 参考现有来源

- `src/tasks/types.ts`
- `src/bridge/types.ts`
- `src/types/*`
- `src/tools/*`

## 5.5 产出物

- `src/runtime/types/*`

## 5.6 验收标准

- 类型层不依赖 CLI / React / Bun UI
- `runtime-types` 可被 bridge 和 core 同时 import

## 5.7 风险

- 旧类型与新类型重复共存一段时间
- 必须容忍短期双轨

---

## 6. Phase 2：抽 `runtime-core`

## 6.1 目标

从当前 CLI 主循环中抽出真正的 runtime 内核。

## 6.2 建议新建目录

```text
src/runtime/core/
  Runtime.ts
  EventBus.ts
  SessionManager.ts
  QueryRuntime.ts
  HostEvents.ts
  index.ts
```

## 6.3 动作

### Step 2.1 新建 `EventBus.ts`

提供：

- `emit(event)`
- `subscribe(cb)`
- `poll()`
- `wait(timeoutMs?)`
- `drain()`

### Step 2.2 新建 `SessionManager.ts`

负责：

- conversation / turn 生命周期
- `submitInput(...)`
- turn id 分配
- session id 关联

### Step 2.3 新建 `HostEvents.ts`

负责：

- `publishHostEvent(...)`
- host event 到 runtime event 的转换
- host event 到 query context 的注入路径

### Step 2.4 新建 `QueryRuntime.ts`

从当前这些位置抽核心逻辑：

- `src/query.ts`
- `src/query/*`

职责：

- query loop orchestration
- turn 执行
- 中断
- 流式事件翻译

### Step 2.5 新建 `Runtime.ts`

组合：

- `EventBus`
- `SessionManager`
- `QueryRuntime`
- task runtime
- memory runtime
- coordinator runtime

提供稳定主接口：

- `start()`
- `stop()`
- `submitInput()`
- `interrupt()`
- `publishHostEvent()`
- `onEvent()`

## 6.4 当前文件影响

这一阶段不要直接大改 `main.tsx`，先新增 core 文件，并在 CLI 内部开始局部替换。

## 6.5 产出物

- `src/runtime/core/*`

## 6.6 验收标准

- 存在一个可实例化的 `Runtime` 对象
- `Runtime` 不依赖终端 UI
- `Runtime` 可以在非 CLI 环境中被构造

## 6.7 风险

- query 主链与 AppState 耦合较深
- 第一轮允许做“薄壳适配”，不要追求一步到位

---

## 7. Phase 3：抽 `runtime-tools-default`

## 7.1 目标

让默认工具池从 runtime core 中可拆卸。

## 7.2 建议新建目录

```text
src/runtime/tools-default/
  coding.ts
  coordinator.ts
  worker.ts
  index.ts
```

## 7.3 动作

### Step 3.1 梳理当前默认工具来源

参考：

- `src/tools/*`
- `src/tools.js`
- `src/commands.ts`

### Step 3.2 定义三类默认工具装配函数

- `buildDefaultCodingTools()`
- `buildCoordinatorTools()`
- `buildWorkerTools()`

### Step 3.3 让 `RuntimeCore` 接受显式工具装配

例如：

```ts
createRuntime({
  tools: buildDefaultCodingTools(...)
})
```

而不是在 core 内部默认偷偷加载全部工具。

## 7.4 产出物

- `src/runtime/tools-default/*`

## 7.5 验收标准

- runtime 可以“无默认工具”启动
- CLI 仍能通过 default tools 获得原有能力

## 7.6 风险

- 某些工具之间存在隐式依赖
- 要允许短期保留一个兼容装配层

### 7.7 当前已落地的真源切换

目前已经补上：

- `src/runtime/tools-default/coding.ts`
- `src/runtime/tools-default/coordinator.ts`
- `src/runtime/tools-default/worker.ts`
- `src/runtime/tools-default/index.ts`
- `src/runtime/tools-default/core.ts` 已承接原 `src/tools.ts` 的核心实现
- `src/tools.ts` 已降级为兼容导出层
- 内部代码已不再依赖 `src/tools.ts`，统一改走 `src/runtime/tools-default/index.ts`
- `useMergedTools` 已开始通过 `buildMergedCodingTools(...)` 消费新层
- `main.tsx` 的 headless coordinator 工具过滤已开始通过 `buildCoordinatorTools(...)` 消费新层
- `ToolSelector` 的 worker 工具过滤已开始通过 `buildWorkerTools(...)` 消费新层
- `cli/print.ts` 的 headless 工具总装配已开始通过 `buildMergedCodingTools(...)` 消费新层
- `REPL.tsx` 的本地工具与刷新型工具装配已开始通过 `buildBuiltinCodingTools(...)` / `buildMergedCodingTools(...)` 消费新层
- `AgentTool.tsx` 与 `resumeAgent.ts` 的 worker 工具装配已开始通过 `buildDefaultCodingTools(...)` 消费新层

这一步意味着默认工具装配的真相源已经切到 `runtime-tools-default`，`src/tools.ts` 只保留兼容 façade。后续再继续做的，就是把 `runtime-tools-default/core.ts` 进一步拆小，而不是回到旧产品入口继续长逻辑。

---

## 8. Phase 4：抽 `runtime-bridge`

## 8.1 目标

把 bridge 从“CLI 的远程功能”提升成“runtime 的 transport 层”。

## 8.2 建议新建目录

```text
src/runtime/bridge/
  protocol/
  server/
  client/
  index.ts
```

## 8.3 动作

### Step 4.1 统一 bridge 协议对象

桥接层输入输出统一复用：

- `UserInput`
- `HostEvent`
- `RuntimeEvent`
- `TaskState`
- `TaskControlResult`

### Step 4.2 抽 server side

从 `src/bridge/*` 中抽出：

- session create
- submit input
- stream events
- list tasks
- control task

### Step 4.3 抽 client side

形成：

- connect
- reconnect
- subscribe event stream
- submit input
- publish host event

### Step 4.4 保留 CLI bridge 壳

CLI 可继续保留 `bridgeMain.ts` 这类产品逻辑，但其底层必须改为消费 `runtime-bridge`。

## 8.4 参考现有来源

- `src/bridge/*`

## 8.5 产出物

- `src/runtime/bridge/*`

## 8.6 验收标准

- bridge 不再直接依赖 CLI 状态树
- bridge 连接的是 `RuntimeCore`，而不是 `main.tsx`

## 8.7 风险

- 现有 bridge 与 AppState/UI 耦合较多
- 建议先做协议和 server 核心，再做 UI 对接

### 8.8 当前已落地的第一版 bridge 骨架

目前已经补上：

- `src/runtime/bridge/protocol.ts`
- `src/runtime/bridge/server/RuntimeBridgeServer.ts`
- `src/runtime/bridge/client/RuntimeBridgeClient.ts`
- `src/runtime/bridge/index.ts`
- `src/runtime/index.ts` 已开始对外导出 bridge 层

这一步先把“可接入的通用 runtime bridge”作为独立层立起来：

- `protocol` 定义 session / input / host-event / task-control / event-subscribe 口径
- `server` 管理多 session 的 `RuntimeCore`
- `client` 以宿主可消费的方式访问 bridge transport

这一步的目标是先把 bridge 作为 SDK/runtime 层的正式边界立住，而不是继续把远程接入能力绑在 CLI/REPL 私有实现里。

### 8.9 当前已落地的第一版 SDK 入口

目前已经补上：

- `src/sdk/index.ts`
- `src/sdk/types.ts`
- `src/entrypoints/sdk.ts`
- `package.json` 已开始导出 `hare-code/sdk`
- `bun run build` 已开始同时产出 `dist/cli.js` 与 `dist/sdk.js`
- `scripts/sdk-smoke.ts`
- 内部类型导入已不再依赖 `src/entrypoints/agentSdkTypes.ts`，统一改走 `src/sdk/types.ts`

这一步把 bridge/runtime 的内部骨架收成了正式的对外接入面：

- `createRuntimeServer(...)`
- `createRuntimeClient(...)`
- `attachRuntimeClient(...)`
- `createInMemoryRuntime(...)`
- `submitGoal(...)`

这意味着外部宿主已经可以不碰 CLI 私有入口，直接按 SDK 方式接入 runtime。

---

## 9. Phase 5：让 CLI 反向消费 runtime

## 9.1 目标

让 `hare-code` CLI 从 runtime owner 变成 runtime host。

## 9.2 动作

### Step 5.1 缩减 `main.tsx` 职责

最终 `main.tsx` 只负责：

- 参数解析
- 宿主配置读取
- default tools 装配
- 创建 runtime
- 创建 UI / REPL
- 订阅 runtime events

### Step 5.1.a 当前已确认的第一批切点

基于现状代码，Phase 5 第一轮不应直接重写整个 CLI 启动链，而应优先从下面几个点切入：

- `src/main.tsx` 中的 `initialState` 目前直接拥有 `tasks`、`coordinatorTaskIndex`、`replBridge*` 等运行时状态，应先把其中可由 `RuntimeCore` 托管的部分改成 view model 映射
- `sessionConfig` 是现有 query / session 装配切点，后续适合作为 CLI 将输入提交给 `RuntimeCore` 的过渡位置
- 第一轮 CLI 接入目标应是“订阅 runtime event 并同步展示态”，而不是一次性替换全部 AppState 写路径

### Step 5.1.b 推荐先补 host adapter 旁路

在真正改 `main.tsx` 之前，先新增：

- `src/cli/runtime-host/CliRuntimeHostAdapter.ts`

职责：

- 订阅 `RuntimeCore` 事件
- 维护一份 CLI 可消费的 runtime view state
- 避免直接把 `AppState` 当成 runtime 真相来源

这样 Phase 5 第一刀会变成“把 CLI 接到 adapter 上”，而不是“把 CLI 直接接进 runtime 内核细节”。

### Step 5.1.c 当前已落地的第一条真实接线

目前已经完成：

- `App` 组件可接收 `runtimeHostAdapter`
- `CliRuntimeHostSync` 已挂入 `AppStateProvider` 内部
- 交互式 `launchRepl(...)` 路径已开始把 adapter 传入 App 树

这意味着 runtime host 已经进入实际 UI 运行树，后续可以在不重写 CLI 主链的前提下，逐步把通知、状态和任务展示迁到 runtime 事件流。

### Step 5.1.d 当前已落地的第一条 query 生命周期镜像

目前已经补上：

- `REPL` 的 `onQuery(...)` 会在真实 query 启动时调用 `runtime.submitInput(...)`
- query 完成时会调用 `runtime.completeTurn(...)`
- query 失败或中断时会调用 `runtime.failTurn(...)`
- assistant 流式文本会通过 `appendAssistantDelta(...)` 同步进 runtime
- 现有 `AppState.tasks` 会通过 CLI host adapter 镜像成 runtime 任务状态
- `StatusLine` 已能把 runtime host 的轻量状态摘要作为后缀拼到现有 statusline 上，并显示当前任务摘要
- footer 的背景任务 pill 已开始直接读取 runtime 任务摘要
- 仅存在 runtime-only 任务时，footer pill 也能直接打开任务对话框
- 仅存在 runtime-only 任务时，footer pill 已可直达当前高亮 runtime 任务详情
- `BackgroundTasksDialog` 已开始展示 runtime-only 任务，并提供只读详情视图
- `BackgroundTasksDialog` 中的 runtime-only 任务已支持最小 stop 操作
- `TaskListV2` / `Spinner` / `REPL` 的 expanded tasks 面板已开始承接 runtime 任务区块
- `ctrl+t` / footer 中“是否有任务可展开”的判断已开始纳入 runtime 任务
- `src/cli/index.ts` 已作为 CLI 宿主层 canonical 入口落地，CLI host adapter 已开始经由 SDK 提供 runtime
- CLI host adapter / REPL / runtime task UI 已不再通过 `adapter.runtime.*` 直摸内核，而是经由 SDK session façade 调用
- `hare-code/cli` 的内部主链已开始建立在 `hare-code/sdk` 之上；CLI 是宿主壳，SDK 是内核入口
- CLI host 实现已从 `src/runtime/hosts/cli/*` 整体迁到 `src/cli/runtime-host/*`
- `src/runtime/index.ts` 已不再导出任何 CLI host 内容，`src/runtime/hosts/*` 已清理完成

这一步让 runtime host 不再只是“已挂到 UI 树里”，而是已经开始消费真实交互生命周期。

### Step 5.2 让 AppState 只保存展示态

不要让 AppState 成为 runtime 真相来源。

原则：

- runtime state 属于 core
- AppState 只是 view model

### Step 5.3 将 CLI 命令与 runtime 解耦

CLI 命令最终应调用：

- `runtime.submitInput(...)`
- `runtime.publishHostEvent(...)`
- `runtime.controlTask(...)`

而不是直接改写底层状态。

## 9.3 产出物

- 经过瘦身的 `main.tsx`
- CLI 成为 runtime host

## 9.4 验收标准

- `main.tsx` import 明显收缩
- query / task / memory / bridge 核心逻辑不再直接长在 CLI 顶层入口

## 9.5 风险

- 这是第一阶段中对现有产品影响最大的步骤
- 需要在 Phase 1-4 充分稳定后再做

---

## 10. 具体文件优先级

## 10.1 第一批优先处理

- `src/query.ts`
- `src/query/*`
- `src/coordinator/coordinatorMode.ts`
- `src/tasks/*`
- `src/memdir/*`

## 10.2 第二批处理

- `src/services/SessionMemory/*`
- `src/services/extractMemories/*`
- `src/services/autoDream/*`
- `src/bridge/*`

## 10.3 第三批处理

- `src/main.tsx`
- `src/screens/*`
- `src/components/*`

---

## 11. Phase 6：SDK / CLI 产品化

## 11.1 目标

在架构主线完成后，把拆出来的两个产品边界做成真正可发布、可解释、可维护的两个包：

- `hare-code`：SDK-only
- `hare-cli`：CLI-only

## 11.2 动作

### Step 6.1 独立 CLI 产品边界

- `hare-cli` 维护自己的 `package.json`
- `hare-cli` 维护自己的 `bin/`
- `hare-cli` 维护自己的构建脚本与 release 产物命名

### Step 6.2 独立发布链

- `hare-code` 的 release 仅发布 SDK tgz
- `hare-cli` 的 release 独立发布 CLI tgz 与平台二进制
- `hare-code-desktop` 的版本与发布链明确建立在 sibling SDK 版本之上
- 三边不再共享同一个“我是 SDK 又是 CLI”的 release 叙事

### Step 6.3 产品文档与安装说明

- `hare-code/README.md` 只讲 SDK
- `hare-cli/README.md` 只讲 CLI
- 明确两者依赖关系与未来版本联动方式

## 11.3 当前已落地

- `hare-code` 已改成 SDK-only 根包
- `hare-cli` 已作为顶层 sibling 包落地
- `hare-cli` 已具备独立 `build`、`smoke`、`build-release` 脚本
- `hare-cli/.github/workflows/release.yml` 已按独立仓库形态补齐为可迁移模板
- `hare-code-desktop` 已切到直接消费 `hare-code/sdk`，不再通过 CLI 子进程 / Bun 安装链运行
- `hare-code-desktop` 会在构建前同步 sibling `hare-code/dist/sdk.js` 到 `electron/vendor/hare-code-sdk.js`
- `hare-code-desktop` 的前端运行时安装弹窗与 `/api/system-status`、`/api/system/install-hare-code` 链路已退出主路径
- `hare-code` 现在同时为 `hare-cli` 与 `hare-code-desktop` 提供版本同步 / 校验脚本
- `hare-code-desktop` 已补齐 `version:sync` / `version:check` 脚本并纳入 SDK 版本真源体系
- `hare-code-desktop` 的 SDK 供应策略已分成 sibling 开发模式与 published package 发布模式
- `hare-code-desktop` 的 package-mode 现已优先消费本地 `hare-code-<version>.tgz`，缺失时自动回退到 GitHub Release 下载对应 tgz，便于独立仓库直接发版
- `hare-code-desktop/.github/workflows/release.yml` 已按独立仓库形态补齐为可迁移模板
- `hare-code` 已补齐供 Python SDK 使用的 `hare-sdk-python-*` runner 构建与 release 资产
- `hare-code/sdk` 的 headless chat session 已明确收口为进程级单并发能力；SDK smoke 现覆盖 `dist/sdk.js` 导出面与 headless session 基本可用性
- `hare-agent-sdk-python` 已改为下载 / 打包 / 查找 `hare-sdk-python` runner，而不是依赖 `hare-cli` 或旧 `hare-code` CLI 语义

## 11.4 下一步

- 给 `hare-cli` 补独立 release workflow
- 明确 `hare-code` / `hare-cli` 的版本联动策略
- 视需要决定后续是继续 sibling 结构，还是演进为独立仓库

## 11.5 当前已补的产品化约束

- `hare-code` 增加了 `version:sync:cli` / `version:check:cli`
- `hare-code` 增加了 `version:sync:siblings` / `version:check:siblings` 与 desktop 专用别名
- `hare-cli` 增加了 `version:sync` / `version:check`
- `hare-code-desktop` 增加了 `version:sync` / `version:check`
- 当前以 `hare-code/package.json` 的版本号为真源，`hare-cli/package.json` 与 `hare-code-desktop/package.json` 跟随同步
- `hare-code-desktop` 增加了 `sdk:build:package` 与 `electron:build:release:*`
- `hare-code` 增加了 `build:sdk-python-runner` 与 SDK runner release 资产矩阵
- `src/ink/*`

---

## 11. 每阶段验收清单

### Phase 1 完成标志

- 新类型目录存在
- 核心 runtime 协议完成第一版

### Phase 2 完成标志

- 可实例化 `RuntimeCore`
- 非 CLI 环境下可启动最小 runtime

### Phase 3 完成标志

- 无默认工具也可运行
- CLI 默认工具池显式装配

### Phase 4 完成标志

- bridge 面向 runtime，而不是 CLI

### Phase 5 完成标志

- CLI 成为 host shell
- runtime 成为真正核心

---

## 12. 建议节奏

建议按以下节奏推进：

### 周期 A：协议冻结

- 完成 `runtime-types`
- 不做大改

### 周期 B：核心抽离

- 完成 `RuntimeCore`
- CLI 做最小适配

### 周期 C：默认工具分层

- 让 runtime 从默认工具池解耦

### 周期 D：bridge 协议化

- 把远程入口也挂到 runtime 上

### 周期 E：产品收口

- 瘦身 CLI
- 形成真正 SDK 化结构

---

## 13. 回滚策略

每个阶段都应满足：

- 原 CLI 仍可继续运行
- 新 runtime 路径可渐进启用
- 不一次性删除旧逻辑

建议做法：

- 新建 `runtime/*`，先双轨
- 旧逻辑逐步切流
- 验证稳定后再删除旧实现

---

## 14. 最终交付定义

当以下条件全部满足时，可认定 `hare-code` 已从产品导向仓库进入 SDK 导向仓库：

1. runtime 协议完整
2. runtime core 可独立实例化
3. CLI 只作为宿主壳
4. bridge 只作为接入层
5. 默认工具池与内核分离

届时再进入下一阶段：

- workspace/package 拆分
- 对外发布 SDK
- 多语言绑定
