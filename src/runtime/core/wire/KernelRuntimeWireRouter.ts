import type {
  KernelCapabilityDescriptor,
  KernelCapabilityName,
  KernelRuntimeCapabilityReloadRequest,
} from '../../contracts/capability.js'
import type {
  RuntimeAgentDescriptor,
  RuntimeAgentRegistrySnapshot,
  RuntimeAgentRunCancelRequest,
  RuntimeAgentRunCancelResult,
  RuntimeAgentRunDescriptor,
  RuntimeAgentRunListSnapshot,
  RuntimeAgentRunOutput,
  RuntimeAgentRunOutputRequest,
  RuntimeAgentSpawnRequest,
  RuntimeAgentSpawnResult,
} from '../../contracts/agent.js'
import type {
  RuntimeCommandExecuteRequest,
  RuntimeCommandExecutionResult,
  RuntimeCommandGraphEntry,
} from '../../contracts/command.js'
import type {
  KernelConversationId,
  KernelConversationSnapshot,
} from '../../contracts/conversation.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../../contracts/events.js'
import type {
  RuntimeHookDescriptor,
  RuntimeHookMutationResult,
  RuntimeHookRegistrySnapshot,
  RuntimeHookRegisterRequest,
  RuntimeHookRunRequest,
  RuntimeHookRunResult,
} from '../../contracts/hook.js'
import type {
  RuntimeMcpAuthRequest,
  RuntimeMcpConnectRequest,
  RuntimeMcpLifecycleResult,
  RuntimeMcpRegistrySnapshot,
  RuntimeMcpResourceRef,
  RuntimeMcpServerRef,
  RuntimeMcpSetEnabledRequest,
  RuntimeMcpToolBinding,
} from '../../contracts/mcp.js'
import type {
  KernelRuntimeHostIdentity,
  KernelRuntimeId,
} from '../../contracts/runtime.js'
import type {
  RuntimePluginCatalogSnapshot,
  RuntimePluginDescriptor,
  RuntimePluginErrorDescriptor,
  RuntimePluginInstallRequest,
  RuntimePluginMutationResult,
  RuntimePluginSetEnabledRequest,
  RuntimePluginUninstallRequest,
  RuntimePluginUpdateRequest,
} from '../../contracts/plugin.js'
import type {
  KernelPermissionDecision,
  KernelPermissionRequest,
  KernelPermissionRequestId,
} from '../../contracts/permissions.js'
import type {
  RuntimeSkillCatalogSnapshot,
  RuntimeSkillDescriptor,
  RuntimeSkillPromptContextRequest,
  RuntimeSkillPromptContextResult,
} from '../../contracts/skill.js'
import type {
  RuntimeTaskAssignRequest,
  RuntimeTaskCreateRequest,
  RuntimeTaskDescriptor,
  RuntimeTaskListSnapshot,
  RuntimeTaskMutationResult,
  RuntimeTaskUpdateRequest,
} from '../../contracts/task.js'
import type { KernelTurnId, KernelTurnSnapshot } from '../../contracts/turn.js'
import type {
  KernelRuntimeCommand,
  KernelRuntimeConnectHostCommand,
  KernelRuntimeCreateConversationCommand,
  KernelRuntimeDisconnectHostCommand,
  KernelRuntimeHostDisconnectPolicy,
  KernelRuntimeRunTurnCommand,
  KernelRuntimeSubscribeEventsCommand,
} from '../../contracts/wire.js'
import type {
  RuntimeToolCallRequest,
  RuntimeToolCallResult,
  RuntimeToolDescriptor,
} from '../../contracts/tool.js'
import { RuntimeConversationBusyError } from '../conversation/RuntimeConversation.js'
import {
  RuntimeEventBus,
  RuntimeEventReplayError,
} from '../events/RuntimeEventBus.js'
import {
  KernelRuntimeWireCommandParseError,
  parseKernelRuntimeCommandLine,
  parseKernelRuntimeCommand,
} from './KernelRuntimeWireCodec.js'

export type KernelRuntimeWireConversationOptions = {
  runtimeId: KernelRuntimeId
  conversationId: KernelConversationId
  workspacePath: string
  sessionId?: string
  initialSnapshot?: KernelConversationSnapshot
  initialActiveTurnSnapshot?: KernelTurnSnapshot
  eventBus: RuntimeEventBus
}

export type KernelRuntimeWireConversation = {
  readonly id: KernelConversationId
  readonly activeTurnId: KernelTurnId | undefined
  snapshot(): KernelConversationSnapshot
  runTurn(request: {
    turnId: KernelTurnId
    prompt: string | readonly unknown[]
    attachments?: readonly unknown[]
    metadata?: Record<string, unknown>
  }): KernelTurnSnapshot
  completeTurn(
    turnId: KernelTurnId,
    stopReason?: string | null,
  ): KernelTurnSnapshot
  failTurn(turnId: KernelTurnId, error: unknown): KernelTurnSnapshot
  abortTurn(turnId: KernelTurnId, reason?: string): KernelTurnSnapshot
  dispose(reason?: string): Promise<void>
}

export type KernelRuntimeWireTurnExecutionEvent =
  | {
      type: 'output'
      payload: unknown
      replayable?: boolean
      metadata?: Record<string, unknown>
    }
  | {
      type: 'event'
      event: Omit<KernelEvent, 'runtimeId' | 'conversationId' | 'turnId'> &
        Partial<Pick<KernelEvent, 'runtimeId' | 'conversationId' | 'turnId'>>
    }
  | {
      type: 'completed'
      stopReason?: string | null
      metadata?: Record<string, unknown>
    }
  | {
      type: 'failed'
      error: unknown
      metadata?: Record<string, unknown>
    }

export type KernelRuntimeWireTurnExecutionResult =
  | void
  | Promise<void>
  | AsyncIterable<KernelRuntimeWireTurnExecutionEvent>

export type KernelRuntimeWireTurnExecutionContext = {
  command: Extract<KernelRuntimeCommand, { type: 'run_turn' }>
  conversation: KernelRuntimeWireConversation
  eventBus: RuntimeEventBus
  permissionBroker?: KernelRuntimeWirePermissionBroker
  signal: AbortSignal
}

export type KernelRuntimeWireTurnExecutor = (
  context: KernelRuntimeWireTurnExecutionContext,
) => KernelRuntimeWireTurnExecutionResult

type Awaitable<T> = T | Promise<T>

