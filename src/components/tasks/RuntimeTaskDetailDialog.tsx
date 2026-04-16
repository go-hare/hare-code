import figures from 'figures'
import React from 'react'
import { useElapsedTime } from 'src/hooks/useElapsedTime.js'
import type { KeyboardEvent } from 'src/ink/events/keyboard-event.js'
import { Box, Text } from 'src/ink.js'
import { useKeybindings } from 'src/keybindings/useKeybinding.js'
import type { TaskState as RuntimeTaskState } from 'src/runtime/types/index.js'
import { formatNumber, truncate } from 'src/utils/format.js'
import { Byline } from '../design-system/Byline.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'

type RuntimeTaskRowProps = {
  task: RuntimeTaskState
  maxActivityWidth: number
}

type RuntimeTaskDetailDialogProps = {
  task: RuntimeTaskState
  onDone: () => void
  onBack?: () => void
  onStop?: () => void
}

export function RuntimeTaskRow({
  task,
  maxActivityWidth,
}: RuntimeTaskRowProps): React.ReactNode {
  const activity = truncate(getRuntimeTaskActivity(task), maxActivityWidth, true)

  return (
    <Text>
      {activity}{' '}
      <RuntimeTaskStatusText status={task.status} />
    </Text>
  )
}

export function RuntimeTaskDetailDialog({
  task,
  onDone,
  onBack,
  onStop,
}: RuntimeTaskDetailDialogProps): React.ReactNode {
  useKeybindings(
    {
      'confirm:yes': onDone,
    },
    {
      context: 'Confirmation',
    },
  )

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === ' ' || event.key === 'enter') {
      event.preventDefault()
      onDone()
      return
    }

    if (event.key === 'left' && onBack) {
      event.preventDefault()
      onBack()
      return
    }

    if (event.key === 'x' && onStop) {
      event.preventDefault()
      onStop()
    }
  }

  const startedAt =
    task.startedAt ?? task.createdAt ?? task.updatedAt ?? task.completedAt ?? Date.now()
  const elapsed = useElapsedTime(
    startedAt,
    isRuntimeTaskActive(task.status),
    1000,
    0,
    task.completedAt,
  )
  const subtitle = (
    <Text>
      <Text color={getRuntimeTaskStatusColor(task.status)}>
        {getRuntimeTaskStatusIcon(task.status)} {getRuntimeTaskStatusLabel(task.status)}
      </Text>
      <Text dimColor={true}>
        {' · '}
        {elapsed}
        {task.progress?.tokenCount ? ` · ${formatNumber(task.progress.tokenCount)} tokens` : ''}
        {task.progress?.toolUseCount
          ? ` · ${task.progress.toolUseCount} ${task.progress.toolUseCount === 1 ? 'tool' : 'tools'}`
          : ''}
      </Text>
    </Text>
  )

  const inputGuide = (exitState: { pending: boolean; keyName: string }) =>
    exitState.pending ? (
      <Text>Press {exitState.keyName} again to exit</Text>
    ) : (
      <Byline>
        {onBack && <KeyboardShortcutHint shortcut="←" action="go back" />}
        <KeyboardShortcutHint shortcut="Esc/Enter/Space" action="close" />
        {onStop && <KeyboardShortcutHint shortcut="x" action="stop" />}
      </Byline>
    )

  return (
    <Box flexDirection="column" tabIndex={0} autoFocus={true} onKeyDown={handleKeyDown}>
      <Dialog
        title={<Text>{task.type} › {task.title}</Text>}
        subtitle={subtitle}
        onCancel={onDone}
        color="background"
        inputGuide={inputGuide}
      >
        <Box flexDirection="column">
          {task.progress && (
            <Box flexDirection="column">
              <Text bold={true} dimColor={true}>
                Progress
              </Text>
              {task.progress.summary && <Text wrap="wrap">{task.progress.summary}</Text>}
              {task.progress.lastActivity && (
                <Text dimColor={true} wrap="wrap">
                  Last activity: {task.progress.lastActivity}
                </Text>
              )}
              {typeof task.progress.percent === 'number' && (
                <Text dimColor={true}>Percent: {task.progress.percent}%</Text>
              )}
            </Box>
          )}

          {task.description && task.description !== task.title && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold={true} dimColor={true}>
                Description
              </Text>
              <Text wrap="wrap">{task.description}</Text>
            </Box>
          )}

          {task.resultSummary && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold={true} dimColor={true}>
                Result
              </Text>
              <Text wrap="wrap">{task.resultSummary}</Text>
            </Box>
          )}

          {task.error && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold={true} color="error">
                Error
              </Text>
              <Text color="error" wrap="wrap">
                {task.error}
              </Text>
            </Box>
          )}

          <Box flexDirection="column" marginTop={1}>
            <Text bold={true} dimColor={true}>
              Metadata
            </Text>
            <Text dimColor={true}>Task ID: {task.taskId}</Text>
            {task.ownerKind && <Text dimColor={true}>Owner: {task.ownerKind}</Text>}
          </Box>
        </Box>
      </Dialog>
    </Box>
  )
}

function RuntimeTaskStatusText({
  status,
}: {
  status: RuntimeTaskState['status']
}): React.ReactNode {
  return (
    <Text color={getRuntimeTaskStatusColor(status)} dimColor={true}>
      ({getRuntimeTaskStatusLabel(status)})
    </Text>
  )
}

function getRuntimeTaskActivity(task: RuntimeTaskState): string {
  return (
    task.progress?.summary ||
    task.progress?.lastActivity ||
    task.description ||
    task.title ||
    task.taskId
  )
}

function isRuntimeTaskActive(status: RuntimeTaskState['status']): boolean {
  return status === 'queued' || status === 'pending' || status === 'running'
}

function getRuntimeTaskStatusLabel(status: RuntimeTaskState['status']): string {
  switch (status) {
    case 'completed':
      return 'done'
    case 'failed':
      return 'error'
    case 'killed':
    case 'cancelled':
      return 'stopped'
    default:
      return status
  }
}

function getRuntimeTaskStatusIcon(status: RuntimeTaskState['status']): string {
  switch (status) {
    case 'completed':
      return figures.tick
    case 'failed':
      return figures.cross
    case 'killed':
    case 'cancelled':
      return figures.warning
    case 'paused':
      return figures.squareSmallFilled
    case 'pending':
    case 'queued':
      return figures.ellipsis
    default:
      return figures.play
  }
}

function getRuntimeTaskStatusColor(
  status: RuntimeTaskState['status'],
): 'success' | 'error' | 'warning' | 'background' {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'killed':
    case 'cancelled':
    case 'paused':
      return 'warning'
    default:
      return 'background'
  }
}
