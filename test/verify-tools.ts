// Exercise the real HTTP tool workflow without relying on skill import support.
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export async function verifyTools(endpoint: string): Promise<void> {
  const client = new Client({ name: 'gum-verifier', version: '0' })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), {
      fetch: (input, init) => fetch(input, { ...init, proxy: '' }),
    }))
    assert(!client.getServerCapabilities()?.extensions?.['io.modelcontextprotocol/skills'])
    const { tools } = await client.listTools()
    for (const name of ['list_docs', 'read_docs', 'rasterize', 'render']) {
      assert(tools.some(tool => tool.name === name), `Missing ${name}`)
    }
    for (const [name, args] of [['list_docs', {}], ['read_docs', { name: 'guides/style' }]] as const) {
      const result = await client.callTool({ name, arguments: args })
      assert(!result.isError, `${name} failed`)
      const content = result.content as { type: string; text: string }[]
      assert(content.some(item => item.type === 'text' && item.text.includes('stroke')))
    }
    const args = {
      code: '<Rect width="80px" height="40px" fill="red" stroke-dasharray={px(4)} />', size: 1000,
    }
    const raster = await client.callTool({ name: 'rasterize', arguments: args })
    assert(!raster.isError, 'Rasterization failed')
    const image = (raster.content as { type: string; data: string; mimeType: string }[]).find(item => item.type === 'image')
    assert(image?.mimeType === 'image/png', 'Rasterization did not return a PNG')
    const png = Buffer.from(image.data, 'base64')
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [160, 80])
    const rendered = await client.callTool({ name: 'render', arguments: args })
    assert(!rendered.isError, 'Viewer handoff failed')
    assert.deepEqual(rendered.structuredContent, args)
    const viewerUri = tools.find(tool => tool.name === 'render')!._meta!['openai/outputTemplate'] as string
    const { contents } = await client.readResource({ uri: viewerUri })
    assert(contents.some(item => 'text' in item && item.text.includes('<html')))
    const { resources } = await client.listResources()
    assert(resources.every(resource => resource.uri.startsWith('ui://gum/')), 'Unexpected documentation resources')
    for (const name of ['rasterize', 'render']) {
      const failure = await client.callTool({ name, arguments: { code: '<MissingElement />' } })
      assert(failure.isError, `${name} did not report invalid code as an error`)
    }
    console.log('Verified docs tools, PNG rendering, viewer handoff/resource, and render errors over HTTP.')
  } finally {
    await client.close()
  }
}
