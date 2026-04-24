import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import { Box, Text } from '@anthropic/ink'
import { extractTag } from '../../utils/messages.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

export function UserCrossSessionMessage({
  param,
  addMargin,
}: Props): React.ReactElement | null {
  const text = param.text
  const extracted = extractTag(text, 'cross-session-message')
  if (!extracted) {
    return null
  }

  const fromMatch = text.match(/from="([^"]*)"/)
  const from = fromMatch?.[1] ?? 'another session'

  return React.createElement(
    Box,
    { flexDirection: 'row', marginTop: addMargin ? 1 : 0 },
    React.createElement(Text, { dimColor: true }, `[${from}] `),
    React.createElement(Text, null, extracted),
  )
}
