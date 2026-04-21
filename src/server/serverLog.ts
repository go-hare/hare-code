type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function formatMeta(meta: unknown): string {
  if (meta === undefined) {
    return ''
  }

  try {
    return ` ${JSON.stringify(meta)}`
  } catch {
    return ''
  }
}

function writeLog(level: LogLevel, message: string, meta?: unknown): void {
  const rendered = `[server:${level}] ${message}${formatMeta(meta)}`
  switch (level) {
    case 'warn':
      console.warn(rendered)
      return
    case 'error':
      console.error(rendered)
      return
    default:
      console.log(rendered)
  }
}

export interface ServerLogger {
  debug(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
  error(message: string, meta?: unknown): void
}

export function createServerLogger(): ServerLogger {
  return {
    debug(message, meta) {
      writeLog('debug', message, meta)
    },
    info(message, meta) {
      writeLog('info', message, meta)
    },
    warn(message, meta) {
      writeLog('warn', message, meta)
    },
    error(message, meta) {
      writeLog('error', message, meta)
    },
  }
}
