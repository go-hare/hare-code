# 内核化现状与收口计划

## 口径

本文使用的判断口径如下：

- CLI 是内核的基本功能之一，也是官方主宿主
- 内核化不是把 CLI 边缘化，而是把可复用能力从 CLI/REPL 私有实现里持续下沉
- 对外稳定接入面优先通过 `src/kernel`
- `src/runtime` 是内部能力层，允许继续演进

在这个口径下，判断重点不是“CLI 是否还在主链里”，而是：

1. 执行、server、bridge、daemon、tools、mcp 等能力是否已经从历史主链实现里抽离
2. `src/kernel` 是否已经成为稳定 façade
3. 顶层宿主是否正在逐步收口到 kernel-first 的调用方式

## 当前判断

当前仓库的内核化大约在 **80% 到 85%**，已处于**主结构完成、剩余收口**阶段。

一句话概括：

> 当前项目已经从“围绕 CLI 堆叠能力”演进到“CLI 主宿主 + runtime 内核 + kernel 稳定接入面”的结构，后续重点是入口归属、测试护栏和发布边界收口，而不是重做架构。

## 已完成的主干

### 1. runtime 分层已经形成

当前 `src/runtime` 已经拆出较清晰的能力分层：

- `contracts`
- `capabilities`
- `core/state`

这意味着执行、server、bridge、daemon、tools、mcp 等核心能力已经有了统一的内部归属，而不是继续散落在 CLI 主链中。

### 2. 执行中枢已经下沉

`QueryEngine` 现在本质上是 `SessionRuntime` 的兼容壳，说明执行中枢已经开始从历史入口抽离，统一收敛到 runtime capability。

### 3. server / direct-connect 已经 runtime 化

当前 `server` 和 `createDirectConnectSession` 都已经是对 runtime capability 的转发，而不是历史孤立实现。

### 4. kernel façade 已经成型

`src/kernel` 已经统一暴露：

- headless
- direct-connect
- server
- bridge
- daemon

README 和 examples 也已经开始按这个口径对外描述和使用。

### 5. CLI 仍是主宿主，但不再承担全部抽象

当前方向不是弱化 CLI，而是让 CLI 继续作为官方交互宿主，同时让其他宿主不必直接依赖 `main.tsx`、`REPL.tsx` 或 CLI 专属装配逻辑。

## 当前还差什么

### 1. headless 执行入口仍借道 CLI 模块

`runKernelHeadless()` 目前仍复用 `cli/print.ts` 中的 `runHeadless()`。

这不是方向错误，但说明 headless 的最终执行入口在模块归属上还没有完全收口到 runtime/kernel 名义下。

### 2. direct-connect / server 的宿主装配还没有完全 kernel-first

虽然底层实现已经 runtime 化，但 `main.tsx` 和 CLI host command 仍有部分路径直接装配 `server/*` 细节。

当前问题不在“能力没有抽出来”，而在“顶层宿主入口还没有统一经过 kernel”。

### 3. bridge / daemon 顶层入口仍有 runtime 深路径依赖

`bridgeMain.ts`、`createSession.ts`、`workerRegistry.ts` 等顶层文件仍直接引用 runtime capability 深路径。

这部分也已具备 kernel façade，但还没有完全形成“顶层宿主只认 kernel”的边界。

### 4. kernel 公开面缺少专门的 contract tests

当前测试更多是功能性和间接覆盖，缺少围绕 `src/kernel` 公开面建立的专门回归护栏。

这会让结构收口后的稳定性更多依赖经验，而不是显式接口约束。

### 5. kernel 仍主要是源码级稳定面，还不是发布级稳定面

当前构建与发布形态仍以 CLI 为主，`package.json` 和 `build.ts` 还没有把 kernel 明确提升为包级稳定导出面。

## 收口原则

后续收口应遵循以下原则：

1. 先收调用入口，再决定是否搬实现
2. 先统一顶层宿主引用，再清理内部深路径
3. 不把“入口收口”和“发布导出”混成一个提交
4. 不在第一刀中物理大搬 `cli/print.ts`
5. 等接口边界稳定后再补 contract tests

## 建议的 5 个 commit

### Commit 1

`refactor(kernel): 收口 headless 入口`

目标：

