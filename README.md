<div align="center">

# Colonist Mini Explorer

Minimal, hackable Chrome (MV3) content script that watches Colonist game log / chat DOM, parses structured events, and renders a floating per‑player resource overlay — optimized for fast iteration & readability.

</div>

## ✨ Current Capabilities

- Broad DOM scan + live mutation observers (regular + shadow roots + same‑origin iframes)
- Event parsing framework (pluggable parser functions) – currently ships with the "NAME got ..." resource acquisition event
- Resource icon detection via `<img>` `src` pattern matching (wood, brick, sheep, wheat, ore)
- In‑memory per‑player accumulator (Map) with live overlay display
- Debug surface: `window.__miniExplorer.dump()` and `.clear()`
- Zero external runtime deps (only dev tool is `esbuild` for bundling)

> Scope is intentionally small; the file layout and comments are tuned for you to extend quickly (add new parsers, richer overlay, persistence, etc.).

## 📁 Project Layout

```
explorer.js          # Entry (assembled single-file build target)
config.js            # Regex + constants
dom.js               # DOM walking + mutation observer orchestration
logger.js            # Tagged console helpers
state/players.js     # Player resource state container & helpers
ui/overlay.js        # Overlay creation + renderer
manifest.json        # Chrome extension (MV3) manifest
styles.css           # (Reserved – not currently imported)
package.json         # Build scripts (esbuild bundle -> dist/)
```

The production content script loaded by Chrome is the bundled output: `dist/explorer.bundle.js` (IIFE) produced from `explorer.js` and its imports.

## 🚀 Quick Start (Development)

1. Clone repo
2. Install dev deps (esbuild):

```bash
npm install
```

3. Build bundle (creates/updates `dist/explorer.bundle.js`):

```bash
npm run build
```

4. (One-time) Load extension in Chrome:

- Go to `chrome://extensions`
- Enable **Developer mode**
- Click **Load unpacked** and select the repository root (must contain `manifest.json`)

5. Open / refresh a Colonist game (`https://colonist.io/`) – the overlay appears top‑right after the initial scan logs `READY...` in DevTools.
6. After making source changes: Go on `chrome://extensions` click the circular reload icon on the extension (or remove + Load unpacked again), and refresh the Colonist tab.

## 🧠 Architecture Overview

`explorer.js` is intentionally linear & commented:

1. Imports & constants
2. Small utilities (text extraction, resource image counting)
3. Event parsing framework
4. Event side‑effects (mutating player state + overlay re-render)
5. Diagnostics (rich logging of lines even if no parser matches)
6. Node scanning (initial full traversal + incremental mutation observers)
7. Debug surface & boot sequence

### Event Parsing Model

Each parser is a function `(lineText, node) -> null | eventObject` where the returned event must at minimum include `{ type, rawText, node }`, with optional `player`, `resources`, or future fields. Parsers are pushed into `eventParsers` (priority = order inserted). The first non‑null result is applied.

Current implemented parser(s):

- `parseGotEvent` – Detects lines containing the word `got`, extracts the player name (first token), counts resource icons on that line, and emits a `got` event with `{ resources }` distribution.

Side effects for recognized events are centralized in `applyEvent(evt)`; for `got` events we increment per‑player tallies.

### Overlay

`ui/overlay.js` lazily creates a fixed positioned container (#mini-explorer) and prints per‑player lines with emoji shorthand plus a per‑row total. Overlay re-renders after any processed event or manual clear.

### Debug Surface

In DevTools Console you can run:

```js
window.__miniExplorer.dump() // returns array of { player, wood, brick, sheep, wheat, ore, total }
window.__miniExplorer.clear() // resets counts & overlay
```

## ➕ Adding a New Event Parser

1. Open `explorer.js`
2. Under the "Concrete parsers" section add a function, e.g.:

```js
function parseRolledEvent(lineText, node) {
  if (!/rolled/i.test(lineText)) return null
  const player = lineText.split(/\s+/)[0]
  const diceSum = getDiceSum(node) // utility already present below
  if (!player || diceSum == null) return null
  return { type: 'rolled', player, diceSum, rawText: lineText, node }
}
eventParsers.push(parseRolledEvent) // choose ordering relative to others
```

3. Add handling in `applyEvent` (if the event mutates state or overlay differently).
4. (Optional) Extend overlay rendering to visualize new data.

Tip: Keep parsers pure (no side effects). Centralizing state mutation preserves debuggability.

## 🧪 Manual Testing Workflow

1. Open Colonist game
2. Open DevTools Console (F12)
3. Trigger in-game actions that produce chat/log lines (e.g., acquiring resources)
4. Inspect console logs prefixed by `[MiniExplorer]` for parsed line details
5. Call `window.__miniExplorer.dump()` to verify current tallies

## ⚠️ Known Limitations / Future Enhancements

- Dedupe: Currently relies on a WeakSet of DOM nodes; if Colonist virtualizes & re-creates identical lines, they may be parsed again (double count). A future improvement: hash `(text + resourceIconPattern + maybe timestamp)` to avoid duplicate semantic events.
- Only "got" events parsed; many others are tagged in `CANDIDATE_LINE_REGEX` but not yet implemented (rolled, placed, bought, stole, etc.).
- No persistence across page reloads.
- Overlay design is intentionally minimal (no sorting, no configurable UI / theming yet).

## 🔐 Permissions Footprint

`manifest.json` uses `host_permissions: ["*://colonist.io/*"]` and injects only the built content script at `document_idle`. No background or storage usage currently.

## 🛠 Build Details

Artifacts emit to `dist/` via esbuild. Primary command:

```bash
npm run build   # create/update dist/explorer.bundle.js
```

Bundle format: `iife` targeting `chrome120`.

## 🧾 License

MIT – feel free to fork & extend. Attribution appreciated but not required.

## 🤝 Contributing Ideas

Potential next steps (PRs welcome):

- Implement additional parsers (`rolled`, `placed a`, `stole`, `discarded`, trade events)
- Add semantic dedupe layer
- Persist state between reloads via `chrome.storage.session` or `localStorage`
- Sorting & highlighting (e.g., highest total, recent changes flash)
- Config overlay (drag to reposition, collapse/expand)
- Unit test harness (e.g., feed synthetic DOM fragments to parsers)

---

Happy hacking! Extend, experiment, and tailor it to your Colonist analysis needs.
