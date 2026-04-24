import * as React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { Message } from '../../types/message.js'

type Props = {
  message: Message
}

export function SnipBoundaryMessage({
  message,
}: Props): React.ReactElement {
  const content =
    typeof (message as Record<string, unknown>).content === 'string'
      ? ((message as Record<string, unknown>).content as string)
      : '[snip] Conversation history before this point has been snipped.'

  return React.createElement(
    Box,
    { marginTop: 1, marginBottom: 1 },
    React.createElement(Text, { dimColor: true }, `── ${content} ──`),
  )
}
