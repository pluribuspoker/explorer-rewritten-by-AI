let overlayBodyEl = null
let diceGraphEl = null
let overlayRoot = null

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
      font: '13px/1.35 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
      background: 'rgba(20,20,20,0.85)',
      color: '#fff',
      padding: '10px 12px',
      borderRadius: '10px',
      boxShadow: '0 4px 16px rgba(0,0,0,.3)',
      maxWidth: '360px',
      pointerEvents: 'auto',
      userSelect: 'none'
    })
    root.innerHTML = `
      <div id="mini-explorer-header" style="font-weight:600;margin-bottom:6px;cursor:move">Mini Explorer</div>
      <div id="mini-explorer-body"></div>
      <div id="mini-explorer-dice-graph" style="margin-top:6px"></div>
      <div id="mini-explorer-debug" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;pointer-events:auto"></div>
    `
    document.documentElement.appendChild(root)
    restoreOverlayPosition(root)
    enableDrag(root)
    injectOverlayStyles()
  }
  overlayBodyEl = root.querySelector('#mini-explorer-body')
  diceGraphEl = root.querySelector('#mini-explorer-dice-graph')
  overlayRoot = root
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
    try {
      onClick()
    } catch (err) {
      console.error(err)
    }
  })
  b.addEventListener('mouseenter', () => {
    b.style.background = '#444'
  })
  b.addEventListener('mouseleave', () => {
    b.style.background = '#333'
  })
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
    makeBtn(
      'Dump',
      'Console table of player resources',
      () => api.dump && api.dump()
    )
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
    makeBtn(
      'Clear',
      'Clear player + dice state',
      () => api.clear && api.clear()
    )
  )
}

export function renderOverlay (playerEntries) {
  const body = getOverlayBody()
  // Normalize & cache entries (iterator may be one-use)
  let rows = []
  try {
    if (!playerEntries) rows = []
    else if (Array.isArray(playerEntries)) rows = playerEntries
    else if (playerEntries instanceof Map) rows = [...playerEntries.entries()]
    else rows = [...playerEntries] // assume iterable of [name, resources]
  } catch {
    rows = []
  }

  if (rows.length === 0) {
    body.textContent = "Listening… (roll, chat, 'got' events)"
    return
  }

  // Column headers / icons
  const ICONS = getResourceIcons()
  const headers = [
    { key: 'name', label: 'Player' },
    { key: 'wood', label: ICONS.wood },
    { key: 'brick', label: ICONS.brick },
    { key: 'sheep', label: ICONS.sheep },
    { key: 'wheat', label: ICONS.wheat },
    { key: 'ore', label: ICONS.ore }
  ]

  // Find max to highlight leader(s)
  let maxTotal = 0
  for (const [, r] of rows) maxTotal = Math.max(maxTotal, r.total || 0)

  const tableRows = rows.map(([name, r]) => {
    const isLeader = r.total === maxTotal && maxTotal > 0
    return `<div class="mx-row${isLeader ? ' mx-leader' : ''}">
      <div class="mx-cell mx-name" title="${name}">${escapeHtml(name)}</div>
      <div class="mx-cell">${r.wood ?? 0}</div>
      <div class="mx-cell">${r.brick ?? 0}</div>
      <div class="mx-cell">${r.sheep ?? 0}</div>
      <div class="mx-cell">${r.wheat ?? 0}</div>
  <div class="mx-cell">${r.ore ?? 0}</div>
    </div>`
  })

  const headerRow = `<div class="mx-row mx-header">${headers
    .map(h => `<div class="mx-cell mx-h">${h.label}</div>`)
    .join('')}</div>`

  body.innerHTML = `
    <div class="mx-table" role="table" aria-label="Player resources">
      ${headerRow}
      ${tableRows.join('')}
    </div>`
}

