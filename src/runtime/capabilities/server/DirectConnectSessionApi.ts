/* eslint-disable eslint-plugin-n/no-unsupported-features/node-builtins */

import { errorMessage } from '../../../utils/errors.js'
import { jsonStringify } from '../../../utils/slowOperations.js'
import type { DirectConnectConfig } from '../../../server/directConnectManager.js'
import { connectResponseSchema } from '../../../server/types.js'

export class DirectConnectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DirectConnectError'
  }
}

export async function createDirectConnectSessionRuntime({
  serverUrl,
  authToken,
  cwd,
  dangerouslySkipPermissions,
  unixSocket,
}: {
  serverUrl: string
  authToken?: string
  cwd: string
  dangerouslySkipPermissions?: boolean
  unixSocket?: string
}): Promise<{
  config: DirectConnectConfig
  workDir?: string
}> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (authToken) {
    headers.authorization = `Bearer ${authToken}`
  }

  let resp: Response
  try {
    resp = await fetch(`${serverUrl}/sessions`, {
      method: 'POST',
      headers,
      ...(unixSocket && typeof Bun !== 'undefined' ? { unix: unixSocket } : {}),
      body: jsonStringify({
        cwd,
        ...(dangerouslySkipPermissions && {
          dangerously_skip_permissions: true,
        }),
      }),
    })
  } catch (err) {
    throw new DirectConnectError(
      `Failed to connect to server at ${serverUrl}: ${errorMessage(err)}`,
    )
  }

  if (!resp.ok) {
    throw new DirectConnectError(
      `Failed to create session: ${resp.status} ${resp.statusText}`,
    )
  }

  const result = connectResponseSchema().safeParse(await resp.json())
  if (!result.success) {
    throw new DirectConnectError(
      `Invalid session response: ${result.error.message}`,
    )
  }

  const data = result.data
  return {
    config: {
      serverUrl,
      sessionId: data.session_id,
      wsUrl: data.ws_url,
      authToken,
      unixSocket,
    },
    workDir: data.work_dir,
  }
}
