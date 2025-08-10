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
    `
    document.documentElement.appendChild(root)
  }
  overlayBodyEl = root.querySelector('#mini-explorer-body')
  return overlayBodyEl
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
