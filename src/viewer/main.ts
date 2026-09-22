// MCP App viewer: evaluate, lay out, and serialize gum.jsx in the host iframe.

import { App, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps'
import type { McpUiHostContext, McpUiTheme } from '@modelcontextprotocol/ext-apps'
import { EMOJI_FAMILY } from '@gum-jsx/core'
import * as math from '@gum-jsx/math'
import { DEFAULT_SIZE, renderFigure as renderGumFigure } from '../render'

declare const __GUM_MCP_VERSION__: string

const WHITE = '#ffffff'
const FONT_BASE = '__GUM_FONT_BASE__'

interface RenderArgs {
  code?: string
  size?: number
  theme?: McpUiTheme
}

interface RenderedFigure {
  markup: string
  width: number
  height: number
}

const fonts = math.createMathFonts()
// Core's default URLs are package-relative, which is useful in ordinary web
// builds but not inside an MCP resource document. Point those six faces at the
// same public asset route as the statically bundled math fonts.
for (const family of ['Sans', 'Mono']) {
  for (const [name, weight] of [['Light', 300], ['Regular', 400], ['Bold', 700]] as const) {
    fonts.register_url(`IBM Plex ${family}`, new URL(
      `${FONT_BASE}/fonts/IBMPlex${family}-${name}.ttf`,
      location.href,
    ), { weight })
  }
}
// The emoji metrics face is bundled the same way. Figures name its family on live
// emoji text, which this document paints with the viewer's own emoji font.
fonts.register_url(EMOJI_FAMILY, new URL(`${FONT_BASE}/fonts/NotoColorEmoji-Metrics.ttf`, location.href),
  { fallback: true })
let fontsReady: Promise<void> | undefined

function loadFonts(): Promise<void> {
  return fontsReady ??= fonts.load().catch(error => {
    fontsReady = undefined
    throw error
  })
}

const root = document.getElementById('root')!
const status = document.getElementById('status')!
const exports = document.getElementById('export')!

let hostTheme: McpUiTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
let lastArgs: RenderArgs | null = null
let lastFigure: RenderedFigure | null = null
let host: App | null = null
let resizePending = false
let reportedSize = ''

function reportSize(): void {
  if (host == null || resizePending) return
  resizePending = true
  requestAnimationFrame(() => {
    resizePending = false
    // Keep the requested width independent of the current iframe width so a
    // small figure can be replaced by a larger one. Height follows the preview,
    // which may be scaled down to fit the space the host actually provides.
    const width = Math.ceil(lastFigure?.width ?? 320)
    const height = Math.ceil(document.body.getBoundingClientRect().height)
    const size = `${width}x${height}`
    if (size === reportedSize) return
    reportedSize = size
    void host!.sendSizeChanged({ width, height }).catch(console.error)
  })
}

new ResizeObserver(reportSize).observe(document.body)

function setStatus(text: string, kind: 'info' | 'error' = 'info'): void {
  status.textContent = text
  status.dataset.kind = kind
  status.hidden = text === ''
  document.body.style.width = `${lastFigure?.width ?? 320}px`
  reportSize()
}

function applyTheme(theme: McpUiTheme): void {
  hostTheme = theme
  document.documentElement.dataset.theme = theme
}

async function renderFigure(
  code: string,
  size: number,
  theme: McpUiTheme,
  background?: string,
): Promise<RenderedFigure> {
  await loadFonts()
  // The host theme wins over a source theme so the figure follows the surrounding UI.
  return renderGumFigure(code, { size, theme, background, fonts })
}

async function render(args: RenderArgs): Promise<void> {
  lastArgs = args
  const { code, size = DEFAULT_SIZE, theme = hostTheme } = args
  if (code == null || code.trim() === '') {
    setStatus('No code to render')
    return
  }
  setStatus('Loading fonts…')
  try {
    const figure = await renderFigure(code, size, theme)
    root.innerHTML = figure.markup
    lastFigure = figure
    exports.hidden = false
    setStatus('')
  } catch (error) {
    root.innerHTML = ''
    lastFigure = null
    exports.hidden = true
    setStatus(`Render error: ${(error as Error).message}`, 'error')
  }
}

function rerender(): void {
  if (lastArgs != null) void render(lastArgs)
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load generated SVG'))
    image.src = source
  })
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob)
    else reject(new Error('Could not encode PNG'))
  }, 'image/png'))
}

