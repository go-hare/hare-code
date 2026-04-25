import { afterEach, describe, expect, test } from 'bun:test'
import { unlink } from 'fs/promises'
import { asAgentId } from '../../types/ids.js'
import {
  getAgentTranscriptPath,
  readAgentMetadata,
  writeAgentMetadata,
} from '../sessionStorage.js'

const agentId = asAgentId('resume-lineage-test')
const metadataPath = getAgentTranscriptPath(agentId).replace(
  /\.jsonl$/,
  '.meta.json',
)

describe('agent metadata persistence', () => {
  afterEach(async () => {
    await unlink(metadataPath).catch(() => {})
  })

  test('persists activeTaskExecutionContext for resume lineage restoration', async () => {
    await writeAgentMetadata(agentId, {
      agentType: 'worker',
      ownedFiles: ['src/coordinator/writeGuard.ts'],
      activeTaskExecutionContext: {
        taskListId: 'alpha-team',
        taskId: '42',
        ownedFiles: ['src/coordinator/writeGuard.ts'],
      },
    })

    await expect(readAgentMetadata(agentId)).resolves.toEqual({
      agentType: 'worker',
      ownedFiles: ['src/coordinator/writeGuard.ts'],
      activeTaskExecutionContext: {
        taskListId: 'alpha-team',
        taskId: '42',
        ownedFiles: ['src/coordinator/writeGuard.ts'],
      },
    })
  })
})
