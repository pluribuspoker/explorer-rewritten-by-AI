let overlayBodyEl = null

export function getOverlayBody () {
  if (overlayBodyEl && document.contains(overlayBodyEl)) return overlayBodyEl
  let root = document.getElementById('mini-explorer')
  if (!root) {
    root = document.createElement('div')
    root.id = 'mini-explorer'
    Object.assign(root.style, {
      position: 'fixed',
      top: '56px',
      right: '8px',
      zIndex: 999999,
      font: '12px/1.3 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
      background: 'rgba(20,20,20,0.85)',
      color: '#fff',
      padding: '8px 10px',
      borderRadius: '10px',
      boxShadow: '0 4px 16px rgba(0,0,0,.3)',
      maxWidth: '280px',
      pointerEvents: 'none'
    })
    root.innerHTML = `
      <div style="font-weight:600;margin-bottom:6px">Mini Explorer</div>
      <div id="mini-explorer-body" style="white-space:pre-wrap"></div>
      <div id="mini-explorer-debug" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;pointer-events:auto"></div>
    `
    document.documentElement.appendChild(root)
  }
  overlayBodyEl = root.querySelector('#mini-explorer-body')
  return overlayBodyEl
}

function makeBtn (label, title, onClick) {
  const b = document.createElement('button')
  b.textContent = label
  b.title = title
  Object.assign(b.style, {
    background: '#333',
    color: '#eee',
    border: '1px solid #555',
    borderRadius: '4px',
    padding: '2px 6px',
    fontSize: '11px',
    cursor: 'pointer'
  })
  b.addEventListener('click', e => {
    e.stopPropagation()
    try { onClick() } catch (err) { console.error(err) }
  })
  b.addEventListener('mouseenter', () => { b.style.background = '#444' })
  b.addEventListener('mouseleave', () => { b.style.background = '#333' })
  return b
}

export function ensureDebugControls () {
  const root = getOverlayBody()?.parentElement
  if (!root) return
  const bar = root.querySelector('#mini-explorer-debug')
  if (!bar || bar.dataset.ready) return
  bar.dataset.ready = '1'
  const api = window.__miniExplorer || {}
  bar.appendChild(
    makeBtn('Dump', 'Console table of player resources', () => api.dump && api.dump())
  )
  bar.appendChild(
    makeBtn('Dice', 'Console log dice counts', () => {
      if (api.dice) {
        const counts = api.dice()
        console.table(counts)
      }
    })
  )
  bar.appendChild(
    makeBtn('Clear', 'Clear player + dice state', () => api.clear && api.clear())
  )
}

export function renderOverlay (playerEntries) {
  const body = getOverlayBody()
  const lines = [...playerEntries].map(
    ([name, r]) =>
      `${name.padEnd(10)}  ` +
      `🪵${r.wood} ` +
      `🧱${r.brick} ` +
      `🐑${r.sheep} ` +
      `🌾${r.wheat} ` +
      `⛰️${r.ore}  = ${r.total}`
  )
  body.textContent = lines.length
    ? lines.join('\n')
    : "Listening… (roll, chat, 'got' events)"
}
