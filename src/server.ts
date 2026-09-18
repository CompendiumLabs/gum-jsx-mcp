// Gum MCP server: a stateless Streamable HTTP endpoint and an MCP App viewer.

import { basename, join } from 'node:path'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server'
import {
  evaluate,
  exact,
  layout_element,
  make_request,
} from '@gum-jsx/core'
import * as math from '@gum-jsx/math'
import { INSTRUCTIONS, refs_pages, listDocs, readDocs } from './skill'
import pkg from '../package.json'

const PORT = Number(process.env.PORT ?? 8787)
const PUBLIC_URL = new URL(process.env.PUBLIC_URL ?? 'https://compendiumlabs.ai')
const PUBLIC_BASE = PUBLIC_URL.href.replace(/\/$/, '')
const PUBLIC_PATH = PUBLIC_URL.pathname.replace(/\/$/, '')
const PUBLIC_ORIGIN = PUBLIC_URL.origin

const DIST = join(import.meta.dir, '..', 'dist')
const FONT_DIR = join(DIST, 'fonts')
const FONT_BASE = '__GUM_FONT_BASE__'
const VIEWER_URI = 'ui://gum/viewer.html'
const DEFAULT_SIZE = 1000

const viewerFile = Bun.file(join(DIST, 'viewer.html'))
if (!(await viewerFile.exists())) {
  console.error('dist/viewer.html not found: run `bun run build` first')
  process.exit(1)
}
const VIEWER_HTML = (await viewerFile.text()).replaceAll(FONT_BASE, PUBLIC_BASE)

// Server-side validation gives the model a useful error before the app opens.
// Local font URLs load synchronously through the core font provider.
function checkCode(code: string, size: number): string | null {
  try {
    const value = evaluate(code, { name: 'mcp.jsx', scope: math })
    const result = layout_element(value, {
      request: make_request({ width: exact(size) }),
      fonts: math.createMathFonts(),
    })
    if (result.kind === 'value') {
      return `Source returned a value instead of an element: ${JSON.stringify(result.value) ?? String(result.value)}`
    }
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

const RENDER_DESCRIPTION = `Render a figure written in gum.jsx and show it to the user.

gum.jsx is a JSX language for SVG figures. Code may be one JSX expression, or JavaScript statements and helper components ending in \`return <.../>\`. The server instructions introduce the language; list_docs and read_docs provide current guides, element references, and gallery examples.

The figure is drawn interactively in the conversation. The tool returns its code, or an actionable evaluation/layout error.`

function createServer(): McpServer {
  const server = new McpServer({ name: 'gum', version: pkg.version }, { instructions: INSTRUCTIONS })

  server.registerTool('list_docs', {
    title: 'List gum.jsx documentation',
    description: 'List the available element sections, guides, and gallery examples. Use it to find names for read_docs.',
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async () => ({ content: [{ type: 'text', text: listDocs() }] }))

  server.registerTool('read_docs', {
    title: 'Read gum.jsx documentation',
    description: 'Read an element section, individual element, guide, or gallery example by the name shown by list_docs.',
    inputSchema: {
      name: z.string().describe('Element section, element, guide, or gallery example name.'),
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ name }) => {
    const page = readDocs(name)
    if (page == null) {
      return {
        isError: true,
        content: [{ type: 'text', text: `No documentation found for "${name}". Use list_docs to see the available names.` }],
      }
    }
    return { content: [{ type: 'text', text: page }] }
  })

  for (const [name, page] of Object.entries(refs_pages)) {
    server.registerResource(`docs-${name}`, `gum://docs/${name}`, {
      title: `gum.jsx docs: ${name}`,
      mimeType: 'text/markdown',
    }, async uri => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: page }],
    }))
  }

  registerAppTool(server, 'render', {
    title: 'Render gum.jsx figure',
    description: RENDER_DESCRIPTION,
    inputSchema: {
      code: z.string().describe('gum.jsx source code for the figure'),
      size: z.number().int().positive().optional()
        .describe(`width of the figure in pixels (default ${DEFAULT_SIZE}); height follows its layout`),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: {
      ui: { resourceUri: VIEWER_URI },
      'openai/outputTemplate': VIEWER_URI,
    },
  }, async ({ code, size = DEFAULT_SIZE }) => {
    const error = checkCode(code, size)
    if (error != null) {
      return {
        isError: true,
        content: [{ type: 'text', text: `gum.jsx rendering failed:\n${error}` }],
        structuredContent: { code, size, error },
      }
    }
    return {
      content: [{ type: 'text', text: `Rendered gum.jsx figure at width ${size}px (${code.length} characters of code).` }],
      structuredContent: { code, size },
    }
  })

  const viewerMeta = {
    ui: {
      csp: { connectDomains: [PUBLIC_ORIGIN], resourceDomains: [PUBLIC_ORIGIN] },
      prefersBorder: true,
    },
    'openai/widgetCSP': {
      connect_domains: [PUBLIC_ORIGIN],
      resource_domains: [PUBLIC_ORIGIN],
    },
  }

  registerAppResource(server, 'gum-viewer', VIEWER_URI, {
    title: 'gum viewer',
    description: 'Renders gum.jsx code as an SVG figure',
    mimeType: RESOURCE_MIME_TYPE,
    _meta: viewerMeta,
  }, async () => ({
    contents: [{
      uri: VIEWER_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: VIEWER_HTML,
      _meta: viewerMeta,
    }],
  }))

  return server
}

