import { expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { z } from 'zod'
import { registerDocs } from '../src/docs-tools'
import { registerViewer } from '../src/viewer-resource'
import { skillFixture } from './skill-fixture'

const { docs } = skillFixture()

test('documentation is available through tools without the Skills extension or doc resources', async () => {
  const server = new McpServer({ name: 'gum-docs-test', version: '0' }, { instructions: docs.INSTRUCTIONS })
  registerDocs(server, docs)
  registerViewer(server, '<html>viewer</html>', 'https://example.com')
  const client = new Client({ name: 'docs-reader', version: '0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  try {
    await client.connect(clientTransport)
    expect(client.getInstructions()).toBe(docs.INSTRUCTIONS)
    expect(client.getServerCapabilities()?.extensions?.['io.modelcontextprotocol/skills']).toBeUndefined()
    for (const method of ['skills/list', 'skills/get']) {
      await expect(client.request({ method, params: {} }, z.object({}))).rejects.toMatchObject({ code: -32601 })
    }
    const { resources } = await client.listResources()
    expect(resources.every(resource => resource.uri.startsWith('ui://gum/'))).toBe(true)
    const index = await client.callTool({ name: 'list_docs', arguments: {} })
    expect(index.content).toEqual([{ type: 'text', text: docs.listDocs() }])
    for (const name of ['guides/style', 'elements/Plot', 'guides/math',
      'elements/math', 'guides', 'gallery/transformer']) {
      const result = await client.callTool({ name: 'read_docs', arguments: { name } })
      expect(result.isError).not.toBe(true)
      expect(result.content).toEqual([{ type: 'text', text: docs.readDocs(name)! }])
    }
    const missing = await client.callTool({ name: 'read_docs', arguments: { name: 'missing' } })
    expect(missing.isError).toBe(true)
  } finally {
    await client.close()
    await server.close()
  }
})
