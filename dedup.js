// Signature & de-duplication utilities
// ------------------------------------
// We generate a stable content signature for each "log line" DOM node:
//   signature = text + sorted image basenames (hashes stripped)
// Historically we used a simple Set to suppress any signature after first
// sight which incorrectly filtered legitimate game repeats (e.g. a player
// getting the same resource on different dice rolls). A time‑window approach
// was rejected; DOM identity proved unstable. Final strategy combines:
//   1. Global signature set (for cheap first-seen tracking)
//   2. Contextual sibling pair set: prevSig >> currentSig
// We treat a line as a duplicate ONLY if:
//   - We've seen its signature before AND
//   - We've already seen the exact adjacent pair (prevSig >> currentSig)
// This allows identical lines to be processed again when their surrounding
// context differs (true new event) while still suppressing duplicates from
// virtualization re-renders where the same block of lines reappears intact.
// If no previous candidate sibling exists, we fall back to global suppression.

const processedLineSignatures = new Set()
const processedAdjacentPairs = new Set() // "prevSig>>currentSig"

// Normalize hashed asset filenames like "road_blue.33012eed15cae5aa6a05.svg" -> "road_blue.svg"
function canonicalizeBasename (basename) {
  try {
    const m = basename.match(/^([^.]+?)(?:\.[0-9a-f]{6,})+\.([a-z0-9]+)$/i)
    if (m) return m[1] + '.' + m[2]
    const parts = basename.split('.')
    if (parts.length > 2) return parts[0] + '.' + parts[parts.length - 1]
    return basename
  } catch {
    return basename
  }
}

function imageSignaturesForNode (node) {
  try {
    const imgs = node.querySelectorAll?.('img') || []
    const parts = []
    for (const img of imgs) {
      const src = img.currentSrc || img.src || ''
      if (!src) continue
      const cleaned = src.split(/[?#]/)[0].split('/').pop()
      if (cleaned) parts.push(canonicalizeBasename(cleaned.toLowerCase()))
    }
    parts.sort()
    return parts.join(',')
  } catch {
    return ''
  }
}

export function lineSignature (lineText, node) {
  return lineText + ' | imgs:' + imageSignaturesForNode(node)
}

// Context-aware duplicate assessment: allow identical lines to repeat if
// their immediate textual neighbor (previous candidate line) differs from
// the last time we saw this line. We only suppress when BOTH the current
// signature and the (prev->current) pair have been observed before.
export function isContextualDuplicate (currentSig, prevSig) {
  if (!processedLineSignatures.has(currentSig)) return false // brand new line
  if (!prevSig) return true // no contextual info; fallback to simple suppression
  const pairKey = prevSig + '>>' + currentSig
  if (!processedAdjacentPairs.has(pairKey)) return false // new adjacency => allow
  return true // seen line & pair => duplicate
}

export function markContext (currentSig, prevSig) {
  processedLineSignatures.add(currentSig)
  if (prevSig) processedAdjacentPairs.add(prevSig + '>>' + currentSig)
}

// (Legacy consumeDuplicateCheck removed; callers now directly use contextual API.)

// Debug helper
export function _debugSignatureCount () {
  return processedLineSignatures.size
}

// Clear all stored signatures (used by debug surface clear)
export function clearSignatures () {
  processedLineSignatures.clear()
  processedAdjacentPairs.clear()
}
