/**
 * Mini Explorer (single-file build)
 * ---------------------------------
 * Goal: scan DOM "log line" nodes, parse structured game events, update in-memory
 * player resource state, and render an overlay. We expect to grow the catalog of
 * event types, so this file is organized top-to-bottom for quick human scanning:
 *   1. Imports & constants
 *   2. Generic helpers / tiny utilities
 *   3. Event parsing framework (contracts + registry + concrete parsers)
 *   4. Event side‑effects (state mutations)
 *   5. Logging & diagnostic helpers
 *   6. Node processing / scanning
 *   7. Debug surface & boot
 */

// 1. Imports ---------------------------------------------------------------
import {
  TAG,
  CANDIDATE_LINE_REGEX,
  IMAGE_HINTS,
  RESOURCE_KEYS
} from './config.js'
import { log, warn, err } from './logger.js'
import {
  addResources,
  spendResources,
  entries as playerEntries,
  clearPlayers,
  snapshot
} from './state/players.js'
import { recordDice, getDiceCounts, clearDice } from './state/dice.js'
import {
  getOverlayBody,
  renderOverlay,
  ensureDebugControls,
  renderDiceGraph
} from './ui/overlay.js'
import { walkAllNodes, startObservers } from './dom.js'
import {
  lineSignature,
  clearSignatures,
  isContextualDuplicate,
  markContext
} from './dedup.js'

// 2. Generic helpers / tiny utilities -------------------------------------

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

// Helper: produce compact non-zero resource summary like "wood:2, brick:1"
function formatResourceSummary (resources) {
  try {
    const nonZero = Object.entries(resources || {}).filter(([, v]) => v > 0)
    if (!nonZero.length) return ''
    return nonZero.map(([k, v]) => `${k}:${v}`).join(', ')
  } catch {
    return ''
  }
}

// 3. Event parsing framework ----------------------------------------------
/**
 * Event object (shape we commit to):
 * { type: string, player?: string, resources?: {wood..}, rawText, node }
 * Additional fields can be appended by future parsers (e.g. diceSum, placed[]).
 * Parsers MUST:
 *   - Accept (lineText, node)
 *   - Return null if not a match
 *   - Return minimal event object if matched (WITHOUT side effects)
 */

const eventParsers = []

// --- Concrete parsers ----------------------------------------------------
function parseDiceRollEvent (lineText, node) {
  if (!/\brolled\b/i.test(lineText)) return null
  const sum = getDiceSum(node)
  if (sum === null) return null
  return { type: 'dice_roll', diceSum: sum, rawText: lineText, node }
}

function parseStartingResourcesEvent (lineText, node) {
  // Shape: "<PlayerName> received starting resources" + resource icons

  // 1. Quick textual check
  if (!/received starting resources/i.test(lineText)) return null

  // 2. Extract player name (first token)
  const playerName = lineText.split(/\s+/)[0]
  if (!playerName) return null

  // 3. Count resource icons present in the DOM node
  const resources = countResourceImages(node)
  const any = RESOURCE_KEYS.some(k => resources[k] > 0)
  if (!any) return null

  // 4. Produce normalized event object
  return {
    type: 'starting_resources',
    player: playerName,
    resources,
    rawText: lineText,
    node
  }
}

function parseGotEvent (lineText, node) {
  // Shape: "<PlayerName> got ..." + resource icons

  // 1. Quick textual check
  if (!/\bgot\b/i.test(lineText)) return null

  // 2. Extract player name
  const playerName = lineText.split(/\s+/)[0]
  if (!playerName) return null

  // 3. Count resource icons
  const resources = countResourceImages(node)
  const gotAny = RESOURCE_KEYS.some(k => resources[k] > 0)
  if (!gotAny) return null

  // 4. Event object
  return {
    type: 'got',
    player: playerName,
    resources,
    rawText: lineText,
    node
  }
}

