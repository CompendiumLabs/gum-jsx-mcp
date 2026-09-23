import { expect, test } from 'bun:test'
import { posix, join } from 'node:path'
import { readFileSync } from 'node:fs'
import * as math from '@gum-jsx/math'
import { buildSkillFiles, getElements, getGuides, getGallery, getSkillPrompt } from '@gum-jsx/docs'
import { skillFixture } from './skill-fixture'
import { renderFigure } from '../src/render'

const { output, docs: { INSTRUCTIONS, refs_pages, listDocs, readDocs } } = skillFixture()

function examples(markdown: string): string[] {
  return [...markdown.matchAll(/^```jsx\n([\s\S]*?)^```/gm)].map(match => match[1])
}

function links(markdown: string): string[] {
  const prose = markdown.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '')
  return [...prose.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)]
    .map(match => match[1])
}

test('MCP shares the portable authoring examples without its shell workflow', () => {
  const portable = buildSkillFiles().get('SKILL.md')!
  // CLI-only deck/prelude examples are excluded along with the shell workflow.
  const shared = buildSkillFiles({ cli: false }).get('SKILL.md')!
  expect(examples(INSTRUCTIONS)).toEqual(examples(shared))
  expect(examples(INSTRUCTIONS).length).toBeGreaterThanOrEqual(3)
  expect(portable).toMatch(/^```sh\n/m)
  expect(INSTRUCTIONS).not.toMatch(/^```(?:sh|bash)\n/m)
  expect(INSTRUCTIONS).not.toContain('@gum-jsx/cli')

  // All shared advice survives adaptation; only documentation URLs change.
  const withoutLinks = (text: string) => text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  expect(withoutLinks(INSTRUCTIONS)).toStartWith(withoutLinks(getSkillPrompt()).trim())
})

test('shared instruction examples render through the MCP figure pipeline', () => {
  const fonts = math.createMathFonts()
  for (const source of examples(INSTRUCTIONS)) {
    const result = renderFigure(source, { fonts })
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
    expect(result.markup).toStartWith('<svg ')
    expect(result.markup).not.toMatch(/NaN|Infinity/)
  }
})

test('docs tools expose every current page and unmodified example', () => {
  const index = listDocs()
  for (const collection of [getElements(), getGuides(), getGallery()]) {
    for (const name of collection.tags) {
      expect(index).toContain(name)
      const page = readDocs(name)
      expect(page).toBe(refs_pages[name])
      expect(page).toContain('```jsx\n' + collection.code[name] + '\n```')
    }
  }
  for (const [category, names] of Object.entries(getElements().cats)) {
    for (const name of names) expect(readDocs(category)).toContain(readDocs(name)!)
  }
  for (const name of ['elements', 'guides', 'gallery']) {
    expect(index).toContain(name)
    expect(readDocs(name)).toBe(refs_pages[name])
  }
})

test('file-based instruction and tool links identify readable docs pages', () => {
  for (const page of [INSTRUCTIONS, ...Object.values(refs_pages)]) {
    expect(page).not.toMatch(/(?:skill|gum):\/\//)
    for (const target of links(page)) {
      if (/^https?:\/\//.test(target)) continue
      const [path, hash] = target.split('#')
      expect(path).toStartWith('references/')
      const name = posix.basename(path, '.md')
      const destination = readDocs(name)
      expect(destination).not.toBeNull()
      expect(readFileSync(join(output, 'gum-jsx', path), 'utf8')).toBeTruthy()
      if (hash === 'example') expect(destination).toContain('\n## Example\n')
    }
  }
  expect(links(INSTRUCTIONS)).toContain('references/elements/Plot.md')
  expect(links(readDocs('guides')!)).toContain('references/guides/Style.md')
  expect(links(readDocs('transformer')!)).toContain('references/gallery/transformer.md#example')
})

test('doc lookup preserves Math/math distinctions and rejects unknown names', () => {
  expect(readDocs('Math')).not.toBe(readDocs('math'))
  expect(readDocs('Math')).toContain('# Math authoring')
  expect(readDocs('math')).toContain('# Math Elements')
  expect(readDocs('  fitting  ')).toBe(readDocs('Fitting'))
  expect(readDocs('PLOT')).toBe(readDocs('Plot'))
  for (const name of ['', 'missing-page', 'constructor', '__proto__', 'toString']) {
    expect(readDocs(name)).toBeNull()
  }
})
