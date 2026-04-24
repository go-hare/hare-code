import { beforeEach, describe, expect, mock, test } from 'bun:test'

const mockCall = mock(async (args: string) => ({
  type: 'text' as const,
  value: `called:${args}`,
}))

mock.module('../../../commands/autonomy.js', () => ({
  default: {
    load: async () => ({ call: mockCall }),
  },
}))

const originalWrite = process.stdout.write.bind(process.stdout)
const writeMock = mock((_chunk: string | Uint8Array) => true)

const { autonomyStatusHandler } = await import('../autonomy.js')

describe('autonomyStatusHandler', () => {
  beforeEach(() => {
    mockCall.mockClear()
    writeMock.mockClear()
    process.stdout.write = writeMock as typeof process.stdout.write
  })

  test('requests normal status output by default', async () => {
    await autonomyStatusHandler()

    expect(mockCall).toHaveBeenCalledWith('status', {} as never)
    expect(writeMock).toHaveBeenCalledWith('called:status\n')
  })

  test('forwards the deep status flag to the command surface', async () => {
    await autonomyStatusHandler({ deep: true })

    expect(mockCall).toHaveBeenCalledWith('status --deep', {} as never)
    expect(writeMock).toHaveBeenCalledWith('called:status --deep\n')
  })
})

process.stdout.write = originalWrite
