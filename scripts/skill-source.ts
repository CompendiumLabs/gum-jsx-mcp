// Build-time assembly of Gum's maintained prompts and docs for MCP hosts.

import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import {
  buildSkillFiles,
  getElements,
  getGallery,
  getGuides,
  getSkillPrompt,
  mapSkillLinks,
} from '@gum-jsx/docs'

const LOCAL_PROMPT_DIR = join(import.meta.dir, '..', 'prompt')

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const elements = getElements()
const guides = getGuides()
const gallery = getGallery()
const files = buildSkillFiles({ cli: false })
const referenceNames = new Map([...files.keys()]
  .filter(file => file.startsWith('references/'))
  .map(file => [file, posix.basename(file, '.md')]))

// Tool-returned links use paths relative to the generated SKILL.md. The
// basename identifies the read_docs page; on-disk files keep relative links.
function referenceLinks(markdown: string, file: string): string {
  return mapSkillLinks(markdown, target => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) return target
    const [path, anchor] = target.split('#')
    const destination = path ? posix.join(posix.dirname(file), decodeURIComponent(path)) : file
    if (!files.has(destination)) throw new Error(`${file}: no MCP documentation for ${target}`)
    return destination + (anchor ? `#${anchor}` : '')
  })
}

// The same pages and examples back the local files and read_docs.
// Keep individual and whole-category lookups available through read_docs.
const refs_pages: Record<string, string> = Object.fromEntries(
  [...referenceNames].map(([file, name]) => [name, referenceLinks(files.get(file)!, file)]),
)
for (const [category, names] of Object.entries(elements.cats)) {
  const content = names.map(name => refs_pages[name]).join('\n\n')
  refs_pages[category] = `# ${capitalize(category)} Elements\n\n${content}`
}

const mcpPrompt = readFileSync(join(LOCAL_PROMPT_DIR, 'mcp.md'), 'utf8').trim()
const INSTRUCTIONS = [
  referenceLinks(getSkillPrompt(), 'SKILL.md').trim(),
  mcpPrompt,
].join('\n\n')

// Keep an inspectable local copy of the shared instructions and references.
const skillFiles = new Map(files)
skillFiles.set('SKILL.md', files.get('SKILL.md')!.trim() + '\n\n' + mcpPrompt + '\n')

const BLURB_LENGTH = 140

function blurb(page: string): { title: string; summary: string } {
  const [head, ...rest] = page.trim().split('\n')
  const title = head!.replace(/^#+\s*/, '')
  const body = rest.join(' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1').trim()
  const sentence = body.match(/^.*?[.!?](\s|$)/)?.[0] ?? body
  const summary = sentence.length > BLURB_LENGTH
    ? sentence.slice(0, BLURB_LENGTH - 3).trimEnd() + '...'
    : sentence.trim()
  return { title, summary }
}

function listDocs(): string {
  const sections = Object.entries(elements.cats)
    .map(([category, names]) => `  ${category} — ${names.join(', ')}`)
  const guidePages = guides.tags.map(name => {
    const { title, summary } = blurb(guides.text[name] ?? '')
    return `  ${name} — ${title}: ${summary}`
  })
  const galleryPages = gallery.tags.map(name => {
    const { title, summary } = blurb(gallery.text[name] ?? '')
    return `  ${name} — ${title}: ${summary}`
  })
  return [
    'Indexes: elements, guides, gallery (also available through read_docs)',
    '',
    'Element reference sections (use a section name for the whole section, or an element name for one page):',
    ...sections,
    '',
    'Guides:',
    ...guidePages,
    '',
    'Gallery examples:',
    ...galleryPages,
  ].join('\n')
}

export { INSTRUCTIONS, refs_pages, listDocs, skillFiles }
