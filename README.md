# Hare Code

`hare-code` 是从原项目中独立拆分出来的本体仓库，既支持源码安装，也支持作为 Git 依赖直接安装。

## 快速开始

### 依赖

- Node.js
- Bun

Windows 安装 Bun：

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

### 安装与运行

```bash
bun install
bun run dev
```

### Git 直接安装

需要先安装 Bun。即使用 `npm install` 安装，运行 `hare-code` 时也会调用本机 Bun。

```bash
# npm
npm install git+https://github.com/go-hare/hare-code.git

# bun
bun add github:go-hare/hare-code
```

安装后可直接执行：

```bash
hare-code --version
```

### 构建

```bash
bun run build
```

构建产物默认输出到 `dist/cli.js`。

### 版本检查

```bash
bun run dev -- --version
```

## 仓库结构

```text
hare-code/
  src/        # CLI 本体与核心逻辑
  packages/   # 本地 workspace 包
  scripts/    # 辅助脚本
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
# 开发模式
bun run dev

# 构建 CLI
bun run build

# 微信桥接
bun run wechat
bun run wechat:login
```

## 配置

- 复制 `.env.example` 为 `.env`
- 按需修改 API 与模型配置
- 详细环境变量说明见 [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)

## 当前定位

- `hare-code`：本体仓库，负责 CLI / core
- `desktop`：单独拆分的桌面端仓库或目录，后续只作为外部调用方

当前仓库目标是先保证：

1. 可以独立 clone
2. 可以独立 `bun install`
3. 可以独立 `bun run dev`
4. 可以独立 `bun run build`
