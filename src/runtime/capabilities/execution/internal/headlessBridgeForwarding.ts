import type { ReplBridgeHandle } from 'src/bridge/replBridge.js'
import type { Message } from 'src/types/message.js'

export function forwardMessagesToBridge({
  bridgeHandle,
  bridgeLastForwardedIndex,
  mutableMessages,
}: {
  bridgeHandle: ReplBridgeHandle | null
  bridgeLastForwardedIndex: number
  mutableMessages: Message[]
}): number {
  if (!bridgeHandle) {
    return bridgeLastForwardedIndex
  }

  const startIndex = Math.min(bridgeLastForwardedIndex, mutableMessages.length)
  const newMessages = mutableMessages
    .slice(startIndex)
    .filter(message => message.type === 'user' || message.type === 'assistant')

  if (newMessages.length > 0) {
    bridgeHandle.writeMessages(newMessages)
  }

  return mutableMessages.length
}
