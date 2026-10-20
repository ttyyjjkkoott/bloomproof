import { Link } from 'react-router-dom'
import { safeUrl } from '../lib/sanitize.js'

export function StatusBadge({ status }) {
  if (status === 'pending') return <span className="badge badge-pending">In review</span>
  return <span className="badge badge-reviewed">Reviewed &amp; published</span>
}

// Honest tiers, derived from the entry file: never promise more than the entry has.
export function EntryBadge({ entry, linked }) {
  const tier =
    entry.kind === 'app'
      ? { cls: 'tag-app', text: 'Get the app' }
      : entry.kind === 'code'
        ? { cls: 'tag-code', text: 'See the code' }
        : { cls: 'tag-live', text: 'See it live' }
  if (linked) {
    return (
      <a className={`tag ${tier.cls}`} href={safeUrl(entry.artifactUrl) || '#'} target="_blank" rel="noreferrer">
        {tier.text}
      </a>
    )
  }
  return <span className={`tag ${tier.cls}`}>{tier.text}</span>
}

// Search/browse results render entry text as React text nodes (textContent
// semantics) — this file must never use innerHTML or dangerouslySetInnerHTML.
export default function Ledger({ entries }) {
  if (!entries.length) {
    return <p>Nothing matches that search. Try simpler words — or be the first to share this story.</p>
  }
  return (
    <div className="ledger">
      {entries.map((e) => (
        <Link key={e.id} className="ledger-row" to={`/proof/${e.id}`}>
          <span>
            <span className="ledger-title">{e.title}</span>
            <span className="ledger-meta">
              <EntryBadge entry={e} />
              <span>{e.humanName}</span>
              <StatusBadge status={e.status} />
            </span>
          </span>
          <span className="ledger-arrow" aria-hidden="true">
            →
          </span>
        </Link>
      ))}
    </div>
  )
}
