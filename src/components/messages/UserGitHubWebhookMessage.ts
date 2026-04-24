import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import { Box, Text } from '@anthropic/ink'
import { extractTag } from '../../utils/messages.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

export function UserGitHubWebhookMessage({
  param,
  addMargin,
}: Props): React.ReactElement | null {
  const text = param.text
  const extracted = extractTag(text, 'github-webhook-activity')
  if (!extracted) {
    return null
  }

  const eventMatch = extracted.match(/event[_-]?type[":\s]+["']?(\w+)/)
  const repoMatch = extracted.match(
    /repo(?:sitory)?[":\s]+["']?([^"'\s,}]+)/,
  )
  const event = eventMatch?.[1] ?? 'activity'
  const repo = repoMatch?.[1] ?? ''
  const repoSuffix = repo ? ` in ${repo}` : ''

  return React.createElement(
    Box,
    { flexDirection: 'row', marginTop: addMargin ? 1 : 0 },
    React.createElement(Text, { dimColor: true }, '[GitHub] '),
    React.createElement(Text, null, `${event}${repoSuffix}`),
  )
}
