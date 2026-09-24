// Build-time assembly of Gum's maintained prompts and docs for MCP hosts.

import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import {
  buildSkillFiles,
  getElements,
  getGallery,
  getGuides,
  mapSkillLinks,
  promptDir,
} from '@gum-jsx/docs'

const LOCAL_PROMPT_DIR = join(import.meta.dir, '..', 'prompt')

const elements = getElements()
const guides = getGuides()
const gallery = getGallery()
const files = buildSkillFiles({ cli: false })
// Tool-returned links use paths relative to the generated SKILL.md. The
// file and fragment identify the read_docs page; on-disk files keep relative links.
function referenceLinks(markdown: string, file: string): string {
  return mapSkillLinks(markdown, target => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) return target
    const [path, anchor] = target.split('#')
    const destination = path ? posix.join(posix.dirname(file), decodeURIComponent(path)) : file
    if (!files.has(destination)) throw new Error(`${file}: no MCP documentation for ${target}`)
    return destination + (anchor ? `#${anchor}` : '')
  })
}

// The portable skill groups elements and gallery entries by category. Extract
// each anchored section so read_docs still supports individual names.
function entry(file: string, name: string): string {
  const markdown = files.get(file)
  if (!markdown) throw new Error(`Missing MCP reference ${file}`)
  const start = markdown.indexOf(`<a id="${name}"></a>`)
  if (start < 0) throw new Error(`Missing ${name} in ${file}`)
  const end = markdown.indexOf('\n\n---\n\n', start)
  return referenceLinks(markdown.slice(start, end < 0 ? undefined : end).trim(), file)
}

const refs_pages: Record<string, string> = {}
for (const name of ['elements', 'guides', 'gallery']) {
  const file = `references/${name}.md`
  refs_pages[name] = referenceLinks(files.get(file)!, file)
}
for (const name of guides.tags) {
  const file = `references/guides/${name}.md`
  refs_pages[`guides/${name}`] = referenceLinks(files.get(file)!, file)
}
for (const [category, names] of Object.entries(elements.cats)) {
  const file = `references/elements/${category}.md`
  refs_pages[`elements/${category}`] = referenceLinks(files.get(file)!, file)
  for (const name of names) refs_pages[`elements/${name}`] = entry(file, name)
}
for (const [category, names] of Object.entries(gallery.cats)) {
  const file = `references/gallery/${category}.md`
  refs_pages[`gallery/${category}`] = referenceLinks(files.get(file)!, file)
  for (const name of names) refs_pages[`gallery/${name}`] = entry(file, name)
}
const mcpPrompt = readFileSync(join(LOCAL_PROMPT_DIR, 'mcp.md'), 'utf8').trim()
const head = readFileSync(join(promptDir, 'head.md'), 'utf8').trim()
const packagedPrompt = files.get('SKILL.md')!.slice(head.length).trim()
const INSTRUCTIONS = [
  referenceLinks(packagedPrompt, 'SKILL.md').trim(),
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
    .map(([category, names]) => `  elements/${category} — ${names.map(name => `elements/${name}`).join(', ')}`)
  const guidePages = guides.tags.map(name => {
    const { title, summary } = blurb(guides.text[name] ?? '')
    return `  guides/${name} — ${title}: ${summary}`
  })
  const galleryPages = gallery.tags.map(name => {
    const { title, summary } = blurb(gallery.text[name] ?? '')
    return `  gallery/${name} — ${title}: ${summary}`
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
