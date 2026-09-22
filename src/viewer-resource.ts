import { createHash } from 'node:crypto'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'

export function viewerUri(html: string): string {
  return `ui://gum/viewer-${createHash('sha256').update(html).digest('hex').slice(0, 16)}.html`
}

export function registerViewer(server: McpServer, html: string, publicOrigin: string): void {
  const meta = {
    ui: {
      csp: { connectDomains: [publicOrigin], resourceDomains: [publicOrigin] },
      prefersBorder: true,
    },
    'openai/widgetCSP': {
      connect_domains: [publicOrigin], resource_domains: [publicOrigin],
    },
  }
  const config = {
    title: 'gum viewer',
    description: 'Renders gum.jsx code as an SVG figure',
    mimeType: RESOURCE_MIME_TYPE,
    _meta: meta,
  }
  const read = (uri: URL) => ({
    contents: [{ uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: meta }],
  })
  registerAppResource(server, 'gum-viewer', viewerUri(html), config, read)
  // Hosts can retain tool metadata across rebuilds. Keep their viewer links
  // usable; render's code/size payload is compatible with the current viewer.
  registerAppResource(server, 'gum-viewer-legacy', 'ui://gum/viewer.html', config, read)
  server.registerResource('gum-viewer-previous-build',
    new ResourceTemplate('ui://gum/viewer-{build}.html', { list: undefined }), config,
    (uri, { build }) => {
      if (typeof build !== 'string' || !/^[a-f0-9]{16}$/.test(build)) {
        throw new McpError(ErrorCode.InvalidParams, 'Unknown gum viewer resource')
      }
      return read(uri)
    })
}
