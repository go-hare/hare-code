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

### 推荐安装方式：GitHub Release 二进制 / tarball

最稳定的安装方式是使用 GitHub Release 中上传的二进制或 `.tgz` 发布包，而不是直接从 Git 仓库源码安装。

#### 多平台 release 产物命名

- `hare-code-windows-x64.exe`
- `hare-code-linux-x64`
- `hare-code-linux-x64-baseline`
- `hare-code-linux-arm64`
- `hare-code-darwin-x64`
- `hare-code-darwin-arm64`
- `hare-code-checksums.txt`
- `hare-code-<version>.tgz`

桌面端和 Python SDK 应该优先消费上面的平台二进制；其中 Linux x64 默认建议优先使用 `hare-code-linux-x64-baseline` 以提升兼容性。`.tgz` 主要给 `npm install -g` 场景。

```bash
# 例子：从 GitHub Release 安装 npm tarball
npm install -g https://github.com/go-hare/hare-code/releases/download/v1.0.0/hare-code-1.0.0.tgz
```

这种方式安装的是已经打好的发布工件，不会触发 Git 源码安装时的 workspace / 原生依赖 / 全局安装边界问题。

### Git 直接安装

需要先安装 Bun。即使用 `npm install` 安装，运行 `hare-code` 时也会调用本机 Bun。

Git 安装默认不在安装阶段强制执行预构建；CLI 会优先使用仓库内提交的 `dist/cli.js`。但如果你的环境对 `npm install -g git+https://...` 兼容性较差，优先使用上面的 Release tarball 方案。

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

### 生成 Release 包

```bash
npm run release:pack
node scripts/build-release.mjs --target windows-x64
```

执行后会分别生成：

- 当前目录下的 `hare-code-<version>.tgz`
- `dist/release/` 下的平台二进制

GitHub Actions 发布工作流会按平台矩阵自动生成并上传这些产物。

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
