// Prerenders every route to static HTML. Runs via the postbuild npm hook,
// so `npm run build` always ends with a complete static site and the deploy
// workflow needs no changes.
//
// 1. Bundles src/entry-server.jsx with `vite build --ssr`.
// 2. Renders every route with react-dom/server + StaticRouter.
// 3. Injects each render into a copy of the built index.html (so asset
//    fingerprints and base path stay exactly as Vite emitted them):
//    /                    → index.html
//    /page/2 … /page/N    → page/N/index.html (only while N > 1 exists)
//    /about … /donate     → about/index.html, …
//    /proof/NNN           → proof/NNN/index.html, one per entry file
//    (missing route)      → 404.html (GitHub Pages serves this for bad URLs)
// 4. Emits sitemap.xml, robots.txt (only if missing), search-index.json.
// 5. Deletes the temporary SSR bundle.
//
// Respects `--outDir <dir>` (default `dist`) so alternate build dirs work.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { escapeHtml, escapeAttr, safeJson } from '../src/lib/sanitize.js'

const here = dirname(fileURLToPath(import.meta.url))
const siteDir = join(here, '..')

const args = process.argv.slice(2)
function flag(name, fallback) {
  const i = args.findIndex((a) => a === name || a.startsWith(`${name}=`))
  if (i === -1) return fallback
  const hit = args[i]
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1)
  return args[i + 1] ?? fallback
}
const outDir = join(siteDir, flag('--outDir', 'dist'))
const serverDir = join(siteDir, 'dist-server')

function fail(msg) {
  console.error(`prerender: ${msg}`)
  process.exit(1)
}

// Single-slot template fill: replaces exactly one occurrence and fails the
// build otherwise, so a template change can never silently duplicate content
// or leave a placeholder unfilled.
function fillOnce(haystack, needle, replacement, what) {
  const parts = haystack.split(needle)
  if (parts.length !== 2) fail(`template has ${parts.length - 1} ${what} slots, expected exactly 1`)
  return parts.join(replacement)
}

// Page-head escaping comes from the shared sanitizer (sanitize.js), so the
// prerender build script and the client render path can never disagree:
// escapeHtml for <title> text, escapeAttr for meta/OG content attributes.
// Entry content can never break out of those tags — every &, <, >, and "
// is entity-encoded, and attribute values are collapsed to a single line.

// 1. SSR bundle (vite binary resolved explicitly — no PATH or shell needed).
const viteBin = join(siteDir, 'node_modules', 'vite', 'bin', 'vite.js')
if (!existsSync(viteBin)) fail(`vite binary not found at ${viteBin} — run npm install first`)
execFileSync(process.execPath, [viteBin, 'build', '--ssr', 'src/entry-server.jsx', '--outDir', 'dist-server'], {
  cwd: siteDir,
  stdio: 'inherit'
})
const serverFile = join(serverDir, 'entry-server.js')
if (!existsSync(serverFile)) fail('SSR bundle was not emitted')
const { render } = await import(pathToFileURL(serverFile).href)

// 2. Data, template, shared pagination.
const entries = JSON.parse(
  readFileSync(join(siteDir, 'src', 'data', 'entries.generated.json'), 'utf8')
)
if (!entries.length) fail('no entries in entries.generated.json — run the build, not this script alone')
const { totalPages } = await import(pathToFileURL(join(siteDir, 'src', 'lib', 'pagination.js')).href)
const templateFile = join(outDir, 'index.html')
if (!existsSync(templateFile)) fail(`${templateFile} missing — the client build must run first`)
const template = readFileSync(templateFile, 'utf8')
if (!template.includes('<div id="root"></div>')) fail('template has no <div id="root"></div>')
const titleTag = template.match(/<title>.*?<\/title>/)?.[0] ?? fail('template has no <title>')
const homeTitle = titleTag.slice(7, -8)
const descTag = template.match(/<meta name="description"[^>]*>/)?.[0] ?? fail('template has no meta description')
const homeDesc = descTag.match(/content="([^"]*)"/)?.[1] ?? fail('template meta description has no content')
if (!template.includes('rel="icon"')) fail('template has no favicon link — index.html must link /favicon.ico')
if (!template.includes('apple-touch-icon')) fail('template has no apple-touch-icon link — index.html must link /apple-touch-icon.png')
if (!existsSync(join(outDir, 'favicon.ico'))) fail('favicon.ico missing from build output — expected Vite public/ dir passthrough')
if (!existsSync(join(outDir, 'apple-touch-icon.png'))) fail('apple-touch-icon.png missing from build output — expected Vite public/ dir passthrough')

const SITE = 'https://bloomproof.org'
const pageCount = totalPages(entries.length)

const STATIC_META = {
  '/about': {
    title: 'Why this exists — Bloom Proof',
    desc: 'Why Bloom Proof exists: one public record where every AI story links to real, checkable proof — reviewed by a human before it publishes.',
    expect: 'Why this exists.'
  },
  '/submit': {
    title: 'Share your project — Bloom Proof',
    desc: 'Built something with AI that helped a real person? Tell us in plain words — about 10 minutes. A real human reads every submission.',
    expect: 'Send for review'
  },
  '/developers': {
    title: 'How the record is built — Bloom Proof',
    desc: "How the record is built: one public repo, no servers, no database — automated checks confirm the format and a human confirms it's real.",
    expect: 'How the record is built'
  },
  '/donate': {
    title: 'Keep the record independent — Bloom Proof',
    desc: 'Bloom Proof is free forever. Donations keep the record independent — Bitcoin only, straight to the project, no accounts or sign-ups.',
    expect: 'Keep the record independent.'
  }
}

