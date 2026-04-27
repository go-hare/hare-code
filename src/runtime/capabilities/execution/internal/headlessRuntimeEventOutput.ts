import type { StdoutMessage } from 'src/entrypoints/sdk/controlTypes.js'
import type {
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEventSink,
} from '../../../contracts/events.js'
import type { StructuredIO } from './io/structuredIO.js'
import { toKernelRuntimeEventMessage } from '../../../../utils/kernelRuntimeEventMessage.js'

type RuntimeEventOutputOptions = {
  outputFormat: string | undefined
  verbose: boolean | undefined
  sessionId: string
  runtimeEventSink?: KernelRuntimeEventSink
}

type RuntimeEventWriter = Pick<StructuredIO, 'write'>

export function createHeadlessRuntimeEventSink(
  structuredIO: RuntimeEventWriter,
  options: RuntimeEventOutputOptions,
): KernelRuntimeEventSink | undefined {
  const shouldWriteStreamJson =
    options.outputFormat === 'stream-json' && options.verbose

  if (!shouldWriteStreamJson && !options.runtimeEventSink) {
    return undefined
  }

  return envelope => {
    if (shouldWriteStreamJson) {
      void structuredIO
        .write(toHeadlessRuntimeEventMessage(envelope, options.sessionId))
        .catch(() => {})
    }

    try {
      options.runtimeEventSink?.(envelope)
    } catch {
      // Runtime event observation must not mutate execution semantics.
    }
  }
}

export function toHeadlessRuntimeEventMessage(
  envelope: KernelRuntimeEnvelopeBase,
  sessionId: string,
): StdoutMessage {
  return toKernelRuntimeEventMessage(envelope, sessionId) as StdoutMessage
}
