import {
  consumePostCompaction,
  getCachedClaudeMdContent,
  getClientType,
  getCurrentTurnTokenBudget,
  getCwdState,
  getInitialMainLoopModel,
  getIsInteractive,
  getLastAPIRequest,
  getLastAPIRequestMessages,
  getLastApiCompletionTimestamp,
  getLastClassifierRequests,
  getLastInteractionTime,
  getLastMainRequestId,
  getLastEmittedDate,
  getMainLoopModelOverride,
  getModelStrings,
  getModelUsage,
  getOriginalCwd,
  getParentSessionId,
  getProjectRoot,
  getPromptCache1hAllowlist,
  getPromptCache1hEligible,
  getPromptId,
  getSdkBetas,
  getSessionId,
  getSessionProjectDir,
  getSessionSource,
  getStrictToolResultPairing,
  getSystemPromptSectionCache,
  getTotalAPIDuration,
  getTotalAPIDurationWithoutRetries,
  getTotalCostUSD,
  getTotalLinesAdded,
  getTotalLinesRemoved,
  getTotalToolDuration,
  getTurnClassifierCount,
  getTurnClassifierDurationMs,
  getTurnHookCount,
  getTurnHookDurationMs,
  getTurnOutputTokens,
  getTurnToolCount,
  getTurnToolDurationMs,
  getBudgetContinuationCount,
  hasUnknownModelCost,
  getAfkModeHeaderLatched,
  getFastModeHeaderLatched,
  getCacheEditingHeaderLatched,
  getThinkingClearLatched,
  incrementBudgetContinuationCount,
  isSessionPersistenceDisabled,
  markPostCompaction,
  regenerateSessionId,
  setCachedClaudeMdContent,
  setCwdState,
  setInitialMainLoopModel,
  setLastAPIRequest,
  setLastAPIRequestMessages,
  setLastApiCompletionTimestamp,
  setLastClassifierRequests,
  setLastEmittedDate,
  setLastMainRequestId,
  setMainLoopModelOverride,
  setModelStrings,
  setPromptCache1hAllowlist,
  setPromptCache1hEligible,
  setPromptId,
  setProjectRoot,
  setSdkBetas,
  setSystemPromptSectionCacheEntry,
  setAfkModeHeaderLatched,
  setFastModeHeaderLatched,
  setCacheEditingHeaderLatched,
  setThinkingClearLatched,
  snapshotOutputTokensForTurn,
  switchSession,
  updateLastInteractionTime,
  clearBetaHeaderLatches,
  clearSystemPromptSectionState,
} from 'src/bootstrap/state.js'
import type { AppState } from 'src/state/AppStateStore.js'
import type {
  RuntimeAppStateProvider,
  RuntimeBootstrapStateProvider,
  RuntimeRequestDebugStatePatch,
  RuntimeStateProviders,
  RuntimeExecutionPromptStatePatch,
} from './providers.js'

type RuntimeAppStateAdapterOptions = {
  getAppState: () => AppState
  setAppState: (updater: (prev: AppState) => AppState) => void
}

