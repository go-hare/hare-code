/**
 * Pure TypeScript port of vendor/color-diff-src.
 *
 * The Rust version uses syntect+bat for syntax highlighting and the similar
 * crate for word diffing. This port uses highlight.js (already a dep via
 * cli-highlight) and the diff npm package's diffArrays.
 *
 * API matches vendor/color-diff-src/index.d.ts exactly so callers don't change.
 */

import { diffArrays } from 'diff'
import type * as hljsNamespace from 'highlight.js'
import { basename, extname } from 'path'

type HLJSApi = typeof hljsNamespace.default
let cachedHljs: HLJSApi | null = null

function hljs(): HLJSApi {
  if (cachedHljs) return cachedHljs
  const mod = require('highlight.js')
  cachedHljs = 'default' in mod && mod.default ? mod.default : mod
  return cachedHljs!
}

const stringWidth: (str: string) => number =
  typeof Bun !== 'undefined' && typeof Bun.stringWidth === 'function'
    ? Bun.stringWidth
    : (str: string) => str.length

function logError(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error))
}

export type Hunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export type SyntaxTheme = {
  theme: string
  source: string | null
}

export type NativeModule = {
  ColorDiff: typeof ColorDiff
  ColorFile: typeof ColorFile
  getSyntaxTheme: (themeName: string) => SyntaxTheme
}

type Color = { r: number; g: number; b: number; a: number }
type Style = { foreground: Color; background: Color }
type Block = [Style, string]
type ColorMode = 'truecolor' | 'color256' | 'ansi'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'

function rgb(r: number, g: number, b: number): Color {
  return { r, g, b, a: 255 }
}

function ansiIdx(index: number): Color {
  return { r: index, g: 0, b: 0, a: 0 }
}

const DEFAULT_BG: Color = { r: 0, g: 0, b: 0, a: 1 }

function detectColorMode(theme: string): ColorMode {
  if (theme.includes('ansi')) return 'ansi'
  const ct = process.env.COLORTERM ?? ''
  return ct === 'truecolor' || ct === '24bit' ? 'truecolor' : 'color256'
}

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255]

function ansi256FromRgb(r: number, g: number, b: number): number {
  const q = (c: number) =>
    c < 48 ? 0 : c < 115 ? 1 : c < 155 ? 2 : c < 195 ? 3 : c < 235 ? 4 : 5
  const qr = q(r)
  const qg = q(g)
  const qb = q(b)
  const cubeIdx = 16 + 36 * qr + 6 * qg + qb
  const grey = Math.round((r + g + b) / 3)
  if (grey < 5) return 16
  if (grey > 244 && qr === qg && qg === qb) return cubeIdx
  const greyLevel = Math.max(0, Math.min(23, Math.round((grey - 8) / 10)))
  const greyIdx = 232 + greyLevel
  const greyRgb = 8 + greyLevel * 10
  const cr = CUBE_LEVELS[qr]!
  const cg = CUBE_LEVELS[qg]!
  const cb = CUBE_LEVELS[qb]!
  const dCube = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
  const dGrey = (r - greyRgb) ** 2 + (g - greyRgb) ** 2 + (b - greyRgb) ** 2
  return dGrey < dCube ? greyIdx : cubeIdx
}

function colorToEscape(c: Color, fg: boolean, mode: ColorMode): string {
  if (c.a === 0) {
    const idx = c.r
    if (idx < 8) return `\x1b[${(fg ? 30 : 40) + idx}m`
    if (idx < 16) return `\x1b[${(fg ? 90 : 100) + (idx - 8)}m`
    return `\x1b[${fg ? 38 : 48};5;${idx}m`
  }
  if (c.a === 1) return fg ? '\x1b[39m' : '\x1b[49m'
  const codeType = fg ? 38 : 48
  if (mode === 'truecolor') {
    return `\x1b[${codeType};2;${c.r};${c.g};${c.b}m`
  }
  return `\x1b[${codeType};5;${ansi256FromRgb(c.r, c.g, c.b)}m`
}

