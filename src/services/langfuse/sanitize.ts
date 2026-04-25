import { homedir } from 'node:os'

const MAX_OUTPUT_LENGTH = 500
const REDACTED_FILE_TOOLS = new Set(['FileReadTool', 'FileWriteTool', 'FileEditTool'])
const REDACTED_SHELL_TOOLS = new Set(['BashTool', 'PowerShellTool'])
const SENSITIVE_OUTPUT_TOOLS = new Set(['ConfigTool', 'MCPTool'])

const SENSITIVE_KEY_PATTERN = /(?:api_?key|token|secret|password|credential|auth_header)/i

function getHomeDirPattern(): RegExp | null {
  const patterns = new Set<string>()
  const home =
    process.env.HOME ??
    process.env.USERPROFILE ??
    homedir()

  if (home) {
    patterns.add(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  }

  // Keep common synthetic home prefixes sanitized across platforms.
  patterns.add('/Users/[^/]+')
  patterns.add('/home/[^/]+')
  patterns.add('[A-Za-z]:\\\\Users\\\\[^\\\\]+')

  return new RegExp(Array.from(patterns).join('|'), 'g')
}

function replaceHomeDir(value: string): string {
  const pattern = getHomeDirPattern()
  return pattern ? value.replace(pattern, '~') : value
}

export function sanitizeGlobal(data: unknown): unknown {
  if (typeof data === 'string') {
    return replaceHomeDir(data)
  }
  if (typeof data === 'object' && data !== null) {
    return sanitizeObject(data as Record<string, unknown>)
  }
  return data
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '[REDACTED]'
    } else if (typeof value === 'string') {
      result[key] = replaceHomeDir(value)
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

export function sanitizeToolInput(toolName: string, input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input
  const obj = { ...(input as Record<string, unknown>) }

  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      obj[key] = '[REDACTED]'
    }
  }

  for (const key of ['file_path', 'path', 'directory'] as const) {
    if (key in obj && typeof obj[key] === 'string') {
      obj[key] = replaceHomeDir(obj[key] as string)
    }
  }
  return obj
}

export function sanitizeToolOutput(toolName: string, output: string): string {
  if (REDACTED_FILE_TOOLS.has(toolName)) {
    return `[file content redacted, ${output.length} chars]`
  }
  if (REDACTED_SHELL_TOOLS.has(toolName)) {
    if (output.length > MAX_OUTPUT_LENGTH) {
      return output.slice(0, MAX_OUTPUT_LENGTH) + '\n[truncated]'
    }
  }
  if (SENSITIVE_OUTPUT_TOOLS.has(toolName)) {
    return `[${toolName} output redacted, ${output.length} chars]`
  }
  return output
}
