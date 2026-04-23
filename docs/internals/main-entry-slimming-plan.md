# `main.tsx` 瘦身计划

## 目标

当前内核化主线已经基本完成，`main.tsx` 的主要问题不再是“越过 kernel 边界”，而是**宿主启动编排职责过重**。

本阶段的目标不是继续做 kernelization，而是把 [src/main.tsx](D:/work/py/reachy_code/claude-code/src/main.tsx:1) 从“大宿主编排器”压成“模式分发入口”。

最终希望 `main.tsx` 只负责：

1. 汇总 CLI 解析结果
2. 决定启动模式
3. 调用对应 launcher

## 当前判断

截至 2026-04-23，`main.tsx` 已经完成了 kernel-first 的关键收口，但仍然偏重。

典型例子：

- headless 主链虽然已经改走 kernel surface，但 [src/main.tsx](D:/work/py/reachy_code/claude-code/src/main.tsx:3841) 这一段仍然自己串了：
  - `createDefaultKernelHeadlessEnvironment(...)`
  - `connectDefaultKernelHeadlessMcp(...)`
  - `prepareKernelHeadlessStartup(...)`
  - `runKernelHeadless(...)`

- direct-connect / server 虽然已经过 `src/kernel/serverHost.ts`，但 `main.tsx` 仍然保留了一部分模式级启动编排。

所以当前问题是：

- **边界已经对了**
- **宿主入口还不够薄**

## 设计原则

本阶段遵循以下规则：

1. 不回退 kernel-first
2. 不把宿主逻辑重新塞回 runtime
3. 不在本阶段顺手重构 `bridgeMain.ts`
4. 不把 `main.tsx` 的复杂度转移到一个新的“大而全 launcher”
5. launcher 只做 mode-specific orchestration，不重复 kernel 内部装配

## 分层口径

### `main.tsx`

负责：

- mode dispatch
- launcher 入参组装
- 顶层流程转发

不负责：

- 具体模式的完整启动编排
- 各模式独立的前置准备细节
- 深层 runtime / server / bridge 细节

### `hosts/cli/launchers/*`

负责：

- 模式级启动编排
- 调 kernel API 的顺序控制
- 宿主级状态写回
- 启动成功后的最小宿主行为

### `src/kernel/*`

负责：

- 稳定 host-facing API
- 参数归一化
- 默认装配
- 边界收口

## 推荐目录

建议新增：

- [src/hosts/cli/launchers/](D:/work/py/reachy_code/claude-code/src/hosts/cli/launchers:1)
  - `headlessLauncher.ts`
  - `directConnectLauncher.ts`
  - `serverLauncher.ts`
  - `sharedStartup.ts`

原因：

- 这些逻辑本质上是 CLI 宿主逻辑
- 不应该继续堆在 `main.tsx`
- 也不应全部塞进 kernel

## 分阶段方案

### Phase A：抽 headless launcher

优先级：最高

目标：

把当前 `main.tsx` 中 headless 模式的启动编排抽成独立 launcher。

建议新增：

- [src/hosts/cli/launchers/headlessLauncher.ts](D:/work/py/reachy_code/claude-code/src/hosts/cli/launchers/headlessLauncher.ts:1)

建议收进去的内容：

- `createDefaultKernelHeadlessEnvironment(...)`
- `connectDefaultKernelHeadlessMcp(...)`
- `prepareKernelHeadlessStartup(...)`
- `runKernelHeadless(...)`

完成后 `main.tsx` 只保留：

```ts
await runHeadlessLaunch(...)
return
```

验收标准：

- `main.tsx` 不再自己串 headless 四段式启动
- headless 行为不变
- `modeDispatch.test.ts` 和 headless 相关 smoke 保持通过

### Phase B：抽 direct-connect launcher

优先级：高

建议新增：

- [src/hosts/cli/launchers/directConnectLauncher.ts](D:/work/py/reachy_code/claude-code/src/hosts/cli/launchers/directConnectLauncher.ts:1)

建议收进去的内容：

- `connectDirectHostSession(...)`
- direct-connect 相关 state 写回
- 模式级错误映射与退出策略

验收标准：

- `main.tsx` 不再保留 direct-connect 的完整启动细节
- direct-connect 继续只认 kernel helper

### Phase C：抽 server launcher

优先级：中高

建议新增：

- [src/hosts/cli/launchers/serverLauncher.ts](D:/work/py/reachy_code/claude-code/src/hosts/cli/launchers/serverLauncher.ts:1)

建议收进去的内容：

- `assembleServerHost(...)`
- 启动成功后的宿主输出/生命周期衔接

验收标准：

- `main.tsx` 不再保留 server 启动编排
- server 模式仍以 kernel 作为稳定宿主入口

### Phase D：抽 shared startup

优先级：最后

建议新增：

- [src/hosts/cli/launchers/sharedStartup.ts](D:/work/py/reachy_code/claude-code/src/hosts/cli/launchers/sharedStartup.ts:1)

建议收进去的内容：

- 共用 startup/preAction side effects
- telemetry / profiler checkpoint
- 可复用的模式前置准备

注意：

这一阶段只在确实出现 launcher 之间重复时才做，不要为了“目录完整”提前抽象。

## 不做的事

本阶段明确不包括：

1. `bridgeMain.ts` 瘦身
2. `server/*` 历史兼容层全面清理
3. 第二轮 runtime contracts 深化
4. 新一轮 kernel public surface 收窄
5. 大规模目录搬迁

## 验收标准

当以下条件同时满足时，可认为 `main.tsx` 瘦身阶段完成：

1. `main.tsx` 主要只剩 mode dispatch
2. headless / direct-connect / server 各自有独立 launcher
3. launcher 不绕过 kernel
4. 现有 mode / kernel 相关测试保持通过

## 当前推荐起点

如果只做第一刀，推荐直接开始：

**Phase A：抽 `headlessLauncher.ts`**

原因：

- 收益最大
- 改动边界最清楚
- 已有 kernel headless surface 足够稳定
- 最能直接降低 `main.tsx` 体积和宿主编排复杂度

## 下一阶段优先级

### 1. `src/main.tsx`

继续把以下模式的启动编排往外抽：

- headless
- repl
- remote
- direct-connect

目标：

- 让 `main.tsx` 更像总入口
- 不再承担具体实现层启动细节

### 2. `src/kernel/serverHost.ts`

继续清理以下层之间的重复转发：

- `server/*`
- `hosts/*`
- `runtime/*`

目标：

- 把 direct-connect / server 的稳定入口彻底定死
- 明确谁是宿主正式入口，谁只是兼容出口

### 3. `src/bridge/bridgeMain.ts`

继续瘦身，尽量只保留：

- 参数分发
- UI / log

把以下逻辑继续往 capability / kernel 靠：

- session
- spawn
- retry

目标：

- 让 `bridgeMain.ts` 退回成桥接宿主入口
- 不再继续充当 bridge 全功能中心