function asTerminalEscaped(
  blocks: readonly Block[],
  mode: ColorMode,
  skipBackground: boolean,
  dim: boolean,
): string {
  let out = dim ? RESET + DIM : RESET
  for (const [style, text] of blocks) {
    out += colorToEscape(style.foreground, true, mode)
    if (!skipBackground) {
      out += colorToEscape(style.background, false, mode)
    }
    out += text
  }
  return out + RESET
}

type Marker = '+' | '-' | ' '

type Theme = {
  addLine: Color
  addWord: Color
  addDecoration: Color
  deleteLine: Color
  deleteWord: Color
  deleteDecoration: Color
  foreground: Color
  background: Color
  scopes: Record<string, Color>
}

function defaultSyntaxThemeName(themeName: string): string {
  if (themeName.includes('ansi')) return 'ansi'
  if (themeName.includes('dark')) return 'Monokai Extended'
  return 'GitHub'
}

const MONOKAI_SCOPES: Record<string, Color> = {
  keyword: rgb(249, 38, 114),
  _storage: rgb(102, 217, 239),
  built_in: rgb(166, 226, 46),
  type: rgb(166, 226, 46),
  literal: rgb(190, 132, 255),
  number: rgb(190, 132, 255),
  string: rgb(230, 219, 116),
  title: rgb(166, 226, 46),
  'title.function': rgb(166, 226, 46),
  'title.class': rgb(166, 226, 46),
  'title.class.inherited': rgb(166, 226, 46),
  params: rgb(253, 151, 31),
  comment: rgb(117, 113, 94),
  meta: rgb(117, 113, 94),
  attr: rgb(166, 226, 46),
  attribute: rgb(166, 226, 46),
  variable: rgb(255, 255, 255),
  'variable.language': rgb(255, 255, 255),
  property: rgb(255, 255, 255),
  operator: rgb(249, 38, 114),
  punctuation: rgb(248, 248, 242),
  symbol: rgb(190, 132, 255),
  regexp: rgb(230, 219, 116),
  subst: rgb(248, 248, 242),
}

const GITHUB_SCOPES: Record<string, Color> = {
  keyword: rgb(167, 29, 93),
  _storage: rgb(167, 29, 93),
  built_in: rgb(0, 134, 179),
  type: rgb(0, 134, 179),
  literal: rgb(0, 134, 179),
  number: rgb(0, 134, 179),
  string: rgb(24, 54, 145),
  title: rgb(121, 93, 163),
  'title.function': rgb(121, 93, 163),
  'title.class': rgb(0, 0, 0),
  'title.class.inherited': rgb(0, 0, 0),
  params: rgb(0, 134, 179),
  comment: rgb(150, 152, 150),
  meta: rgb(150, 152, 150),
  attr: rgb(0, 134, 179),
  attribute: rgb(0, 134, 179),
  variable: rgb(0, 134, 179),
  'variable.language': rgb(0, 134, 179),
  property: rgb(0, 134, 179),
  operator: rgb(167, 29, 93),
  punctuation: rgb(51, 51, 51),
  symbol: rgb(0, 134, 179),
  regexp: rgb(24, 54, 145),
  subst: rgb(51, 51, 51),
}

function createTheme(themeName: string): Theme {
  if (themeName.includes('dark')) {
    return {
      addLine: rgb(35, 51, 35),
      addWord: rgb(61, 82, 61),
      addDecoration: rgb(123, 191, 123),
      deleteLine: rgb(69, 26, 30),
      deleteWord: rgb(92, 49, 53),
      deleteDecoration: rgb(246, 106, 120),
      foreground: rgb(248, 248, 242),
      background: DEFAULT_BG,
      scopes: MONOKAI_SCOPES,
    }
  }
  return {
    addLine: rgb(234, 255, 234),
    addWord: rgb(176, 228, 176),
    addDecoration: rgb(31, 136, 61),
    deleteLine: rgb(255, 238, 240),
    deleteWord: rgb(255, 206, 212),
    deleteDecoration: rgb(207, 34, 46),
    foreground: rgb(36, 41, 46),
    background: DEFAULT_BG,
    scopes: GITHUB_SCOPES,
  }
}

