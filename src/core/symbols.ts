/**
 * True when every character of `query` appears in `candidate`, in order,
 * ignoring case: the relaxed match VS Code asks a workspace symbol provider
 * for, since it scores and highlights the results itself. `cbp` matches
 * `color.brand.primary`; an empty query matches everything.
 */
export function fuzzyMatches(query: string, candidate: string): boolean {
  const q = query.toLowerCase()
  const c = candidate.toLowerCase()
  let at = 0
  for (const ch of q) {
    at = c.indexOf(ch, at)
    if (at === -1) return false
    at++
  }
  return true
}
