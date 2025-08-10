# Colonist Mini Explorer (v0)

A tiny, readable Chrome content script that gets you traction parsing Colonist chat.

### What it does

- Watches the DOM for lines that *look* like chat messages (broad regex)
- Parses only the simplest event: **“NAME got …”**
- Counts resource icons on that line (wood/brick/sheep/wheat/ore)
- Shows a small overlay with per-player counts

This is intentionally small so you can iterate quickly.

---

## Install (Chrome)

1. `git clone` or copy this folder somewhere on your PC.
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** → select this folder.
5. Open a game on `colonist.io` and you should see *Mini Explorer* overlay.

---

## Notes

- This first version doesn’t dedupe when the chat list re-renders on scroll (Colonist uses virtualization).  
  If you see double counting, we can add a **content signature** to dedupe lines in the next patch.
- To clear the counts during a test, you can run in DevTools:
  ```js
  window.__miniExplorer.clear()
