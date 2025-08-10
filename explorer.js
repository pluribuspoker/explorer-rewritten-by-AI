import {
  TAG,
  CANDIDATE_LINE_REGEX,
  IMAGE_HINTS,
  RESOURCE_KEYS
} from './config.js'
import { log, warn, err } from './logger.js'
import {
  addResources,
  entries as playerEntries,
  clearPlayers,
  snapshot
} from './state/players.js'
import { getOverlayBody, renderOverlay } from './ui/overlay.js'
// IIFE removed; code now executes at top level.
/** ---------- DOM iteration helpers (covers shadow roots & iframes) ---------- */
function* walkAllNodes (root) {
  const stack = [root]
  const seenDocs = new Set()

  while (stack.length) {
    const node = stack.pop()
    if (!node) continue
    yield node

    if (node.shadowRoot) stack.push(node.shadowRoot)

    if (node.tagName === 'IFRAME') {
      try {
        const doc = node.contentDocument || node.contentWindow?.document
        if (doc && !seenDocs.has(doc)) {
          seenDocs.add(doc)
          stack.push(doc)
        }
      } catch {
        /* cross-origin iframe */
      }
    }

    if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i])
      }
    }
  }
}

/** ---------- small normalizers ---------- */
function textFrom (node) {
  try {
    return (node.innerText || node.textContent || '').trim()
  } catch {
    return ''
  }
}

function countResourceImages (container) {
  const counts = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }
  try {
    const imgs = container.querySelectorAll?.('img') || []
    for (const img of imgs) {
      const src = img.currentSrc || img.src || ''
      for (const key of RESOURCE_KEYS) {
        if (IMAGE_HINTS[key].test(src)) counts[key]++
      }
    }
  } catch {
    /* ignore */
  }
  return counts
}

/** ---------- parser: just handle “NAME got …” ---------- */
function parseGotEvent (lineText, node) {
  // we only care about lines that contain “got”
  if (!/\bgot\b/i.test(lineText)) return null

  // assume the first token is the player's name
  const playerName = lineText.split(/\s+/)[0]
  if (!playerName) return null

  // count resource icons in that line
  const resources = countResourceImages(node)
  const gotAny = RESOURCE_KEYS.some(k => resources[k] > 0)
  if (!gotAny) return null

  return { type: 'got', player: playerName, resources }
}

/** ---------- process a candidate “log line” node once ---------- */
const seenDomNodes = new WeakSet()

function processNode (node) {
  if (!(node instanceof HTMLElement)) return
  if (seenDomNodes.has(node)) return

  const lineText = textFrom(node)
  if (!lineText || !CANDIDATE_LINE_REGEX.test(lineText)) return

  // mark this node so we don't parse it twice
  seenDomNodes.add(node)

  logEventDetails(lineText, node)

  // minimal: handle only “got”
  const event = parseGotEvent(lineText, node)
  if (!event) return

  addResources(event.player, event.resources)
  renderOverlay(playerEntries())
}

/** ---------- helper: log all event details (resource, dice, etc.) ---------- */
function logEventDetails (lineText, node) {
  let details = []

  // Resource event
  const resources = countResourceImages(node)
  const nonZeroResources = Object.entries(resources).filter(([_, v]) => v > 0)
  if (nonZeroResources.length) {
    details.push(
      'resources: ' + nonZeroResources.map(([k, v]) => `${k}:${v}`).join(', ')
    )
  }

  // Dice event
  if (/\brolled\b/i.test(lineText)) {
    const sum = getDiceSum(node)
    if (sum !== null) {
      details.push('dice: ' + sum)
    }
  }

  // Placed event detection
  if (/\bplaced a\b/i.test(lineText)) {
    const placed = getPlacedItems(node)
    if (placed.length) {
      details.push(placed.join(', '))
    }
  }

  if (details.length) {
    log('line:', lineText, ...details)
  } else {
    log('line:', lineText)
  }
}

/** ---------- helper: extract and sum dice values from node ---------- */
function getDiceSum (node) {
  const imgs = node.querySelectorAll?.('img') || []
  const imgSrcs = Array.from(imgs).map(img => img.currentSrc || img.src || '')
  const diceValues = imgSrcs
    .map(src => {
      const m = src.match(/dice_(\d+)/i)
      return m ? parseInt(m[1], 10) : null
    })
    .filter(v => v !== null)
  if (diceValues.length) {
    return diceValues.reduce((a, b) => a + b, 0)
  }
  return null
}

/** ---------- helper: detect placed items (road, settlement, etc.) ---------- */
function getPlacedItems (node) {
  const imgs = node.querySelectorAll?.('img') || []
  const imgSrcs = Array.from(imgs).map(img => img.currentSrc || img.src || '')
  const items = []
  for (const src of imgSrcs) {
    if (/road_\w+\.\w+\.svg/i.test(src)) items.push('road')
    if (/settlement_\w+\.\w+\.svg/i.test(src)) items.push('settlement')
    // Add more patterns for other placed items as needed
  }
  return items
}

/** ---------- one-time scan of whatever is already rendered ---------- */
function initialScan () {
  let candidates = 0
  for (const node of walkAllNodes(document)) {
    if (node instanceof HTMLElement) {
      const txt = textFrom(node)
      if (txt && CANDIDATE_LINE_REGEX.test(txt)) {
        processNode(node)
        candidates++
      }
    }
  }
  log('initial scan done. candidates:', candidates)
}

/** ---------- keep watching for newly added lines (incl. shadow/iframes) ---------- */
function startObservers () {
  const observers = []

  function observe (root) {
    try {
      const obs = new MutationObserver(mutations => {
        for (const m of mutations) {
          if (!m.addedNodes) continue

          m.addedNodes.forEach(processNode)

          // if new shadow host / iframe appears, start observing those too
          m.addedNodes.forEach(n => {
            if (n instanceof HTMLElement && n.shadowRoot) observe(n.shadowRoot)
            if (n instanceof HTMLIFrameElement) {
              try {
                const doc = n.contentDocument || n.contentWindow?.document
                if (doc) observe(doc)
              } catch {
                /* cross-origin iframe */
              }
            }
          })
        }
      })

      obs.observe(root, { childList: true, subtree: true })
      observers.push(obs)
    } catch {
      /* ignore */
    }
  }

  observe(document)

  // also hook existing shadow roots / iframes right away
  for (const n of walkAllNodes(document)) {
    if (n instanceof HTMLElement && n.shadowRoot) observe(n.shadowRoot)
    if (n instanceof HTMLIFrameElement) {
      try {
        const doc = n.contentDocument || n.contentWindow?.document
        if (doc) observe(doc)
      } catch {
        /* cross-origin iframe */
      }
    }
  }

  log('observers attached:', observers.length)
  return () => observers.forEach(o => o.disconnect())
}

/** ---------- optional debug helpers ---------- */
window.__miniExplorer = {
  dump () {
    const rows = snapshot()
    console.table(rows)
    return rows
  },
  clear () {
    clearPlayers()
    renderOverlay(playerEntries())
  }
}

/** ---------- boot ---------- */
try {
  getOverlayBody()
  renderOverlay(playerEntries())
  initialScan()
  startObservers()
  log(
    'READY. Move/roll/get resources to see logs; call window.__miniExplorer.dump()'
  )
} catch (e) {
  err('boot failed:', e)
}
