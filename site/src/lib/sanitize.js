// Central sanitizer for hostile community input.
//
// Imported by the Node build scripts (generate-data, prerender) AND by the
// client (store, pages), so entry content is neutralized at build time and
// re-checked at render time. Framework-free and DOM-free on purpose: no
// innerHTML, no DOMParser, nothing that can execute markup — only string
// operations, so it is safe to run anywhere, including during SSR.

// Control characters (minus tab/newline, which cleanText uses between
// paragraphs). Stripped so they can never aid scheme or tag smuggling.
const CONTROL_RE = new RegExp(
  '[' + String.fromCharCode(0) + '-' + String.fromCharCode(8) +
  String.fromCharCode(11) + String.fromCharCode(12) +
  String.fromCharCode(14) + '-' + String.fromCharCode(31) +
  String.fromCharCode(127) + ']',
  'g'
)

// Anything shaped like an HTML tag or comment. Entry fields are plain words,
// so markup in them is abuse, not content: it is removed (not escaped) at
// build, which neutralizes event-handler attributes such as onerror by
// removing the tag that would carry them. Plain comparisons like "a < b"
// survive because they have no letter after "<".
const TAG_RE = /<!--[\s\S]*?-->|<\/?[A-Za-z][^<>]*>/g

// A URL scheme followed immediately by a non-space — the shape of a real
// scheme payload (javascript:alert(1)), as opposed to a prose label
// ("Live site: https://…", which always has a space after the colon).
const DANGEROUS_SCHEME_RE = /(javascript|data|vbscript|file|blob):\S/i

// Base origin used only to resolve relative URLs for scheme inspection.
// The original string is returned when safe, never the resolved href.
const BASE_ORIGIN = 'https://bloomproof.org'

export function sanitizeText(value) {
  return String(value ?? '').replace(CONTROL_RE, '')
}

export function stripTags(value) {
  return sanitizeText(value).replace(TAG_RE, '')
}

export function hasDangerousScheme(value) {
  return DANGEROUS_SCHEME_RE.test(sanitizeText(value))
}

// Escape for HTML element text. Same five replacements React uses for text
// nodes, applied in the same order (& first), so prerendered <title> output
// matches what React renders in the page body.
export function escapeHtml(value) {
  return sanitizeText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// Escape for double-quoted attribute values (meta/OG content). Collapses
// whitespace so multi-paragraph entry text stays on one line inside the tag.
export function escapeAttr(value) {
  return sanitizeText(value)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Allowlist-based URL check. Returns the original (trimmed) URL when its
// scheme is http(s) — the only schemes entry links may use — and '' for
// everything else: javascript:, data:, vbscript:, file:, blob:, unknown
// schemes, and unparseable input. Relative URLs resolve against the site
// origin, so they pass only as same-origin https links. WHATWG parsing
// matches browser behavior on case, whitespace, and embedded tab/newline
// tricks (e.g. "java tab script:" still parses as javascript: and is blocked).
export function safeUrl(value) {
  const raw = sanitizeText(value).trim()
  if (!raw) return ''
  let protocol = ''
  try {
    protocol = new URL(raw, BASE_ORIGIN).protocol
  } catch {
    return ''
  }
  if (protocol !== 'http:' && protocol !== 'https:') return ''
  return raw
}

// JSON that stays valid JSON but can never break out of a <script> element:
// the literal substrings "</script", "<!--", and "-->" cannot appear, and
// U+2028/29 cannot break older JS parsers. JSON.parse reverses every escape,
// so generated JSON and search-index.json read back byte-identical values.
export function safeJson(value, space) {
  const BS = String.fromCharCode(92)
  return JSON.stringify(value, null, space)
    .replace(/</g, BS + 'u003c')
    .replace(/>/g, BS + 'u003e')
    .replace(/&/g, BS + 'u0026')
    .replace(new RegExp(String.fromCharCode(8232), 'g'), BS + 'u2028')
    .replace(new RegExp(String.fromCharCode(8233), 'g'), BS + 'u2029')
}

const TEXT_FIELDS = ['title', 'problem', 'solution', 'artifactLicense', 'humanName', 'humanQuote']

// Whole-entry pass, applied at build (generate-data) and again at load/render
// (store.toEntry, so tampered localStorage and future sources get the same
// treatment). Idempotent: running it twice changes nothing the second time.
export function sanitizeEntry(entry) {
  const out = { ...entry }
  for (const field of TEXT_FIELDS) {
    if (out[field] != null) out[field] = stripTags(out[field])
  }
  if ('artifactUrl' in out) out.artifactUrl = safeUrl(out.artifactUrl)
  if ('attachmentUrl' in out) out.attachmentUrl = safeUrl(out.attachmentUrl)
  if (Array.isArray(out.extraLinks)) {
    out.extraLinks = out.extraLinks
      .map((link) => ({ label: stripTags(link.label), url: safeUrl(link.url) }))
      .filter((link) => link.url)
  }
  return out
}