// Image-based build event parser (replaces text-classifier variant)
function parseBuildEvent (lineText, node) {
  if (!/\bbuilt a\b/i.test(lineText)) return null
  const playerName = lineText.split(/\s+/)[0]
  if (!playerName) return null
  const items = getPlacedItems(node)
  const imgs = node.querySelectorAll?.('img') || []
  const imageSrcs = Array.from(imgs).map(img => img.currentSrc || img.src || '')
  return {
    type: 'build',
    player: playerName,
    items,
    imageSrcs,
    rawText: lineText,
    node
  }
}

// Register parsers in priority order (top-first match wins)
eventParsers.push(parseDiceRollEvent)
eventParsers.push(parseStartingResourcesEvent)
eventParsers.push(parseGotEvent)
eventParsers.push(parseBuildEvent)

function parseLine (lineText, node) {
  for (const parse of eventParsers) {
    try {
      const evt = parse(lineText, node)
      if (evt) return evt
    } catch (e) {
      warn('parser failed:', e)
    }
  }
  return null
}

// 4. Event side-effects ----------------------------------------------------
function applyEvent (evt) {
  switch (evt.type) {
    case 'starting_resources':
      if (evt.player && evt.resources) {
        addResources(evt.player, evt.resources)
        const resSummary = formatResourceSummary(evt.resources)
        log(
          'event starting_resources ->',
          evt.player,
          resSummary || '(no resource counts)'
        )
      }
      break
    case 'got':
      if (evt.player && evt.resources) {
        addResources(evt.player, evt.resources)
        // Incremental: internal event log (will later replace external pre-parse logging)
        const resSummary = formatResourceSummary(evt.resources)
        log('event got ->', evt.player, resSummary || '(no resource counts)')
      }
      break
    case 'dice_roll':
      if (typeof evt.diceSum === 'number') {
        recordDice(evt.diceSum)
        log('event dice_roll -> sum:', evt.diceSum)
      }
      break
    case 'build':
      if (evt.player) {
        const items = evt.items || []
        if (!items.length) {
          log(
            'event build ->',
            evt.player,
            'items: (unrecognized yet)',
            '(image filenames logged)'
          )
        } else {
          for (const item of items) {
            switch (item) {
              case 'road': {
                const spent = spendResources(evt.player, { wood: 1, brick: 1 })
                log(
                  'event build ->',
                  evt.player,
                  'road',
                  formatResourceSummary(spent) || '(no spend)'
                )
                break
              }
              case 'settlement': {
                const spent = spendResources(evt.player, {
                  wood: 1,
                  brick: 1,
                  sheep: 1,
                  wheat: 1
                })
                log(
                  'event build ->',
                  evt.player,
                  'settlement',
                  formatResourceSummary(spent) || '(no spend)'
                )
                break
              }
              case 'city': {
                const spent = spendResources(evt.player, { wheat: 2, ore: 3 })
                log(
                  'event build ->',
                  evt.player,
                  'city',
                  formatResourceSummary(spent) || '(no spend)'
                )
                break
              }
              default:
                log('event build ->', evt.player, item, '(no cost logic)')
            }
          }
        }
      }
      break
    // Future event types handled here.
    default:
      // (No side-effect yet) – intentionally silent.
      break
  }
  // Overlay always re-renders after any recognized event for now.
  renderOverlay(playerEntries())
  renderDiceGraph(getDiceCounts())
}

// 5. Logging & diagnostics -------------------------------------------------
function logEventDetails (lineText, node) {
  const details = []
  let sig = ''
  try {
    sig = lineSignature(lineText, node)
  } catch {}
  const resources = countResourceImages(node)
  const nonZeroResources = Object.entries(resources).filter(([, v]) => v > 0)
  if (nonZeroResources.length) {
    details.push(
      'resources: ' + nonZeroResources.map(([k, v]) => `${k}:${v}`).join(', ')
    )
  }
  if (/\brolled\b/i.test(lineText)) {
    const sum = getDiceSum(node)
    if (sum !== null) details.push('dice: ' + sum)
  }
  if (/\bplaced a\b/i.test(lineText)) {
    const placed = getPlacedItems(node)
    if (placed.length) details.push(placed.join(', '))
  }
  if (/\bbuilt a\b/i.test(lineText)) {
    try {
      const imgs = node.querySelectorAll?.('img') || []
      if (imgs.length) {
        const names = Array.from(imgs)
          .map(img => (img.currentSrc || img.src || '').split('/').pop())
          .filter(Boolean)
        if (names.length) details.push('build_imgs: ' + names.join('|'))
      }
    } catch {}
  }
  const parts = ['line:', lineText]
  if (details.length) parts.push(...details)
  log(...parts)
  log('signature:', sig)
}

