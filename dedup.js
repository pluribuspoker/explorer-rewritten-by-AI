// Signature & de-duplication utilities
// ------------------------------------
// Provides stable signatures for log lines (text + image basenames) and
// a session-long suppression mechanism for duplicate lines.

const processedLineSignatures = new Set()

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

export function isSignatureDuplicate (sig) {
  return processedLineSignatures.has(sig)
}

export function markSignature (sig) {
  processedLineSignatures.add(sig)
}

export function consumeDuplicateCheck (lineText, node) {
  const sig = lineSignature(lineText, node)
  const duplicate = processedLineSignatures.has(sig)
  if (!duplicate) processedLineSignatures.add(sig)
  return { duplicate, signature: sig }
}

// Debug helper
export function _debugSignatureCount () {
  return processedLineSignatures.size
}

// Clear all stored signatures (used by debug surface clear)
export function clearSignatures () {
  processedLineSignatures.clear()
}
