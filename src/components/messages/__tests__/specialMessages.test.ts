import { describe, expect, test } from 'bun:test'
import * as React from 'react'
import { SnipBoundaryMessage } from '../SnipBoundaryMessage.js'
import { UserCrossSessionMessage } from '../UserCrossSessionMessage.js'
import { UserForkBoilerplateMessage } from '../UserForkBoilerplateMessage.js'
import { UserGitHubWebhookMessage } from '../UserGitHubWebhookMessage.js'

describe('special message renderers', () => {
  test('UserCrossSessionMessage renders sender and text', () => {
    const element = UserCrossSessionMessage({
      addMargin: true,
      param: {
        type: 'text',
        text: '<cross-session-message from="session-a">hello from peer</cross-session-message>',
      } as any,
    }) as React.ReactElement<{ children: React.ReactNode[] }>

    expect(element).not.toBeNull()
    const children = element.props.children as Array<
      React.ReactElement<Record<string, any>>
    >
    expect(children[0]?.props.children).toContain('[session-a]')
    expect(children[1]?.props.children).toBe('hello from peer')
  })

  test('UserForkBoilerplateMessage renders directive preview instead of boilerplate', () => {
    const element = UserForkBoilerplateMessage({
      addMargin: false,
      param: {
        type: 'text',
        text: '<fork-boilerplate>Scope: auth regression\nResult: placeholder</fork-boilerplate>\n\nYour directive: Implement the failing auth regression first\nThen run tests',
      } as any,
    }) as React.ReactElement<{ children: React.ReactNode[] }>

    expect(element).not.toBeNull()
    const children = element.props.children as Array<
      React.ReactElement<Record<string, any>>
    >
    expect(children[0]?.props.children).toBe('[fork] ')
    expect(children[1]?.props.children).toBe(
      'Implement the failing auth regression first',
    )
  })

  test('UserGitHubWebhookMessage renders event summary', () => {
    const element = UserGitHubWebhookMessage({
      addMargin: true,
      param: {
        type: 'text',
        text: '<github-webhook-activity>{"event_type":"check_run","repository":"owner/repo"}</github-webhook-activity>',
      } as any,
    }) as React.ReactElement<{ children: React.ReactNode[] }>

    expect(element).not.toBeNull()
    const children = element.props.children as Array<
      React.ReactElement<Record<string, any>>
    >
    expect(children[0]?.props.children).toBe('[GitHub] ')
    expect(children[1]?.props.children).toBe('check_run in owner/repo')
  })

  test('SnipBoundaryMessage renders visible separator text', () => {
    const element = SnipBoundaryMessage({
      message: {
        content: '[snip] older history hidden',
      } as any,
    }) as React.ReactElement<{ children: React.ReactElement<Record<string, any>> }>

    expect(element).not.toBeNull()
    expect(
      (element.props.children as React.ReactElement<Record<string, any>>).props
        .children,
    ).toBe('── [snip] older history hidden ──')
  })
})
