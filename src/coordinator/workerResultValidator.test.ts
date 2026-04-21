import { describe, expect, test } from 'bun:test'

import { validateWorkerResult } from './workerResultValidator.js'

describe('workerResultValidator', () => {
  test('adds a failure prefix for failed workers', () => {
    const validated = validateWorkerResult('stack trace', 'failed', 'run tests')

    expect(validated.result).toContain('[WORKER FAILED')
    expect(validated.result).toContain('stack trace')
    expect(validated.wasTruncated).toBe(false)
  })

  test('returns an explicit notice for empty results', () => {
    const validated = validateWorkerResult('', 'completed', 'research task')

    expect(validated.result).toContain('completed but produced no output')
  })

  test('truncates oversized results', () => {
    const validated = validateWorkerResult(
      'a'.repeat(20_000),
      'completed',
      'large task',
    )

    expect(validated.wasTruncated).toBe(true)
    expect(validated.result).toContain('Result truncated')
    expect(validated.result.length).toBeLessThanOrEqual(12_000)
  })
})
