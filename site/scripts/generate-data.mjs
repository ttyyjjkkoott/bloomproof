// Builds the site's entry data from the canonical markdown record.
//
// Reads entries/NNN-*.md (top-level only; template.md and draft-*.md are
// skipped until a maintainer assigns them a number) and writes
// src/data/entries.generated.json, which the site imports. Runs via the
// predev/prebuild npm hooks, so `npm run dev` and `npm run build` always
// regenerate it. Fails loudly on malformed entries — a bad file breaks
// the build instead of shipping a broken story.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sanitizeEntry, hasDangerousScheme, safeJson } from '../src/lib/sanitize.js'

const here = dirname(fileURLToPath(import.meta.url))
const entriesDir = join(here, '..', '..', 'entries')
const outFile = join(here, '..', 'src', 'data', 'entries.generated.json')

function fail(file, msg) {
  console.error(`generate-data: ${file}: ${msg}`)
  process.exit(1)
}

// Collapse a section body to clean text: one line per paragraph.
function cleanText(body) {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
}

function sectionOf(file, body, name) {
  const match = body.match(new RegExp(`^## ${name}\\s*$`, 'm'))
  if (!match) fail(file, `missing ## ${name} section`)
  const start = match.index + match[0].length
  const rest = body.slice(start)
  const next = rest.search(/^## \S/m)
  return (next === -1 ? rest : rest.slice(0, next)).trim()
}

function firstUrl(text) {
  const match = text.match(/https?:\/\/\S+/)
  if (!match) return ''
  return match[0].replace(/[.,;:!?)]+$/, '')
}

function parseArtifact(file, section) {
  // Build-time URL blocklist: javascript:, data:, and similar schemes in the
  // Artifact section fail the build loudly instead of shipping a hostile link.
  // (firstUrl below only ever extracts http(s) URLs, so this is the tripwire
  // that makes a smuggled scheme visible rather than silently dropped.)
  if (hasDangerousScheme(section)) {
    fail(file, 'blocked URL scheme (javascript:/data:/vbscript:/file:/blob:) — links must be http(s)')
  }
  const lines = section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2))
  const labeled = []
  for (const line of lines) {
    const cut = line.indexOf(':')
    if (cut === -1) continue
    labeled.push({ key: line.slice(0, cut).trim(), rest: line.slice(cut + 1).trim() })
  }
  const find = (key) => labeled.find((l) => l.key.toLowerCase() === key)
  const liveSite = find('live site')
  const app = find('app')
  const code = find('code')
  const projectSite = find('project site')
  if (liveSite && app) fail(file, 'has both "Live site:" and "App:" — at most one is allowed')
  if (!code || !firstUrl(code.rest)) fail(file, 'missing "Code:" line with a URL')
  const kind = app ? 'app' : liveSite ? 'live' : 'code'
  const primary =
    (projectSite && firstUrl(projectSite.rest)) ||
    (liveSite && firstUrl(liveSite.rest)) ||
    (app && firstUrl(app.rest)) ||
    firstUrl(code.rest)
  const extraLinks = labeled
    .filter((l) => firstUrl(l.rest) && firstUrl(l.rest) !== primary)
    .map((l) => ({ label: l.key, url: firstUrl(l.rest) }))
  return { kind, artifactUrl: primary, extraLinks }
}

function parseHuman(file, section) {
  const nameMatch = section.match(/^(?:-\s*)?Name:\s*(.+)$/m)
  if (!nameMatch) fail(file, 'missing "Name:" line in the Human section')
  const quoteMatch = section.match(/^(?:-\s*)?Quote:\s*(.+)$/m)
  return { humanName: nameMatch[1].trim(), humanQuote: quoteMatch ? quoteMatch[1].trim() : '' }
}

function parseEntry(filename) {
  const number = filename.match(/^(\d+)-/)[1]
  const raw = readFileSync(join(entriesDir, filename), 'utf8')
  const titleMatch = raw.match(/^# (.+)$/m)
  if (!titleMatch) fail(filename, 'missing "# Title" line')
  const problem = cleanText(sectionOf(filename, raw, 'Problem'))
  const solution = cleanText(sectionOf(filename, raw, 'Solution'))
  if (!problem) fail(filename, 'empty Problem section')
  if (!solution) fail(filename, 'empty Solution section')
  const license = cleanText(sectionOf(filename, raw, 'License'))
  if (!license) fail(filename, 'empty License section')
  const artifact = parseArtifact(filename, sectionOf(filename, raw, 'Artifact'))
  const human = parseHuman(filename, sectionOf(filename, raw, 'Human'))
  // Build-time sanitization (render-time re-checks live in store.js and the
  // page components): strips tag-shaped markup from entry text — neutralizing
  // event-handler attributes like onerror — and re-validates every URL.
  return sanitizeEntry({
    id: number,
    number,
    title: titleMatch[1].trim(),
    problem,
    solution,
    artifactType: artifact.kind === 'code' ? 'repo' : 'demo',
    kind: artifact.kind,
    artifactUrl: artifact.artifactUrl,
    artifactLicense: license,
    extraLinks: artifact.extraLinks,
    humanName: human.humanName,
    humanQuote: human.humanQuote,
    attachmentUrl: '',
    origin: 'record',
    status: 'published'
  })
}

const files = readdirSync(entriesDir, { withFileTypes: true })
  .filter((d) => d.isFile() && /^\d+-.+\.md$/.test(d.name))
  .map((d) => d.name)
  .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
if (!files.length) fail('(entries)', 'no entries/NNN-*.md files found')
const entries = files.map(parseEntry)
mkdirSync(dirname(outFile), { recursive: true })
// safeJson: identical values after JSON.parse, but a literal "</script" in
// entry text can never break out, even if this file is ever inlined.
writeFileSync(outFile, safeJson(entries, 2) + '\n')
console.log(`generate-data: ${entries.length} entries → src/data/entries.generated.json`)
