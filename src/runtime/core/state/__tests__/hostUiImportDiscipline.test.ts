import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(import.meta.dir, '../../../../..')

const hostUiTargets = [
  'src/components/BridgeDialog.tsx',
  'src/components/DevChannelsDialog.tsx',
  'src/components/DevBar.tsx',
  'src/components/Feedback.tsx',
  'src/components/LogoV2/ChannelsNotice.tsx',
  'src/components/LogSelector.tsx',
  'src/components/Messages.tsx',
  'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
  'src/components/Spinner.tsx',
  'src/components/StatusLine.tsx',
  'src/components/TrustDialog/TrustDialog.tsx',
  'src/components/Settings/Config.tsx',
  'src/components/agents/generateAgent.ts',
  'src/components/memory/MemoryFileSelector.tsx',
  'src/components/messages/UserPromptMessage.tsx',
  'src/components/permissions/FallbackPermissionRequest.tsx',
  'src/components/permissions/shellPermissionHelpers.tsx',
  'src/components/permissions/FilePermissionDialog/permissionOptions.tsx',
  'src/components/permissions/rules/WorkspaceTab.tsx',
  'src/components/permissions/SkillPermissionRequest/SkillPermissionRequest.tsx',
  'src/components/Settings/Status.tsx',
  'src/components/ultraplan/UltraplanChoiceDialog.tsx',
  'src/hooks/useApiKeyVerification.ts',
  'src/hooks/usePluginRecommendationBase.tsx',
  'src/hooks/usePrStatus.ts',
  'src/hooks/useSwarmInitialization.ts',
  'src/hooks/notifs/useAutoModeUnavailableNotification.ts',
  'src/hooks/notifs/useDeprecationWarningNotification.tsx',
  'src/hooks/notifs/useFastModeNotification.tsx',
  'src/hooks/notifs/useIDEStatusIndicator.tsx',
  'src/hooks/notifs/useMcpConnectivityStatus.tsx',
  'src/hooks/notifs/usePluginAutoupdateNotification.tsx',
  'src/hooks/notifs/usePluginInstallationStatus.tsx',
  'src/hooks/notifs/useRateLimitWarningNotification.tsx',
  'src/hooks/notifs/useSettingsErrors.tsx',
  'src/hooks/notifs/useStartupNotification.ts',
  'src/hooks/notifs/useTeammateShutdownNotification.ts',
  'src/hooks/useTeleportResume.tsx',
  'src/commands/assistant/assistant.tsx',
  'src/commands/coordinator.ts',
  'src/commands/branch/branch.ts',
  'src/commands/brief.ts',
  'src/commands/chrome/index.ts',
  'src/commands/color/color.ts',
  'src/commands/context/index.ts',
  'src/commands/extra-usage/index.ts',
  'src/commands/reload-plugins/reload-plugins.ts',
  'src/commands/rename/rename.ts',
  'src/commands/resume/resume.tsx',
  'src/commands/session/index.ts',
  'src/screens/Doctor.tsx',
  'src/screens/ResumeConversation.tsx',
  'src/services/awaySummary.ts',
  'src/services/claudeAiLimits.ts',
  'src/services/tokenEstimation.ts',
  'src/services/voiceKeyterms.ts',
] as const

function readSource(file: string): string {
  return readFileSync(join(repoRoot, file), 'utf8')
}

