import { log } from './logger.js'

/**
 * Walk all descendant nodes of a root, traversing into shadow roots and same-origin iframes.
 * Yields every node (depth-first) including the root itself.
 */
export function * walkAllNodes (root) {
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

/**
 * Attach mutation observers to document, existing shadow roots, and same-origin iframes.
 * Invokes processNode on any added nodes. Returns a disposer function to disconnect all observers.
 */
export function startObservers (processNode) {
  const observers = []

  function observe (root) {
    try {
      const obs = new MutationObserver(mutations => {
        for (const m of mutations) {
          if (!m.addedNodes) continue

          if (processNode) {
            m.addedNodes.forEach(n => processNode(n))
          }

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
