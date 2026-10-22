import { useState, type ReactNode } from "react";

/** A table cell that edits in place. The display span is focusable, so a
 *  single click or tabbing into it swaps in a text input; Tab / Enter / blur
 *  commit, Escape cancels. `commit` returns false to reject the text: on
 *  Enter the cell stays open and flashes red, on blur it reverts. */
export function InlineCell({
  text,
  className,
  title,
  mono,
  placeholder,
  commit,
  grow,
  children,
}: {
  text: string;
  className?: string;
  title?: string;
  mono?: boolean;
  placeholder?: string;
  commit: (text: string) => boolean;
  /** While editing, widen past a narrow column to fit the text. */
  grow?: boolean;
  children?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [bad, setBad] = useState(false);

  if (!editing) {
    return (
      <span
        tabIndex={0}
        className={`cell${mono ? " mono" : ""}${className ? ` ${className}` : ""}${text ? "" : " empty"}`}
        title={title ?? "Click to edit"}
        onFocus={() => {
          setDraft(text);
          setBad(false);
          setEditing(true);
        }}
      >
        {children ?? text ?? ""}
        {!text && !children && placeholder && <span className="placeholder">{placeholder}</span>}
      </span>
    );
  }
  const changed = draft.trim() !== text.trim();
  return (
    <input
      autoFocus
      className={`inline${mono ? " mono" : ""}${bad ? " bad" : ""}${grow ? " grow" : ""}`}
      style={grow ? { width: `${draft.length + 3}ch` } : undefined}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => {
        setDraft(e.target.value);
        setBad(false);
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          if (changed && !commit(draft)) setBad(true);
          else setEditing(false);
        } else if (e.key === "Escape") {
          setEditing(false);
        }
        if (e.key !== "Tab") e.stopPropagation();
      }}
      onBlur={() => {
        if (changed) commit(draft); // rejected text simply reverts
        setEditing(false);
      }}
    />
  );
}
