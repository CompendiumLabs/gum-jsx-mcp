// Real-client MCP tool verification. Kept separate from the offline unit tests.
import { join } from 'node:path'
import { verifyTools } from './verify-tools'

const ROOT = join(import.meta.dir, '..')
const INSPECTOR = '@modelcontextprotocol/inspector@2.7.0'
const children = new Set<Bun.Subprocess>()
let interrupted = 0

function stop(code: number): void {
  interrupted = code
  for (const child of children) child.kill('SIGTERM')
}
const onInterrupt = () => stop(130)
const onTerminate = () => stop(143)
process.on('SIGINT', onInterrupt)
process.on('SIGTERM', onTerminate)

async function run(command: string[], env = process.env): Promise<number> {
  if (interrupted) return interrupted
  const child = Bun.spawn(command, { cwd: ROOT, env, stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' })
  children.add(child)
  const timeout = setTimeout(() => {
    console.error(`Verification command timed out: ${command.join(' ')}`)
    child.kill('SIGKILL')
  }, 180_000)
  try {
    return interrupted || await child.exited
  } finally {
    clearTimeout(timeout)
    children.delete(child)
  }
}

async function verify(): Promise<number> {
  const built = await run([process.execPath, 'run', 'build'])
  if (built !== 0 || interrupted) return interrupted || built

  const server = Bun.spawn([process.execPath, 'src/server.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', PUBLIC_URL: 'http://127.0.0.1' },
    stdin: 'ignore', stdout: 'pipe', stderr: 'inherit',
  })
  children.add(server)
  const startupTimeout = setTimeout(() => server.kill('SIGKILL'), 15_000)
  // Wait for the server's actual assigned port; do not reserve a port then race
  // another process to bind it, or accidentally verify an existing dev server.
  const reader = server.stdout.getReader()
  const decoder = new TextDecoder()
  let output = '', port: string | undefined
  try {
    while (!port) {
      const { done, value } = await reader.read()
      if (done) throw new Error('Verification server exited before reporting its port')
      output += decoder.decode(value, { stream: true })
      port = /listening on http:\/\/localhost:(\d+)/.exec(output)?.[1]
    }
  } finally {
    clearTimeout(startupTimeout)
    reader.releaseLock()
  }
  // Drain subsequent output so a full pipe cannot stall the child.
  const drained = (async () => {
    const remaining = server.stdout.getReader()
    try {
      while (!(await remaining.read()).done) { /* discard server logs */ }
    } finally {
      remaining.releaseLock()
    }
  })()
  try {
    const endpoint = `http://127.0.0.1:${port}/mcp`
    console.log(`Verifying ${endpoint} with ${INSPECTOR}`)
    const inspected = await run(['bunx', INSPECTOR, '--cli', endpoint, '--transport', 'http',
      '--protocol-era', 'legacy', '--method', 'tools/list'], {
      ...process.env,
      NO_PROXY: [process.env.NO_PROXY, process.env.no_proxy, '127.0.0.1', 'localhost'].filter(Boolean).join(','),
      no_proxy: [process.env.NO_PROXY, process.env.no_proxy, '127.0.0.1', 'localhost'].filter(Boolean).join(','),
    })
    if (inspected !== 0 || interrupted) return interrupted || inspected
    await verifyTools(endpoint)
    return 0
  } finally {
    server.kill('SIGTERM')
    await server.exited
    await drained
    children.delete(server)
  }
}

try {
  process.exitCode = await verify()
} catch (error) {
  if (!interrupted) console.error(error)
  process.exitCode = interrupted || 1
} finally {
  for (const child of children) child.kill('SIGKILL')
  await Promise.all([...children].map(child => child.exited))
  process.off('SIGINT', onInterrupt)
  process.off('SIGTERM', onTerminate)
  if (interrupted) process.exitCode = interrupted
}
