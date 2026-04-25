import {
  getActiveAgentsFromList,
  getAgentDefinitionsWithOverrides,
  type AgentDefinition,
  type AgentDefinitionsResult,
} from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'

function getAgentIdentityKey(agent: AgentDefinition): string {
  const pluginName = 'plugin' in agent ? agent.plugin : ''
  return [
    agent.source,
    agent.agentType,
    agent.baseDir ?? '',
    agent.filename ?? '',
    pluginName,
  ].join('::')
}

export function mergeRefreshedAgentDefinitions(
  currentAgentDefinitions: AgentDefinitionsResult,
  freshAgentDefinitions: AgentDefinitionsResult,
): AgentDefinitionsResult {
  const freshKeys = new Set(
    freshAgentDefinitions.allAgents.map(getAgentIdentityKey),
  )

  // CLI-provided agents from --agents are appended after the standard load and
  // use the flagSettings source. Keep those when built-in agents are re-derived
  // across a coordinator/normal mode switch, but drop stale built-ins/plugins.
  const preservedFlagAgents = currentAgentDefinitions.allAgents.filter(
    agent =>
      agent.source === 'flagSettings' && !freshKeys.has(getAgentIdentityKey(agent)),
  )

  const allAgents = [...freshAgentDefinitions.allAgents, ...preservedFlagAgents]

  return {
    ...freshAgentDefinitions,
    allowedAgentTypes:
      currentAgentDefinitions.allowedAgentTypes ??
      freshAgentDefinitions.allowedAgentTypes,
    allAgents,
    activeAgents: getActiveAgentsFromList(allAgents),
  }
}

export async function refreshAgentDefinitionsFromCurrentState(
  currentCwd: string,
  currentAgentDefinitions: AgentDefinitionsResult,
): Promise<AgentDefinitionsResult> {
  getAgentDefinitionsWithOverrides.cache.clear?.()
  const freshAgentDefinitions = await getAgentDefinitionsWithOverrides(currentCwd)
  return mergeRefreshedAgentDefinitions(
    currentAgentDefinitions,
    freshAgentDefinitions,
  )
}
