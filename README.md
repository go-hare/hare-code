# Hare Code

`hare-code` 现在是 SDK-only 包。CLI 已拆到工作区顶层 sibling 包 `../hare-cli`。

## 快速开始

### 依赖

- Node.js
- Bun（仅本地构建时需要）

### 安装

```bash
npm install hare-code
```

CLI 请改用 sibling 包 `hare-cli`。

### 版本联动

当前以 `hare-code` 作为版本真源，`hare-cli` 与 `hare-code-desktop` 都应与它保持同版本号。

```bash
node scripts/sync-sibling-version.mjs --only hare-cli
node scripts/check-sibling-version.mjs --only hare-cli
node scripts/sync-sibling-version.mjs --only hare-code-desktop
node scripts/check-sibling-version.mjs --only hare-code-desktop

# 或一次性同步 / 校验全部 sibling 包
node scripts/sync-sibling-version.mjs
node scripts/check-sibling-version.mjs
```

### 构建

```bash
bun run build
```

构建产物默认输出到：

- `dist/sdk.js`

### SDK 接入

现在可以通过 `hare-code/sdk` 作为通用 runtime/sdk 入口接入。

```ts
import {
  createInMemoryRuntime,
  createRuntimeServer,
  createRuntimeClient,
} from 'hare-code/sdk'

const { client } = await createInMemoryRuntime()
await client.publishHostEvent({
  type: 'system',
  text: 'host ready',
})
const turnId = await client.submitInput({
  text: 'hello runtime',
})
const taskId = await client.submitGoal({
  goal: 'verify task flow',
})
const event = await client.waitEvent(1000)
```

当前这套入口已经覆盖：

- in-memory runtime server
- session create / list / stop
- submit input / interrupt
- submit goal
- publish host event
- task control
- event subscribe / poll / wait / drain

`createHeadlessChatSession()` 当前是**进程级单并发**能力：同一个 Node/Electron 进程里如果需要真正并发跑多个 headless 会话，应改用独立进程或 `RuntimeBridgeServer` 做隔离，而不是在同一进程里直接并发复用多个 headless session。

可以用下面的命令跑最小 smoke：

```bash
bun run smoke:sdk
```

### 生成 SDK Release 包

```bash
npm run release:pack
```

执行后会生成当前目录下的 `hare-code-<version>.tgz`。

### Python SDK Runner 产物

`hare-code` release 还会提供给 Python SDK 使用的 headless SDK runner 二进制：

- `hare-sdk-python-windows-x64.exe`
- `hare-sdk-python-linux-x64`
- `hare-sdk-python-linux-x64-baseline`
- `hare-sdk-python-linux-arm64`
- `hare-sdk-python-darwin-x64`
- `hare-sdk-python-darwin-arm64`

本地可用下面的命令构建：

```bash
node scripts/build-sdk-python-runner.mjs --target windows-x64
```

### CLI

CLI 已移到工作区顶层的 [`hare-cli`](/D:/work/py/reachy_code/hare-cli/README.md)。

## 仓库结构

```text
hare-code/
  src/        # SDK / runtime / bridge / types
  scripts/    # 构建、版本联动与辅助脚本
```

## 本地 workspace 包

以下包不是从 npm registry 单独下载的普通依赖，而是仓库内的本地 workspace 包，需要与主仓库一起存在：

- `@ant/claude-for-chrome-mcp`
- `@ant/computer-use-input`
- `@ant/computer-use-mcp`
- `@ant/computer-use-swift`
- `audio-capture-napi`
- `color-diff-napi`
- `image-processor-napi`
- `modifiers-napi`
- `url-handler-napi`

## 常用命令

```bash
# 构建 SDK
bun run build

# SDK smoke
bun run smoke:sdk

# 统一版本联动
node scripts/check-sibling-version.mjs

# 微信桥接
bun run wechat
bun run wechat:login
```

## 配置

- 复制 `.env.example` 为 `.env`
- 按需修改 API 与模型配置
- 详细环境变量说明见 [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)

## 当前定位

- `hare-code`：SDK 本体仓库，作为版本真源
- `hare-cli`：CLI 宿主 sibling 包，版本跟随 SDK
- `hare-code-desktop`：桌面端宿主 sibling 包，版本跟随 SDK，并直接消费 `hare-code/sdk`

当前仓库目标是先保证：

1. 可以独立 clone
2. 可以独立 `bun install`
3. 可以独立 `bun run build`
4. 可以独立 `bun run smoke:sdk`
