// Precompile inspectable authoring files and the snapshot used by docs tools.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { INSTRUCTIONS, refs_pages, listDocs, skillFiles } from './skill-source'
import { SKILL_OUTPUT } from '../src/skill'

export function buildSkills(output = SKILL_OUTPUT): void {
  rmSync(output, { recursive: true, force: true })
  for (const [file, text] of skillFiles) {
    const target = join(output, 'gum-jsx', file)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, text)
  }
  writeFileSync(join(output, 'instructions.md'), INSTRUCTIONS + '\n')
  writeFileSync(join(output, 'docs.json'), JSON.stringify({ index: listDocs(), pages: refs_pages }, null, 2) + '\n')
  console.log(`built instructions, docs snapshot, and ${skillFiles.size} local reference files in ${output}`)
}

if (import.meta.main) buildSkills()
