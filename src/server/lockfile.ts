export interface ServerLockInfo {
  pid: number
  port: number
  host: string
  httpUrl: string
  startedAt: number
}

import { unlink, writeFile, readFile } from 'fs/promises'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { isFsInaccessible } from '../utils/errors.js'
import { isProcessRunning } from '../utils/genericProcessUtils.js'

function getServerLockPath(): string {
  return join(getClaudeConfigHomeDir(), 'server.lock.json')
}

export async function writeServerLock(info: ServerLockInfo): Promise<void> {
  await writeFile(getServerLockPath(), JSON.stringify(info, null, 2))
}

export async function removeServerLock(): Promise<void> {
  try {
    await unlink(getServerLockPath())
  } catch (error) {
    if (!isFsInaccessible(error)) {
      throw error
    }
  }
}

export async function probeRunningServer(): Promise<ServerLockInfo | null> {
  try {
    const raw = await readFile(getServerLockPath(), 'utf8')
    const parsed = JSON.parse(raw) as ServerLockInfo
    if (!isProcessRunning(parsed.pid)) {
      await removeServerLock()
      return null
    }
    return parsed
  } catch (error) {
    if (isFsInaccessible(error)) {
      return null
    }
    throw error
  }
}