describe('host/UI bootstrap import discipline', () => {
  for (const file of hostUiTargets) {
    test(`${file} does not import bootstrap state directly`, () => {
      const content = readSource(file)
      expect(content).not.toContain("from 'src/bootstrap/state.js'")
      expect(content).not.toContain("from './bootstrap/state.js'")
      expect(content).not.toContain("from '../bootstrap/state.js'")
      expect(content).not.toContain("from '../../bootstrap/state.js'")
      expect(content).not.toContain("from '../../../bootstrap/state.js'")
    })
  }

  test('components route session and remote host data through runtime providers', () => {
    const bridgeDialogContent = readSource('src/components/BridgeDialog.tsx')
    const feedbackContent = readSource('src/components/Feedback.tsx')
    const logSelectorContent = readSource('src/components/LogSelector.tsx')
    const messagesContent = readSource('src/components/Messages.tsx')

    expect(bridgeDialogContent).toContain(
      'createRuntimeSessionIdentityStateProvider',
    )
    expect(feedbackContent).toContain(
      'createRuntimeRequestDebugStateProvider',
    )
    expect(logSelectorContent).toContain(
      'createRuntimeSessionIdentityStateProvider',
    )
    expect(messagesContent).toContain(
      'createRuntimeHeadlessControlStateProvider',
    )
  })

  test('hooks and notifications read remote or activity state through runtime providers', () => {
    const prStatusContent = readSource('src/hooks/usePrStatus.ts')
    const startupNotificationContent = readSource(
      'src/hooks/notifs/useStartupNotification.ts',
    )
    const swarmInitContent = readSource('src/hooks/useSwarmInitialization.ts')

    expect(prStatusContent).toContain('createRuntimeUsageStateProvider')
    expect(startupNotificationContent).toContain(
      'createRuntimeHeadlessControlStateProvider',
    )
    expect(swarmInitContent).toContain(
      'createRuntimeSessionIdentityStateProvider',
    )
  })

  test('commands and services read session and remote state through runtime providers', () => {
    const resumeContent = readSource('src/commands/resume/resume.tsx')
    const sessionContent = readSource('src/commands/session/index.ts')
    const tokenEstimationContent = readSource(
      'src/services/tokenEstimation.ts',
    )

    expect(resumeContent).toContain(
      'createRuntimeSessionIdentityStateProvider',
    )
    expect(sessionContent).toContain(
      'createRuntimeHeadlessControlStateProvider',
    )
    expect(tokenEstimationContent).toContain(
      'createRuntimeSessionIdentityStateProvider',
    )
  })

  test('shared-blocker, teleport, trust, and observability state flow through runtime seams', () => {
    const briefContent = readSource('src/commands/brief.ts')
    const assistantContent = readSource('src/commands/assistant/assistant.tsx')
    const spinnerContent = readSource('src/components/Spinner.tsx')
    const statusLineContent = readSource('src/components/StatusLine.tsx')
    const configContent = readSource('src/components/Settings/Config.tsx')
    const teleportResumeContent = readSource('src/hooks/useTeleportResume.tsx')
    const trustDialogContent = readSource(
      'src/components/TrustDialog/TrustDialog.tsx',
    )
    const devBarContent = readSource('src/components/DevBar.tsx')
    const channelsNoticeContent = readSource(
      'src/components/LogoV2/ChannelsNotice.tsx',
    )
    const userPromptMessageContent = readSource(
      'src/components/messages/UserPromptMessage.tsx',
    )
    const ultraplanChoiceContent = readSource(
      'src/components/ultraplan/UltraplanChoiceDialog.tsx',
    )
    const generateAgentContent = readSource(
      'src/components/agents/generateAgent.ts',
    )
    const doctorContent = readSource('src/screens/Doctor.tsx')
    const resumeConversationContent = readSource(
      'src/screens/ResumeConversation.tsx',
    )

    expect(briefContent).toContain('createRuntimeKairosStateProvider')
    expect(briefContent).toContain(
      'createRuntimeUserMessageOptInStateProvider',
    )
    expect(assistantContent).toContain('createRuntimeKairosStateProvider')
    expect(spinnerContent).toContain('createRuntimeUsageStateProvider')
    expect(spinnerContent).toContain(
      'createRuntimeUserMessageOptInStateProvider',
    )
    expect(statusLineContent).toContain(
      'createRuntimeHeadlessControlStateProvider',
    )
    expect(statusLineContent).toContain('createRuntimePromptStateProvider')
    expect(statusLineContent).toContain(
      'createRuntimeSessionIdentityStateProvider',
    )
    expect(configContent).toContain(
      'createRuntimeUserMessageOptInStateProvider',
    )
    expect(teleportResumeContent).toContain(
      'createRuntimeTeleportStateWriter',
    )
    expect(trustDialogContent).toContain(
      'createRuntimeSessionPolicyStateWriter',
    )
    expect(devBarContent).toContain('createRuntimeObservabilityStateProvider')
    expect(channelsNoticeContent).toContain(
      'createRuntimeHeadlessControlStateProvider',
    )
    expect(userPromptMessageContent).toContain(
      'createRuntimeUserMessageOptInStateProvider',
    )
    expect(ultraplanChoiceContent).toContain(
      'createRuntimeSessionIdentityStateProvider',
    )
    expect(generateAgentContent).toContain(
      'createRuntimeSessionIdentityStateProvider',
    )
    expect(doctorContent).toContain(
      'createRuntimeSessionIdentityStateProvider',
    )
    expect(resumeConversationContent).toContain(
      'createRuntimeSessionIdentityStateProvider',
    )
  })
})
