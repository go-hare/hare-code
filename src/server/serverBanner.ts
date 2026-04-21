import { buildConnectUrl } from './parseConnectUrl.js'
import type { ServerConfig } from './types.js'

export function printBanner(
  config: ServerConfig,
  authToken: string,
  actualPort: number,
): void {
  const displayHost = config.host === '0.0.0.0' ? 'localhost' : config.host
  const listenTarget = config.unix
    ? `unix:${config.unix}`
    : `http://${config.host}:${actualPort}`
  const connectUrl = buildConnectUrl({
    host: displayHost,
    port: actualPort,
    authToken,
    unixSocket: config.unix,
  })

  console.log('')
  console.log('Direct-connect server ready')
  console.log(`Listen:  ${listenTarget}`)
  console.log(`Connect: ${connectUrl}`)
  console.log('')
}