async function toPng(figure: RenderedFigure, ratio = 2): Promise<Blob> {
  const blob = new Blob([figure.markup], { type: 'image/svg+xml' })
  let image: HTMLImageElement
  let url: string | undefined
  try {
    url = URL.createObjectURL(blob)
    image = await loadImage(url)
  } catch {
    image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(figure.markup)}`)
  } finally {
    if (url != null) URL.revokeObjectURL(url)
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(figure.width * ratio)
  canvas.height = Math.ceil(figure.height * ratio)
  const context = canvas.getContext('2d')
  if (context == null) throw new Error('Canvas is unavailable')
  context.scale(ratio, ratio)
  context.drawImage(image, 0, 0, figure.width, figure.height)
  return canvasBlob(canvas)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(blob)
  })
}

function saveFile(name: string, data: string | Blob, mime: string): void {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url))
}

async function exportFigure(): Promise<RenderedFigure> {
  const { code = '', size = DEFAULT_SIZE } = lastArgs ?? {}
  return renderFigure(code, size, 'light', WHITE)
}

const FORMATS: Record<string, () => Promise<{ name: string; mime: string; data: string | Blob }>> = {
  jsx: async () => ({ name: 'figure.jsx', mime: 'text/plain', data: lastArgs?.code ?? '' }),
  svg: async () => {
    const figure = await exportFigure()
    return { name: 'figure.svg', mime: 'image/svg+xml', data: figure.markup }
  },
  png: async () => {
    const figure = await exportFigure()
    return { name: 'figure.png', mime: 'image/png', data: await toPng(figure) }
  },
}

async function download(name: string, mime: string, data: string | Blob): Promise<void> {
  if (host == null || host.getHostCapabilities()?.downloadFile == null) {
    saveFile(name, data, mime)
    return
  }
  const resource = typeof data === 'string'
    ? { uri: `file:///${name}`, mimeType: mime, text: data }
    : { uri: `file:///${name}`, mimeType: mime, blob: await blobToBase64(data) }
  await host.downloadFile({ contents: [{ type: 'resource', resource }] })
}

async function onExport(format: string): Promise<void> {
  if (lastFigure == null) return
  const buttons = [...exports.querySelectorAll('button')]
  buttons.forEach(button => { button.disabled = true })
  try {
    const { name, mime, data } = await FORMATS[format]()
    await download(name, mime, data)
  } catch (error) {
    setStatus(`Export failed: ${(error as Error).message}`, 'error')
  } finally {
    buttons.forEach(button => { button.disabled = false })
  }
}

exports.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest('button')
  const format = button?.dataset.format
  if (format != null) void onExport(format)
})

async function connectMcpApp(): Promise<void> {
  const app = new App({ name: 'gum-viewer', version: __GUM_MCP_VERSION__ }, {}, { autoResize: false })

  app.ontoolinput = ({ arguments: args }) => {
    void render((args ?? {}) as RenderArgs)
  }
  app.ontoolresult = ({ structuredContent, isError, content }) => {
    if (isError) {
      const text = (content ?? []).map(item => item.type === 'text' ? item.text : '').join('\n')
      root.innerHTML = ''
      lastFigure = null
      exports.hidden = true
      setStatus(text || 'Tool call failed', 'error')
      return
    }
    void render((structuredContent ?? {}) as RenderArgs)
  }

  const syncHost = (context: McpUiHostContext | undefined) => {
    if (context == null) return
    if (context.styles?.variables != null) applyHostStyleVariables(context.styles.variables)
    if (context.theme != null && context.theme !== hostTheme) {
      applyTheme(context.theme)
      rerender()
    }
  }
  app.onhostcontextchanged = syncHost

  await app.connect()
  host = app
  syncHost(app.getHostContext())
  reportSize()
}

interface OpenAiGlobals {
  toolInput?: RenderArgs
  toolOutput?: RenderArgs
  theme?: McpUiTheme
}

function connectOpenAi(openai: OpenAiGlobals): void {
  const sync = (globals: OpenAiGlobals) => {
    if (globals.theme != null && globals.theme !== hostTheme) applyTheme(globals.theme)
    const args = globals.toolOutput ?? globals.toolInput
    if (args != null) void render(args)
  }
  window.addEventListener('openai:set_globals', (event: Event) => {
    sync(((event as CustomEvent).detail?.globals ?? {}) as OpenAiGlobals)
  })
  sync(openai)
}

async function main(): Promise<void> {
  applyTheme(hostTheme)

  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  if (code != null) {
    const size = Number(params.get('size') ?? DEFAULT_SIZE)
    const theme = (params.get('theme') as McpUiTheme | null) ?? hostTheme
    applyTheme(theme)
    await render({ code, size, theme })
    return
  }

  const openai = (window as unknown as { openai?: OpenAiGlobals }).openai
  if (openai != null) {
    connectOpenAi(openai)
    return
  }

  setStatus('Connecting to host…')
  try {
    await connectMcpApp()
    if (lastArgs == null) setStatus('Waiting for a figure…')
  } catch (error) {
    setStatus(`Could not connect to host: ${(error as Error).message}`, 'error')
  }
}

void main()
