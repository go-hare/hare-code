import type { KernelRuntimeEnvelopeBase } from '../runtime/contracts/events.js'

export class KernelRuntimeRequestError extends Error {
  readonly envelope: KernelRuntimeEnvelopeBase

  constructor(envelope: KernelRuntimeEnvelopeBase) {
    super(envelope.error?.message ?? 'Kernel runtime request failed')
    this.name = 'KernelRuntimeRequestError'
    this.envelope = envelope
  }

  get code() {
    return this.envelope.error?.code
  }
}
