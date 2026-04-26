const MAX_URL_LENGTH = 2048

/**
 * Check for a pending URL event from environment variables or CLI arguments.
 *
 * This is a synchronous snapshot check, not an event listener. The optional
 * timeout parameter is retained for API compatibility but has no practical
 * effect because process.env and process.argv do not change at runtime.
 */
export async function waitForUrlEvent(
  timeoutMs?: number,
): Promise<string | null> {
  void timeoutMs
  return findUrlEvent()
}

function findUrlEvent(): string | null {
  for (const key of [
    'CLAUDE_CODE_URL_EVENT',
    'CLAUDE_CODE_DEEP_LINK_URL',
    'CLAUDE_CODE_URL',
  ]) {
    const value = process.env[key]
    if (isClaudeUrl(value)) {
      return value
    }
  }

  const arg = process.argv.find(isClaudeUrl)
  return arg ?? null
}

function isClaudeUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_URL_LENGTH &&
    (value.startsWith('claude-cli://') || value.startsWith('claude://'))
  )
}