const pages = [
  {
    route: '/',
    file: 'index.html',
    title: homeTitle,
    desc: homeDesc,
    keepDesc: true,
    type: 'website',
    expect: 'see-all-text',
    expectCount: { pattern: 'ledger-row', count: entries.length }
  }
]
for (let n = 2; n <= pageCount; n += 1) {
  pages.push({
    route: `/page/${n}`,
    file: `page/${n}/index.html`,
    title: `Every story, page ${n} — Bloom Proof`,
    desc: `Browse every story, page ${n} of ${pageCount} — real AI projects, checked by a human, newest first.`,
    type: 'website',
    expect: 'Story pages'
  })
}
for (const [route, meta] of Object.entries(STATIC_META)) {
  pages.push({ route, file: `${route.slice(1)}/index.html`, ...meta, type: 'website' })
}
for (const e of entries) {
  pages.push({
    route: `/proof/${e.id}`,
    file: `proof/${e.id}/index.html`,
    title: `${e.title} — Bloom Proof`,
    desc: e.problem,
    type: 'article',
    expect: escapeHtml(e.title)
  })
}
const notFound = {
  route: '/__missing__',
  file: '404.html',
  title: 'Page not found — Bloom Proof',
  desc: 'Hmm, that page does not exist. The stories are all back on the home page.',
  type: 'website',
  expect: 'that page does not exist'
}

// 3. Render every page.
function buildPage(page) {
  const html = render(page.route)
  if (!html) fail(`route ${page.route} rendered empty — refusing to emit a broken page`)
  if (page.expect && !html.includes(page.expect)) {
    fail(`route ${page.route} rendered without its marker — refusing to emit a broken page`)
  }
  if (page.expectCount != null) {
    const found = html.split(page.expectCount.pattern).length - 1
    if (found !== page.expectCount.count) {
      fail(`route ${page.route} rendered ${found} ${page.expectCount.pattern} markers, expected ${page.expectCount.count}`)
    }
  }
  if (html.includes('Gathering real stories')) fail(`route ${page.route} rendered the loading shell`)
  const og = [
    `<meta property="og:title" content="${escapeAttr(page.title)}">`,
    `<meta property="og:description" content="${escapeAttr(page.desc)}">`,
    `<meta property="og:type" content="${page.type}">`,
    `<meta property="og:url" content="${escapeAttr(SITE + (page.route === '/' ? '/' : page.route))}">`,
    `<meta property="og:image" content="${SITE}/site-logo.png">`
  ].join('\n    ')
  let out = fillOnce(template, '<div id="root"></div>', `<div id="root">${html}</div>`, 'root div')
  out = fillOnce(out, titleTag, `<title>${escapeHtml(page.title)}</title>`, 'title tag')
  if (!page.keepDesc) {
    out = fillOnce(out, descTag, `<meta name="description" content="${escapeAttr(page.desc)}">`, 'meta description')
  }
  out = fillOnce(out, '\n  </head>', `\n    ${og}\n  </head>`, 'head close')
  // Fail-closed injection tripwires: hostile entry markdown must never add a
  // script element or an executable-URL link to a prerendered page. The only
  // <script> is the bundle tag from index.html; href/src may only be http(s),
  // same-origin, anchor, or mailto — never javascript:/data:/vbscript:.
  if (out.split('<script').length - 1 !== template.split('<script').length - 1) {
    fail(`route ${page.route} emitted an unexpected <script> element — refusing to ship a possible breakout`)
  }
  if (/<(a|img|link)\b[^>]*(href|src)\s*=\s*["']?\s*(javascript|data|vbscript|file|blob):/i.test(out)) {
    fail(`route ${page.route} emitted a blocked-URL href/src — refusing to ship a possible XSS`)
  }
  const dest = join(outDir, page.file)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, out)
}

for (const page of pages) buildPage(page)
buildPage({ ...notFound, route: '/__missing__' })

// 4. Sitemap, robots, search index.
const locs = pages.map((p) => (p.route === '/' ? `${SITE}/` : `${SITE}${p.route}`))
writeFileSync(
  join(outDir, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs
    .map((loc) => `  <url><loc>${loc}</loc></url>`)
    .join('\n')}\n</urlset>\n`
)
if (!existsSync(join(outDir, 'robots.txt'))) {
  writeFileSync(join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)
}
// safeJson: a literal "</script" in entry text stays inert even if this file
// is ever inlined into a <script> element; JSON.parse reads back the values.
writeFileSync(
  join(outDir, 'search-index.json'),
  safeJson(entries.map((e) => ({ id: e.id, title: e.title, summary: e.problem, kind: e.kind })))
)

// 5. Cleanup.
rmSync(serverDir, { recursive: true, force: true })
console.log(`prerender: ${pages.length + 1} pages + sitemap.xml + robots.txt + search-index.json → ${outDir}`)
