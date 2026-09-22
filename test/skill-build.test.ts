import { expect, test } from 'bun:test'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { mapSkillLinks } from '@gum-jsx/docs'
import { buildSkills } from '../scripts/skill'
import { skillFiles } from '../scripts/skill-source'
import { loadSkillDocs } from '../src/skill'
import { skillFixture } from './skill-fixture'

test('builds retain inspectable linked files and remove obsolete protocol artifacts', () => {
  const { scratch, output, docs } = skillFixture()
  const source = readFileSync(join(output, 'gum-jsx', 'SKILL.md'), 'utf8')
  expect(readFileSync(join(output, 'instructions.md'), 'utf8').trim()).toBe(docs.INSTRUCTIONS)
  expect(JSON.parse(readFileSync(join(output, 'docs.json'), 'utf8')).index).toBe(docs.listDocs())
  for (const [file, text] of skillFiles) {
    expect(readFileSync(join(output, 'gum-jsx', file), 'utf8')).toBe(text)
    mapSkillLinks(text, target => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) return target
      const path = target.split('#')[0]
      const destination = path ? posix.join(posix.dirname(file), decodeURIComponent(path)) : file
      expect(skillFiles.has(destination)).toBe(true)
      return target
    })
  }
  writeFileSync(join(scratch, 'viewer.html'), 'keep viewer')
  writeFileSync(join(output, 'manifest.json'), 'obsolete protocol manifest')
  writeFileSync(join(output, 'gum-jsx', 'obsolete.md'), 'old generated file')
  buildSkills(output)
  expect(readFileSync(join(output, 'gum-jsx', 'SKILL.md'), 'utf8')).toBe(source)
  expect(existsSync(join(output, 'manifest.json'))).toBe(false)
  expect(existsSync(join(output, 'gum-jsx', 'obsolete.md'))).toBe(false)
  expect(readFileSync(join(scratch, 'viewer.html'), 'utf8')).toBe('keep viewer')
})

test('runtime loads only generated instructions and docs, retaining the startup snapshot', () => {
  const { output, docs } = skillFixture()
  rmSync(join(output, 'gum-jsx'), { recursive: true })
  expect(loadSkillDocs(output).INSTRUCTIONS).toBe(docs.INSTRUCTIONS)
  writeFileSync(join(output, 'instructions.md'), 'Generated instructions\n')
  writeFileSync(join(output, 'docs.json'), JSON.stringify({ index: 'Generated index', pages: { Style: 'Generated style' } }))
  const loaded = loadSkillDocs(output)
  expect(loaded.INSTRUCTIONS).toBe('Generated instructions')
  expect(loaded.listDocs()).toBe('Generated index')
  expect(loaded.readDocs('Style')).toBe('Generated style')
  expect(docs.INSTRUCTIONS).not.toBe(loaded.INSTRUCTIONS)
  expect(docs.readDocs('Style')).not.toBe(loaded.readDocs('Style'))
})

test('missing or malformed generated snapshots fail with rebuild guidance', () => {
  const { output } = skillFixture()
  writeFileSync(join(output, 'docs.json'), JSON.stringify({ pages: [] }))
  expect(() => loadSkillDocs(output)).toThrow('run `bun run skill`')
  rmSync(join(output, 'docs.json'))
  expect(() => loadSkillDocs(output)).toThrow('run `bun run skill`')
  buildSkills(output)
  rmSync(join(output, 'instructions.md'))
  expect(() => loadSkillDocs(output)).toThrow('run `bun run skill`')
})
