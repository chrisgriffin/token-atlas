/** Group navigation helpers: the toolbar's group filter and the table's scope. */
import type { GroupNode } from "../../core/types"
import { countTokens } from "../../core/parse"

export interface GroupEntry {
  path: string[]
  /** Dotted path, the value the filter carries. */
  key: string
  /** Nesting level, 0 for a top-level group. */
  depth: number
  /** Tokens in this group and everything under it. */
  tokens: number
}

/** Every group in the document, in document order. */
export function listGroups(root: GroupNode): GroupEntry[] {
  const out: GroupEntry[] = []
  const walk = (group: GroupNode, depth: number) => {
    for (const child of group.children) {
      if (child.kind !== "group") continue
      out.push({
        path: child.path,
        key: child.path.join("."),
        depth,
        tokens: countTokens(child),
      })
      walk(child, depth + 1)
    }
  }
  walk(root, 0)
  return out
}

/** The group at `path`, or undefined when it no longer exists. */
export function findGroup(
  root: GroupNode,
  path: string[],
): GroupNode | undefined {
  let current: GroupNode = root
  for (const segment of path) {
    const next = current.children.find(
      c => c.kind === "group" && c.name === segment,
    )
    if (!next || next.kind !== "group") return undefined
    current = next
  }
  return current
}
