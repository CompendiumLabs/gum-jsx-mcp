import { afterAll, afterEach, expect, spyOn, test } from 'bun:test'
import { withRequestLogging } from '../src/request-logging'

const stderr = spyOn(console, 'error').mockImplementation(() => {})
afterEach(() => stderr.mockClear())
afterAll(() => stderr.mockRestore())

function logs() {
  return stderr.mock.calls.map(([line]) => JSON.parse(line as string))
}

test('logs MCP arguments while preserving the request and streaming response', async () => {
  const body = { jsonrpc: '2.0', id: 42, method: 'tools/call', params: { name: 'render', arguments: { code: '<Rect />' } } }
  const response = new Response(new ReadableStream(), { headers: { 'Content-Type': 'text/event-stream' } })
  const handle = withRequestLogging(async request => {
    expect(await request.json()).toEqual(body)
    return response
  })
  const result = await handle(new Request('http://localhost/mcp', { method: 'POST', body: JSON.stringify(body) }))
  expect(result).toBe(response)
  expect(result.bodyUsed).toBe(false)
  expect(logs()).toMatchObject([
    { id: 1, event: 'request', method: 'POST', path: '/mcp' },
    { id: 1, event: 'request-body', body },
    { id: 1, event: 'response', status: 200, durationMs: expect.any(Number) },
  ])
  expect(logs().every(entry => !Number.isNaN(Date.parse(entry.time)))).toBe(true)
  await result.body!.cancel()
})

test('logs malformed bodies and HTTP errors without changing handling', async () => {
  const handle = withRequestLogging(async request => {
    expect(await request.text()).toBe('{invalid')
    return new Response('Invalid JSON', { status: 400 })
  })
  const result = await handle(new Request('http://localhost/mcp', { method: 'POST', body: '{invalid' }))
  expect(await result.text()).toBe('Invalid JSON')
  expect(logs()[1]).toMatchObject({ event: 'request-body', body: '{invalid' })
  expect(logs()[2]).toMatchObject({ event: 'response', status: 400 })
})

test('correlates concurrent requests and rethrows handler errors', async () => {
  const failure = new Error('Failed to render')
  const handle = withRequestLogging(async request => {
    if (new URL(request.url).pathname === '/mcp') throw failure
    return new Response(null, { status: 204 })
  })
  const results = await Promise.allSettled([
    handle(new Request('http://localhost/mcp')),
    handle(new Request('http://localhost/health')),
  ])
  expect(results[0]).toEqual({ status: 'rejected', reason: failure })
  expect(logs().filter(entry => entry.id === 1)).toMatchObject([
    { event: 'request', path: '/mcp' },
    { event: 'error', error: expect.stringContaining('Failed to render') },
  ])
  expect(logs().filter(entry => entry.id === 2)).toMatchObject([
    { event: 'request', path: '/health' },
    { event: 'response', status: 204 },
  ])
})
