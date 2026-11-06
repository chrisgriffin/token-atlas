import { useRef, useState, type ReactNode } from "react"

/** A table cell that edits in place. The display span is focusable, so a
 *  single click or tabbing into it swaps in a text input; Tab / Enter / blur
 *  commit, Escape cancels. `commit` returns false to reject the text: on
 *  Enter the cell stays open and flashes red, on blur it reverts. Enter and
 *  Escape hand focus back to the table, so the arrow keys keep working;
 *  refocusing the cell itself would open it again. */
export function InlineCell({
  text,
  className,
  title,
  mono,
  placeholder,
  commit,
  grow,
  tabbable = true,
  children,
}: {
  text: string
  className?: string
  title?: string
  mono?: boolean
  placeholder?: string
  commit: (text: string) => boolean
  /** While editing, widen past a narrow column to fit the text. */
  grow?: boolean
  /** In the Tab order; the table passes false for every row but the selected one. */
  tabbable?: boolean
  children?: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [bad, setBad] = useState(false)
  // Set when Enter or Escape closed the cell: the blur that moving focus
  // causes must not commit a second time, or commit a cancelled draft.
  const closed = useRef(false)
  const close = (input: HTMLElement) => {
    closed.current = true
    setEditing(false)
    input.closest<HTMLElement>(".table-wrap")?.focus()
  }

  if (!editing) {
    return (
      <span
        tabIndex={tabbable ? 0 : -1}
        className={`cell${mono ? " mono" : ""}${className ? ` ${className}` : ""}${text ? "" : " empty"}`}
        title={title ?? "Click to edit"}
        onFocus={() => {
          closed.current = false
          setDraft(text)
          setBad(false)
          setEditing(true)
        }}
      >
        {children ?? text ?? ""}
        {!text && !children && placeholder && (
          <span className="placeholder">{placeholder}</span>
        )}
      </span>
    )
  }
  const changed = draft.trim() !== text.trim()
  return (
    <input
      autoFocus
      className={`inline${mono ? " mono" : ""}${bad ? " bad" : ""}${grow ? " grow" : ""}`}
      style={grow ? { width: `${draft.length + 3}ch` } : undefined}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={e => {
        setDraft(e.target.value)
        setBad(false)
      }}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        if (e.key !== "Tab") e.stopPropagation()
        // The Enter that confirms an IME composition belongs to the IME.
        if (e.nativeEvent.isComposing) return
        if (e.key === "Enter") {
          if (changed && !commit(draft)) setBad(true)
          else close(e.currentTarget)
        } else if (e.key === "Escape") {
          close(e.currentTarget)
        }
      }}
      onBlur={() => {
        if (changed && !closed.current) commit(draft) // rejected text simply reverts
        setEditing(false)
      }}
    />
  )
}
