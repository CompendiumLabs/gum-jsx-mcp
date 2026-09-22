import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { createMathFonts } from '@gum-jsx/math'
import { rasterize_svg } from '@gum-jsx/png'
import { DEFAULT_SIZE, renderFigure } from './render'

// Check the complete SVG render before returning success to the model.
// Local font URLs load synchronously through the core font provider.
function checkCode(code: string, size: number): string | null {
  try {
    renderFigure(code, { size, fonts: createMathFonts() })
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

const RENDER_DESCRIPTION = `Display a gum.jsx figure in the client viewer. First call rasterize with the same code and size, inspect the returned PNG, and fix any errors or visual problems. Repeat the raster check after every revision.

gum.jsx is a JSX language for SVG figures. Code may be one JSX expression, or JavaScript statements and helper components ending in \`return <.../>\`. The server instructions introduce the language; list_docs and read_docs provide current guides, element references, and gallery examples.

The figure is drawn interactively in the conversation. The tool returns its code, or an actionable evaluation, layout, or SVG rendering error. Server validation does not confirm browser display; viewer errors mean the figure was not displayed successfully.`

const inputSchema = {
  code: z.string().describe('gum.jsx source code for the figure'),
  size: z.number().int().positive().optional()
    .describe(`available layout width in pixels (default ${DEFAULT_SIZE}); compact figures hug content and authored dimensions are preserved`),
}

export function registerRenderTool(server: McpServer, viewerUri: string): void {
  server.registerTool('rasterize', {
    title: 'Test gum.jsx figure as PNG',
    description: 'Evaluate, lay out, serialize, and rasterize gum.jsx on the server. Returns a 2× PNG for visual inspection, or an actionable error. Always call this before render, including after revisions. Inspect the PNG for legibility, clipping, overlap, and alignment; then call render with the same code and size to display the checked figure. Uses a light root theme and white background, matching viewer downloads.',
    inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ code, size = DEFAULT_SIZE }) => {
    try {
      const figure = renderFigure(code, { size, fonts: createMathFonts(), theme: 'light', background: 'white' })
      const png = rasterize_svg(figure.markup, { size: figure, ratio: 2 })
      return {
        content: [
          { type: 'text', text: `Rasterized gum.jsx figure (${figure.width} × ${figure.height}px; PNG at 2×). Inspect this image before calling render with the same code and size.` },
          { type: 'image', mimeType: 'image/png', data: png.toString('base64') },
        ],
      }
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `gum.jsx rasterization failed:\n${error instanceof Error ? error.message : String(error)}` }],
      }
    }
  })

  registerAppTool(server, 'render', {
    title: 'Render gum.jsx figure',
    description: RENDER_DESCRIPTION,
    inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: {
      ui: { resourceUri: viewerUri },
      'openai/outputTemplate': viewerUri,
    },
  }, async ({ code, size = DEFAULT_SIZE }) => {
    const error = checkCode(code, size)
    if (error != null) {
      return {
        isError: true,
        content: [{ type: 'text', text: `gum.jsx rendering failed:\n${error}` }],
        structuredContent: { code, size, error },
      }
    }
    return {
      content: [{ type: 'text', text: `gum.jsx SVG validated on the server and sent to the viewer (${size}px width offer). Browser display is not yet confirmed.` }],
      structuredContent: { code, size },
    }
  })
}
