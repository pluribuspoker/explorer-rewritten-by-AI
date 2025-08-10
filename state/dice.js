// Dice roll statistics state (2-12 inclusive)
// Provides simple accumulation + accessors

const _counts = {}
for (let i = 2; i <= 12; i++) _counts[i] = 0

export function recordDice (sum) {
  if (typeof sum === 'number' && sum >= 2 && sum <= 12) {
    _counts[sum] = (_counts[sum] || 0) + 1
  }
}

export function getDiceCounts () {
  return { ..._counts }
}

export function clearDice () {
  for (let i = 2; i <= 12; i++) _counts[i] = 0
}
