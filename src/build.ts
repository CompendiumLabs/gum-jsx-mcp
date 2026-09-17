// Bundle the MCP App into one HTML resource. Imported font files are emitted
// beside it and use a deployment-independent URL placeholder that server.ts
// replaces with PUBLIC_URL.

import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pkg from '../package.json'

const ROOT = join(import.meta.dir, '..')
const DIST = join(ROOT, 'dist')
const FONT_BASE = '__GUM_FONT_BASE__'
const CORE_FONT_DIR = fileURLToPath(new URL('./fonts/', import.meta.resolve('@gum-jsx/core')))

async function build(): Promise<void> {
  await rm(DIST, { recursive: true, force: true })
  await mkdir(DIST, { recursive: true })

  const result = await Bun.build({
    entrypoints: [join(ROOT, 'src/viewer/main.ts')],
    outdir: DIST,
    target: 'browser',
    format: 'esm',
    minify: true,
    sourcemap: 'none',
    publicPath: `${FONT_BASE}/`,
    naming: { entry: 'viewer.js', asset: 'fonts/[name].[ext]' },
    define: { __GUM_MCP_VERSION__: JSON.stringify(pkg.version) },
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error('viewer build failed')
  }

  // Core registers its bundled faces through runtime new URL() calls, so they
  // are not visible to Bun's static asset graph. Keep those URLs intact and
  // copy the package-owned files to the route they resolve against.
  const fontDir = join(DIST, 'fonts')
  await mkdir(fontDir, { recursive: true })
  const coreFonts = (await readdir(CORE_FONT_DIR)).filter(name => name.endsWith('.ttf'))
  await Promise.all(coreFonts.map(name => copyFile(join(CORE_FONT_DIR, name), join(fontDir, name))))

  const js = await Bun.file(join(DIST, 'viewer.js')).text()
  const template = await Bun.file(join(ROOT, 'src/viewer/index.html')).text()
  const html = template.replace('__VIEWER_JS__', () => js.replaceAll('</script', '<\\/script'))
  await Bun.write(join(DIST, 'viewer.html'), html)

  const fonts = (await readdir(fontDir)).filter(name => name.endsWith('.ttf')).length
  console.log(`built dist/viewer.html (${(html.length / 1024).toFixed(0)} KB) and ${fonts} font files`)
}

await build()
