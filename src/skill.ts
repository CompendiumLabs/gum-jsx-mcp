// Gum's maintained prompts and docs, adapted to MCP instructions and tools.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getElements,
  getGallery,
  getGuides,
  prepareElementPage,
  prepareTopicPage,
  promptDir,
} from '@gum-jsx/docs'

const LOCAL_PROMPT_DIR = join(import.meta.dir, '..', 'prompt')

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function readPrompt(dir: string, name: string): string {
  return readFileSync(join(dir, `${name}.md`), 'utf8').trim()
}

const elements = getElements()
const guides = getGuides()
const gallery = getGallery()

// Whole element categories and gallery examples are resources, matching the
// original server. read_docs additionally accepts individual elements/guides.
const refs_pages: Record<string, string> = {}
for (const [category, names] of Object.entries(elements.cats)) {
  const content = names.map(name => prepareElementPage(elements.text[name]!, elements.code[name]!)).join('\n\n')
  refs_pages[category] = `# ${capitalize(category)} Elements\n\n${content}`
}
for (const name of gallery.tags) {
  refs_pages[name] = prepareTopicPage(gallery.text[name]!, gallery.code[name]!)
}

const namedPages: [string, string][] = [
  ...elements.tags.map(name => [name, prepareElementPage(elements.text[name]!, elements.code[name]!)] as [string, string]),
  ...guides.tags.map(name => [name, prepareTopicPage(guides.text[name]!, guides.code[name]!)] as [string, string]),
  ...Object.entries(refs_pages),
]
const exactPages: Record<string, string> = Object.fromEntries(namedPages)
const lowerPages: Record<string, string> = Object.fromEntries(
  namedPages.map(([name, page]) => [name.toLowerCase(), page]),
)

const INSTRUCTIONS = [
  readPrompt(promptDir, 'intro'),
  readPrompt(promptDir, 'docs'),
  readPrompt(promptDir, 'refs'),
  readPrompt(LOCAL_PROMPT_DIR, 'mcp'),
].join('\n\n')

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

function readDocs(name: string): string | null {
  const key = name.trim()
  // Exact names disambiguate the `Math` guide from the `math` element section;
  // all unambiguous names remain case-insensitive through the fallback.
  return exactPages[key] ?? lowerPages[key.toLowerCase()] ?? null
}

export { INSTRUCTIONS, refs_pages, listDocs, readDocs }
