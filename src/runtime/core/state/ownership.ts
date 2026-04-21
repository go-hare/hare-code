import type { AppState } from 'src/state/AppStateStore.js'

export type RuntimeStatePlane =
  | 'runtime-core'
  | 'execution-state'
  | 'host-state'
  | 'shared-blocker'

export type BootstrapStateFieldOwnership = {
  field: string
  plane: RuntimeStatePlane
  owner: string
  rationale: string
}

type OwnershipRecord<T extends string> = Record<
  T,
  BootstrapStateFieldOwnership & { field: T }
>

function own<const T extends readonly string[]>(
  fields: T,
  meta: Omit<BootstrapStateFieldOwnership, 'field'>,
): OwnershipRecord<T[number]> {
  return Object.fromEntries(
    fields.map(field => [field, { field, ...meta }]),
  ) as OwnershipRecord<T[number]>
}

const sessionIdentityFields = [
  'originalCwd',
  'projectRoot',
  'cwd',
  'sessionId',
  'parentSessionId',
  'sessionProjectDir',
] as const

const bootstrapConfigFields = [
  'isInteractive',
  'clientType',
  'sessionSource',
  'flagSettingsPath',
  'flagSettingsInline',
  'allowedSettingSources',
  'sessionIngressToken',
  'oauthTokenFromFd',
  'apiKeyFromFd',
  'inlinePlugins',
  'chromeFlagOverride',
  'useCoworkPlugins',
  'initJsonSchema',
  'registeredHooks',
  'sdkBetas',
  'additionalDirectoriesForClaudeMd',
  'allowedChannels',
  'hasDevChannels',
] as const

const agentRuntimeFields = [
  'sdkAgentProgressSummariesEnabled',
  'mainThreadAgentType',
] as const

const automationFields = [
  'scheduledTasksEnabled',
  'sessionCronTasks',
  'sessionCreatedTeams',
] as const

const permissionAndPersistenceFields = [
  'sessionBypassPermissionsMode',
  'sessionTrustAccepted',
  'sessionPersistenceDisabled',
] as const

const observabilityFields = [
  'totalCostUSD',
  'totalAPIDuration',
  'totalAPIDurationWithoutRetries',
  'totalToolDuration',
  'turnHookDurationMs',
  'turnToolDurationMs',
  'turnClassifierDurationMs',
  'turnToolCount',
  'turnHookCount',
  'turnClassifierCount',
  'startTime',
  'lastInteractionTime',
  'totalLinesAdded',
  'totalLinesRemoved',
  'hasUnknownModelCost',
  'meter',
  'sessionCounter',
  'locCounter',
  'prCounter',
  'commitCounter',
  'costCounter',
  'tokenCounter',
  'codeEditToolDecisionCounter',
  'activeTimeCounter',
  'statsStore',
  'loggerProvider',
  'eventLogger',
  'meterProvider',
  'tracerProvider',
  'inMemoryErrorLog',
  'slowOperations',
] as const

const executionFields = [
  'modelUsage',
  'mainLoopModelOverride',
  'initialMainLoopModel',
  'modelStrings',
  'strictToolResultPairing',
  'lastAPIRequest',
  'lastAPIRequestMessages',
  'lastClassifierRequests',
  'cachedClaudeMdContent',
  'planSlugCache',
  'invokedSkills',
  'systemPromptSectionCache',
  'lastEmittedDate',
  'promptCache1hAllowlist',
  'promptCache1hEligible',
  'afkModeHeaderLatched',
  'fastModeHeaderLatched',
  'cacheEditingHeaderLatched',
  'thinkingClearLatched',
  'promptId',
  'lastMainRequestId',
  'lastApiCompletionTimestamp',
  'pendingPostCompaction',
] as const

const hostFields = [
  'questionPreviewFormat',
  'agentColorMap',
  'agentColorIndex',
  'hasExitedPlanMode',
  'needsPlanModeExitAttachment',
  'needsAutoModeExitAttachment',
  'lspRecommendationShownThisSession',
  'isRemoteMode',
  'directConnectServerUrl',
] as const

const sharedBlockerFields = [
  'kairosActive',
  'userMsgOptIn',
  'teleportedSessionInfo',
] as const

export const bootstrapStateKeys = [
  ...sessionIdentityFields,
  ...bootstrapConfigFields,
  ...agentRuntimeFields,
  ...automationFields,
  ...permissionAndPersistenceFields,
  ...observabilityFields,
  ...executionFields,
  ...hostFields,
  ...sharedBlockerFields,
] as const

export type BootstrapStateField = (typeof bootstrapStateKeys)[number]

