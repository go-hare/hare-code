import { describe, expect, test } from 'bun:test'

import type { Command } from '../../../../types/command.js'
import {
  createRuntimeCommandGraph,
  toRuntimeCommandDescriptor,
} from '../runtimeCommandGraph.js'

describe('runtime command graph', () => {
  test('projects prompt, local, local-jsx, and workflow commands into stable descriptors', () => {
    const promptCommand = createCommand({
      name: 'review',
      type: 'prompt',
      description: 'Review code',
      source: 'builtin',
      progressMessage: 'reviewing',
      contentLength: 12,
      disableModelInvocation: true,
      disableNonInteractive: true,
      whenToUse: 'when reviewing changes',
    })
    const localCommand = createCommand({
      name: 'status',
      type: 'local',
      description: 'Show status',
      supportsNonInteractive: true,
      bridgeSafe: true,
      availability: ['console'],
      argumentHint: '[--json]',
    })
    const jsxCommand = createCommand({
      name: 'theme',
      type: 'local-jsx',
      description: 'Open theme picker',
      aliases: ['color-theme'],
      isSensitive: true,
    })
    const workflowCommand = createCommand({
      name: 'ship',
      type: 'prompt',
      kind: 'workflow',
      description: 'Run release workflow',
      source: 'plugin',
      progressMessage: 'shipping',
      contentLength: 42,
      loadedFrom: 'plugin',
    })

    expect(toRuntimeCommandDescriptor(promptCommand)).toMatchObject({
      name: 'review',
      kind: 'prompt',
      disableModelInvocation: true,
      whenToUse: 'when reviewing changes',
    })
    expect(toRuntimeCommandDescriptor(localCommand)).toMatchObject({
      name: 'status',
      kind: 'local',
      bridgeSafe: true,
      availability: ['console'],
      argumentHint: '[--json]',
    })
    expect(toRuntimeCommandDescriptor(jsxCommand)).toMatchObject({
      name: 'theme',
      kind: 'local-jsx',
      aliases: ['color-theme'],
      sensitive: true,
      terminalOnly: true,
    })
    expect(toRuntimeCommandDescriptor(workflowCommand)).toMatchObject({
      name: 'ship',
      kind: 'workflow',
    })

    expect(
      createRuntimeCommandGraph([
        promptCommand,
        localCommand,
        jsxCommand,
        workflowCommand,
      ]),
    ).toMatchObject([
      {
        descriptor: { name: 'review' },
        supportsNonInteractive: false,
        modelInvocable: false,
      },
      {
        descriptor: { name: 'status' },
        supportsNonInteractive: true,
        modelInvocable: true,
      },
      {
        descriptor: { name: 'theme' },
        supportsNonInteractive: false,
        modelInvocable: true,
      },
      {
        descriptor: { name: 'ship' },
        loadedFrom: 'plugin',
        modelInvocable: true,
      },
    ])
  })
})

function createCommand(command: Partial<Command> & { name: string }): Command {
  return {
    description: command.description ?? command.name,
    isEnabled: () => true,
    ...command,
  } as Command
}
