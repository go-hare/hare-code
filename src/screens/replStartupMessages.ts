import type { Message as MessageType } from '../types/message.js'

type SetMessages = (
  updater: (prev: MessageType[]) => MessageType[],
) => void

export function attachPendingReplStartupMessages({
  pendingStartupMessages,
  setMessages,
}: {
  pendingStartupMessages?: Promise<MessageType[]>
  setMessages: SetMessages
}): (() => void) | undefined {
  if (!pendingStartupMessages) {
    return undefined
  }

  let cancelled = false
  void pendingStartupMessages.then(messages => {
    if (cancelled || messages.length === 0) {
      return
    }
    setMessages(previous => [...previous, ...messages])
  })

  return () => {
    cancelled = true
  }
}