function getDiceSum (node) {
  const imgs = node.querySelectorAll?.('img') || []
  const imgSrcs = Array.from(imgs).map(img => img.currentSrc || img.src || '')
  const diceValues = imgSrcs
    .map(src => {
      const m = src.match(/dice_(\d+)/i)
      return m ? parseInt(m[1], 10) : null
    })
    .filter(v => v !== null)
  if (diceValues.length) return diceValues.reduce((a, b) => a + b, 0)
  return null
}

function getPlacedItems (node) {
  const imgs = node.querySelectorAll?.('img') || []
  const imgSrcs = Array.from(imgs).map(img => img.currentSrc || img.src || '')
  const items = new Set()
  for (const src of imgSrcs) {
    const file = src.split('/').pop() || ''
    if (/icon_bot/i.test(file)) continue // skip avatar/bot markers
    // Road examples: road_green.<hash>.svg ; allow variant/hashes
    if (/^road_[^\.]+\.[a-z0-9]+\.svg/i.test(file)) items.add('road')
    // Settlement examples (expected similar): settlement_<color>.<hash>.svg
    if (/^settlement_[^\.]+\.[a-z0-9]+\.svg/i.test(file))
      items.add('settlement')
    // City examples: city_blue.<hash>.svg
    if (/^city_[^\.]+\.[a-z0-9]+\.svg/i.test(file)) items.add('city')
  }
  return [...items]
}

// 6. Node processing / scanning -------------------------------------------
function processNode (node) {
  if (!(node instanceof HTMLElement)) return

  const lineText = textFrom(node)
  if (!lineText || !CANDIDATE_LINE_REGEX.test(lineText)) return

  // Sibling-context virtualization duplicate guard.
  let prevNode = node.previousElementSibling
  let prevSig = null
  while (prevNode) {
    try {
      const t = textFrom(prevNode)
      if (t && CANDIDATE_LINE_REGEX.test(t)) {
        prevSig = lineSignature(t, prevNode)
        break
      }
    } catch {}
    prevNode = prevNode.previousElementSibling
  }

  const sig = lineSignature(lineText, node)
  if (isContextualDuplicate(sig, prevSig)) {
    // log('context dedup skip:', lineText)
    return
  }
  markContext(sig, prevSig)
  // Identity debug logging removed (was used to hunt stable DOM IDs).

  // (Simple global signature suppression removed; contextual logic above decides.)

  // Log diagnostic info regardless of whether any parser claims the line.
  logEventDetails(lineText, node)

  const evt = parseLine(lineText, node)
  if (!evt) return
  try {
    applyEvent(evt)
  } catch (e) {
    warn('applyEvent failed for', evt.type, e)
  }
}

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

// 7. Debug surface & boot -------------------------------------------------
window.__miniExplorer = {
  dump () {
    const rows = snapshot()
    console.table(rows)
    return rows
  },
  clear () {
    clearPlayers()
    clearDice()
    clearSignatures()
    renderOverlay(playerEntries())
    renderDiceGraph(getDiceCounts())
  },
  dice () {
    return getDiceCounts()
  }
}

try {
  getOverlayBody()
  renderOverlay(playerEntries())
  renderDiceGraph(getDiceCounts())
  ensureDebugControls()
  initialScan()
  startObservers(processNode) // observe new DOM
  log(
    'READY. Move/roll/get resources to see logs; call window.__miniExplorer.dump()'
  )
} catch (e) {
  err('boot failed:', e)
}
