import { TODO_WRITE_TOOL_NAME } from '@go-hare/builtin-tools/tools/TodoWriteTool/constants.js'
import type { Message } from '../../types/message.js'
import type { TodoList } from './types.js'
import { TodoListSchema } from './types.js'

export type TodoSnapshot = {
  sourceMessageUuid?: string
  todos: TodoList
}

export function extractTodoSnapshotFromMessages(
  messages: readonly Message[],
): TodoSnapshot | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.type !== 'assistant') {
      continue
    }

    const todoInput = getTodoWriteInput(message.message?.content)
    if (!todoInput) {
      continue
    }

    const parsed = TodoListSchema().safeParse(todoInput.todos)
    if (!parsed.success) {
      continue
    }

    return {
      sourceMessageUuid: message.uuid,
      todos: parsed.data,
    }
  }

  return undefined
}

function getTodoWriteInput(
  content: unknown,
): Record<string, unknown> | undefined {
  if (!Array.isArray(content)) {
    return undefined
  }

  for (const block of content) {
    if (
      typeof block !== 'object' ||
      block === null ||
      !('type' in block) ||
      !('name' in block) ||
      block.type !== 'tool_use' ||
      block.name !== TODO_WRITE_TOOL_NAME ||
      !('input' in block) ||
      typeof block.input !== 'object' ||
      block.input === null
    ) {
      continue
    }

    return block.input as Record<string, unknown>
  }

  return undefined
}
