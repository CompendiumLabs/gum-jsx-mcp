import { expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { decode } from 'fast-png'
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
    const pixels = decode(png)
    expect([...pixels.data.slice(4 * (20 * 80 + 40), 4 * (20 * 80 + 40) + 4)]).toEqual([255, 0, 0, 255])
    const display = await client.callTool({ name: 'render', arguments: args })
    expect(display.isError).not.toBe(true)
    expect(display.structuredContent).toEqual(args)
    expect(JSON.stringify(display.content)).not.toContain('Rendered Gum figure')
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

test('rasterize paints white behind transparent geometry and retains fractional dimensions', async () => {
  await withClient(async client => {
    const result = await client.callTool({ name: 'rasterize', arguments: {
      code: '<Rect width="8.25px" height="4.25px" fill="none" stroke={none} />',
    } })
    expect(result.isError).not.toBe(true)
    const image = (result.content as { type: string; data: string }[]).find(item => item.type === 'image')!
    const png = decode(Buffer.from(image.data, 'base64'))
    expect([png.width, png.height]).toEqual([17, 9])
    expect([...png.data.slice(0, 4)]).toEqual([255, 255, 255, 255])
  })
})

test('named map coordinates and position spreads survive the MCP render boundary', async () => {
  await withClient(async client => {
    const code = `
      const point = {lon: 30, lat: 20}
      return <GeoMap source={world_countries({ids: []})} width={px(120)} height={px(80)}>
        <Rect {...{pos: point}} width={px(4)} height={px(6)} />
        <Points points={[point]} point-size={({lat}) => px(lat / 5)} />
      </GeoMap>
    `
    const equivalent = code.replace('{lon: 30, lat: 20}', '[30, 20]')
      .replace('point-size={({lat}) => px(lat / 5)}', 'point-size={px(4)}')
    const named = await client.callTool({ name: 'rasterize', arguments: { code } })
    const tuples = await client.callTool({ name: 'rasterize', arguments: { code: equivalent } })
    expect(named.isError).not.toBe(true)
    expect(tuples.isError).not.toBe(true)
    const images = (result: typeof named) => (result.content as { type: string }[]).filter(item => item.type === 'image')
    expect(images(named)).toHaveLength(1)
    expect(images(named)).toEqual(images(tuples))
    const display = await client.callTool({ name: 'render', arguments: { code } })
    expect(display.isError).not.toBe(true)
    expect(display.structuredContent).toEqual({ code, size: 1000 })
  })
})

test('failed evaluations and layouts return errors without images or success messages', async () => {
  await withClient(async client => {
    for (const code of ['return 42', '<MissingElement />', '<Rect stroke-dasharray={px(-1)} />',
      '<GeoMap source={world_countries()}><Points points={[{lon: 30, lat: 20, x: 30}]} /></GeoMap>']) {
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
