import { expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { registerRenderTool } from '../src/render-tool'
import { registerViewer, viewerUri } from '../src/viewer-resource'

test('current and cached tool metadata can load the viewer after a rebuild', async () => {
  const html = '<html>current viewer</html>'
  const origin = 'https://dev.compendiumlabs.ai'
  const server = new McpServer({ name: 'gum-viewer-test', version: '0' })
  registerViewer(server, html, origin)
  registerRenderTool(server, viewerUri(html))
  const client = new Client({ name: 'cached-host', version: '0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  try {
    await client.connect(clientTransport)
    const { tools } = await client.listTools()
    const current = tools.find(tool => tool.name === 'render')!._meta!['openai/outputTemplate'] as string
    const previous = viewerUri('<html>previous viewer</html>')
    expect(current).not.toBe(previous)
    for (const uri of [current, previous, 'ui://gum/viewer.html']) {
      const { contents } = await client.readResource({ uri })
      expect(contents).toHaveLength(1)
      expect(contents[0]).toMatchObject({ uri, text: html, mimeType: 'text/html;profile=mcp-app' })
      expect(contents[0]._meta).toMatchObject({ ui: { csp: { connectDomains: [origin], resourceDomains: [origin] } } })
    }
    for (const uri of ['ui://gum/viewer-invalid.html', 'ui://gum/private.html', 'ui://other/viewer.html']) {
      await expect(client.readResource({ uri })).rejects.toThrow()
    }
  } finally {
    await client.close()
    await server.close()
  }
})
