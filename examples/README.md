# Kernel Examples

## `kernel-headless-embed.ts`

Minimal external embedding example for the public kernel headless API.

It demonstrates:

- minimal bootstrap setup
- command / tool / agent loading
- default headless environment construction
- running a single headless kernel session through `src/kernel`

### Run

```powershell
$env:OPENAI_BASE_URL='http://127.0.0.1:8317/v1'
$env:OPENAI_API_KEY='YOUR_KEY'
$env:CLAUDE_CODE_USE_OPENAI='1'
$env:CLAUDE_CODE_SKIP_PROMPT_HISTORY='1'
$env:KERNEL_EXAMPLE_MODEL='gpt-5.4'
bun run examples/kernel-headless-embed.ts "Reply with exactly: kernel-embed-ok"
```

Expected output:

```text
kernel-embed-ok
```
