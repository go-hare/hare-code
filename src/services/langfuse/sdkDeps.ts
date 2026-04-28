import { createRequire } from 'module'

export type { LangfuseSpanProcessor, MaskFunction } from '@langfuse/otel'
export type {
  LangfuseAgent,
  LangfuseGeneration,
  LangfuseSpan,
} from '@langfuse/tracing'
export type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base'

type LangfuseOtelModule = typeof import('@langfuse/otel')
type LangfuseTracingModule = typeof import('@langfuse/tracing')
type OTelTraceBaseModule = typeof import('@opentelemetry/sdk-trace-base')

type LangfuseSdkDeps = {
  BasicTracerProvider: OTelTraceBaseModule['BasicTracerProvider']
  LangfuseOtelSpanAttributes: LangfuseTracingModule['LangfuseOtelSpanAttributes']
  LangfuseSpanProcessor: LangfuseOtelModule['LangfuseSpanProcessor']
  setLangfuseTracerProvider: LangfuseTracingModule['setLangfuseTracerProvider']
  startObservation: LangfuseTracingModule['startObservation']
}

const require = createRequire(import.meta.url)
let cachedDeps: LangfuseSdkDeps | null = null

export function getLangfuseSdkDeps(): LangfuseSdkDeps {
  if (cachedDeps) {
    return cachedDeps
  }

  const otel = require('@langfuse/otel') as LangfuseOtelModule
  const tracing = require('@langfuse/tracing') as LangfuseTracingModule
  const traceBase = require(
    '@opentelemetry/sdk-trace-base',
  ) as OTelTraceBaseModule

  cachedDeps = {
    BasicTracerProvider: traceBase.BasicTracerProvider,
    LangfuseOtelSpanAttributes: tracing.LangfuseOtelSpanAttributes,
    LangfuseSpanProcessor: otel.LangfuseSpanProcessor,
    setLangfuseTracerProvider: tracing.setLangfuseTracerProvider,
    startObservation: tracing.startObservation,
  }
  return cachedDeps
}
