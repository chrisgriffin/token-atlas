/**
 * Token paths defined in more than one file. The workspace index is
 * first-file-wins per path and says nothing when it drops a definition; this
 * is the pure half of making that visible.
 *
 * Files a resolver offers as alternatives (one modifier's files, from
 * `modifierFiles`) never load beside each other, so a path they share is
 * deliberate and not a collision. Which file *should* win anywhere else is a
 * product decision and deliberately not decided here.
 */
import { indexTokens } from "./resolve"
import type { TokenDocumentModel } from "./types"

export interface PathCollision {
  path: string
  /**
   * The file the index keeps for `path` (the first given), then every other
   * file defining it that is not one of the winner's alternatives.
   */
  files: string[]
}

export function findPathCollisions(
  files: ReadonlyArray<{ label: string; model: TokenDocumentModel }>,
  alternatives: ReadonlyArray<readonly string[]> = [],
): PathCollision[] {
  const byPath = new Map<string, string[]>()
  for (const { label, model } of files) {
    for (const key of indexTokens(model).keys()) {
      const list = byPath.get(key)
      if (list) list.push(label)
      else byPath.set(key, [label])
    }
  }
  const alternate = (a: string, b: string) =>
    alternatives.some(group => group.includes(a) && group.includes(b))
  return [...byPath].flatMap(([path, [winner, ...rest]]) => {
    const losers = rest.filter(loser => !alternate(winner, loser))
    return losers.length ? [{ path, files: [winner, ...losers] }] : []
  })
}
