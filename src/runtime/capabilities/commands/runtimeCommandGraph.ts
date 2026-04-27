import type { RuntimeCommandDescriptor } from '../../contracts/command.js'
import {
  getCommandName,
  type Command,
  type CommandAvailability,
} from '../../../types/command.js'

export interface RuntimeCommandGraphEntry {
  descriptor: RuntimeCommandDescriptor
  source?: string
  loadedFrom?: Command['loadedFrom']
  supportsNonInteractive: boolean
  modelInvocable: boolean
}

function toRuntimeCommandKind(
  command: Command,
): RuntimeCommandDescriptor['kind'] {
  if (command.kind === 'workflow') {
    return 'workflow'
  }
  return command.type
}

function toAvailability(
  availability?: CommandAvailability[],
): readonly string[] | undefined {
  return availability?.length ? availability : undefined
}

function supportsNonInteractive(command: Command): boolean {
  switch (command.type) {
    case 'prompt':
      return !command.disableNonInteractive
    case 'local':
      return command.supportsNonInteractive
    case 'local-jsx':
      return false
  }
}

export function toRuntimeCommandDescriptor(
  command: Command,
): RuntimeCommandDescriptor {
  return {
    name: getRuntimeCommandName(command),
    description: getRuntimeCommandDescription(command),
    kind: toRuntimeCommandKind(command),
    aliases: command.aliases,
    availability: toAvailability(command.availability),
    argumentHint: command.argumentHint,
    bridgeSafe: command.bridgeSafe,
    disableModelInvocation: command.disableModelInvocation,
    hidden: getRuntimeCommandHidden(command),
    immediate: command.immediate,
    sensitive: command.isSensitive,
    terminalOnly: command.type === 'local-jsx',
    whenToUse: command.whenToUse,
  }
}

export function createRuntimeCommandGraph(
  commands: readonly Command[],
): RuntimeCommandGraphEntry[] {
  return commands.map(command => ({
    descriptor: toRuntimeCommandDescriptor(command),
    source: 'source' in command ? command.source : undefined,
    loadedFrom: command.loadedFrom,
    supportsNonInteractive: supportsNonInteractive(command),
    modelInvocable: !command.disableModelInvocation,
  }))
}

function getRuntimeCommandName(command: Command): string {
  try {
    return getCommandName(command)
  } catch {
    return command.name
  }
}

function getRuntimeCommandDescription(command: Command): string {
  try {
    return command.description
  } catch {
    return command.name
  }
}

function getRuntimeCommandHidden(command: Command): boolean | undefined {
  try {
    return command.isHidden
  } catch {
    return undefined
  }
}
