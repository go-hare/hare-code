import type { StdoutMessage } from 'src/entrypoints/sdk/controlTypes.js'

export function emitHeadlessRuntimeMessage({
  message,
  output,
  drainSdkEvents,
  hasBackgroundTasks,
  heldBackResult,
  heldBackAssistantMessages = [],
  terminalResultEmitted = false,
}: {
  message: StdoutMessage
  output: {
    enqueue(message: StdoutMessage): void
  }
  drainSdkEvents: () => StdoutMessage[]
  hasBackgroundTasks: () => boolean
  heldBackResult: StdoutMessage | null
  heldBackAssistantMessages?: StdoutMessage[]
  terminalResultEmitted?: boolean
}): {
  heldBackResult: StdoutMessage | null
  heldBackAssistantMessages: StdoutMessage[]
  lastResultIsError?: boolean
  terminalResultEmitted?: boolean
} {
  const sdkEvents = drainSdkEvents()
  for (const event of sdkEvents) {
    output.enqueue(event)
  }
  const backgroundTasksPending = hasBackgroundTasks()

  if (
    terminalResultEmitted &&
    shouldSuppressAfterTerminalResult(message)
  ) {
    return {
      heldBackResult,
      heldBackAssistantMessages,
    }
  }

  if (message.type === 'result') {
    const lastResultIsError = !!(message as Record<string, unknown>).is_error
    if (backgroundTasksPending) {
      return {
        heldBackResult: message,
        heldBackAssistantMessages,
        lastResultIsError,
      }
    }

    output.enqueue(message)
    return {
      heldBackResult: null,
      heldBackAssistantMessages,
      lastResultIsError,
      terminalResultEmitted: true,
    }
  }

  if (
    backgroundTasksPending &&
    shouldHoldUntilBackgroundWorkCompletes(message)
  ) {
    return {
      heldBackResult,
      heldBackAssistantMessages: [...heldBackAssistantMessages, message],
    }
  }

  output.enqueue(message)
  return {
    heldBackResult,
    heldBackAssistantMessages,
  }
}

function shouldHoldUntilBackgroundWorkCompletes(
  message: StdoutMessage,
): boolean {
  return (
    message.type === 'assistant' ||
    message.type === 'stream_event' ||
    message.type === 'streamlined_text'
  )
}

function shouldSuppressAfterTerminalResult(message: StdoutMessage): boolean {
  return (
    message.type === 'result' ||
    message.type === 'user' ||
    shouldHoldUntilBackgroundWorkCompletes(message)
  )
}
