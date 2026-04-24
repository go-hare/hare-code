import { getSessionId } from '../../../bootstrap/state.js'
import type { ToolUseContext } from '../../../Tool.js'
import { formatAgentId, parseAgentId } from '../../../utils/agentId.js'
import { quote } from '../../../utils/bash/shellQuote.js'
import { isInBundledMode } from '../../../utils/bundledMode.js'
import { registerCleanup } from '../../../utils/cleanupRegistry.js'
import { logForDebugging } from '../../../utils/debug.js'
import { jsonStringify } from '../../../utils/slowOperations.js'
import { writeToMailbox } from '../../../utils/teammateMailbox.js'
import {
  buildInheritedCliArgParts,
  buildInheritedEnvVars,
  getInheritedEnvVarAssignments,
  getTeammateCommand,
} from '../spawnUtils.js'
import { assignTeammateColor } from '../teammateLayoutManager.js'
import { isInsideTmux } from './detection.js'
import type {
  BackendType,
  PaneBackend,
  TeammateExecutor,
  TeammateMessage,
  TeammateSpawnConfig,
  TeammateSpawnResult,
} from './types.js'

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function withoutModelArg(args: string[]): string[] {
  const filtered: string[] = []
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--model') {
      i += 1
      continue
    }
    filtered.push(args[i]!)
  }
  return filtered
}

function buildPowerShellSpawnCommand(
  binaryPath: string,
  args: string[],
  cwd: string,
): string {
  const envAssignments = getInheritedEnvVarAssignments().map(
    ([key, value]) => `$env:${key} = ${quotePowerShellString(value)}`,
  )
  const invocation = isInBundledMode()
    ? `& ${quotePowerShellString(binaryPath)}`
    : `& ${quotePowerShellString(process.execPath)} ${quotePowerShellString(binaryPath)}`
  return [
    `Set-Location -LiteralPath ${quotePowerShellString(cwd)}`,
    ...envAssignments,
    `${invocation} ${args.map(quotePowerShellString).join(' ')}`,
  ].join('; ')
}

export class PaneBackendExecutor implements TeammateExecutor {
  readonly type: BackendType

  private backend: PaneBackend
  private context: ToolUseContext | null = null
  private spawnedTeammates: Map<string, { paneId: string; insideTmux: boolean }>
  private cleanupRegistered = false

  constructor(backend: PaneBackend) {
    this.backend = backend
    this.type = backend.type
    this.spawnedTeammates = new Map()
  }

  setContext(context: ToolUseContext): void {
    this.context = context
  }

  async isAvailable(): Promise<boolean> {
    return this.backend.isAvailable()
  }

