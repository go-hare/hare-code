import type {
  KernelCapabilityReloadScope,
  KernelRuntimeCapabilityReloadRequest,
} from './capability.js'
import type { KernelConversationId } from './conversation.js'
import type { KernelEvent } from './events.js'
import type { KernelPermissionDecision } from './permissions.js'
import type { KernelRuntimeHostIdentity } from './runtime.js'
import type { KernelTurnId, KernelTurnRunRequest } from './turn.js'

export const KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION = 'kernel.runtime.command.v1'

export type KernelRuntimeCommandType =
  | 'init_runtime'
  | 'connect_host'
  | 'disconnect_host'
  | 'create_conversation'
  | 'run_turn'
  | 'abort_turn'
  | 'decide_permission'
  | 'dispose_conversation'
  | 'reload_capabilities'
  | 'publish_host_event'
  | 'subscribe_events'
  | 'ping'

export type KernelRuntimeCommandBase<TType extends KernelRuntimeCommandType> = {
  schemaVersion: typeof KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION
  type: TType
  requestId: string
  metadata?: Record<string, unknown>
}

export type KernelRuntimeInitCommand =
  KernelRuntimeCommandBase<'init_runtime'> & {
    host?: KernelRuntimeHostIdentity
    workspacePath?: string
    provider?: Record<string, unknown>
    auth?: Record<string, unknown>
    model?: string
    capabilities?: Record<string, unknown>
  }

export type KernelRuntimeHostDisconnectPolicy =
  | 'detach'
  | 'continue'
  | 'abort_active_turns'

export type KernelRuntimeConnectHostCommand =
  KernelRuntimeCommandBase<'connect_host'> & {
    host: KernelRuntimeHostIdentity
    sinceEventId?: string
  }

export type KernelRuntimeDisconnectHostCommand =
  KernelRuntimeCommandBase<'disconnect_host'> & {
    hostId: string
    reason?: string
    policy?: KernelRuntimeHostDisconnectPolicy
  }

export type KernelRuntimeCreateConversationCommand =
  KernelRuntimeCommandBase<'create_conversation'> & {
    conversationId: KernelConversationId
    workspacePath: string
    sessionId?: string
    sessionMeta?: Record<string, unknown>
    capabilityIntent?: Record<string, unknown>
  }

export type KernelRuntimeRunTurnCommand =
  KernelRuntimeCommandBase<'run_turn'> & {
    conversationId: KernelConversationId
    turnId: KernelTurnId
    prompt: KernelTurnRunRequest['prompt']
    attachments?: KernelTurnRunRequest['attachments']
  }

export type KernelRuntimeAbortTurnCommand =
  KernelRuntimeCommandBase<'abort_turn'> & {
    conversationId: KernelConversationId
    turnId: KernelTurnId
    reason?: string
  }

export type KernelRuntimeDecidePermissionCommand =
  KernelRuntimeCommandBase<'decide_permission'> & KernelPermissionDecision

export type KernelRuntimeDisposeConversationCommand =
  KernelRuntimeCommandBase<'dispose_conversation'> & {
    conversationId: KernelConversationId
    reason?: string
  }

export type KernelRuntimeReloadCapabilitiesCommand =
  KernelRuntimeCommandBase<'reload_capabilities'> &
    KernelRuntimeCapabilityReloadRequest & {
      capabilities?: readonly string[]
    }

export type KernelRuntimePublishHostEventCommand =
  KernelRuntimeCommandBase<'publish_host_event'> & {
    event: KernelEvent
  }

export type KernelRuntimeSubscribeEventsCommand =
  KernelRuntimeCommandBase<'subscribe_events'> & {
    conversationId?: KernelConversationId
    turnId?: KernelTurnId
    sinceEventId?: string
    filters?: Record<string, unknown>
  }

export type KernelRuntimePingCommand = KernelRuntimeCommandBase<'ping'>

export type KernelRuntimeCommand =
  | KernelRuntimeInitCommand
  | KernelRuntimeConnectHostCommand
  | KernelRuntimeDisconnectHostCommand
  | KernelRuntimeCreateConversationCommand
  | KernelRuntimeRunTurnCommand
  | KernelRuntimeAbortTurnCommand
  | KernelRuntimeDecidePermissionCommand
  | KernelRuntimeDisposeConversationCommand
  | KernelRuntimeReloadCapabilitiesCommand
  | KernelRuntimePublishHostEventCommand
  | KernelRuntimeSubscribeEventsCommand
  | KernelRuntimePingCommand

export type KernelRuntimeWireReloadScope = KernelCapabilityReloadScope