function themeFor(themeName: string): Theme {
  return createTheme(themeName)
}

export function getSyntaxTheme(themeName: string): SyntaxTheme {
  return {
    theme: defaultSyntaxThemeName(themeName),
    source: null,
  }
}

function tokenize(code: string, filename?: string): Block[] {
  const api = hljs()
  try {
    const language = filename
      ? api.getLanguage(extname(filename).slice(1)) ? extname(filename).slice(1) : undefined
      : undefined
    const result = language
      ? api.highlight(code, { language, ignoreIllegals: true })
      : api.highlightAuto(code)
    const themed = themeFor(process.env.CLAUDE_CODE_THEME ?? 'dark')
    const blocks: Block[] = []
    const text = result.value
      .replace(/<span class="hljs-([^"]+)">/g, (_m, scope) => `\u0000${scope}\u0001`)
      .replace(/<\/span>/g, '\u0002')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
    const stack = [themed.foreground]
    let buffer = ''
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i]!
      if (ch === '\u0000') {
        if (buffer) {
          blocks.push([
            { foreground: stack[stack.length - 1]!, background: themed.background },
            buffer,
          ])
          buffer = ''
        }
        const end = text.indexOf('\u0001', i)
        const scope = text.slice(i + 1, end)
        stack.push(themed.scopes[scope] ?? themed.foreground)
        i = end
      } else if (ch === '\u0002') {
        if (buffer) {
          blocks.push([
            { foreground: stack[stack.length - 1]!, background: themed.background },
            buffer,
          ])
          buffer = ''
        }
        if (stack.length > 1) stack.pop()
      } else {
        buffer += ch
      }
    }
    if (buffer) {
      blocks.push([
        { foreground: stack[stack.length - 1]!, background: themed.background },
        buffer,
      ])
    }
    return blocks
  } catch (error) {
    logError(error)
    return [[{ foreground: themeFor('dark').foreground, background: DEFAULT_BG }, code]]
  }
}

function padLeft(value: number, width: number): string {
  const str = String(value)
  return `${' '.repeat(Math.max(0, width - stringWidth(str)))}${str}`
}

function buildLine(marker: Marker, text: string, lineNo: number, width: number, theme: Theme): string {
  const fg =
    marker === '+'
      ? theme.addDecoration
      : marker === '-'
        ? theme.deleteDecoration
        : theme.foreground
  const bg =
    marker === '+'
      ? theme.addLine
      : marker === '-'
        ? theme.deleteLine
        : theme.background
  const blocks: Block[] = [
    [{ foreground: fg, background: bg }, `${marker} ${padLeft(lineNo, width)} `],
    ...tokenize(text),
  ]
  return asTerminalEscaped(blocks, detectColorMode(process.env.CLAUDE_CODE_THEME ?? 'dark'), false, false)
}

export class ColorDiff {
  static renderHunk(hunk: Hunk, fileName?: string): string {
    const theme = themeFor(process.env.CLAUDE_CODE_THEME ?? 'dark')
    const width = Math.max(
      String(hunk.oldStart + hunk.oldLines).length,
      String(hunk.newStart + hunk.newLines).length,
      1,
    )
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart
    const lines: string[] = []
    for (const line of hunk.lines) {
      const marker = (line[0] ?? ' ') as Marker
      const text = line.slice(1)
      if (marker === '-') {
        lines.push(buildLine(marker, text, oldLine, width, theme))
        oldLine += 1
      } else if (marker === '+') {
        lines.push(buildLine(marker, text, newLine, width, theme))
        newLine += 1
      } else {
        lines.push(buildLine(' ', text, oldLine, width, theme))
        oldLine += 1
        newLine += 1
      }
    }
    const header = fileName ? `${basename(fileName)}\n` : ''
    return header + lines.join('\n')
  }
}

export class ColorFile {
  static render(content: string, fileName?: string): string {
    const header = fileName ? `${basename(fileName)}\n` : ''
    const body = tokenize(content, fileName)
    return header + asTerminalEscaped(body, detectColorMode(process.env.CLAUDE_CODE_THEME ?? 'dark'), false, false)
  }
}
