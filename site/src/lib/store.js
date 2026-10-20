import generatedEntries from '../data/entries.generated.json'
import { sanitizeEntry } from './sanitize.js'

const LOCAL_KEY = 'bloom-proof-submissions-v1'

function readLocal() {
  if (typeof localStorage === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
  } catch {
    return []
  }
}

function writeLocal(rows) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(rows))
}

// Render-time sanitization (the build-time pass lives in generate-data):
// every entry is re-sanitized on load, so tampered localStorage drafts and
// any future entry source get the same treatment — tag-shaped markup is
// stripped from text and only http(s) URLs survive. Idempotent with the
// build pass, so prerendered HTML and hydrated HTML always agree.
function toEntry(row) {
  return sanitizeEntry({
    id: row.id,
    number: row.number || '—',
    title: row.title,
    problem: row.problem,
    solution: row.solution,
    artifactType: row.artifactType || 'demo',
    artifactUrl: row.artifactUrl || '',
    artifactLicense: row.artifactLicense || '',
    humanName: row.humanName || '',
    humanQuote: row.humanQuote || '',
    attachmentUrl: row.attachmentUrl || '',
    extraLinks: row.extraLinks || [],
    origin: row.origin || 'community',
    kind: row.kind || 'live',
    status: row.status || 'published',
    createdAt: row.createdAt || new Date().toISOString()
  })
}

// Published entries from the markdown record. Synchronous and identical on
// server and client, so prerendered HTML hydrates without mismatches.
export function loadPublishedSync() {
  return generatedEntries.map(toEntry)
}

// Published entries plus this browser's pending drafts. Drafts exist only
// on the client, so call this after mount, never during first render.
export function loadEntriesSync() {
  const local = readLocal().map(toEntry)
  return [...local].reverse().concat(loadPublishedSync())
}

export async function loadEntries() {
  return loadEntriesSync()
}

export async function submitEntry(values) {
  const rows = readLocal()
  const entry = toEntry({
    id: `local-${Date.now()}`,
    number: `L-${String(rows.length + 1).padStart(2, '0')}`,
    title: values.title.trim(),
    problem: values.problem.trim(),
    solution: values.solution.trim(),
    artifactUrl: values.artifactUrl.trim(),
    artifactType: values.artifactType,
    artifactLicense: values.artifactLicense.trim(),
    humanName: values.humanName.trim(),
    humanQuote: values.humanQuote.trim(),
    attachmentUrl: values.attachmentUrl || '',
    extraLinks: values.extraLinks || [],
    kind: values.kind || 'live',
    origin: 'community',
    status: 'pending',
    createdAt: new Date().toISOString()
  })
  rows.push(entry)
  writeLocal(rows)
  return entry
}