// Render dice bar graph (2-12) with heights proportional to counts
// counts: {2: n, ..., 12: n}
export function renderDiceGraph (counts) {
  if (!diceGraphEl || !document.contains(diceGraphEl)) getOverlayBody()
  if (!diceGraphEl) return
  const values = []
  for (let i = 2; i <= 12; i++) values.push(counts?.[i] || 0)
  const max = Math.max(1, ...values)
  const barMaxPx = 48
  const barsHtml = values
    .map((v, idx) => {
      const label = idx + 2
      const h = v === 0 ? 2 : Math.max(4, Math.round((v / max) * barMaxPx))
      const opacity = v === 0 ? 0.25 : 0.85
      return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;flex:1;min-width:14px;">
        <div title="${label}: ${v}" style="width:100%;background:linear-gradient(180deg,#4caf50,#2e7d32);height:${h}px;border-radius:3px 3px 0 0;opacity:${opacity};transition:height .25s ease,opacity .25s ease"></div>
        <div style="font-size:10px;margin-top:2px;opacity:.8">${label}</div>
      </div>`
    })
    .join('')
  diceGraphEl.innerHTML = `<div style="display:flex;align-items:flex-end;gap:4px;height:${
    barMaxPx + 18
  }px;">${barsHtml}</div>`
}

// --- Drag + position persistence -----------------------------------------
function enableDrag (root) {
  const header = root.querySelector('#mini-explorer-header')
  if (!header || header.dataset.dragReady) return
  header.dataset.dragReady = '1'
  let dragging = false
  let startX = 0
  let startY = 0
  let originLeft = 0
  let originTop = 0
  function onPointerDown (e) {
    if (e.button !== 0) return
    dragging = true
    const rect = root.getBoundingClientRect()
    if (root.style.right) {
      root.style.left = rect.left + 'px'
      root.style.top = rect.top + 'px'
      root.style.right = ''
    }
    startX = e.clientX
    startY = e.clientY
    originLeft = parseFloat(root.style.left || rect.left)
    originTop = parseFloat(root.style.top || rect.top)
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp, { once: true })
  }
  function onPointerMove (e) {
    if (!dragging) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    const pad = 4
    const w = root.offsetWidth
    const h = root.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let nextLeft = originLeft + dx
    let nextTop = originTop + dy
    nextLeft = Math.min(Math.max(pad, nextLeft), vw - w - pad)
    nextTop = Math.min(Math.max(pad, nextTop), vh - h - pad)
    root.style.left = nextLeft + 'px'
    root.style.top = nextTop + 'px'
  }
  function onPointerUp () {
    dragging = false
    document.removeEventListener('pointermove', onPointerMove)
    persistOverlayPosition(root)
  }
  header.addEventListener('pointerdown', onPointerDown)
}

function persistOverlayPosition (root) {
  try {
    const { top, left } = root.style
    if (top && left) {
      localStorage.setItem('miniExplorerPos', JSON.stringify({ top, left }))
    }
  } catch {
    /* ignore */
  }
}

function restoreOverlayPosition (root) {
  try {
    const raw = localStorage.getItem('miniExplorerPos')
    if (!raw) return
    const { top, left } = JSON.parse(raw)
    if (top && left) {
      root.style.top = top
      root.style.left = left
      root.style.right = ''
    }
  } catch {
    /* ignore */
  }
}

// --- Styles / helpers -----------------------------------------------------
function injectOverlayStyles () {
  if (document.getElementById('mini-explorer-styles')) return
  const style = document.createElement('style')
  style.id = 'mini-explorer-styles'
  style.textContent = `
    #mini-explorer .mx-table { display:flex; flex-direction:column; gap:2px; }
  #mini-explorer .mx-row { display:grid; grid-template-columns: 1fr repeat(5, 34px); align-items:stretch; }
    #mini-explorer .mx-header { font-weight:600; font-size:12px; opacity:.85; }
    #mini-explorer .mx-cell { padding:3px 4px; text-align:center; font-variant-numeric:tabular-nums; }
    #mini-explorer .mx-name { text-align:left; padding-left:6px; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #mini-explorer .mx-row:not(.mx-header):hover { background:rgba(255,255,255,0.06); }
    #mini-explorer .mx-row.mx-leader { background:linear-gradient(90deg,rgba(255,215,0,0.18),rgba(255,215,0,0)); }
    #mini-explorer .mx-h { filter:brightness(1.1); }
  `
  document.head.appendChild(style)
}

function getResourceIcons () {
  // Chosen for clarity & quick visual parse; adjust if you prefer originals
  return {
    wood: '🌲', // alternative: 🪵
    brick: '🧱',
    sheep: '🐑',
    wheat: '🌾',
    ore: '🪨' // alternative: ⛏️ / ⛰️
  }
}

function escapeHtml (str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
