import { describe, expect, test } from 'bun:test'
import { readFile } from 'fs/promises'
import { join } from 'path'

const repoRoot = join(import.meta.dir, '../../..')

const componentFiles = [
  'src/components/DevChannelsDialog.tsx',
  'src/components/BridgeDialog.tsx',
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
  'src/components/Settings/Status.tsx',
  'src/components/agents/generateAgent.ts',
  'src/components/memory/MemoryFileSelector.tsx',
  'src/components/messages/UserPromptMessage.tsx',
  'src/components/permissions/FallbackPermissionRequest.tsx',
  'src/components/permissions/FilePermissionDialog/permissionOptions.tsx',
  'src/components/permissions/SkillPermissionRequest/SkillPermissionRequest.tsx',
  'src/components/permissions/rules/WorkspaceTab.tsx',
  'src/components/permissions/shellPermissionHelpers.tsx',
  'src/components/ultraplan/UltraplanChoiceDialog.tsx',
] as const

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(join(repoRoot, relativePath), 'utf8')
}

describe('component runtime state import discipline', () => {
  for (const relativePath of componentFiles) {
    test(`${relativePath} does not import bootstrap/state.js directly`, async () => {
      const content = await readRepoFile(relativePath)
      expect(content).not.toContain('bootstrap/state.js')
    })
  }

  test('shared-blocker and host UI components route state through runtime providers', async () => {
    const spinnerContent = await readRepoFile('src/components/Spinner.tsx')
    const statusLineContent = await readRepoFile('src/components/StatusLine.tsx')
    const configContent = await readRepoFile('src/components/Settings/Config.tsx')
    const trustDialogContent = await readRepoFile(
      'src/components/TrustDialog/TrustDialog.tsx',
    )
    const devBarContent = await readRepoFile('src/components/DevBar.tsx')
    const channelsNoticeContent = await readRepoFile(
      'src/components/LogoV2/ChannelsNotice.tsx',
    )
    const userPromptMessageContent = await readRepoFile(
      'src/components/messages/UserPromptMessage.tsx',
    )
    const ultraplanChoiceContent = await readRepoFile(
      'src/components/ultraplan/UltraplanChoiceDialog.tsx',
    )
    const generateAgentContent = await readRepoFile(
      'src/components/agents/generateAgent.ts',
    )

    expect(spinnerContent).toContain('createRuntimeKairosStateProvider')
    expect(spinnerContent).toContain(
      'createRuntimeUserMessageOptInStateProvider',
    )
    expect(spinnerContent).toContain('createRuntimeUsageStateProvider')
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
    expect(trustDialogContent).toContain(
      'createRuntimeSessionPolicyStateWriter',
    )
    expect(devBarContent).toContain('createRuntimeObservabilityStateProvider')
    expect(channelsNoticeContent).toContain(
      'createRuntimeHeadlessControlStateProvider',
    )
    expect(userPromptMessageContent).toContain(
      'createRuntimeKairosStateProvider',
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
  })
})
