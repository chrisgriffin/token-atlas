// JS/TS exports — camelCase, dotted access, or a quoted path all match.
export const colorBlue500 = "#3b82f6"
export const spaceMd = "16px"

export const tokens = {
  color: { blue500: colorBlue500 },
  space: { md: spaceMd },
}

// Hover the property chain, not just the leaf.
const accent = tokens.color.blue500
const gap = tokens.space.md
const byPath = "space.md"

export default { accent, gap, byPath }