async function handleMcp(request: Request): Promise<Response> {
  const server = createServer()
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)
  const response = await transport.handleRequest(request)
  if (response.body == null) {
    await server.close()
    return response
  }
  const closer = new TransformStream<Uint8Array, Uint8Array>({ flush: () => server.close() })
  return new Response(response.body.pipeThrough(closer), {
    status: response.status,
    headers: response.headers,
  })
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
}

function withCors(response: Response): Response {
  for (const [name, value] of Object.entries(CORS)) response.headers.set(name, value)
  return response
}

function routePath(url: URL): string {
  const { pathname } = url
  if (PUBLIC_PATH !== '' && pathname.startsWith(PUBLIC_PATH + '/')) {
    return pathname.slice(PUBLIC_PATH.length)
  }
  if (PUBLIC_PATH !== '' && pathname === PUBLIC_PATH) return '/'
  return pathname
}

function isGet(request: Request): boolean {
  return request.method === 'GET' || request.method === 'HEAD'
}

async function serveFont(name: string): Promise<Response> {
  if (name !== basename(name) || !name.endsWith('.ttf')) {
    return new Response('Not found', { status: 404 })
  }
  const file = Bun.file(join(FONT_DIR, name))
  if (!(await file.exists())) return new Response('Not found', { status: 404 })
  return new Response(file, {
    headers: {
      'Content-Type': 'font/ttf',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = routePath(url)

  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (path === '/mcp') return handleMcp(request)
  if (path.startsWith('/fonts/') && isGet(request)) return serveFont(path.slice('/fonts/'.length))
  if (path === '/viewer.html' && isGet(request)) {
    return new Response(VIEWER_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
  if (path === '/host.html' && isGet(request)) {
    return new Response(Bun.file(join(import.meta.dir, 'viewer', 'host.html')), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
  if ((path === '/' || path === '/health') && isGet(request)) {
    return Response.json({ name: 'gum-mcp', version: pkg.version, mcp: `${PUBLIC_BASE}/mcp` })
  }
  return new Response('Not found', { status: 404 })
}

Bun.serve({
  port: PORT,
  idleTimeout: 255,
  fetch: async request => withCors(await handle(request)),
})

console.log(`gum-mcp ${pkg.version} listening on http://localhost:${PORT} (public: ${PUBLIC_BASE})`)
