// Server entry for the build-time prerender (never shipped to browsers).
// Bundled with `vite build --ssr` and imported once per route by
// scripts/prerender.mjs. Note: no CSS import — the client bundle owns styles.
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { Site } from './App.jsx'
import { loadPublishedSync } from './lib/store.js'

export function render(url) {
  const entries = loadPublishedSync()
  return renderToString(
    <StaticRouter location={url}>
      <Site entries={entries} onAdded={() => {}} />
    </StaticRouter>
  )
}
