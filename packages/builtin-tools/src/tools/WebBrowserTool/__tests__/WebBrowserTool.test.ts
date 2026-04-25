import { describe, expect, test } from 'bun:test'
import { WebBrowserTool } from '../WebBrowserTool.js'

describe('WebBrowserTool', () => {
  test('exports stable metadata', async () => {
    expect(WebBrowserTool).toBeDefined()
    expect(WebBrowserTool.name).toBe('WebBrowser')
    expect(await WebBrowserTool.description()).toContain('browser')
    expect(await WebBrowserTool.prompt()).toContain('embedded browser')
    expect(WebBrowserTool.userFacingName()).toBe('Browser')
    expect(WebBrowserTool.isReadOnly()).toBe(true)
    expect(WebBrowserTool.isConcurrencySafe()).toBe(false)
  })

  test('accepts the advertised browser actions and rejects unknown ones', () => {
    const schema = WebBrowserTool.inputSchema

    for (const action of [
      'navigate',
      'screenshot',
      'click',
      'type',
      'scroll',
    ]) {
      expect(
        schema.safeParse({
          url: 'https://example.com',
          action,
        }).success,
      ).toBe(true)
    }

    expect(
      schema.safeParse({
        url: 'https://example.com',
        action: 'submit',
      }).success,
    ).toBe(false)
  })

  test('renders tool use and result blocks consistently', () => {
    expect(
      WebBrowserTool.renderToolUseMessage({
        url: 'https://example.com',
        action: 'click',
      } as never),
    ).toBe('Browser click: https://example.com')

    const block = WebBrowserTool.mapToolResultToToolResultBlockParam(
      {
        title: 'Example Domain',
        url: 'https://example.com',
        content: 'Sample content',
      },
      'tool-use-id',
    )

    expect(block.tool_use_id).toBe('tool-use-id')
    expect(block.content).toContain('Example Domain')
    expect(block.content).toContain('https://example.com')
    expect(block.content).toContain('Sample content')
  })

  test('returns the placeholder result when runtime support is unavailable', async () => {
    const result = await WebBrowserTool.call({
      url: 'https://example.com',
      action: 'navigate',
    } as never)

    expect(result.data).toEqual({
      title: '',
      url: 'https://example.com',
      content: 'Web browser requires the WEB_BROWSER_TOOL runtime.',
    })
  })
})
