import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import { Box, Text } from '@anthropic/ink'
import { FORK_DIRECTIVE_PREFIX } from '../../constants/xml.js'
import { extractTag } from '../../utils/messages.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

function getForkPreview(text: string): string | null {
  const extracted = extractTag(text, 'fork-boilerplate')
  if (!extracted) {
    return null
  }

  const directiveIndex = text.indexOf(FORK_DIRECTIVE_PREFIX)
  const directiveText =
    directiveIndex >= 0
      ? text.slice(directiveIndex + FORK_DIRECTIVE_PREFIX.length)
      : extracted

  const firstLine = directiveText.trim().split('\n')[0] ?? ''
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine
}

export function UserForkBoilerplateMessage({
  param,
  addMargin,
}: Props): React.ReactElement | null {
  const preview = getForkPreview(param.text)
  if (!preview) {
    return null
  }

  return React.createElement(
    Box,
    { flexDirection: 'row', marginTop: addMargin ? 1 : 0 },
    React.createElement(Text, { dimColor: true }, '[fork] '),
    React.createElement(Text, null, preview),
  )
}