- 让 `main.tsx` 和 kernel headless 主链不再直接依赖 `cli/print.ts`
- 先建立 runtime 级的 headless 入口，再决定是否进一步搬迁实现

建议涉及文件：

- `src/main.tsx`
- `src/kernel/headless.ts`
- `src/runtime/capabilities/execution/index.ts`
- `src/runtime/capabilities/execution/HeadlessRuntime.ts`（建议新增）
- `src/cli/print.ts`

验收标准：

- `main.tsx` 不再直接动态导入 `src/cli/print.js`
- `runKernelHeadless()` 不再直接引用 CLI 命名模块
- `examples/kernel-headless-embed.ts` 保持可用

### Commit 2

`refactor(kernel): 统一直连与服务宿主装配`

目标：

- 让 direct-connect / server 的顶层宿主装配更明确地经过 kernel
- 减少 CLI host command 对 `server/*` 装配细节的直接拼接

建议涉及文件：

- `src/main.tsx`
- `src/kernel/index.ts`
- `src/kernel/serverHost.ts`（建议新增）
- `src/hosts/cli/registerCliHostCommands.ts`
- `src/server/createDirectConnectSession.ts`
- `src/server/server.ts`

验收标准：

- `main.tsx` 的 direct-connect 主链只从 kernel 取入口
- CLI `server` / `open` 相关命令优先使用 kernel 暴露的能力
- `examples/kernel-direct-connect.ts` 保持可用

### Commit 3

`refactor(kernel): 收口 bridge 与 daemon 顶层入口`

目标：

- bridge / daemon 顶层宿主不再直接引用 runtime capability 深路径
- 顶层统一通过 kernel façade 访问桥接和守护能力

建议涉及文件：

- `src/bridge/bridgeMain.ts`
- `src/bridge/createSession.ts`
- `src/daemon/workerRegistry.ts`
- `src/kernel/bridge.ts`
- `src/kernel/daemon.ts`

验收标准：

- bridge / daemon 顶层入口不再直接 import runtime bridge/daemon 深路径
- 相关顶层类型与 helper 都能从 kernel 获取

### Commit 4

`test(kernel): 补 kernel contract tests`

目标：

- 为 `src/kernel` 公开面建立独立护栏
- 防止后续宿主回退到深路径调用

建议涉及文件：

- `src/kernel/__tests__/headless.test.ts`（建议新增）
- `src/kernel/__tests__/surface.test.ts`（建议新增）
- `tests/integration/kernel-headless.test.ts`（可选）
- `tests/integration/kernel-direct-connect.test.ts`（可选）

验收标准：

- headless 和 direct-connect 至少各有一条显式 kernel 回归
- `src/kernel` 公开面有最小 surface 断言

### Commit 5

`chore(build): 将 kernel 升级为发布级入口`

目标：

- 把今天的“源码级稳定面”升级为“包级稳定面”
- 在不破坏 CLI 分发主链的前提下，为 kernel 建立正式导出边界

建议涉及文件：

- `package.json`
- `build.ts`
- `tsconfig.build.json`（建议新增）
- `README.md`
- `README_EN.md`
- `examples/README.md`

验收标准：

- package 具备明确的 kernel export
- build 产物包含 kernel 入口和类型产物
- 至少有一个最小 consumer 能从包级入口导入 kernel

## 推荐落刀顺序

推荐严格按以下顺序推进：

1. headless 入口收口
2. direct-connect / server 宿主装配收口
3. bridge / daemon 顶层入口收口
4. kernel contract tests
5. kernel 发布级导出

原因：

- 第 1 到 3 步解决的是“谁是正式入口”
- 第 4 步解决的是“接口稳定性如何被约束”
- 第 5 步解决的是“如何作为正式导出面对外发布”

如果提前做第 5 步，就容易把一个仍在演进的源码接口过早固定成发布承诺。

## 当前结论

按当前项目的设计目标，CLI 仍然是 kernel 的一部分，而不是 kernel 化的反例。

因此，当前阶段更准确的判断不是“CLI 还没退场，所以内核化不彻底”，而是：

> CLI 主宿主地位已经明确，runtime 能力抽离已经基本完成，kernel façade 已经成型；现在真正剩下的是最后一轮入口归属、测试护栏和发布边界收口。
