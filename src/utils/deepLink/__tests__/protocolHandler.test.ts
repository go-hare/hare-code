import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { DeepLinkAction } from '../parseDeepLink.js'

const mockParseDeepLink = mock((_uri: string): DeepLinkAction => ({
  query: 'hello',
  cwd: 'D:/workspace/project',
}))
const mockLaunchInTerminal = mock(async () => true)
const mockReadLastFetchTime = mock(async (_cwd: string) => undefined as Date | undefined)
const mockBuildDeepLinkBanner = mock(() => 'mock deep link banner')
const mockUpdateGithubRepoPathMapping = mock(async () => {})
const mockGetKnownPathsForRepo = mock((_repo: string) => [] as string[])
const mockFilterExistingPaths = mock(async (_paths: string[]) => [] as string[])
const mockValidateRepoAtPath = mock(async (_path: string, _repo: string) => true)
const mockRemovePathFromRepo = mock((_repo: string, _path: string) => {})
const mockWaitForUrlEvent = mock(
  async (_timeoutMs?: number): Promise<string | null> => null,
)

mock.module('../parseDeepLink.js', () => ({
  parseDeepLink: mockParseDeepLink,
}))
mock.module('../registerProtocol.js', () => ({
  MACOS_BUNDLE_ID: 'com.anthropic.claude-code-url-handler',
}))
mock.module('../terminalLauncher.js', () => ({
  launchInTerminal: mockLaunchInTerminal,
}))
mock.module('../banner.js', () => ({
  buildDeepLinkBanner: mockBuildDeepLinkBanner,
  readLastFetchTime: mockReadLastFetchTime,
}))
mock.module('../../githubRepoPathMapping.js', () => ({
  updateGithubRepoPathMapping: mockUpdateGithubRepoPathMapping,
  getKnownPathsForRepo: mockGetKnownPathsForRepo,
  filterExistingPaths: mockFilterExistingPaths,
  validateRepoAtPath: mockValidateRepoAtPath,
  removePathFromRepo: mockRemovePathFromRepo,
}))
mock.module('url-handler-napi', () => ({
  waitForUrlEvent: mockWaitForUrlEvent,
}))

async function loadModule() {
  return import(`../protocolHandler.ts?case=${Math.random()}`)
}

const originalBundleId = process.env.__CFBundleIdentifier

beforeEach(() => {
  mockParseDeepLink.mockReset()
  mockLaunchInTerminal.mockReset()
  mockReadLastFetchTime.mockReset()
  mockBuildDeepLinkBanner.mockReset()
  mockUpdateGithubRepoPathMapping.mockReset()
  mockGetKnownPathsForRepo.mockReset()
  mockFilterExistingPaths.mockReset()
  mockValidateRepoAtPath.mockReset()
  mockRemovePathFromRepo.mockReset()
  mockWaitForUrlEvent.mockReset()

  mockParseDeepLink.mockImplementation((_uri: string): DeepLinkAction => ({
    query: 'hello',
    cwd: 'D:/workspace/project',
  }))
  mockLaunchInTerminal.mockImplementation(async () => true)
  mockReadLastFetchTime.mockImplementation(
    async (_cwd: string) => undefined as Date | undefined,
  )
  mockBuildDeepLinkBanner.mockImplementation(() => 'mock deep link banner')
  mockUpdateGithubRepoPathMapping.mockImplementation(async () => {})
  mockGetKnownPathsForRepo.mockImplementation((_repo: string) => [])
  mockFilterExistingPaths.mockImplementation(async (_paths: string[]) => [])
  mockValidateRepoAtPath.mockImplementation(
    async (_path: string, _repo: string) => true,
  )
  mockRemovePathFromRepo.mockImplementation((_repo: string, _path: string) => {})
  mockWaitForUrlEvent.mockImplementation(
    async (_timeoutMs?: number): Promise<string | null> => null,
  )

  delete process.env.__CFBundleIdentifier
})

afterEach(() => {
  if (originalBundleId === undefined) {
    delete process.env.__CFBundleIdentifier
  } else {
    process.env.__CFBundleIdentifier = originalBundleId
  }
})

describe('handleDeepLinkUri', () => {
  test('returns 1 when parsing fails', async () => {
    mockParseDeepLink.mockImplementation((_uri: string) => {
      throw new Error('invalid deep link')
    })
    const { handleDeepLinkUri } = await loadModule()

    await expect(handleDeepLinkUri('bad-uri')).resolves.toBe(1)
    expect(mockLaunchInTerminal).not.toHaveBeenCalled()
  })

  test('launches the current executable with the explicit cwd from the deep link', async () => {
    const { handleDeepLinkUri } = await loadModule()

    await expect(
      handleDeepLinkUri('claude-cli://prompt?q=hello'),
    ).resolves.toBe(0)

    expect(mockLaunchInTerminal).toHaveBeenCalledWith(process.execPath, {
      query: 'hello',
      cwd: 'D:/workspace/project',
      repo: undefined,
      lastFetchMs: undefined,
    })
  })

  test('resolves repo clones and forwards last fetch time to the launched process', async () => {
    const fetchTime = new Date('2026-04-25T12:34:56.000Z')
    mockParseDeepLink.mockImplementation((_uri: string): DeepLinkAction => ({
      query: 'hello',
      repo: 'owner/repo',
    }))
    mockGetKnownPathsForRepo.mockImplementation((_repo: string) => [
      'D:/repos/repo',
    ])
    mockFilterExistingPaths.mockImplementation(async (_paths: string[]) => [
      'D:/repos/repo',
    ])
    mockReadLastFetchTime.mockImplementation(async (_cwd: string) => fetchTime)

    const { handleDeepLinkUri } = await loadModule()

    await expect(
      handleDeepLinkUri('claude-cli://prompt?q=hello'),
    ).resolves.toBe(0)

    expect(mockLaunchInTerminal).toHaveBeenCalledWith(process.execPath, {
      query: 'hello',
      cwd: 'D:/repos/repo',
      repo: 'owner/repo',
      lastFetchMs: fetchTime.getTime(),
    })
  })
})

describe('handleUrlSchemeLaunch', () => {
  test('returns null without calling url-handler-napi when bundle id does not match', async () => {
    process.env.__CFBundleIdentifier = 'other.bundle'
    const { handleUrlSchemeLaunch } = await loadModule()

    await expect(handleUrlSchemeLaunch()).resolves.toBeNull()
    expect(mockWaitForUrlEvent).not.toHaveBeenCalled()
  })

  test('returns null when the bundle id matches but no URL arrives', async () => {
    process.env.__CFBundleIdentifier = 'com.anthropic.claude-code-url-handler'
    const { handleUrlSchemeLaunch } = await loadModule()

    await expect(handleUrlSchemeLaunch()).resolves.toBeNull()
    expect(mockWaitForUrlEvent).toHaveBeenCalledWith(5000)
  })

  test('handles URL launches through url-handler-napi', async () => {
    process.env.__CFBundleIdentifier = 'com.anthropic.claude-code-url-handler'
    mockWaitForUrlEvent.mockImplementation(
      async (_timeoutMs?: number): Promise<string | null> =>
        'claude-cli://prompt?q=hello',
    )
    const { handleUrlSchemeLaunch } = await loadModule()

    await expect(handleUrlSchemeLaunch()).resolves.toBe(0)
    expect(mockParseDeepLink).toHaveBeenCalledWith(
      'claude-cli://prompt?q=hello',
    )
  })
})
