type Handler = (request: Request) => Promise<Response>

export function withRequestLogging(handle: Handler): Handler {
  let nextId = 0
  return async request => {
    const id = ++nextId
    const started = performance.now()
    const log = (event: string, details: Record<string, unknown>) => {
      console.error(JSON.stringify({ time: new Date().toISOString(), id, event, ...details }))
    }

    log('request', { method: request.method, path: new URL(request.url).pathname })
    if (request.body !== null) {
      try {
        // Read a clone so the MCP transport still receives the original body.
        const text = await request.clone().text()
        let body: unknown = text
        try { body = JSON.parse(text) } catch { /* preserve malformed requests for debugging */ }
        log('request-body', { body })
      } catch (error) {
        log('request-body-error', { error: String(error) })
      }
    }

    try {
      const response = await handle(request)
      log('response', { status: response.status, durationMs: Math.round(performance.now() - started) })
      return response
    } catch (error) {
      log('error', {
        error: error instanceof Error ? error.stack ?? error.message : String(error),
        durationMs: Math.round(performance.now() - started),
      })
      throw error
    }
  }
}