export type KernelRuntimeWireCommandCatalog = {
  listCommands(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<readonly RuntimeCommandGraphEntry[]>
  executeCommand?(
    request: RuntimeCommandExecuteRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeCommandExecutionResult>
}

export type KernelRuntimeWireToolCatalog = {
  listTools(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<readonly RuntimeToolDescriptor[]>
  callTool?(
    request: RuntimeToolCallRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeToolCallResult>
}

export type KernelRuntimeWireMcpRegistry = {
  listServers(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<readonly RuntimeMcpServerRef[]>
  listResources(
    serverName?: string,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<readonly RuntimeMcpResourceRef[]>
  listToolBindings(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<readonly RuntimeMcpToolBinding[]>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<void | Partial<RuntimeMcpRegistrySnapshot>>
  connectServer?(
    request: RuntimeMcpConnectRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeMcpLifecycleResult>
  authenticateServer?(
    request: RuntimeMcpAuthRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeMcpLifecycleResult>
  setServerEnabled?(
    request: RuntimeMcpSetEnabledRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeMcpLifecycleResult>
}

export type KernelRuntimeWireHookCatalog = {
  listHooks(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<readonly RuntimeHookDescriptor[]>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<void | Partial<RuntimeHookRegistrySnapshot>>
  runHook?(
    request: RuntimeHookRunRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeHookRunResult>
  registerHook?(
    request: RuntimeHookRegisterRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeHookMutationResult>
}

export type KernelRuntimeWireSkillCatalog = {
  listSkills(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<readonly RuntimeSkillDescriptor[]>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<void | Partial<RuntimeSkillCatalogSnapshot>>
  resolvePromptContext?(
    request: RuntimeSkillPromptContextRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeSkillPromptContextResult>
}

export type KernelRuntimeWirePluginCatalog = {
  listPlugins(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<{
    plugins: readonly RuntimePluginDescriptor[]
    errors?: readonly RuntimePluginErrorDescriptor[]
  }>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<void | Partial<RuntimePluginCatalogSnapshot>>
  setPluginEnabled?(
    request: RuntimePluginSetEnabledRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimePluginMutationResult>
  installPlugin?(
    request: RuntimePluginInstallRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimePluginMutationResult>
  uninstallPlugin?(
    request: RuntimePluginUninstallRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimePluginMutationResult>
  updatePlugin?(
    request: RuntimePluginUpdateRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimePluginMutationResult>
}

export type KernelRuntimeWireAgentRegistry = {
  listAgents(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<RuntimeAgentRegistrySnapshot>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<void | Partial<RuntimeAgentRegistrySnapshot>>
  spawnAgent?(
    request: RuntimeAgentSpawnRequest,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeAgentSpawnResult>
  listAgentRuns?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<RuntimeAgentRunListSnapshot>
  getAgentRun?(
    runId: string,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeAgentRunDescriptor | null>
  getAgentOutput?(
    request: RuntimeAgentRunOutputRequest,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeAgentRunOutput>
  cancelAgentRun?(
    request: RuntimeAgentRunCancelRequest,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeAgentRunCancelResult>
}

export type KernelRuntimeWireTaskRegistry = {
  listTasks(
    taskListId?: string,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeTaskListSnapshot>
  getTask(
    taskId: string,
    taskListId?: string,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeTaskDescriptor | null>
  createTask?(
    request: RuntimeTaskCreateRequest,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeTaskMutationResult>
  updateTask?(
    request: RuntimeTaskUpdateRequest,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeTaskMutationResult>
  assignTask?(
    request: RuntimeTaskAssignRequest,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeTaskMutationResult>
}

export type KernelRuntimeWireRouterOptions = {
  runtimeId: KernelRuntimeId
  workspacePath: string
  eventBus?: RuntimeEventBus
  conversationSnapshotStore?: KernelRuntimeWireConversationSnapshotStore
  capabilityResolver?: KernelRuntimeWireCapabilityResolver
  commandCatalog?: KernelRuntimeWireCommandCatalog
  toolCatalog?: KernelRuntimeWireToolCatalog
  mcpRegistry?: KernelRuntimeWireMcpRegistry
  hookCatalog?: KernelRuntimeWireHookCatalog
  skillCatalog?: KernelRuntimeWireSkillCatalog
  pluginCatalog?: KernelRuntimeWirePluginCatalog
  agentRegistry?: KernelRuntimeWireAgentRegistry
  taskRegistry?: KernelRuntimeWireTaskRegistry
  permissionBroker?: KernelRuntimeWirePermissionBroker
  runTurnExecutor?: KernelRuntimeWireTurnExecutor
  createConversation(
    options: KernelRuntimeWireConversationOptions,
    command: KernelRuntimeCreateConversationCommand,
  ): KernelRuntimeWireConversation
}

type KernelRuntimeWireHostState = 'connected' | 'disconnected'

type KernelRuntimeWireHostRecord = {
  identity: KernelRuntimeHostIdentity
  state: KernelRuntimeWireHostState
  connectCount: number
  disconnectReason?: string
  disconnectPolicy?: KernelRuntimeHostDisconnectPolicy
}

export type KernelRuntimeWireConversationRecoverySnapshot = {
  conversation: KernelConversationSnapshot
  activeTurn?: KernelTurnSnapshot
  activeExecution?: KernelRuntimeRunTurnCommand
}

export type KernelRuntimeWireConversationSnapshotStore = {
  readLatest(
    conversationId: KernelConversationId,
  ): Awaitable<KernelRuntimeWireConversationRecoverySnapshot | undefined>
  append(
    snapshot: KernelRuntimeWireConversationRecoverySnapshot,
  ): Awaitable<void>
}

export type KernelRuntimeWireCapabilityResolver = {
  listDescriptors(): readonly KernelCapabilityDescriptor[]
  requireCapability?(
    name: KernelCapabilityName,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<unknown>
  reloadCapabilities(
    scope: KernelRuntimeCapabilityReloadRequest['scope'],
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<readonly KernelCapabilityDescriptor[]>
}

export type KernelRuntimeWirePermissionBroker = {
  requestPermission(
    request: KernelPermissionRequest,
  ): Promise<KernelPermissionDecision>
  decide(decision: KernelPermissionDecision): KernelPermissionDecision
  snapshot?(): {
    pendingRequestIds: KernelPermissionRequestId[]
    finalizedRequestIds: KernelPermissionRequestId[]
  }
}

export class KernelRuntimeWireRouter {
  readonly eventBus: RuntimeEventBus
  private readonly conversations = new Map<
    KernelConversationId,
    KernelRuntimeWireConversation
  >()
  private readonly activeExecutions = new Map<string, AbortController>()
  private readonly hosts = new Map<string, KernelRuntimeWireHostRecord>()

  constructor(private readonly options: KernelRuntimeWireRouterOptions) {
    this.eventBus =
      options.eventBus ??
      new RuntimeEventBus({
        runtimeId: options.runtimeId,
      })
  }

  async handleCommand(
    command: KernelRuntimeCommand,
  ): Promise<KernelRuntimeEnvelopeBase[]> {
    try {
      switch (command.type) {
        case 'ping':
          return [this.eventBus.pong({ requestId: command.requestId })]
        case 'init_runtime':
          return this.handleInit(command.requestId)
        case 'connect_host':
          return this.handleConnectHost(command)
        case 'disconnect_host':
          return [await this.handleDisconnectHost(command)]
        case 'create_conversation':
          return [await this.handleCreateConversation(command)]
        case 'run_turn':
          return [await this.handleRunTurn(command)]
        case 'abort_turn':
          return [await this.handleAbortTurn(command)]
        case 'decide_permission':
          return [this.handleDecidePermission(command)]
        case 'dispose_conversation':
          return [await this.handleDisposeConversation(command)]
        case 'subscribe_events':
          return this.handleSubscribeEvents(command)
        case 'reload_capabilities':
          return [await this.handleReloadCapabilities(command)]
        case 'list_commands':
          return [await this.handleListCommands(command)]
        case 'execute_command':
          return [await this.handleExecuteCommand(command)]
        case 'list_tools':
          return [await this.handleListTools(command)]
        case 'call_tool':
          return [await this.handleCallTool(command)]
        case 'list_mcp_servers':
          return [await this.handleListMcpServers(command)]
        case 'list_mcp_tools':
          return [await this.handleListMcpTools(command)]
        case 'list_mcp_resources':
          return [await this.handleListMcpResources(command)]
        case 'reload_mcp':
          return [await this.handleReloadMcp(command)]
        case 'connect_mcp':
          return [await this.handleConnectMcp(command)]
        case 'authenticate_mcp':
          return [await this.handleAuthenticateMcp(command)]
        case 'set_mcp_enabled':
          return [await this.handleSetMcpEnabled(command)]
        case 'list_hooks':
          return [await this.handleListHooks(command)]
        case 'reload_hooks':
          return [await this.handleReloadHooks(command)]
        case 'run_hook':
          return [await this.handleRunHook(command)]
        case 'register_hook':
          return [await this.handleRegisterHook(command)]
        case 'list_skills':
          return [await this.handleListSkills(command)]
        case 'reload_skills':
          return [await this.handleReloadSkills(command)]
        case 'resolve_skill_context':
          return [await this.handleResolveSkillContext(command)]
        case 'list_plugins':
          return [await this.handleListPlugins(command)]
        case 'reload_plugins':
          return [await this.handleReloadPlugins(command)]
        case 'set_plugin_enabled':
          return [await this.handleSetPluginEnabled(command)]
        case 'install_plugin':
          return [await this.handleInstallPlugin(command)]
        case 'uninstall_plugin':
          return [await this.handleUninstallPlugin(command)]
        case 'update_plugin':
          return [await this.handleUpdatePlugin(command)]
        case 'list_agents':
          return [await this.handleListAgents(command)]
        case 'reload_agents':
          return [await this.handleReloadAgents(command)]
        case 'spawn_agent':
          return [await this.handleSpawnAgent(command)]
        case 'list_agent_runs':
          return [await this.handleListAgentRuns(command)]
        case 'get_agent_run':
          return [await this.handleGetAgentRun(command)]
        case 'get_agent_output':
          return [await this.handleGetAgentOutput(command)]
        case 'cancel_agent_run':
          return [await this.handleCancelAgentRun(command)]
        case 'list_tasks':
          return [await this.handleListTasks(command)]
        case 'get_task':
          return [await this.handleGetTask(command)]
        case 'create_task':
          return [await this.handleCreateTask(command)]
        case 'update_task':
          return [await this.handleUpdateTask(command)]
        case 'assign_task':
          return [await this.handleAssignTask(command)]
        case 'publish_host_event':
          return [this.handlePublishHostEvent(command)]
      }
    } catch (error) {
      return [this.mapError(command, error)]
    }
  }

  async handleMessage(message: unknown): Promise<KernelRuntimeEnvelopeBase[]> {
    try {
      return await this.handleCommand(parseKernelRuntimeCommand(message))
    } catch (error) {
      if (error instanceof KernelRuntimeWireCommandParseError) {
        return [
          this.eventBus.error({
            requestId: error.requestId,
            code: 'schema_mismatch',
            message: error.message,
            retryable: false,
            details: error.details,
          }),
        ]
      }
      return [
        this.eventBus.error({
          code: 'internal_error',
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        }),
      ]
    }
  }

  async handleCommandLine(line: string): Promise<KernelRuntimeEnvelopeBase[]> {
    try {
      return await this.handleCommand(parseKernelRuntimeCommandLine(line))
    } catch (error) {
      if (error instanceof KernelRuntimeWireCommandParseError) {
        return [
          this.eventBus.error({
            requestId: error.requestId,
            code: 'schema_mismatch',
            message: error.message,
            retryable: false,
            details: error.details,
          }),
        ]
      }
      return [
        this.eventBus.error({
          code: 'internal_error',
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        }),
      ]
    }
  }

  private handleInit(requestId: string): KernelRuntimeEnvelopeBase[] {
    const ack = this.eventBus.ack({
      requestId,
      payload: {
        runtimeId: this.options.runtimeId,
        state: 'ready',
      },
    })
    this.eventBus.emit({
      type: 'runtime.ready',
      replayable: true,
      payload: {
        runtimeId: this.options.runtimeId,
        workspacePath: this.options.workspacePath,
      },
    })
    return [ack]
  }

  private handleConnectHost(
    command: KernelRuntimeConnectHostCommand,
  ): KernelRuntimeEnvelopeBase[] {
    const replay = this.replayRuntimeScopedEvents(command.sinceEventId)
    const previous = this.hosts.get(command.host.id)
    const record: KernelRuntimeWireHostRecord = {
      identity: command.host,
      state: 'connected',
      connectCount: (previous?.connectCount ?? 0) + 1,
    }
    this.hosts.set(command.host.id, record)
    this.eventBus.emit({
      type: previous ? 'host.reconnected' : 'host.connected',
      replayable: true,
      payload: sanitizeWirePayload({
        host: command.host,
        previousState: previous?.state,
        replayedEvents: replay.length,
        sinceEventId: command.sinceEventId,
      }),
      metadata: command.metadata,
    })
    const ack = this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({
        connected: true,
        hostId: command.host.id,
        state: record.state,
        previousState: previous?.state,
        replayedEvents: replay.length,
      }),
    })
    return [ack, ...replay]
  }

  private async handleDisconnectHost(
    command: KernelRuntimeDisconnectHostCommand,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const host = this.requireHost(command.hostId, command.requestId)
    const policy = command.policy ?? 'detach'
    const abortedTurnIds =
      policy === 'abort_active_turns'
        ? await this.abortActiveTurnsForHostDisconnect(command)
        : []
    const record: KernelRuntimeWireHostRecord = {
      ...host,
      state: 'disconnected',
      disconnectReason: command.reason,
      disconnectPolicy: policy,
    }
    this.hosts.set(command.hostId, record)
    this.eventBus.emit({
      type: 'host.disconnected',
      replayable: true,
      payload: sanitizeWirePayload({
        hostId: command.hostId,
        policy,
        reason: command.reason,
        abortedTurnIds,
      }),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({
        disconnected: true,
        hostId: command.hostId,
        policy,
        reason: command.reason,
        abortedTurnIds,
      }),
    })
  }

  private async handleCreateConversation(
    command: KernelRuntimeCreateConversationCommand,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const existing = this.conversations.get(command.conversationId)
    if (existing) {
      this.assertExistingConversationMatches(existing, command)
      return this.eventBus.ack({
        requestId: command.requestId,
        conversationId: existing.id,
        payload: sanitizeWirePayload(existing.snapshot()),
      })
    }
    await this.requireCapabilityIntent(command)
    const recoveredSnapshot = await this.readRecoveredConversation(command)
    const sessionId =
      command.sessionId ?? recoveredSnapshot?.conversation.sessionId

    const conversation = this.options.createConversation(
      {
        runtimeId: this.options.runtimeId,
        conversationId: command.conversationId,
        workspacePath: command.workspacePath,
        sessionId,
        initialSnapshot: recoveredSnapshot?.conversation,
        initialActiveTurnSnapshot: recoveredSnapshot?.activeTurn,
        eventBus: this.eventBus,
      },
      command,
    )
    this.conversations.set(conversation.id, conversation)
    await this.recordConversationSnapshot(
      conversation,
      recoveredSnapshot?.activeTurn,
      recoveredSnapshot?.activeExecution,
    )
    if (recoveredSnapshot?.activeExecution && recoveredSnapshot.activeTurn) {
      this.startTurnExecution(
        recoveredSnapshot.activeExecution,
        conversation,
        recoveredSnapshot.activeTurn,
      )
    }
    return this.eventBus.ack({
      requestId: command.requestId,
      conversationId: conversation.id,
      payload: sanitizeWirePayload(conversation.snapshot()),
    })
  }

  private async handleRunTurn(
    command: Extract<KernelRuntimeCommand, { type: 'run_turn' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const conversation = this.requireConversation(
      command.conversationId,
      command.requestId,
    )
    const snapshot = conversation.runTurn({
      turnId: command.turnId,
      prompt: command.prompt,
      attachments: command.attachments,
      metadata: command.metadata,
    })
    await this.recordConversationSnapshot(conversation, snapshot, command)
    this.startTurnExecution(command, conversation, snapshot)
    return this.eventBus.ack({
      requestId: command.requestId,
      conversationId: command.conversationId,
      turnId: command.turnId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleAbortTurn(
    command: Extract<KernelRuntimeCommand, { type: 'abort_turn' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const conversation = this.requireConversation(
      command.conversationId,
      command.requestId,
    )
    const snapshot = conversation.abortTurn(command.turnId, command.reason)
    await this.recordConversationSnapshot(conversation, snapshot)
    this.activeExecutions
      .get(this.turnExecutionKey(command.conversationId, command.turnId))
      ?.abort(command.reason ?? 'aborted')
    return this.eventBus.ack({
      requestId: command.requestId,
      conversationId: command.conversationId,
      turnId: command.turnId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private handleDecidePermission(
    command: Extract<KernelRuntimeCommand, { type: 'decide_permission' }>,
  ): KernelRuntimeEnvelopeBase {
    if (!this.options.permissionBroker) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Permission broker is not available',
        retryable: false,
      })
    }

    const decision = this.options.permissionBroker.decide(command)
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(decision),
    })
  }

  private async handleDisposeConversation(
    command: Extract<KernelRuntimeCommand, { type: 'dispose_conversation' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const conversation = this.requireConversation(
      command.conversationId,
      command.requestId,
    )
    await conversation.dispose(command.reason)
    await this.recordConversationSnapshot(conversation)
    this.conversations.delete(command.conversationId)
    for (const [key, controller] of this.activeExecutions) {
      if (key.startsWith(`${command.conversationId}:`)) {
        controller.abort(command.reason ?? 'conversation_disposed')
        this.activeExecutions.delete(key)
      }
    }
    return this.eventBus.ack({
      requestId: command.requestId,
      conversationId: command.conversationId,
      payload: { disposed: true },
    })
  }

  private handleSubscribeEvents(
    command: KernelRuntimeSubscribeEventsCommand,
  ): KernelRuntimeEnvelopeBase[] {
    const events = this.eventBus.replay({
      conversationId: command.conversationId,
      turnId: command.turnId,
      sinceEventId: command.sinceEventId,
    })
    const ack = this.eventBus.ack({
      requestId: command.requestId,
      conversationId: command.conversationId,
      turnId: command.turnId,
      payload: { subscribed: true },
    })
    return [ack, ...events]
  }

  private replayRuntimeScopedEvents(
    sinceEventId: string | undefined,
  ): KernelRuntimeEnvelopeBase[] {
    if (!sinceEventId) {
      return []
    }
    return this.eventBus
      .replay({ sinceEventId })
      .filter(envelope => !envelope.conversationId && !envelope.turnId)
  }

  private async requireCapabilityIntent(
    command: KernelRuntimeCreateConversationCommand,
  ): Promise<void> {
    const capabilityNames = getCapabilityIntentNames(command.capabilityIntent)
    if (capabilityNames.length === 0) {
      return
    }
    const resolver = this.options.capabilityResolver
    if (!resolver?.requireCapability) {
      throw new KernelRuntimeWireCapabilityUnavailableError(
        command.requestId,
        capabilityNames,
      )
    }

    await Promise.all(
      capabilityNames.map(name =>
        resolver.requireCapability!(name, {
          cwd: command.workspacePath,
          metadata: sanitizeWirePayload({
            conversationId: command.conversationId,
            sessionId: command.sessionId,
            capabilityIntent: command.capabilityIntent,
            commandMetadata: command.metadata,
          }),
        }),
      ),
    )
    this.eventBus.emit({
      conversationId: command.conversationId,
      type: 'capabilities.required',
      replayable: true,
      payload: sanitizeWirePayload({
        capabilities: capabilityNames,
        descriptors: resolver.listDescriptors(),
      }),
      metadata: command.metadata,
    })
  }

  private assertExistingConversationMatches(
    conversation: KernelRuntimeWireConversation,
    command: KernelRuntimeCreateConversationCommand,
  ): void {
    const snapshot = conversation.snapshot()
    if (snapshot.workspacePath !== command.workspacePath) {
      throw new KernelRuntimeWireConversationConflictError(
        command.requestId,
        command.conversationId,
        'workspacePath',
        {
          existingWorkspacePath: snapshot.workspacePath,
          requestedWorkspacePath: command.workspacePath,
        },
      )
    }
    if (
      command.sessionId !== undefined &&
      snapshot.sessionId !== undefined &&
      command.sessionId !== snapshot.sessionId
    ) {
      throw new KernelRuntimeWireConversationConflictError(
        command.requestId,
        command.conversationId,
        'sessionId',
        {
          existingSessionId: snapshot.sessionId,
          requestedSessionId: command.sessionId,
        },
      )
    }
  }

  private async handleReloadCapabilities(
    command: Extract<KernelRuntimeCommand, { type: 'reload_capabilities' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.capabilityResolver) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Capability resolver is not available',
        retryable: false,
      })
    }

    const descriptors =
      await this.options.capabilityResolver.reloadCapabilities(command.scope, {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      })
    this.eventBus.emit({
      type: 'capabilities.reloaded',
      replayable: true,
      payload: sanitizeWirePayload({
        scope: command.scope,
        capabilities: command.capabilities,
        descriptors,
      }),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        descriptors: sanitizeWirePayload(descriptors),
      },
    })
  }

  private async handleListCommands(
    command: Extract<KernelRuntimeCommand, { type: 'list_commands' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.commandCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Command catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('commands', command)
    const entries = await this.options.commandCatalog.listCommands({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        entries: sanitizeWirePayload(entries),
      },
    })
  }

  private async handleExecuteCommand(
    command: Extract<KernelRuntimeCommand, { type: 'execute_command' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const executeCommand = this.options.commandCatalog?.executeCommand
    if (!executeCommand) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Command execution is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('commands', command)
    const result = await executeCommand(stripWireCommandFields(command), {
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    this.eventBus.emit({
      type: 'commands.executed',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListTools(
    command: Extract<KernelRuntimeCommand, { type: 'list_tools' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.toolCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Tool catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('tools', command)
    const tools = await this.options.toolCatalog.listTools({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        tools: sanitizeWirePayload(tools),
      },
    })
  }

  private async handleCallTool(
    command: Extract<KernelRuntimeCommand, { type: 'call_tool' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const callTool = this.options.toolCatalog?.callTool
    if (!callTool) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Tool execution is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('tools', command)
    const result = await callTool(stripWireCommandFields(command), {
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    this.eventBus.emit({
      type: 'tools.called',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListMcpServers(
    command: Extract<KernelRuntimeCommand, { type: 'list_mcp_servers' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.mcpRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'MCP registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('mcp', command)
    const servers = await this.options.mcpRegistry.listServers({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        servers: sanitizeWirePayload(servers),
      },
    })
  }

  private async handleListMcpTools(
    command: Extract<KernelRuntimeCommand, { type: 'list_mcp_tools' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.mcpRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'MCP registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('mcp', command)
    const tools = await this.options.mcpRegistry.listToolBindings({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        tools: sanitizeWirePayload(
          filterMcpToolBindings(tools, command.serverName),
        ),
      },
    })
  }

  private async handleListMcpResources(
    command: Extract<KernelRuntimeCommand, { type: 'list_mcp_resources' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.mcpRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'MCP registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('mcp', command)
    const resources = await this.options.mcpRegistry.listResources(
      command.serverName,
      {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      },
    )
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        resources: sanitizeWirePayload(resources),
      },
    })
  }

  private async handleReloadMcp(
    command: Extract<KernelRuntimeCommand, { type: 'reload_mcp' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.mcpRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'MCP registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('mcp', command)
    await this.options.mcpRegistry.reload?.({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    const snapshot = await this.readMcpRegistrySnapshot(command.metadata)
    this.eventBus.emit({
      type: 'mcp.reloaded',
      replayable: true,
      payload: sanitizeWirePayload(snapshot),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleConnectMcp(
    command: Extract<KernelRuntimeCommand, { type: 'connect_mcp' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.mcpRegistry?.connectServer) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'MCP connect is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('mcp', command)
    const result = await this.options.mcpRegistry.connectServer(
      stripWireCommandFields(command),
      {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      },
    )
    return this.ackMcpLifecycle(command, result, 'mcp.connected')
  }

  private async handleAuthenticateMcp(
    command: Extract<KernelRuntimeCommand, { type: 'authenticate_mcp' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.mcpRegistry?.authenticateServer) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'MCP authentication is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('mcp', command)
    const result = await this.options.mcpRegistry.authenticateServer(
      stripWireCommandFields(command),
      {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      },
    )
    return this.ackMcpLifecycle(command, result, 'mcp.authenticated')
  }

  private async handleSetMcpEnabled(
    command: Extract<KernelRuntimeCommand, { type: 'set_mcp_enabled' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.mcpRegistry?.setServerEnabled) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'MCP enable/disable is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('mcp', command)
    const result = await this.options.mcpRegistry.setServerEnabled(
      stripWireCommandFields(command),
      {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      },
    )
    return this.ackMcpLifecycle(command, result, 'mcp.enabled_changed')
  }

  private ackMcpLifecycle(
    command: Extract<
      KernelRuntimeCommand,
      { type: 'connect_mcp' | 'authenticate_mcp' | 'set_mcp_enabled' }
    >,
    result: RuntimeMcpLifecycleResult,
    eventType: string,
  ): KernelRuntimeEnvelopeBase {
    const payload = sanitizeWirePayload(result)
    this.eventBus.emit({
      type: eventType,
      replayable: true,
      payload,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload,
    })
  }

  private async readMcpRegistrySnapshot(
    metadata: Record<string, unknown> | undefined,
  ): Promise<RuntimeMcpRegistrySnapshot> {
    const context = {
      cwd: this.options.workspacePath,
      metadata,
    }
    const [servers, resources, toolBindings] = await Promise.all([
      this.options.mcpRegistry!.listServers(context),
      this.options.mcpRegistry!.listResources(undefined, context),
      this.options.mcpRegistry!.listToolBindings(context),
    ])
    return { servers, resources, toolBindings }
  }

  private async handleListHooks(
    command: Extract<KernelRuntimeCommand, { type: 'list_hooks' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.hookCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Hook catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('hooks', command)
    const hooks = await this.options.hookCatalog.listHooks({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        hooks: sanitizeWirePayload(hooks),
      },
    })
  }

  private async handleReloadHooks(
    command: Extract<KernelRuntimeCommand, { type: 'reload_hooks' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.hookCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Hook catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('hooks', command)
    await this.options.hookCatalog.reload?.({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    const snapshot: RuntimeHookRegistrySnapshot = {
      hooks: await this.options.hookCatalog.listHooks({
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      }),
    }
    this.eventBus.emit({
      type: 'hooks.reloaded',
      replayable: true,
      payload: sanitizeWirePayload(snapshot),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleRunHook(
    command: Extract<KernelRuntimeCommand, { type: 'run_hook' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.hookCatalog?.runHook) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Hook run is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('hooks', command)
    const result = await this.options.hookCatalog.runHook(
      stripWireCommandFields(command),
      {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'hooks.ran',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleRegisterHook(
    command: Extract<KernelRuntimeCommand, { type: 'register_hook' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.hookCatalog?.registerHook) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Hook registration is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('hooks', command)
    const result = await this.options.hookCatalog.registerHook(
      stripWireCommandFields(command),
      {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'hooks.registered',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListSkills(
    command: Extract<KernelRuntimeCommand, { type: 'list_skills' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.skillCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Skill catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('skills', command)
    const skills = await this.options.skillCatalog.listSkills({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        skills: sanitizeWirePayload(skills),
      },
    })
  }

  private async handleReloadSkills(
    command: Extract<KernelRuntimeCommand, { type: 'reload_skills' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.skillCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Skill catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('skills', command)
    await this.options.skillCatalog.reload?.({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    const snapshot: RuntimeSkillCatalogSnapshot = {
      skills: await this.options.skillCatalog.listSkills({
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      }),
    }
    this.eventBus.emit({
      type: 'skills.reloaded',
      replayable: true,
      payload: sanitizeWirePayload(snapshot),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleResolveSkillContext(
    command: Extract<KernelRuntimeCommand, { type: 'resolve_skill_context' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.skillCatalog?.resolvePromptContext) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Skill prompt context resolution is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('skills', command)
    const result = await this.options.skillCatalog.resolvePromptContext(
      stripWireCommandFields(command),
      {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'skills.context_resolved',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListPlugins(
    command: Extract<KernelRuntimeCommand, { type: 'list_plugins' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.pluginCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Plugin catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('plugins', command)
    const snapshot = await this.options.pluginCatalog.listPlugins({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({
        plugins: snapshot.plugins,
        errors: snapshot.errors ?? [],
      }),
    })
  }

  private async handleReloadPlugins(
    command: Extract<KernelRuntimeCommand, { type: 'reload_plugins' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.pluginCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Plugin catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('plugins', command)
    await this.options.pluginCatalog.reload?.({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    const listed = await this.options.pluginCatalog.listPlugins({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    const snapshot: RuntimePluginCatalogSnapshot = {
      plugins: listed.plugins,
      errors: listed.errors ?? [],
    }
    this.eventBus.emit({
      type: 'plugins.reloaded',
      replayable: true,
      payload: sanitizeWirePayload(snapshot),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleSetPluginEnabled(
    command: Extract<KernelRuntimeCommand, { type: 'set_plugin_enabled' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.pluginCatalog?.setPluginEnabled) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Plugin enable/disable is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('plugins', command)
    const result = await this.options.pluginCatalog.setPluginEnabled(
      stripWireCommandFields(command),
      {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'plugins.enabled_changed',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleInstallPlugin(
    command: Extract<KernelRuntimeCommand, { type: 'install_plugin' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.pluginCatalog?.installPlugin) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Plugin install is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('plugins', command)
    const result = await this.options.pluginCatalog.installPlugin(
      stripWireCommandFields(command),
      {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'plugins.installed',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleUninstallPlugin(
    command: Extract<KernelRuntimeCommand, { type: 'uninstall_plugin' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.pluginCatalog?.uninstallPlugin) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Plugin uninstall is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('plugins', command)
    const result = await this.options.pluginCatalog.uninstallPlugin(
      stripWireCommandFields(command),
      {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'plugins.uninstalled',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleUpdatePlugin(
    command: Extract<KernelRuntimeCommand, { type: 'update_plugin' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.pluginCatalog?.updatePlugin) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Plugin update is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('plugins', command)
    const result = await this.options.pluginCatalog.updatePlugin(
      stripWireCommandFields(command),
      {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'plugins.updated',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListAgents(
    command: Extract<KernelRuntimeCommand, { type: 'list_agents' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.agentRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Agent registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('agents', command)
    const snapshot = await this.options.agentRegistry.listAgents({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleReloadAgents(
    command: Extract<KernelRuntimeCommand, { type: 'reload_agents' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.agentRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Agent registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('agents', command)
    await this.options.agentRegistry.reload?.({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    const snapshot = await this.options.agentRegistry.listAgents({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    this.eventBus.emit({
      type: 'agents.reloaded',
      replayable: true,
      payload: sanitizeWirePayload(snapshot),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleSpawnAgent(
    command: Extract<KernelRuntimeCommand, { type: 'spawn_agent' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.agentRegistry?.spawnAgent) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Agent spawner is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('agents', command)
    const result = await this.options.agentRegistry.spawnAgent(
      stripWireCommandFields(command),
      {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'agents.spawned',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListAgentRuns(
    command: Extract<KernelRuntimeCommand, { type: 'list_agent_runs' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const listAgentRuns = this.options.agentRegistry?.listAgentRuns
    if (!listAgentRuns) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Agent run registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('agents', command)
    const snapshot = await listAgentRuns({
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleGetAgentRun(
    command: Extract<KernelRuntimeCommand, { type: 'get_agent_run' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const getAgentRun = this.options.agentRegistry?.getAgentRun
    if (!getAgentRun) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Agent run registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('agents', command)
    const run = await getAgentRun(command.runId, {
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        run: sanitizeWirePayload(run),
      },
    })
  }

  private async handleGetAgentOutput(
    command: Extract<KernelRuntimeCommand, { type: 'get_agent_output' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const getAgentOutput = this.options.agentRegistry?.getAgentOutput
    if (!getAgentOutput) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Agent run output is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('agents', command)
    const output = await getAgentOutput(stripWireCommandFields(command), {
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(output),
    })
  }

  private async handleCancelAgentRun(
    command: Extract<KernelRuntimeCommand, { type: 'cancel_agent_run' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const cancelAgentRun = this.options.agentRegistry?.cancelAgentRun
    if (!cancelAgentRun) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Agent run cancellation is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('agents', command)
    const result = await cancelAgentRun(stripWireCommandFields(command), {
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    if (result.cancelled) {
      this.eventBus.emit({
        type: 'agents.run.cancelled',
        replayable: true,
        payload: sanitizeWirePayload(result),
        metadata: command.metadata,
      })
    }
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListTasks(
    command: Extract<KernelRuntimeCommand, { type: 'list_tasks' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.taskRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Task registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('tasks', command)
    const snapshot = await this.options.taskRegistry.listTasks(
      command.taskListId,
      {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      },
    )
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleGetTask(
    command: Extract<KernelRuntimeCommand, { type: 'get_task' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.taskRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Task registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('tasks', command)
    const task = await this.options.taskRegistry.getTask(
      command.taskId,
      command.taskListId,
      {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      },
    )
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        task: sanitizeWirePayload(task),
      },
    })
  }

  private async handleCreateTask(
    command: Extract<KernelRuntimeCommand, { type: 'create_task' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const createTask = this.options.taskRegistry?.createTask
    if (!createTask) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Task mutator is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('tasks', command)
    const result = await createTask(stripWireCommandFields(command), {
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    this.eventBus.emit({
      type: 'tasks.created',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleUpdateTask(
    command: Extract<KernelRuntimeCommand, { type: 'update_task' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const updateTask = this.options.taskRegistry?.updateTask
    if (!updateTask) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Task mutator is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('tasks', command)
    const result = await updateTask(stripWireCommandFields(command), {
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    this.eventBus.emit({
      type: 'tasks.updated',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleAssignTask(
    command: Extract<KernelRuntimeCommand, { type: 'assign_task' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const assignTask = this.options.taskRegistry?.assignTask
    if (!assignTask) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Task mutator is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('tasks', command)
    const result = await assignTask(stripWireCommandFields(command), {
      cwd: this.options.workspacePath,
      metadata: command.metadata,
    })
    this.eventBus.emit({
      type: 'tasks.assigned',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async requireCatalogCapability(
    name: KernelCapabilityName,
    command: Pick<KernelRuntimeCommand, 'requestId' | 'metadata'>,
  ): Promise<void> {
    try {
      await this.options.capabilityResolver?.requireCapability?.(name, {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      })
    } catch {
      throw new KernelRuntimeWireCapabilityUnavailableError(command.requestId, [
        name,
      ])
    }
  }

  private handlePublishHostEvent(
    command: Extract<KernelRuntimeCommand, { type: 'publish_host_event' }>,
  ): KernelRuntimeEnvelopeBase {
    const event = this.eventBus.emit({
      ...command.event,
      metadata: {
        ...command.event.metadata,
        publishedBy: 'host',
        requestId: command.requestId,
      },
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      conversationId: event.conversationId,
      turnId: event.turnId,
      eventId: event.eventId,
      payload: {
        published: true,
        eventId: event.eventId,
      },
    })
  }

  private startTurnExecution(
    command: KernelRuntimeRunTurnCommand,
    conversation: KernelRuntimeWireConversation,
    snapshot: KernelTurnSnapshot,
  ): void {
    if (!this.options.runTurnExecutor || snapshot.state !== 'running') {
      return
    }

    const executionKey = this.turnExecutionKey(
      command.conversationId,
      command.turnId,
    )
    if (this.activeExecutions.has(executionKey)) {
      return
    }

    const controller = new AbortController()
    this.activeExecutions.set(executionKey, controller)
    void this.runTurnExecution({
      command,
      conversation,
      eventBus: this.eventBus,
      permissionBroker: this.options.permissionBroker,
      signal: controller.signal,
    }).finally(() => {
      this.activeExecutions.delete(executionKey)
    })
  }

  private async runTurnExecution(
    context: KernelRuntimeWireTurnExecutionContext,
  ): Promise<void> {
    let terminalEmitted = false
    try {
      const result = this.options.runTurnExecutor?.(context)
      if (isAsyncIterable(result)) {
        for await (const event of result) {
          terminalEmitted =
            (await this.handleTurnExecutionEvent(context, event)) ||
            terminalEmitted
        }
      } else {
        await result
      }

      if (!terminalEmitted) {
        await this.completeTurnExecution(context, 'end_turn')
      }
    } catch (error) {
      if (terminalEmitted) {
        return
      }
      if (context.signal.aborted) {
        await this.completeTurnExecution(context, 'aborted')
        return
      }
      await this.failTurnExecution(context, error)
    }
  }

  private async handleTurnExecutionEvent(
    context: KernelRuntimeWireTurnExecutionContext,
    event: KernelRuntimeWireTurnExecutionEvent,
  ): Promise<boolean> {
    switch (event.type) {
      case 'output':
        this.eventBus.emit({
          conversationId: context.command.conversationId,
          turnId: context.command.turnId,
          type: 'turn.output_delta',
          replayable: event.replayable ?? true,
          payload: sanitizeWirePayload(event.payload),
          metadata: event.metadata,
        })
        return false
      case 'event':
        this.eventBus.emit({
          ...event.event,
          conversationId:
            event.event.conversationId ?? context.command.conversationId,
          turnId: event.event.turnId ?? context.command.turnId,
          replayable: event.event.replayable,
          payload: sanitizeWirePayload(event.event.payload),
        })
        return false
      case 'completed':
        await this.completeTurnExecution(
          context,
          event.stopReason ?? 'end_turn',
        )
        return true
      case 'failed':
        await this.failTurnExecution(context, event.error, event.metadata)
        return true
    }
  }

  private async completeTurnExecution(
    context: KernelRuntimeWireTurnExecutionContext,
    stopReason: string | null,
  ): Promise<void> {
    if (context.conversation.activeTurnId !== context.command.turnId) {
      return
    }
    const snapshot = context.conversation.completeTurn(
      context.command.turnId,
      stopReason,
    )
    await this.recordConversationSnapshot(context.conversation, snapshot)
  }

  private async failTurnExecution(
    context: KernelRuntimeWireTurnExecutionContext,
    error: unknown,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (context.conversation.activeTurnId !== context.command.turnId) {
      return
    }
    try {
      const snapshot = context.conversation.failTurn(
        context.command.turnId,
        error,
      )
      await this.recordConversationSnapshot(context.conversation, snapshot)
    } catch (failError) {
      this.eventBus.error({
        requestId: context.command.requestId,
        conversationId: context.command.conversationId,
        turnId: context.command.turnId,
        code: 'internal_error',
        message:
          failError instanceof Error ? failError.message : String(failError),
        retryable: false,
        details: {
          executorError: sanitizeWirePayload(error),
        },
        metadata,
      })
    }
  }

  private turnExecutionKey(
    conversationId: KernelConversationId,
    turnId: KernelTurnId,
  ): string {
    return `${conversationId}:${turnId}`
  }

  private async abortActiveTurnsForHostDisconnect(
    command: KernelRuntimeDisconnectHostCommand,
  ): Promise<KernelTurnId[]> {
    const abortedTurnIds: KernelTurnId[] = []
    const reason = command.reason ?? 'host_disconnected'
    for (const [conversationId, conversation] of this.conversations) {
      const activeTurnId = conversation.activeTurnId
      if (!activeTurnId) {
        continue
      }
      const snapshot = conversation.abortTurn(activeTurnId, reason)
      await this.recordConversationSnapshot(conversation, snapshot)
      this.activeExecutions
        .get(this.turnExecutionKey(conversationId, activeTurnId))
        ?.abort(reason)
      abortedTurnIds.push(activeTurnId)
    }
    return abortedTurnIds
  }

  private async readRecoveredConversation(
    command: KernelRuntimeCreateConversationCommand,
  ): Promise<KernelRuntimeWireConversationRecoverySnapshot | undefined> {
    if (!this.options.conversationSnapshotStore) {
      return undefined
    }

    try {
      const recovered = await this.options.conversationSnapshotStore.readLatest(
        command.conversationId,
      )
      if (!recovered) {
        return undefined
      }
      if (
        command.sessionId !== undefined &&
        recovered.conversation.sessionId !== undefined &&
        command.sessionId !== recovered.conversation.sessionId
      ) {
        return undefined
      }
      const conversation = normalizeRecoveredConversationSnapshot(
        recovered.conversation,
        {
          runtimeId: this.options.runtimeId,
          conversationId: command.conversationId,
          workspacePath: command.workspacePath,
          sessionId: command.sessionId,
        },
      )
      const activeTurn = selectRecoveredActiveTurn(
        conversation,
        recovered.activeTurn,
      )
      const activeExecution = selectRecoveredActiveExecution(
        conversation,
        activeTurn,
        recovered.activeExecution,
      )
      return {
        conversation,
        activeTurn,
        activeExecution,
      }
    } catch (error) {
      this.emitConversationSnapshotFailure(command.conversationId, error, {
        operation: 'readLatest',
      })
      return undefined
    }
  }

  private async recordConversationSnapshot(
    conversation: KernelRuntimeWireConversation,
    activeTurnSnapshot?: KernelTurnSnapshot,
    activeExecution?: KernelRuntimeRunTurnCommand,
  ): Promise<void> {
    if (!this.options.conversationSnapshotStore) {
      return
    }

    const conversationSnapshot = conversation.snapshot()
    const entry = sanitizeWirePayload({
      conversation: conversationSnapshot,
      activeTurn:
        activeTurnSnapshot &&
        conversationSnapshot.activeTurnId === activeTurnSnapshot.turnId
          ? activeTurnSnapshot
          : undefined,
      activeExecution:
        activeExecution &&
        activeTurnSnapshot?.state === 'running' &&
        conversationSnapshot.activeTurnId === activeExecution.turnId &&
        activeTurnSnapshot.turnId === activeExecution.turnId
          ? activeExecution
          : undefined,
    }) as KernelRuntimeWireConversationRecoverySnapshot

    try {
      await this.options.conversationSnapshotStore.append(entry)
    } catch (error) {
      this.emitConversationSnapshotFailure(conversation.id, error, {
        operation: 'append',
      })
    }
  }

  private emitConversationSnapshotFailure(
    conversationId: KernelConversationId,
    error: unknown,
    metadata?: Record<string, unknown>,
  ): void {
    this.eventBus.emit({
      conversationId,
      type: 'conversation.snapshot_failed',
      replayable: false,
      payload: sanitizeWirePayload({
        message: error instanceof Error ? error.message : String(error),
      }),
      metadata,
    })
  }

  private requireConversation(
    conversationId: KernelConversationId,
    requestId: string,
  ): KernelRuntimeWireConversation {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) {
      throw new KernelRuntimeWireNotFoundError(requestId, conversationId)
    }
    return conversation
  }

  private requireHost(
    hostId: string,
    requestId: string,
  ): KernelRuntimeWireHostRecord {
    const host = this.hosts.get(hostId)
    if (!host) {
      throw new KernelRuntimeWireHostNotFoundError(requestId, hostId)
    }
    return host
  }

  private mapError(
    command: KernelRuntimeCommand,
    error: unknown,
  ): KernelRuntimeEnvelopeBase {
    if (error instanceof KernelRuntimeWireNotFoundError) {
      return this.eventBus.error({
        requestId: error.requestId,
        conversationId: error.conversationId,
        code: 'not_found',
        message: `Conversation ${error.conversationId} was not found`,
        retryable: false,
      })
    }
    if (error instanceof KernelRuntimeWireHostNotFoundError) {
      return this.eventBus.error({
        requestId: error.requestId,
        code: 'not_found',
        message: `Host ${error.hostId} was not found`,
        retryable: false,
        details: { hostId: error.hostId },
      })
    }
    if (error instanceof KernelRuntimeWireConversationConflictError) {
      return this.eventBus.error({
        requestId: error.requestId,
        conversationId: error.conversationId,
        code: 'invalid_request',
        message: error.message,
        retryable: false,
        details: error.details,
      })
    }
    if (error instanceof KernelRuntimeWireCapabilityUnavailableError) {
      return this.eventBus.error({
        requestId: error.requestId,
        code: 'unavailable',
        message: error.message,
        retryable: false,
        details: { capabilities: error.capabilityNames },
      })
    }
    if (error instanceof RuntimeConversationBusyError) {
      return this.eventBus.error({
        requestId: command.requestId,
        conversationId: error.conversationId,
        turnId: error.activeTurnId,
        code: 'busy',
        message: error.message,
        retryable: true,
      })
    }
    if (error instanceof RuntimeEventReplayError) {
      return this.eventBus.error({
        requestId: command.requestId,
        conversationId:
          'conversationId' in command ? command.conversationId : undefined,
        code: error.code === 'not_found' ? 'not_found' : 'unavailable',
        message: error.message,
        retryable: error.code === 'expired',
        details: { eventId: error.eventId, replayError: error.code },
      })
    }
    if (isPermissionDecisionNotFoundError(error)) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'not_found',
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
        details:
          'permissionRequestId' in command
            ? { permissionRequestId: command.permissionRequestId }
            : undefined,
      })
    }
    return this.eventBus.error({
      requestId: command.requestId,
      conversationId:
        'conversationId' in command ? command.conversationId : undefined,
      turnId: 'turnId' in command ? command.turnId : undefined,
      code: 'internal_error',
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
    })
  }
}

class KernelRuntimeWireHostNotFoundError extends Error {
  constructor(
    readonly requestId: string,
    readonly hostId: string,
  ) {
    super(`Host ${hostId} was not found`)
    this.name = 'KernelRuntimeWireHostNotFoundError'
  }
}

class KernelRuntimeWireNotFoundError extends Error {
  constructor(
    readonly requestId: string,
    readonly conversationId: KernelConversationId,
  ) {
    super(`Conversation ${conversationId} was not found`)
    this.name = 'KernelRuntimeWireNotFoundError'
  }
}

class KernelRuntimeWireConversationConflictError extends Error {
  constructor(
    readonly requestId: string,
    readonly conversationId: KernelConversationId,
    readonly conflictField: string,
    readonly details: Record<string, unknown>,
  ) {
    super(
      `Conversation ${conversationId} already exists with a different ${conflictField}`,
    )
    this.name = 'KernelRuntimeWireConversationConflictError'
  }
}

class KernelRuntimeWireCapabilityUnavailableError extends Error {
  constructor(
    readonly requestId: string,
    readonly capabilityNames: readonly KernelCapabilityName[],
  ) {
    super(
      `Capability resolver cannot load required capabilities: ${capabilityNames.join(', ')}`,
    )
    this.name = 'KernelRuntimeWireCapabilityUnavailableError'
  }
}

function sanitizeWirePayload<T>(value: T): T {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    } as T
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeWirePayload(item)) as T
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, sanitizeWirePayload(item)]),
  ) as T
}

function stripWireCommandFields<
  TCommand extends {
    schemaVersion: string
    type: string
    requestId: string
    metadata?: Record<string, unknown>
  },
>(command: TCommand): Omit<TCommand, 'schemaVersion' | 'type' | 'requestId'> {
  const {
    schemaVersion: _schemaVersion,
    type: _type,
    requestId: _requestId,
    ...payload
  } = command
  return payload
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  )
}

function normalizeRecoveredConversationSnapshot(
  snapshot: KernelConversationSnapshot,
  scope: {
    runtimeId: KernelRuntimeId
    conversationId: KernelConversationId
    workspacePath: string
    sessionId?: string
  },
): KernelConversationSnapshot {
  return sanitizeWirePayload({
    ...snapshot,
    runtimeId: scope.runtimeId,
    conversationId: scope.conversationId,
    workspacePath: scope.workspacePath,
    sessionId: scope.sessionId ?? snapshot.sessionId,
    state: isRuntimeOwnedActiveState(snapshot.state)
      ? 'detached'
      : snapshot.state,
  }) as KernelConversationSnapshot
}

function selectRecoveredActiveTurn(
  conversation: KernelConversationSnapshot,
  activeTurn: KernelTurnSnapshot | undefined,
): KernelTurnSnapshot | undefined {
  if (!conversation.activeTurnId || !activeTurn) {
    return undefined
  }
  if (
    activeTurn.conversationId !== conversation.conversationId ||
    activeTurn.turnId !== conversation.activeTurnId
  ) {
    return undefined
  }
  if (!isActiveTurnState(activeTurn.state)) {
    return undefined
  }
  return activeTurn
}

function selectRecoveredActiveExecution(
  conversation: KernelConversationSnapshot,
  activeTurn: KernelTurnSnapshot | undefined,
  activeExecution: KernelRuntimeRunTurnCommand | undefined,
): KernelRuntimeRunTurnCommand | undefined {
  if (!activeTurn || activeTurn.state !== 'running' || !activeExecution) {
    return undefined
  }
  if (
    activeExecution.type !== 'run_turn' ||
    activeExecution.conversationId !== conversation.conversationId ||
    activeExecution.turnId !== activeTurn.turnId
  ) {
    return undefined
  }
  return activeExecution
}

function isRuntimeOwnedActiveState(
  state: KernelConversationSnapshot['state'],
): boolean {
  return state === 'running' || state === 'aborting'
}

function isActiveTurnState(state: KernelTurnSnapshot['state']): boolean {
  return state === 'starting' || state === 'running' || state === 'aborting'
}

function isPermissionDecisionNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && error.name === 'RuntimePermissionDecisionError'
  )
}

function filterMcpToolBindings(
  bindings: readonly RuntimeMcpToolBinding[],
  serverName: string | undefined,
): readonly RuntimeMcpToolBinding[] {
  if (!serverName) {
    return bindings
  }
  return bindings.filter(binding => binding.server === serverName)
}

function getCapabilityIntentNames(
  capabilityIntent: Record<string, unknown> | undefined,
): readonly KernelCapabilityName[] {
  if (!capabilityIntent) {
    return []
  }

  const names = new Set<KernelCapabilityName>()
  for (const key of [
    'capabilities',
    'requiredCapabilities',
    'require',
    'requires',
    'load',
  ]) {
    addCapabilityNames(names, capabilityIntent[key])
  }

  for (const [key, value] of Object.entries(capabilityIntent)) {
    if (value === true) {
      names.add(key)
    }
  }

  return [...names]
}

function addCapabilityNames(
  names: Set<KernelCapabilityName>,
  value: unknown,
): void {
  if (typeof value === 'string') {
    names.add(value)
    return
  }
  if (!Array.isArray(value)) {
    return
  }
  for (const item of value) {
    if (typeof item === 'string') {
      names.add(item)
    }
  }
}

export function createKernelRuntimeWireRouter(
  options: KernelRuntimeWireRouterOptions,
): KernelRuntimeWireRouter {
  return new KernelRuntimeWireRouter(options)
}