export const bootstrapStateOwnership = {
  ...own(sessionIdentityFields, {
    plane: 'runtime-core',
    owner: 'runtime/core/session',
    rationale:
      'Defines runtime session identity, project anchoring, and resume routing.',
  }),
  ...own(bootstrapConfigFields, {
    plane: 'runtime-core',
    owner: 'runtime/core/bootstrap',
    rationale:
      'Bootstraps auth, settings, plugin wiring, and session-scoped configuration.',
  }),
  ...own(agentRuntimeFields, {
    plane: 'runtime-core',
    owner: 'runtime/core/agents',
    rationale:
      'Session-scoped agent execution settings should move with the runtime, not the CLI shell.',
  }),
  ...own(automationFields, {
    plane: 'runtime-core',
    owner: 'runtime/core/automation',
    rationale:
      'Scheduled tasks and team lifecycle belong to runtime orchestration state.',
  }),
  ...own(permissionAndPersistenceFields, {
    plane: 'runtime-core',
    owner: 'runtime/core/policy',
    rationale:
      'These toggles gate session persistence and permission policy across hosts.',
  }),
  ...own(observabilityFields, {
    plane: 'runtime-core',
    owner: 'runtime/core/observability',
    rationale:
      'Telemetry counters and in-memory diagnostics are process-owned runtime infrastructure.',
  }),
  ...own(executionFields, {
    plane: 'execution-state',
    owner: 'runtime/capabilities/execution',
    rationale:
      'Tracks model-turn state, prompt shaping, and recovery metadata used by the execution loop.',
  }),
  ...own(hostFields, {
    plane: 'host-state',
    owner: 'hosts/terminal',
    rationale:
      'Pure UI, presentation, and remote-session shell concerns should stay outside runtime core state.',
  }),
  ...own(sharedBlockerFields, {
    plane: 'shared-blocker',
    owner: 'split-required',
    rationale:
      'These flags currently mix host UX with execution semantics and need a later owner split.',
  }),
} satisfies OwnershipRecord<BootstrapStateField>

export type BootstrapModuleField =
  | 'sessionSwitched'
  | 'interactionTimeDirty'
  | 'outputTokensAtTurnStart'
  | 'currentTurnTokenBudget'
  | 'budgetContinuationCount'
  | 'scrollDraining'
  | 'scrollDrainTimer'

export const bootstrapModuleStateOwnership = {
  sessionSwitched: {
    field: 'sessionSwitched',
    plane: 'runtime-core',
    owner: 'runtime/core/session',
    rationale:
      'Session switch notifications are runtime lifecycle events, not CLI-only glue.',
  },
  interactionTimeDirty: {
    field: 'interactionTimeDirty',
    plane: 'host-state',
    owner: 'hosts/terminal/render-loop',
    rationale:
      'Ink render batching is terminal-host behavior and should not live in runtime execution state.',
  },
  outputTokensAtTurnStart: {
    field: 'outputTokensAtTurnStart',
    plane: 'execution-state',
    owner: 'runtime/capabilities/execution/token-budget',
    rationale:
      'Per-turn token accounting is execution state and must move with the runtime session.',
  },
  currentTurnTokenBudget: {
    field: 'currentTurnTokenBudget',
    plane: 'execution-state',
    owner: 'runtime/capabilities/execution/token-budget',
    rationale:
      'Current token budget is part of execution flow control and belongs to the runtime turn state.',
  },
  budgetContinuationCount: {
    field: 'budgetContinuationCount',
    plane: 'execution-state',
    owner: 'runtime/capabilities/execution/token-budget',
    rationale:
      'Auto-continue retry count is turn-local execution bookkeeping.',
  },
  scrollDraining: {
    field: 'scrollDraining',
    plane: 'host-state',
    owner: 'hosts/terminal/render-loop',
    rationale:
      'Scroll backpressure is terminal host scheduling state, not kernel state.',
  },
  scrollDrainTimer: {
    field: 'scrollDrainTimer',
    plane: 'host-state',
    owner: 'hosts/terminal/render-loop',
    rationale:
      'The scroll debounce timer is host event-loop machinery.',
  },
} satisfies OwnershipRecord<BootstrapModuleField>

export const firstPassRuntimeAppStateKeys = [
  'toolPermissionContext',
  'fileHistory',
  'attribution',
  'fastMode',
] as const

export type FirstPassRuntimeAppStateKey =
  (typeof firstPassRuntimeAppStateKeys)[number]

export type FirstPassRuntimeAppStateSlice = Pick<
  AppState,
  FirstPassRuntimeAppStateKey
>

export type FirstPassHostAppStateKey = Exclude<
  keyof AppState,
  FirstPassRuntimeAppStateKey
>
