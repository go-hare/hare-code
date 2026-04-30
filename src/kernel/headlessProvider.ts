import type { APIProvider } from '../utils/model/providers.js'
import type { KernelHeadlessRunOptions } from './headless.js'

export type KernelHeadlessProviderName = APIProvider

export type KernelHeadlessProviderEnvOptions = {
  provider?: KernelHeadlessProviderName
  apiKey?: string
  baseUrl?: string
  model?: string
  fallbackModel?: string
  extraEnv?: Record<string, string | undefined>
}

export type KernelHeadlessProviderEnvResult = {
  env: Record<string, string>
  runOptions: Pick<
    KernelHeadlessRunOptions,
    'userSpecifiedModel' | 'fallbackModel'
  >
}

const PROVIDER_FLAG_ENV: Partial<
  Record<KernelHeadlessProviderName, string>
> = {
  bedrock: 'CLAUDE_CODE_USE_BEDROCK',
  vertex: 'CLAUDE_CODE_USE_VERTEX',
  foundry: 'CLAUDE_CODE_USE_FOUNDRY',
  openai: 'CLAUDE_CODE_USE_OPENAI',
  gemini: 'CLAUDE_CODE_USE_GEMINI',
  grok: 'CLAUDE_CODE_USE_GROK',
}

const PROVIDER_BASE_URL_ENV: Record<KernelHeadlessProviderName, string> = {
  firstParty: 'ANTHROPIC_BASE_URL',
  bedrock: 'ANTHROPIC_BEDROCK_BASE_URL',
  vertex: 'ANTHROPIC_VERTEX_BASE_URL',
  foundry: 'ANTHROPIC_FOUNDRY_BASE_URL',
  openai: 'OPENAI_BASE_URL',
  gemini: 'GEMINI_BASE_URL',
  grok: 'GROK_BASE_URL',
}

const PROVIDER_MODEL_ENV: Record<KernelHeadlessProviderName, string> = {
  firstParty: 'ANTHROPIC_MODEL',
  bedrock: 'ANTHROPIC_MODEL',
  vertex: 'ANTHROPIC_MODEL',
  foundry: 'ANTHROPIC_MODEL',
  openai: 'OPENAI_MODEL',
  gemini: 'GEMINI_MODEL',
  grok: 'GROK_MODEL',
}

const PROVIDER_API_KEY_ENV: Partial<
  Record<KernelHeadlessProviderName, string>
> = {
  firstParty: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  grok: 'GROK_API_KEY',
}

export function createKernelHeadlessProviderEnv(
  options: KernelHeadlessProviderEnvOptions = {},
): KernelHeadlessProviderEnvResult {
  const provider = options.provider ?? 'firstParty'
  const env = withDefinedEntries(options.extraEnv)

  const flagEnv = PROVIDER_FLAG_ENV[provider]
  if (flagEnv) {
    env[flagEnv] = '1'
  }

  const apiKeyEnv = PROVIDER_API_KEY_ENV[provider]
  if (apiKeyEnv && options.apiKey) {
    env[apiKeyEnv] = options.apiKey
  }

  if (options.baseUrl) {
    env[PROVIDER_BASE_URL_ENV[provider]] = options.baseUrl
  }

  if (options.model) {
    env[PROVIDER_MODEL_ENV[provider]] = options.model
  }

  return {
    env,
    runOptions: {
      userSpecifiedModel: options.model,
      fallbackModel: options.fallbackModel,
    },
  }
}

function withDefinedEntries(
  value: Record<string, string | undefined> | undefined,
): Record<string, string> {
  if (!value) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}
