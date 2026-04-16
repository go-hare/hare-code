import * as React from 'react'
import { useState } from 'react'
import {
  getCliRuntimeTaskSummary,
  useCliRuntimeHostStateMaybe,
} from '../../cli/runtime-host/index.js'
import { Box, Text } from '../../ink.js'

type Props = {
  selected?: boolean
}

export function RuntimeTaskStatus({
  selected = false,
}: Props): React.ReactNode {
  const runtimeHostState = useCliRuntimeHostStateMaybe()
  const summary = getCliRuntimeTaskSummary(runtimeHostState)
  const [hover, setHover] = useState(false)

  if (!summary) {
    return null
  }

  const highlighted = selected || hover
  const label = (
    <Text color="background" inverse={highlighted}>
      {summary.label}
    </Text>
  )

  return (
    <Box onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {label}
    </Box>
  )
}
