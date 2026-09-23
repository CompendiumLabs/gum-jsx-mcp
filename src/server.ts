// Gum MCP server: a stateless Streamable HTTP endpoint and an MCP App viewer.

import { basename, join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { registerViewer, viewerUri } from './viewer-resource'
import { loadSkillDocs } from './skill'
import { registerDocs } from './docs-tools'
import { registerRenderTool } from './render-tool'
import { withRequestLogging } from './request-logging'
import pkg from '../package.json'

const DEBUG = process.argv.slice(2).includes('--debug')
const PORT = Number(process.env.PORT ?? 8787)
const PUBLIC_URL = new URL(process.env.PUBLIC_URL ?? 'https://compendiumlabs.ai')
const PUBLIC_BASE = PUBLIC_URL.href.replace(/\/$/, '')
const PUBLIC_PATH = PUBLIC_URL.pathname.replace(/\/$/, '')
const PUBLIC_ORIGIN = PUBLIC_URL.origin

const DIST = join(import.meta.dir, '..', 'dist')
const FONT_DIR = join(DIST, 'fonts')
const FONT_BASE = '__GUM_FONT_BASE__'

const viewerFile = Bun.file(join(DIST, 'viewer.html'))
if (!(await viewerFile.exists())) {
  console.error('dist/viewer.html not found: run `bun run build` first')
  process.exit(1)
}
const VIEWER_HTML = (await viewerFile.text()).replaceAll(FONT_BASE, PUBLIC_BASE)
// Hosts may cache app resources by URI. A changed bundle needs a new identity.
const VIEWER_URI = viewerUri(VIEWER_HTML)
const docs = loadSkillDocs()

function createServer(): McpServer {
  const server = new McpServer({ name: 'gum', version: pkg.version }, { instructions: docs.INSTRUCTIONS })
  registerDocs(server, docs)

  registerRenderTool(server, VIEWER_URI)

  registerViewer(server, VIEWER_HTML, PUBLIC_ORIGIN)

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

const fetchRequest = async (request: Request) => withCors(await handle(request))
const httpServer = Bun.serve({
  hostname: process.env.HOST ?? '0.0.0.0',
  port: PORT,
  idleTimeout: 255,
  fetch: DEBUG ? withRequestLogging(fetchRequest) : fetchRequest,
})

console.log(`gum-mcp ${pkg.version} listening on http://localhost:${httpServer.port} (public: ${PUBLIC_BASE})`)
