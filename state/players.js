import { RESOURCE_KEYS } from '../config.js'

/** @typedef {Object} PlayerResources
 *  @property {number} wood
 *  @property {number} brick
 *  @property {number} sheep
 *  @property {number} wheat
 *  @property {number} ore
 *  @property {number} total
 */
/** @type {Map<string, PlayerResources>} */
const players = new Map()

export function ensurePlayer (name) {
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
  return /** @type {PlayerResources} */ (players.get(name))
}
export function entries () {
  return players.entries()
}
export function clearPlayers () {
  players.clear()
}
export function addResources (name, resources) {
  const p = ensurePlayer(name)
  for (const key of RESOURCE_KEYS) {
    const n = resources[key] || 0
    if (n) {
      p[key] += n
      p.total += n
    }
  }
}
// Spend (decrement) resources for a player. Clamps at zero & adjusts total by the
// actual amount removed so total always matches sum of individual resources.
// Returns an object of what was actually spent.
export function spendResources (name, costs) {
  const p = ensurePlayer(name)
  /** @type {Record<string, number>} */
  const spent = {}
  let totalRemoved = 0
  for (const key of RESOURCE_KEYS) {
    const want = costs[key] || 0
    if (!want) continue
    const have = p[key] || 0
    const remove = Math.min(have, want)
    if (remove > 0) {
      p[key] = have - remove
      spent[key] = remove
      totalRemoved += remove
    }
  }
  if (totalRemoved) p.total = Math.max(0, p.total - totalRemoved)
  return spent
}
export function snapshot () {
  return [...players.entries()].map(([player, r]) => ({ player, ...r }))
}
