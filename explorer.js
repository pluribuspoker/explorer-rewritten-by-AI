/**
 * Colonist Mini Explorer (v0)
 * ---------------------------------------
 * Goal: get traction with the simplest possible approach.
 * - Watches the page for chat-like lines (no fragile selectors).
 * - Parses only “NAME got …” lines by counting resource icons in that line.
 * - Shows a tiny overlay with per-player tallies.
 *
 * This is intentionally small and readable so you can iterate fast.
 */
/* eslint-disable no-console */

;(() => {
  /** ---------- logging helpers ---------- */
  const TAG = '[MiniExplorer]'
  const log = (...a) => console.log(TAG, ...a)
  const warn = (...a) => console.warn(TAG, ...a)
  const err = (...a) => console.error(TAG, ...a)

  /** ---------- what looks like a “log line” to us ---------- */
  // keep this broad so we can see lines we might want to support later
  const CANDIDATE_LINE_REGEX =
    /(rolled|got|gave|and got|wants to give|placed a|built a|bought|discarded|stole|took from bank|received starting resources)/i

  /** ---------- resource detection (by icon filename) ---------- */
  const IMAGE_HINTS = {
    wood: /card_lumber/i,
    brick: /card_brick/i,
    sheep: /card_wool/i,
    wheat: /card_grain/i,
    ore: /card_ore/i
  }
  const RESOURCE_KEYS = ['wood', 'brick', 'sheep', 'wheat', 'ore']

  /** ---------- state: very simple tallies for “NAME got …” ---------- */
  // players map → { wood, brick, sheep, wheat, ore, total }
  const players = new Map()

  function ensurePlayer (name) {
    if (!players.has(name)) {
      players.set(name, {
        wood: 0,
        brick: 0,
        sheep: 0,
        wheat: 0,
        ore: 0,
        total: 0
      })
    }
    return players.get(name)
  }

  /** ---------- tiny overlay UI so you can see counts ---------- */
  function getOverlayBody () {
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

      // simple header + body
      root.innerHTML = `
        <div style="font-weight:600;margin-bottom:6px">Mini Explorer</div>
        <div id="mini-explorer-body" style="white-space:pre-wrap"></div>
      `

      document.documentElement.appendChild(root)
    }
    return root.querySelector('#mini-explorer-body')
  }

  function renderOverlay () {
    const body = getOverlayBody()
    const lines = [...players.entries()].map(([name, r]) => {
      const row =
        `${name.padEnd(10)}  ` +
        `🪵${r.wood} ` +
        `🧱${r.brick} ` +
        `🐑${r.sheep} ` +
        `🌾${r.wheat} ` +
        `⛰️${r.ore}  = ${r.total}`
      return row
    })

    body.textContent = lines.length
      ? lines.join('\n')
      : "Listening… (roll, chat, 'got' events)"
  }

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

    const p = ensurePlayer(event.player)
    for (const key of RESOURCE_KEYS) {
      const n = event.resources[key]
      if (n) {
        p[key] += n
        p.total += n
      }
    }
    renderOverlay()
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
              if (n instanceof HTMLElement && n.shadowRoot)
                observe(n.shadowRoot)
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
      const rows = [...players.entries()].map(([player, r]) => ({
        player,
        ...r
      }))
      console.table(rows)
      return rows
    },
    clear () {
      players.clear()
      renderOverlay()
    }
  }

  /** ---------- boot ---------- */
  try {
    getOverlayBody()
    renderOverlay()
    initialScan()
    startObservers()
    log(
      'READY. Move/roll/get resources to see logs; call window.__miniExplorer.dump()'
    )
  } catch (e) {
    err('boot failed:', e)
  }
})()
