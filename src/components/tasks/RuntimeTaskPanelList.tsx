import figures from 'figures'
import React from 'react'
import { useTerminalSize } from 'src/hooks/useTerminalSize.js'
import { Box, Text } from 'src/ink.js'
import type { TaskState as RuntimeTaskState } from 'src/runtime/types/index.js'
import { RuntimeTaskRow } from './RuntimeTaskDetailDialog.js'

type Props = {
  tasks: RuntimeTaskState[]
  showHeader?: boolean
  marginTop?: number
}

export function RuntimeTaskPanelList({
  tasks,
  showHeader = true,
  marginTop = 0,
}: Props): React.ReactNode {
  const { columns } = useTerminalSize()

  if (tasks.length === 0) {
    return null
  }

  const maxActivityWidth = Math.max(24, columns - (showHeader ? 18 : 14))

  return (
    <Box flexDirection="column" marginTop={marginTop}>
      {showHeader && (
        <Text dimColor>
          <Text bold>{tasks.length}</Text>{' '}
          {tasks.length === 1 ? 'runtime task' : 'runtime tasks'}
        </Text>
      )}
      <Box flexDirection="column" marginLeft={showHeader ? 2 : 0}>
        {tasks.map(task => (
          <Box key={task.taskId}>
            <Text dimColor>{figures.pointerSmall} </Text>
            <RuntimeTaskRow task={task} maxActivityWidth={maxActivityWidth} />
          </Box>
        ))}
      </Box>
    </Box>
  )
}
