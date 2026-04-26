import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'child_process'
import { join } from 'path'

const packageRoot = join(import.meta.dir, '../..')
const runScript = `
import { waitForUrlEvent } from './src/index.ts'
const value = await waitForUrlEvent(
  process.env.URL_HANDLER_TEST_TIMEOUT
    ? Number(process.env.URL_HANDLER_TEST_TIMEOUT)
    : undefined,
)
process.stdout.write(value === null ? 'null' : value)
`

function runWaitForUrlEvent(options?: {
  env?: Record<string, string | undefined>
  args?: string[]
}): string {
  const env = { ...process.env }
  delete env.CLAUDE_CODE_URL_EVENT
  delete env.CLAUDE_CODE_DEEP_LINK_URL
  delete env.CLAUDE_CODE_URL
  delete env.URL_HANDLER_TEST_TIMEOUT

  for (const [key, value] of Object.entries(options?.env ?? {})) {
    if (value === undefined) {
      delete env[key]
    } else {
      env[key] = value
    }
  }

  return execFileSync('bun', ['-e', runScript, ...(options?.args ?? [])], {
    cwd: packageRoot,
    env,
    encoding: 'utf8',
  })
}

describe('waitForUrlEvent', () => {
  test('resolves to null without a timeout', () => {
    expect(runWaitForUrlEvent()).toBe('null')
  })

  test('resolves to null with an explicit timeout', () => {
    expect(
      runWaitForUrlEvent({ env: { URL_HANDLER_TEST_TIMEOUT: '1' } }),
    ).toBe('null')
  })

  test('returns a Claude URL from environment variables', () => {
    expect(
      runWaitForUrlEvent({
        env: { CLAUDE_CODE_URL_EVENT: 'claude-cli://prompt?q=hello' },
      }),
    ).toBe('claude-cli://prompt?q=hello')
  })

  test('returns a Claude URL from argv', () => {
    expect(
      runWaitForUrlEvent({ args: ['claude://prompt?q=hello'] }),
    ).toBe('claude://prompt?q=hello')
  })

  test('rejects URLs exceeding the maximum length', () => {
    expect(
      runWaitForUrlEvent({
        env: {
          CLAUDE_CODE_URL_EVENT: `claude-cli://${'x'.repeat(2048)}`,
        },
      }),
    ).toBe('null')
  })
})
