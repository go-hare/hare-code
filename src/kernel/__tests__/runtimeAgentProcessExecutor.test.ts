import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { describe, expect, test } from 'bun:test'

import { createKernelRuntimeAgentProcessExecutor } from '../runtimeAgentProcessExecutor.js'

describe('createKernelRuntimeAgentProcessExecutor', () => {
  test('passes coordinator invocation fields through teammate args and env', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'kernel-agent-executor-'))
    const scriptPath = join(tempDir, 'echo-agent.js')

    try {
      await writeFile(
        scriptPath,
        [
          'let stdin = "";',
          'process.stdin.setEncoding("utf8");',
          'process.stdin.on("data", chunk => { stdin += chunk; });',
          'process.stdin.on("end", () => {',
          '  const payload = {',
          '    argv: process.argv.slice(2),',
          '    stdin,',
          '    env: {',
          '      teamName: process.env.HARE_KERNEL_AGENT_TEAM_NAME,',
          '      agentName: process.env.HARE_KERNEL_AGENT_NAME,',
          '      mode: process.env.HARE_KERNEL_AGENT_MODE,',
          '      taskId: process.env.HARE_KERNEL_AGENT_TASK_ID,',
          '      taskListId: process.env.HARE_KERNEL_AGENT_TASK_LIST_ID,',
          '      ownedFiles: process.env.HARE_KERNEL_AGENT_OWNED_FILES_JSON,',
          '    },',
          '  };',
          '  process.stdout.write(JSON.stringify({ type: "result", result: payload }) + "\\n");',
          '});',
        ].join('\n'),
      )

      const executor = createKernelRuntimeAgentProcessExecutor({
        command: process.execPath,
        args: [scriptPath],
      })

      const writes: string[] = []
      let flushCount = 0
      const result = await executor({
        request: {
          prompt: 'review these files',
          agentType: 'reviewer',
          name: 'worker@1',
          teamName: 'alpha',
          taskId: 'task-1',
          taskListId: 'team-alpha',
          ownedFiles: ['src/a.ts', 'src/b.ts'],
          model: 'gpt-5.4',
          mode: 'worker',
          metadata: {
            parentSessionId: 'session-parent-1',
          },
        },
        run: {
          runId: 'run-1',
          status: 'running',
          prompt: 'review these files',
          createdAt: '2026-04-28T00:00:00.000Z',
          updatedAt: '2026-04-28T00:00:00.000Z',
        },
        agent: {
          agentType: 'reviewer',
          whenToUse: 'Review code',
          source: 'projectSettings',
          active: true,
        },
        cwd: process.cwd(),
        signal: new AbortController().signal,
        output: {
          outputFile: '/tmp/kernel-agent-output.log',
          append(content) {
            writes.push(content)
          },
          async flush() {
            flushCount += 1
          },
        },
      })

      expect(result).toMatchObject({
        outputFile: '/tmp/kernel-agent-output.log',
        metadata: {
          executor: 'process',
          teamName: 'alpha',
          name: 'worker@1',
          mode: 'worker',
          taskId: 'task-1',
          taskListId: 'team-alpha',
          ownedFiles: ['src/a.ts', 'src/b.ts'],
        },
        result: {
          stdin: 'review these files',
          env: {
            teamName: 'alpha',
            agentName: 'worker-1',
            mode: 'worker',
            taskId: 'task-1',
            taskListId: 'team-alpha',
            ownedFiles: '["src/a.ts","src/b.ts"]',
          },
          argv: expect.arrayContaining([
            '--agent',
            'reviewer',
            '--model',
            'gpt-5.4',
            '--agent-id',
            'worker-1@alpha',
            '--agent-name',
            'worker-1',
            '--team-name',
            'alpha',
            '--parent-session-id',
            'session-parent-1',
            '--agent-type',
            'reviewer',
          ]),
        },
      })
      expect(writes).toEqual([])
      expect(flushCount).toBeGreaterThan(0)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
