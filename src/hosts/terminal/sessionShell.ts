import type { TabStatusKind } from '@anthropic/ink'

export type TerminalFocusedInputDialog =
  | 'message-selector'
  | 'sandbox-permission'
  | 'tool-permission'
  | 'prompt'
  | 'worker-sandbox-permission'
  | 'elicitation'
  | 'cost'
  | 'idle-return'
  | 'init-onboarding'
  | 'ide-onboarding'
  | 'model-switch'
  | 'undercover-callout'
  | 'effort-callout'
  | 'remote-callout'
  | 'lsp-recommendation'
  | 'plugin-hint'
  | 'desktop-upsell'
  | 'ultraplan-choice'
  | 'ultraplan-launch'
  | undefined

export function getTerminalSessionShellState(options: {
  isLoading: boolean
  activeToolName?: string
  hasToolPermissionRequest: boolean
  hasPromptRequest: boolean
  hasSandboxPermissionRequest: boolean
  hasWorkerSandboxRequest: boolean
  hasElicitationRequest: boolean
  hasPendingWorkerRequest: boolean
  hasPendingSandboxRequest: boolean
  isShowingLocalJSXCommand: boolean
}) {
  const isWaitingForApproval =
    options.hasToolPermissionRequest ||
    options.hasPromptRequest ||
    options.hasPendingWorkerRequest ||
    options.hasPendingSandboxRequest

  const sessionStatus: TabStatusKind =
    isWaitingForApproval || options.isShowingLocalJSXCommand
      ? 'waiting'
      : options.isLoading
        ? 'busy'
        : 'idle'

  return {
    hasActivePrompt:
      options.hasToolPermissionRequest ||
      options.hasPromptRequest ||
      options.hasSandboxPermissionRequest ||
      options.hasWorkerSandboxRequest ||
      options.hasElicitationRequest,
    isWaitingForApproval,
    titleIsAnimating:
      options.isLoading &&
      !isWaitingForApproval &&
      !options.isShowingLocalJSXCommand,
    sessionStatus,
    waitingFor:
      sessionStatus !== 'waiting'
        ? undefined
        : options.hasToolPermissionRequest
          ? `approve ${options.activeToolName ?? 'tool'}`
          : options.hasPendingWorkerRequest
            ? 'worker request'
            : options.hasPendingSandboxRequest
              ? 'sandbox request'
              : options.isShowingLocalJSXCommand
                ? 'dialog open'
                : 'input needed',
  }
}

export function resolveTerminalFocusedInputDialog(options: {
  isExiting: boolean
  hasExitFlow: boolean
  isMessageSelectorVisible: boolean
  isPromptInputActive: boolean
  allowDialogsWithAnimation: boolean
  hasSandboxPermissionRequest: boolean
  hasToolPermissionRequest: boolean
  hasPromptRequest: boolean
  hasWorkerSandboxRequest: boolean
  hasElicitationRequest: boolean
  showingCostDialog: boolean
  hasIdleReturnDialog: boolean
  isUltraplanEnabled: boolean
  hasUltraplanChoice: boolean
  hasUltraplanLaunch: boolean
  isLoading: boolean
  showIdeOnboarding: boolean
  showModelSwitchCallout: boolean
  showUndercoverCallout: boolean
  showEffortCallout: boolean
  showRemoteCallout: boolean
  hasLspRecommendation: boolean
  hasPluginHint: boolean
  showDesktopUpsellStartup: boolean
  isAntUser: boolean
}): TerminalFocusedInputDialog {
  if (options.isExiting || options.hasExitFlow) {
    return undefined
  }

  if (options.isMessageSelectorVisible) {
    return 'message-selector'
  }

  if (options.isPromptInputActive) {
    return undefined
  }

  if (options.hasSandboxPermissionRequest) {
    return 'sandbox-permission'
  }

  if (
    options.allowDialogsWithAnimation &&
    options.hasToolPermissionRequest
  ) {
    return 'tool-permission'
  }

  if (options.allowDialogsWithAnimation && options.hasPromptRequest) {
    return 'prompt'
  }

  if (
    options.allowDialogsWithAnimation &&
    options.hasWorkerSandboxRequest
  ) {
    return 'worker-sandbox-permission'
  }

  if (options.allowDialogsWithAnimation && options.hasElicitationRequest) {
    return 'elicitation'
  }

  if (options.allowDialogsWithAnimation && options.showingCostDialog) {
    return 'cost'
  }

  if (options.allowDialogsWithAnimation && options.hasIdleReturnDialog) {
    return 'idle-return'
  }

  if (
    options.isUltraplanEnabled &&
    options.allowDialogsWithAnimation &&
    !options.isLoading &&
    options.hasUltraplanChoice
  ) {
    return 'ultraplan-choice'
  }

  if (
    options.isUltraplanEnabled &&
    options.allowDialogsWithAnimation &&
    !options.isLoading &&
    options.hasUltraplanLaunch
  ) {
    return 'ultraplan-launch'
  }

  if (options.allowDialogsWithAnimation && options.showIdeOnboarding) {
    return 'ide-onboarding'
  }

  if (
    options.isAntUser &&
    options.allowDialogsWithAnimation &&
    options.showModelSwitchCallout
  ) {
    return 'model-switch'
  }

  if (
    options.isAntUser &&
    options.allowDialogsWithAnimation &&
    options.showUndercoverCallout
  ) {
    return 'undercover-callout'
  }

  if (options.allowDialogsWithAnimation && options.showEffortCallout) {
    return 'effort-callout'
  }

  if (options.allowDialogsWithAnimation && options.showRemoteCallout) {
    return 'remote-callout'
  }

  if (options.allowDialogsWithAnimation && options.hasLspRecommendation) {
    return 'lsp-recommendation'
  }

  if (options.allowDialogsWithAnimation && options.hasPluginHint) {
    return 'plugin-hint'
  }

  if (
    options.allowDialogsWithAnimation &&
    options.showDesktopUpsellStartup
  ) {
    return 'desktop-upsell'
  }

  return undefined
}

export function hasSuppressedTerminalDialogs(options: {
  isPromptInputActive: boolean
  hasSandboxPermissionRequest: boolean
  hasToolPermissionRequest: boolean
  hasPromptRequest: boolean
  hasWorkerSandboxRequest: boolean
  hasElicitationRequest: boolean
  showingCostDialog: boolean
}) {
  return (
    options.isPromptInputActive &&
    (options.hasSandboxPermissionRequest ||
      options.hasToolPermissionRequest ||
      options.hasPromptRequest ||
      options.hasWorkerSandboxRequest ||
      options.hasElicitationRequest ||
      options.showingCostDialog)
  )
}

export function shouldShowTerminalSpinner(options: {
  toolOverlayShowsSpinner: boolean
  hasToolPermissionRequest: boolean
  hasPromptRequest: boolean
  isLoading: boolean
  hasUserInputInFlight: boolean
  hasRunningTeammates: boolean
  queuedCommandCount: number
  hasPendingWorkerRequest: boolean
  hasOnlySleepToolActive: boolean
  hasVisibleStreamingText: boolean
  isBriefOnly: boolean
}) {
  return (
    options.toolOverlayShowsSpinner &&
    !options.hasToolPermissionRequest &&
    !options.hasPromptRequest &&
    (options.isLoading ||
      options.hasUserInputInFlight ||
      options.hasRunningTeammates ||
      options.queuedCommandCount > 0) &&
    !options.hasPendingWorkerRequest &&
    !options.hasOnlySleepToolActive &&
    (!options.hasVisibleStreamingText || options.isBriefOnly)
  )
}
