// Configuration & constant patterns for Mini Explorer (ES module)
export const TAG = '[MiniExplorer]'
export const CANDIDATE_LINE_REGEX =
  /(rolled|got|gave|and got|wants to give|placed a|built a|bought|discarded|stole|took from bank|received starting resources)/i
export const IMAGE_HINTS = {
  wood: /card_lumber/i,
  brick: /card_brick/i,
  sheep: /card_wool/i,
  wheat: /card_grain/i,
  ore: /card_ore/i
}
export const RESOURCE_KEYS = ['wood', 'brick', 'sheep', 'wheat', 'ore']
