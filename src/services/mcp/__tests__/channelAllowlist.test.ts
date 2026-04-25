import { describe, expect, test } from 'bun:test'

import { isChannelAllowlisted } from '../channelAllowlist.js'

describe('isChannelAllowlisted', () => {
  test('allows builtin weixin plugin', () => {
    expect(isChannelAllowlisted('weixin@builtin')).toBe(true)
  })

  test('rejects undefined plugin source', () => {
    expect(isChannelAllowlisted(undefined)).toBe(false)
  })
})
