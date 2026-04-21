import type { RuntimeCommandInvocation } from 'src/runtime/contracts/command.js'
import {
  getCommandName,
  isCommandEnabled,
  type Command,
} from 'src/types/command.js'

export type ResolvedRuntimeCommandInteraction = {
  invocation: RuntimeCommandInvocation
  matchingCommand?: Command
  shouldTreatAsImmediate: boolean
}

export function parseRuntimeCommandInvocation(
  input: string,
  source: RuntimeCommandInvocation['source'] = 'repl',
): RuntimeCommandInvocation | undefined {
  const trimmedInput = input.trim()
  if (!trimmedInput.startsWith('/')) {
    return undefined
  }

  const commandText = trimmedInput.slice(1)
  const spaceIndex = commandText.indexOf(' ')
  const name =
    spaceIndex === -1 ? commandText : commandText.slice(0, spaceIndex)

  if (!name) {
    return undefined
  }

  return {
    name,
    args: spaceIndex === -1 ? '' : commandText.slice(spaceIndex + 1).trim(),
    source,
  }
}

export function resolveRuntimeCommandInteraction(options: {
  input: string
  commands: readonly Command[]
  queryIsActive: boolean
  fromKeybinding?: boolean
  source?: RuntimeCommandInvocation['source']
}): ResolvedRuntimeCommandInteraction | undefined {
  const invocation = parseRuntimeCommandInvocation(
    options.input,
    options.source,
  )
  if (!invocation) {
    return undefined
  }

  const matchingCommand = options.commands.find(
    command =>
      isCommandEnabled(command) &&
      (command.name === invocation.name ||
        command.aliases?.includes(invocation.name) ||
        getCommandName(command) === invocation.name),
  )

  return {
    invocation,
    matchingCommand,
    shouldTreatAsImmediate:
      options.queryIsActive &&
      (!!matchingCommand?.immediate || options.fromKeybinding === true),
  }
}
