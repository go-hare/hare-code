import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const adaptersContent = readFileSync(
  join(import.meta.dir, '../adapters.ts'),
  'utf8',
)
const bootstrapProviderContent = readFileSync(
  join(import.meta.dir, '../bootstrapProvider.ts'),
  'utf8',
)
const repoRoot = join(import.meta.dir, '../../../../..')

function collectSourceFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'tests') {
        continue
      }
      files.push(...collectSourceFiles(fullPath))
      continue
    }

    if (entry.isFile() && statSync(fullPath).isFile()) {
      files.push(fullPath)
    }
  }

  return files
}

describe('runtime core state import discipline', () => {
  test('keeps bootstrap singleton wiring out of adapters', () => {
    expect(adaptersContent).not.toContain("from 'src/bootstrap/state.js'")
  })

  test('isolates bootstrap singleton wiring in bootstrapProvider', () => {
    expect(bootstrapProviderContent).toContain(
      "from 'src/bootstrap/state.js'",
    )
  })

  test('assembles bootstrapProvider from explicit runtime-owned state slices', () => {
    expect(bootstrapProviderContent).toContain(
      'createRuntimeSessionIdentityStateProvider()',
    )
    expect(bootstrapProviderContent).toContain(
      'createRuntimeUsageStateProvider()',
    )
    expect(bootstrapProviderContent).toContain(
      'createRuntimePromptStateProvider()',
    )
    expect(bootstrapProviderContent).toContain(
      'createRuntimeRequestDebugStateProvider()',
    )
    expect(bootstrapProviderContent).toContain(
      'createRuntimeHeadlessControlStateProvider()',
    )
    expect(bootstrapProviderContent).toContain(
      'createRuntimeCompactionStateProvider()',
    )
  })

  test('keeps host-only and shared-blocker adapters inside bootstrapProvider', () => {
    expect(bootstrapProviderContent).toContain(
      'createRuntimeKairosStateProvider()',
    )
    expect(bootstrapProviderContent).toContain(
      'createRuntimeUserMessageOptInStateProvider()',
    )
    expect(bootstrapProviderContent).toContain(
      'createRuntimeTeleportStateWriter()',
    )
    expect(bootstrapProviderContent).toContain(
      'createRuntimeSessionPolicyStateWriter()',
    )
    expect(bootstrapProviderContent).toContain(
      'createRuntimeObservabilityStateProvider()',
    )
  })

  test('keeps RuntimeBootstrapStateProvider references isolated to runtime core state', () => {
    const allowed = new Set([
      'src/runtime/contracts/state.ts',
      'src/runtime/core/state/bootstrapProvider.ts',
      'src/runtime/core/state/providers.ts',
    ])

    const offenders = collectSourceFiles(join(repoRoot, 'src'))
      .filter(file => /\.(ts|tsx)$/.test(file))
      .filter(
        file =>
          relative(repoRoot, file).startsWith('src/runtime/') ||
          relative(repoRoot, file).startsWith('src/kernel/'),
      )
      .filter(file =>
        readFileSync(file, 'utf8').includes('RuntimeBootstrapStateProvider'),
      )
      .map(file => relative(repoRoot, file).replaceAll('\\', '/'))
      .filter(file => !allowed.has(file))

    expect(offenders).toEqual([])
  })

  test('keeps direct bootstrap singleton imports isolated to bootstrapProvider', () => {
    const offenders = collectSourceFiles(join(repoRoot, 'src'))
      .filter(file => /\.(ts|tsx)$/.test(file))
      .filter(
        file =>
          relative(repoRoot, file).startsWith('src/runtime/') ||
          relative(repoRoot, file).startsWith('src/kernel/'),
      )
      .filter(file =>
        readFileSync(file, 'utf8').includes("from 'src/bootstrap/state.js'"),
      )
      .map(file => relative(repoRoot, file).replaceAll('\\', '/'))
      .filter(file => file !== 'src/runtime/core/state/bootstrapProvider.ts')

    expect(offenders).toEqual([])
  })
})
