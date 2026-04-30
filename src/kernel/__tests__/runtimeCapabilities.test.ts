import { describe, expect, test } from 'bun:test'

import {
  createKernelRuntime,
  reloadKernelRuntimeCapabilities,
  resolveKernelRuntimeCapabilities,
  type KernelCapabilityDescriptor,
  type KernelCapabilityReloadScope,
} from '../index.js'

function createCapabilityDescriptor(
  name: string,
  status: KernelCapabilityDescriptor['status'] = 'declared',
  dependencies: readonly string[] = [],
  reloadable = true,
  metadata?: Record<string, unknown>,
): KernelCapabilityDescriptor {
  return {
    name,
    status,
    lazy: status !== 'ready',
    dependencies,
    reloadable,
    metadata,
  }
}

function namesOf(
  views: readonly {
    name: string
  }[],
): readonly string[] {
  return views.map(view => view.name)
}

describe('kernel runtime capability helpers', () => {
  test('resolves raw descriptors into stable capability views', () => {
    const views = resolveKernelRuntimeCapabilities([
      createCapabilityDescriptor('tools', 'declared', ['runtime']),
      createCapabilityDescriptor('runtime', 'ready', [], false),
      createCapabilityDescriptor('kairos', 'disabled', ['events'], true, {
        optional: true,
      }),
      createCapabilityDescriptor('events', 'ready', [], false),
    ])

    expect(namesOf(views)).toEqual(['events', 'runtime', 'tools', 'kairos'])
    expect(views.find(view => view.name === 'tools')).toMatchObject({
      family: 'extension',
      ready: false,
      unavailable: false,
    })
    expect(views.find(view => view.name === 'kairos')).toMatchObject({
      family: 'autonomy',
      optional: true,
      unavailable: true,
    })
  })

  test('reloads and resolves capability views from runtime and facade inputs', async () => {
    const reloadScopes: KernelCapabilityReloadScope[] = []
    let descriptors = [
      createCapabilityDescriptor('runtime', 'ready', [], false),
      createCapabilityDescriptor('events', 'ready', [], false),
      createCapabilityDescriptor('tools', 'declared', ['runtime']),
    ]

    const runtime = await createKernelRuntime({
      id: 'runtime-capability-helper-test',
      workspacePath: process.cwd(),
      eventJournalPath: false,
      conversationJournalPath: false,
      capabilityResolver: {
        listDescriptors: () => descriptors,
        reloadCapabilities: async scope => {
          reloadScopes.push(scope)
          descriptors = descriptors.map(descriptor =>
            scope.type === 'capability' && descriptor.name === scope.name
              ? { ...descriptor, status: 'ready', lazy: false }
              : descriptor,
          )
          return descriptors
        },
      },
    })

    try {
      const initialViews = await reloadKernelRuntimeCapabilities(runtime)
      expect(reloadScopes).toEqual([{ type: 'runtime' }])
      expect(namesOf(initialViews)).toEqual(['events', 'runtime', 'tools'])
      expect(resolveKernelRuntimeCapabilities(runtime)).toEqual(initialViews)

      const reloadedViews = await reloadKernelRuntimeCapabilities(
        runtime.capabilities,
        {
          type: 'capability',
          name: 'tools',
        },
      )

      expect(reloadScopes).toEqual([
        { type: 'runtime' },
        { type: 'capability', name: 'tools' },
      ])
      expect(
        resolveKernelRuntimeCapabilities(runtime.capabilities),
      ).toEqual(reloadedViews)
      expect(reloadedViews.find(view => view.name === 'tools')).toMatchObject({
        ready: true,
        loaded: true,
      })
    } finally {
      await runtime.dispose()
    }
  })
})
