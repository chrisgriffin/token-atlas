/** New sibling order after dropping `dragged` before or after `target`.
 *  Returns null when nothing would change. */
export function reorderSiblings(
  siblings: string[],
  dragged: string,
  target: string,
  after: boolean,
): string[] | null {
  if (
    dragged === target ||
    !siblings.includes(dragged) ||
    !siblings.includes(target)
  )
    return null
  const without = siblings.filter(n => n !== dragged)
  const at = without.indexOf(target) + (after ? 1 : 0)
  const order = [...without.slice(0, at), dragged, ...without.slice(at)]
  return order.every((n, i) => n === siblings[i]) ? null : order
}
