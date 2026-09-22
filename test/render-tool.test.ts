import { expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { rasterize_pixels } from '@gum-jsx/png'
import { registerRenderTool } from '../src/render-tool'

async function withClient(run: (client: Client) => Promise<void>): Promise<void> {
  const server = new McpServer({ name: 'gum-render-test', version: '0' })
  registerRenderTool(server, 'ui://gum/test-viewer.html')
  const client = new Client({ name: 'figure-author', version: '0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  try {
    await client.connect(clientTransport)
    await run(client)
  } finally {
    await client.close()
    await server.close()
  }
}

test('rasterize returns a painted PNG before render hands the source to the viewer', async () => {
  await withClient(async client => {
    const { tools } = await client.listTools()
    expect(tools.find(tool => tool.name === 'rasterize')?._meta).toBeUndefined()
    expect(tools.find(tool => tool.name === 'render')?._meta?.ui).toEqual({ resourceUri: 'ui://gum/test-viewer.html' })
    const args = { code: '<Rect width="40px" height="20px" fill="red" stroke={none} />', size: 1000 }
    const raster = await client.callTool({ name: 'rasterize', arguments: args })
    expect(raster.isError).not.toBe(true)
    const image = (raster.content as { type: string; data: string; mimeType: string }[]).find(item => item.type === 'image')!
    expect(image.mimeType).toBe('image/png')
    const png = Buffer.from(image.data, 'base64')
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([80, 40])
    const pixels = rasterize_pixels(png)
    expect([...pixels.data.slice(4 * (20 * 80 + 40), 4 * (20 * 80 + 40) + 4)]).toEqual([255, 0, 0, 255])
    const display = await client.callTool({ name: 'render', arguments: args })
    expect(display.isError).not.toBe(true)
    expect(display.structuredContent).toEqual(args)
    expect(JSON.stringify(display.content)).not.toContain('Rendered gum.jsx figure')
  })
})

test('scalar dash patterns and named font weights survive full rasterization', async () => {
  await withClient(async client => {
    const source = (dashes: string) => `
      <Svg width="160px" height="80px" stroke-dasharray={${dashes}} font-weight="bold">
        <VStack>
          <Rect width="80px" height="20px" fill={none} />
          <Text>Dash test</Text>
          <Latex>{'x^2'}</Latex>
        </VStack>
      </Svg>
    `
    const scalar = await client.callTool({ name: 'rasterize', arguments: { code: source('px(4)') } })
    const array = await client.callTool({ name: 'rasterize', arguments: { code: source('[px(4), px(4)]') } })
    expect(scalar.isError).not.toBe(true)
    expect(array.isError).not.toBe(true)
    const images = (result: typeof scalar) => (result.content as { type: string }[]).filter(item => item.type === 'image')
    expect(images(scalar)).toHaveLength(1)
    expect(images(scalar)).toEqual(images(array))
  })
})

test('failed evaluations and layouts return errors without images or success messages', async () => {
  await withClient(async client => {
    for (const code of ['return 42', '<MissingElement />', '<Rect stroke-dasharray={px(-1)} />']) {
      for (const name of ['rasterize', 'render']) {
        const result = await client.callTool({ name, arguments: { code } })
        expect(result.isError).toBe(true)
        const content = result.content as { type: string; text: string }[]
        expect(content).toHaveLength(1)
        expect(content[0].type).toBe('text')
        expect(content[0].text).toContain('failed:')
        expect(content[0].text).not.toContain('not a function')
        expect(content[0].text).not.toMatch(/Rasterized|validated|Rendered/)
      }
    }
    // Valid SVG with an empty viewport cannot produce a raster image.
    const empty = await client.callTool({ name: 'rasterize', arguments: { code: '<Svg width="0px" height="0px" />' } })
    expect(empty.isError).toBe(true)
    expect(JSON.stringify(empty.content)).toContain('positive and finite')
  })
})