export function createBootstrapStateProvider(): RuntimeBootstrapStateProvider {
  return {
    getSessionIdentity() {
      return {
        sessionId: getSessionId(),
        parentSessionId: getParentSessionId(),
        sessionProjectDir: getSessionProjectDir(),
        originalCwd: getOriginalCwd(),
        projectRoot: getProjectRoot(),
        cwd: getCwdState(),
        isInteractive: getIsInteractive(),
        clientType: getClientType(),
        sessionSource: getSessionSource(),
      }
    },
    regenerateSessionId(options) {
      return regenerateSessionId(options)
    },
    switchSession(sessionId, projectDir = null) {
      switchSession(sessionId, projectDir)
    },
    setCwd(cwd) {
      setCwdState(cwd)
    },
    setProjectRoot(projectRoot) {
      setProjectRoot(projectRoot)
    },
    getUsageSnapshot() {
      return {
        totalCostUSD: getTotalCostUSD(),
        totalApiDurationMs: getTotalAPIDuration(),
        totalApiDurationWithoutRetriesMs: getTotalAPIDurationWithoutRetries(),
        totalToolDurationMs: getTotalToolDuration(),
        turnHookDurationMs: getTurnHookDurationMs(),
        turnToolDurationMs: getTurnToolDurationMs(),
        turnClassifierDurationMs: getTurnClassifierDurationMs(),
        turnHookCount: getTurnHookCount(),
        turnToolCount: getTurnToolCount(),
        turnClassifierCount: getTurnClassifierCount(),
        totalLinesAdded: getTotalLinesAdded(),
        totalLinesRemoved: getTotalLinesRemoved(),
        hasUnknownModelCost: hasUnknownModelCost(),
        lastInteractionTime: getLastInteractionTime(),
        modelUsage: getModelUsage(),
      }
    },
    markInteraction(immediate) {
      updateLastInteractionTime(immediate)
    },
    getExecutionBudget() {
      return {
        turnOutputTokens: getTurnOutputTokens(),
        currentTurnTokenBudget: getCurrentTurnTokenBudget(),
        budgetContinuationCount: getBudgetContinuationCount(),
        strictToolResultPairing: getStrictToolResultPairing(),
      }
    },
    snapshotTurnBudget(budget) {
      snapshotOutputTokensForTurn(budget)
    },
    incrementBudgetContinuationCount() {
      incrementBudgetContinuationCount()
    },
    getPromptState() {
      return {
        mainLoopModelOverride: getMainLoopModelOverride(),
        initialMainLoopModel: getInitialMainLoopModel(),
        modelStrings: getModelStrings(),
        cachedClaudeMdContent: getCachedClaudeMdContent(),
        systemPromptSectionCache: getSystemPromptSectionCache(),
        lastEmittedDate: getLastEmittedDate(),
        promptCache1hAllowlist: getPromptCache1hAllowlist(),
        promptCache1hEligible: getPromptCache1hEligible(),
        afkModeHeaderLatched: getAfkModeHeaderLatched(),
        fastModeHeaderLatched: getFastModeHeaderLatched(),
        cacheEditingHeaderLatched: getCacheEditingHeaderLatched(),
        thinkingClearLatched: getThinkingClearLatched(),
        sdkBetas: getSdkBetas(),
      }
    },
    patchPromptState(patch: RuntimeExecutionPromptStatePatch) {
      if ('mainLoopModelOverride' in patch) {
        setMainLoopModelOverride(patch.mainLoopModelOverride)
      }
      if (
        'initialMainLoopModel' in patch &&
        patch.initialMainLoopModel !== undefined
      ) {
        setInitialMainLoopModel(patch.initialMainLoopModel)
      }
      if ('modelStrings' in patch && patch.modelStrings !== undefined) {
        setModelStrings(patch.modelStrings)
      }
      if ('cachedClaudeMdContent' in patch) {
        setCachedClaudeMdContent(patch.cachedClaudeMdContent ?? null)
      }
      if (patch.clearSystemPromptSectionCache) {
        clearSystemPromptSectionState()
      }
      if (patch.systemPromptSection) {
        setSystemPromptSectionCacheEntry(
          patch.systemPromptSection.name,
          patch.systemPromptSection.value,
        )
      }
      if ('lastEmittedDate' in patch) {
        setLastEmittedDate(patch.lastEmittedDate ?? null)
      }
      if ('promptCache1hAllowlist' in patch) {
        setPromptCache1hAllowlist(patch.promptCache1hAllowlist ?? null)
      }
      if ('promptCache1hEligible' in patch) {
        setPromptCache1hEligible(patch.promptCache1hEligible ?? null)
      }
      if (patch.clearHeaderLatches) {
        clearBetaHeaderLatches()
      }
      if ('afkModeHeaderLatched' in patch && patch.afkModeHeaderLatched !== undefined) {
        setAfkModeHeaderLatched(patch.afkModeHeaderLatched)
      }
      if (
        'fastModeHeaderLatched' in patch &&
        patch.fastModeHeaderLatched !== undefined
      ) {
        setFastModeHeaderLatched(patch.fastModeHeaderLatched)
      }
      if (
        'cacheEditingHeaderLatched' in patch &&
        patch.cacheEditingHeaderLatched !== undefined
      ) {
        setCacheEditingHeaderLatched(patch.cacheEditingHeaderLatched)
      }
      if (
        'thinkingClearLatched' in patch &&
        patch.thinkingClearLatched !== undefined
      ) {
        setThinkingClearLatched(patch.thinkingClearLatched)
      }
      if ('sdkBetas' in patch) {
        setSdkBetas(patch.sdkBetas)
      }
    },
    getRequestDebugState() {
      return {
        lastApiRequest: getLastAPIRequest(),
        lastApiRequestMessages: getLastAPIRequestMessages(),
        lastClassifierRequests: getLastClassifierRequests(),
        promptId: getPromptId(),
        lastMainRequestId: getLastMainRequestId(),
        lastApiCompletionTimestamp: getLastApiCompletionTimestamp(),
      }
    },
    patchRequestDebugState(patch: RuntimeRequestDebugStatePatch) {
      if ('lastApiRequest' in patch) {
        setLastAPIRequest(patch.lastApiRequest ?? null)
      }
      if ('lastApiRequestMessages' in patch) {
        setLastAPIRequestMessages(patch.lastApiRequestMessages ?? null)
      }
      if ('lastClassifierRequests' in patch) {
        setLastClassifierRequests(patch.lastClassifierRequests ?? null)
      }
      if ('promptId' in patch) {
        setPromptId(patch.promptId ?? null)
      }
      if (
        'lastMainRequestId' in patch &&
        patch.lastMainRequestId !== undefined
      ) {
        setLastMainRequestId(patch.lastMainRequestId)
      }
      if (
        'lastApiCompletionTimestamp' in patch &&
        patch.lastApiCompletionTimestamp !== undefined
      ) {
        setLastApiCompletionTimestamp(patch.lastApiCompletionTimestamp)
      }
    },
    markPostCompaction() {
      markPostCompaction()
    },
    consumePostCompaction() {
      return consumePostCompaction()
    },
    isSessionPersistenceDisabled() {
      return isSessionPersistenceDisabled()
    },
  }
}

