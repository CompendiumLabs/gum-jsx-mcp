import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { loadSkillDocs } from './skill'

export function registerDocs(server: McpServer, { listDocs, readDocs }: ReturnType<typeof loadSkillDocs>): void {
  server.registerTool('list_docs', {
    title: 'List gum.jsx documentation',
    description: 'List the available element sections, guides, and gallery examples. Use it to find names for read_docs.',
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async () => ({ content: [{ type: 'text', text: listDocs() }] }))

  server.registerTool('read_docs', {
    title: 'Read gum.jsx documentation',
    description: 'Read an element section, individual element, guide, or gallery example by the name shown by list_docs.',
    inputSchema: {
      name: z.string().describe('Exact name from list_docs, such as guides/style or elements/Plot.'),
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ name }) => {
    const page = readDocs(name)
    if (page == null) {
      return {
        isError: true,
        content: [{ type: 'text', text: `No documentation found for "${name}". Use list_docs to see the available names.` }],
      }
    }
    return { content: [{ type: 'text', text: page }] }
  })

}
