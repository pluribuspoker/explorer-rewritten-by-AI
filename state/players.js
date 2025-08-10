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
export function snapshot () {
  return [...players.entries()].map(([player, r]) => ({ player, ...r }))
}