export function createAppStateProvider(
  options: RuntimeAppStateAdapterOptions,
): RuntimeAppStateProvider {
  return {
    getExecutionState() {
      const state = options.getAppState()
      return {
        toolPermissionContext: state.toolPermissionContext,
        fileHistory: state.fileHistory,
        attribution: state.attribution,
        fastMode: state.fastMode,
      }
    },
    getAppState() {
      return options.getAppState()
    },
    updateToolPermissionContext(updater) {
      options.setAppState(prev => {
        const next = updater(prev.toolPermissionContext)
        if (next === prev.toolPermissionContext) {
          return prev
        }
        return {
          ...prev,
          toolPermissionContext: next,
        }
      })
    },
    updateFileHistory(updater) {
      options.setAppState(prev => {
        const next = updater(prev.fileHistory)
        if (next === prev.fileHistory) {
          return prev
        }
        return {
          ...prev,
          fileHistory: next,
        }
      })
    },
    updateAttribution(updater) {
      options.setAppState(prev => {
        const next = updater(prev.attribution)
        if (next === prev.attribution) {
          return prev
        }
        return {
          ...prev,
          attribution: next,
        }
      })
    },
    setFastMode(value) {
      options.setAppState(prev => {
        if (prev.fastMode === value) {
          return prev
        }
        return {
          ...prev,
          fastMode: value,
        }
      })
    },
  }
}

export function createExecutionStateProviders(
  options: RuntimeAppStateAdapterOptions,
): RuntimeStateProviders {
  return {
    bootstrap: createBootstrapStateProvider(),
    app: createAppStateProvider(options),
  }
}