  async spawn(config: TeammateSpawnConfig): Promise<TeammateSpawnResult> {
    const agentId = formatAgentId(config.name, config.teamName)

    if (!this.context) {
      logForDebugging(
        `[PaneBackendExecutor] spawn() called without context for ${config.name}`,
      )
      return {
        success: false,
        agentId,
        error:
          'PaneBackendExecutor not initialized. Call setContext() before spawn().',
      }
    }

    try {
      const teammateColor = config.color ?? assignTeammateColor(agentId)

      const paneResult =
        config.useSplitPane === false &&
        this.backend.createTeammateWindowInSwarmView
          ? await this.backend.createTeammateWindowInSwarmView(
              config.name,
              teammateColor,
            )
          : await this.backend.createTeammatePaneInSwarmView(
              config.name,
              teammateColor,
            )
      const { paneId, isFirstTeammate } = paneResult

      const insideTmux = await isInsideTmux()

      if (isFirstTeammate && insideTmux) {
        await this.backend.enablePaneBorderStatus()
      }

      const binaryPath = getTeammateCommand()

      const teammateArgs = [
        '--agent-id',
        agentId,
        '--agent-name',
        config.name,
        '--team-name',
        config.teamName,
        '--agent-color',
        teammateColor,
        '--parent-session-id',
        config.parentSessionId || getSessionId(),
        ...(config.planModeRequired ? ['--plan-mode-required'] : []),
        ...(config.agentType ? ['--agent-type', config.agentType] : []),
      ]

      const appState = this.context.getAppState()
      let inheritedArgParts = buildInheritedCliArgParts({
        planModeRequired: config.planModeRequired,
        permissionMode: appState.toolPermissionContext.mode,
      })

      if (config.model) {
        inheritedArgParts = withoutModelArg(inheritedArgParts)
        inheritedArgParts.push('--model', config.model)
      }

      const workingDir = config.cwd
      const envStr = buildInheritedEnvVars()
      const allArgs = [...teammateArgs, ...inheritedArgParts]
      const spawnCommand =
        this.type === 'windows-terminal'
          ? buildPowerShellSpawnCommand(binaryPath, allArgs, workingDir)
          : `cd ${quote([workingDir])} && env ${envStr} ${quote([binaryPath])} ${quote(allArgs)}`

      await this.backend.sendCommandToPane(paneId, spawnCommand, !insideTmux)

      this.spawnedTeammates.set(agentId, { paneId, insideTmux })

      if (!this.cleanupRegistered) {
        this.cleanupRegistered = true
        registerCleanup(async () => {
          for (const [id, info] of this.spawnedTeammates) {
            logForDebugging(
              `[PaneBackendExecutor] Cleanup: killing pane for ${id}`,
            )
            await this.backend.killPane(info.paneId, !info.insideTmux)
          }
          this.spawnedTeammates.clear()
        })
      }

      await writeToMailbox(
        config.name,
        {
          from: 'team-lead',
          text: config.prompt,
          timestamp: new Date().toISOString(),
        },
        config.teamName,
      )

      logForDebugging(
        `[PaneBackendExecutor] Spawned teammate ${agentId} in pane ${paneId}`,
      )

      return {
        success: true,
        agentId,
        paneId,
        backendType: this.type,
        color: teammateColor,
        insideTmux,
        windowName:
          'windowName' in paneResult
            ? (paneResult as { windowName: string }).windowName
            : undefined,
        isSplitPane: config.useSplitPane !== false,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logForDebugging(
        `[PaneBackendExecutor] Failed to spawn ${agentId}: ${errorMessage}`,
      )
      return {
        success: false,
        agentId,
        error: errorMessage,
      }
    }
  }

  async sendMessage(agentId: string, message: TeammateMessage): Promise<void> {
    logForDebugging(
      `[PaneBackendExecutor] sendMessage() to ${agentId}: ${message.text.substring(0, 50)}...`,
    )

    const parsed = parseAgentId(agentId)
    if (!parsed) {
      throw new Error(
        `Invalid agentId format: ${agentId}. Expected format: agentName@teamName`,
      )
    }

    const { agentName, teamName } = parsed

    await writeToMailbox(
      agentName,
      {
        text: message.text,
        from: message.from,
        color: message.color,
        timestamp: message.timestamp ?? new Date().toISOString(),
      },
      teamName,
    )

    logForDebugging(
      `[PaneBackendExecutor] sendMessage() completed for ${agentId}`,
    )
  }

  async terminate(agentId: string, reason?: string): Promise<boolean> {
    logForDebugging(
      `[PaneBackendExecutor] terminate() called for ${agentId}: ${reason}`,
    )

    const parsed = parseAgentId(agentId)
    if (!parsed) {
      logForDebugging(
        `[PaneBackendExecutor] terminate() failed: invalid agentId format`,
      )
      return false
    }

    const { agentName, teamName } = parsed

    const shutdownRequest = {
      type: 'shutdown_request',
      requestId: `shutdown-${agentId}-${Date.now()}`,
      from: 'team-lead',
      reason,
    }

    await writeToMailbox(
      agentName,
      {
        from: 'team-lead',
        text: jsonStringify(shutdownRequest),
        timestamp: new Date().toISOString(),
      },
      teamName,
    )

    logForDebugging(
      `[PaneBackendExecutor] terminate() sent shutdown request to ${agentId}`,
    )
    return true
  }

  async kill(agentId: string): Promise<boolean> {
    logForDebugging(`[PaneBackendExecutor] kill() called for ${agentId}`)

    const spawned = this.spawnedTeammates.get(agentId)
    if (!spawned) {
      logForDebugging(
        `[PaneBackendExecutor] kill() failed: no pane found for ${agentId}`,
      )
      return false
    }

    const success = await this.backend.killPane(spawned.paneId, !spawned.insideTmux)

    if (success) {
      this.spawnedTeammates.delete(agentId)
      logForDebugging(`[PaneBackendExecutor] kill() succeeded for ${agentId}`)
    } else {
      logForDebugging(`[PaneBackendExecutor] kill() failed for ${agentId}`)
    }

    return success
  }

  async isActive(agentId: string): Promise<boolean> {
    return this.spawnedTeammates.has(agentId)
  }
}

export function createPaneBackendExecutor(
  backend: PaneBackend,
): TeammateExecutor {
  return new PaneBackendExecutor(backend)
}
