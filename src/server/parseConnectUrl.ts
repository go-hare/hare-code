export type ParsedConnectUrl = {
  serverUrl: string
  authToken: string
  unixSocket?: string
}

function extractAuthToken(url: URL): string {
  return (
    url.searchParams.get('auth') ??
    (url.username ? decodeURIComponent(url.username) : '')
  )
}

export function buildConnectUrl({
  host,
  port,
  authToken,
  unixSocket,
}: {
  host: string
  port: number
  authToken: string
  unixSocket?: string
}): string {
  if (unixSocket) {
    return `cc+unix://${encodeURIComponent(unixSocket)}?auth=${encodeURIComponent(authToken)}`
  }

  return `cc://${host}:${port}?auth=${encodeURIComponent(authToken)}`
}

export function parseConnectUrl(url: string): ParsedConnectUrl {
  const parsed = new URL(url)
  const authToken = extractAuthToken(parsed)

  if (parsed.protocol === 'cc:') {
    return {
      serverUrl: `http://${parsed.host}`,
      authToken,
    }
  }

  if (parsed.protocol === 'cc+unix:') {
    const rawSocket = parsed.host || parsed.pathname.replace(/^\/+/, '')
    const unixSocket = decodeURIComponent(rawSocket)
    if (!unixSocket) {
      throw new Error('Invalid cc+unix URL: missing unix socket path')
    }

    return {
      serverUrl: 'http://localhost',
      authToken,
      unixSocket,
    }
  }

  throw new Error(`Unsupported connect URL protocol: ${parsed.protocol}`)
}
