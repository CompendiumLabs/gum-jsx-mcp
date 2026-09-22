import { afterAll } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSkills } from '../scripts/skill'
import { loadSkillDocs } from '../src/skill'

export function skillFixture() {
  const scratch = mkdtempSync(join(tmpdir(), 'gum-mcp-skill-'))
  const output = join(scratch, 'skills')
  afterAll(() => rmSync(scratch, { recursive: true, force: true }))
  buildSkills(output)
  return { scratch, output, docs: loadSkillDocs(output) }
}
