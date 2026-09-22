// Load precompiled authoring instructions and documentation once at startup.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
const SKILL_OUTPUT = join(import.meta.dir, '..', 'dist', 'skills')

function loadSkillDocs(output = SKILL_OUTPUT) {
  try {
    const INSTRUCTIONS = readFileSync(join(output, 'instructions.md'), 'utf8').trim()
    const { index, pages: refs_pages } = z.object({ index: z.string(), pages: z.record(z.string(), z.string()) })
      .parse(JSON.parse(readFileSync(join(output, 'docs.json'), 'utf8')))
    const exactPages = new Map(Object.entries(refs_pages))
    const lowerPages = new Map([...exactPages].map(([name, page]) => [name.toLowerCase(), page]))
    return {
      INSTRUCTIONS, refs_pages,
      listDocs: () => index,
      readDocs: (name: string): string | null => {
        const key = name.trim()
        return exactPages.get(key) ?? lowerPages.get(key.toLowerCase()) ?? null
      },
    }
  } catch (cause) {
    throw new Error(`Cannot load MCP docs from ${output}; run \`bun run skill\` or \`bun run build\`.`, { cause })
  }
}

export { loadSkillDocs, SKILL_OUTPUT }
