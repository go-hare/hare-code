import { readFile, writeFile } from 'fs/promises'
import { enableConfigs } from '../utils/config.js'
import {
  clearMemoryFileCaches,
  getMemoryFiles,
  type MemoryFileInfo,
} from '../utils/claudemd.js'

export type KernelMemorySource =
  | 'managed'
  | 'user'
  | 'project'
  | 'local'
  | 'auto'
  | 'team'
  | 'unknown'

export type KernelMemoryDescriptor = {
  id: string
  path: string
  source: KernelMemorySource
  bytes: number
  parent?: string
  globs?: readonly string[]
}

export type KernelMemoryDocument = KernelMemoryDescriptor & {
  content: string
}

export type KernelMemoryUpdateRequest = {
  id: string
  content: string
}

export type KernelMemoryManager = {
  list(): Promise<readonly KernelMemoryDescriptor[]>
  read(id: string): Promise<KernelMemoryDocument>
  update(request: KernelMemoryUpdateRequest): Promise<KernelMemoryDocument>
}

export type KernelMemoryManagerOptions = {
  loadFiles?: () => Promise<MemoryFileInfo[]>
  readFile?: (path: string) => Promise<string>
  writeFile?: (path: string, content: string) => Promise<void>
  invalidateCaches?: () => void
}

export function createKernelMemoryManager(
  options: KernelMemoryManagerOptions = {},
): KernelMemoryManager {
  ensureConfigAccess()
  const loadFiles = options.loadFiles ?? (() => getMemoryFiles(false))
  const readMemoryFile = options.readFile ?? (path => readFile(path, 'utf8'))
  const writeMemoryFile =
    options.writeFile ?? ((path, content) => writeFile(path, content, 'utf8'))
  const invalidateCaches = options.invalidateCaches ?? clearMemoryFileCaches

  async function loadIndex(): Promise<Map<string, KernelMemoryDocument>> {
    const files = await loadFiles()
    const index = new Map<string, KernelMemoryDocument>()
    for (const file of files) {
      index.set(file.path, {
        id: file.path,
        path: file.path,
        source: toMemorySource(file.type),
        bytes: Buffer.byteLength(file.content),
        content: file.content,
        parent: file.parent,
        globs: file.globs,
      })
    }
    return index
  }

  async function readDocument(id: string): Promise<KernelMemoryDocument> {
    const entry = (await loadIndex()).get(id)
    if (entry) {
      return entry
    }
    const content = await readMemoryFile(id)
    return {
      id,
      path: id,
      source: 'unknown',
      bytes: Buffer.byteLength(content),
      content,
    }
  }

  return {
    async list() {
      return [...(await loadIndex()).values()].map(
        ({ content: _content, ...descriptor }) => descriptor,
      )
    },
    read: readDocument,
    async update(request) {
      await writeMemoryFile(request.id, request.content)
      invalidateCaches()
      return readDocument(request.id)
    },
  }
}

function toMemorySource(type: string): KernelMemorySource {
  switch (type) {
    case 'Managed':
      return 'managed'
    case 'User':
      return 'user'
    case 'Project':
      return 'project'
    case 'Local':
      return 'local'
    case 'AutoMem':
      return 'auto'
    case 'TeamMem':
      return 'team'
    default:
      return 'unknown'
  }
}

function ensureConfigAccess(): void {
  if (process.env.NODE_ENV !== 'test') {
    enableConfigs()
  }
}
