// Regression tests for hostile community input handling. Run with
// `npm test` (Node's built-in runner, no extra dependencies).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeText,
  stripTags,
  hasDangerousScheme,
  escapeHtml,
  escapeAttr,
  safeUrl,
  safeJson,
  sanitizeEntry
} from '../src/lib/sanitize.js'

const TAB = String.fromCharCode(9)
const LF = String.fromCharCode(10)

describe('stripTags', () => {
  it('removes tags carrying event-handler attributes', () => {
    const out = stripTags('Hello <img src=x onerror=alert(1)> world')
    assert.ok(!out.includes('<img'), 'img tag must go')
    assert.ok(!out.includes('onerror'), 'onerror must go with its tag')
    assert.ok(out.includes('Hello') && out.includes('world'))
  })

  it('removes script elements but keeps surrounding text', () => {
    assert.equal(stripTags('a<script>alert(1)</script>b'), 'aalert(1)b')
  })

  it('leaves plain comparisons alone', () => {
    assert.equal(stripTags('a < b and 3 > 2'), 'a < b and 3 > 2')
  })

  it('repeats to a fixpoint so nested payloads cannot survive one pass', () => {
    assert.equal(stripTags('<scr<script>ipt>alert(1)</scr</script>ipt>'), 'alert(1)')
    const nestedImg = stripTags('<img <img src=x onerror=alert(1)> src=x onerror=alert(2)>')
    assert.equal(nestedImg, '')
  })
})

describe('hasDangerousScheme', () => {
  it('detects executable schemes without a space after the colon', () => {
    assert.ok(hasDangerousScheme('- Code: javascript:alert(1)'))
    assert.ok(hasDangerousScheme('data:text/html,<script>alert(1)</script>'))
    assert.ok(hasDangerousScheme('VBSCRIPT:msgbox(1)'))
  })

  it('ignores prose labels, which always have a space after the colon', () => {
    assert.ok(!hasDangerousScheme('- Live site: https://example.com'))
    assert.ok(!hasDangerousScheme('- Data: https://example.com/set.csv'))
  })
})

describe('safeUrl', () => {
  it('allows http(s) links', () => {
    assert.equal(safeUrl('https://example.com/x'), 'https://example.com/x')
    assert.equal(safeUrl('http://example.com'), 'http://example.com')
  })

  it('blocks javascript: and data: URLs', () => {
    assert.equal(safeUrl('javascript:alert(1)'), '')
    assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), '')
    assert.equal(safeUrl('vbscript:msgbox(1)'), '')
  })

  it('blocks case, whitespace, and tab/newline smuggling', () => {
    assert.equal(safeUrl('  JAVASCRIPT:alert(1)  '), '')
    assert.equal(safeUrl('java' + TAB + 'script:alert(1)'), '')
    assert.equal(safeUrl('java' + LF + 'script:alert(1)'), '')
    assert.equal(safeUrl('JaVaScRiPt:alert(1)'), '')
  })

  it('blocks empty and unparseable input', () => {
    assert.equal(safeUrl(''), '')
    assert.equal(safeUrl('https://'), '')
  })
})

describe('escapeHtml / escapeAttr', () => {
  it('escapes text so it cannot break out of <title>', () => {
    const out = escapeHtml('a</title><script>alert(1)</script>')
    assert.ok(!out.includes('</title>'))
    assert.ok(!out.includes('<script>'))
    assert.ok(out.includes('&lt;/title&gt;'))
  })

  it('escapes attributes and collapses them to one line', () => {
    const out = escapeAttr('a"><script>alert(1)</script>' + LF + LF + 'b')
    assert.ok(!out.includes('"'))
    assert.ok(!out.includes('<'))
    assert.ok(!out.includes(LF))
    assert.ok(out.includes('&quot;&gt;'))
  })
})

describe('safeJson', () => {
  it('round-trips through JSON.parse with identical values', () => {
    const value = { t: '</script><script>alert(1)</script>', u: 'a&b', n: 1 }
    assert.deepEqual(JSON.parse(safeJson(value)), value)
  })

  it('emits no literal script-breakout substring', () => {
    const out = safeJson({ t: '</script><!-- -->-->alert(1)' })
    assert.ok(!out.includes('</script'))
    assert.ok(!out.includes('<!--'))
  })
})

describe('sanitizeEntry', () => {
  const hostile = {
    id: '999',
    title: 'Hi <img src=x onerror=alert(1)>',
    problem: 'See [x](javascript:alert(1))</script><script>alert(1)</script>',
    solution: 'ok',
    artifactLicense: 'MIT',
    humanName: 'A <b>bold</b> name',
    humanQuote: 'q',
    artifactUrl: 'javascript:alert(1)',
    attachmentUrl: 'data:text/html,hi',
    extraLinks: [
      { label: 'Code', url: 'https://example.com/code' },
      { label: 'Evil', url: 'javascript:alert(1)' }
    ]
  }

  it('strips markup from text and blocks dangerous URLs', () => {
    const out = sanitizeEntry(hostile)
    assert.ok(!out.title.includes('<'))
    assert.ok(!out.title.includes('onerror'))
    assert.ok(!out.problem.includes('</script>'))
    assert.equal(out.artifactUrl, '')
    assert.equal(out.attachmentUrl, '')
    assert.deepEqual(out.extraLinks, [{ label: 'Code', url: 'https://example.com/code' }])
  })

  it('is idempotent', () => {
    assert.deepEqual(sanitizeEntry(sanitizeEntry(hostile)), sanitizeEntry(hostile))
  })

  it('leaves clean entries untouched', () => {
    const clean = {
      id: '001',
      title: 'Plain title',
      problem: 'A problem.',
      solution: 'A fix.',
      artifactLicense: 'MIT',
      humanName: 'Jane Doe',
      humanQuote: '',
      artifactUrl: 'https://example.com',
      attachmentUrl: '',
      extraLinks: []
    }
    assert.deepEqual(sanitizeEntry(clean), clean)
  })
})

describe('sanitizeText', () => {
  it('strips control characters but keeps tab/newline', () => {
    const nul = String.fromCharCode(0)
    assert.equal(sanitizeText('a' + nul + 'b'), 'ab')
    assert.equal(sanitizeText('a' + TAB + 'b' + LF + 'c'), 'a' + TAB + 'b' + LF + 'c')
  })
})
