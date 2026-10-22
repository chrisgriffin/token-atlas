import { useEffect, useId, useMemo, useState } from "react";
import type { TokenNode, TokenType } from "../../core/types";
import { toHex } from "../../core/color";
import { wouldCycle } from "../../core/aliases";
import { TypeIcon } from "../icons";

interface AliasPickerProps {
  tokens: TokenNode[];
  currentPath: string[];
  currentType?: TokenType;
  /** Currently selected reference (dotted path, no braces). */
  selectedRef?: string;
  onPick: (reference: string) => void;
  /** Focus the search box on mount (popover use). */
  autoFocus?: boolean;
}

export function AliasPicker({
  tokens,
  currentPath,
  currentType,
  selectedRef,
  onPick,
  autoFocus,
}: AliasPickerProps) {
  const [query, setQuery] = useState("");
  // The highlighted row: focus stays in the search box, which names this row
  // as its active option, so the arrows and Enter work without leaving it.
  const [active, setActive] = useState(0);
  const listId = useId();
  const currentKey = currentPath.join(".");

  const map = useMemo(() => {
    const m = new Map<string, TokenNode>();
    for (const t of tokens) m.set(t.path.join("."), t);
    return m;
  }, [tokens]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tokens
      .filter((t) => {
        const key = t.path.join(".");
        if (key === currentKey) return false; // can't alias self
        if (wouldCycle(map, currentKey, key)) return false; // would create a loop
        if (q && !key.toLowerCase().includes(q)) return false;
        return true;
      })
      .slice(0, 200);
  }, [tokens, query, map, currentKey]);

  const activeId = candidates.length
    ? `${listId}-${Math.min(active, candidates.length - 1)}`
    : undefined;
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  return (
    <div>
      <input
        autoFocus={autoFocus}
        placeholder="Search tokens to reference…"
        value={query}
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={activeId}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          const last = candidates.length - 1;
          if (e.key === "ArrowDown") setActive((i) => Math.min(i + 1, last));
          else if (e.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
          else if (e.key === "Enter" && candidates.length)
            onPick(candidates[Math.min(active, last)].path.join("."));
          else return;
          e.preventDefault();
        }}
      />
      <div
        id={listId}
        role="listbox"
        aria-label="Tokens"
        style={{
          marginTop: 8,
          maxHeight: 240,
          overflow: "auto",
          border: "1px solid var(--vscode-panel-border)",
          borderRadius: 4,
        }}
      >
        {candidates.length === 0 ? (
          <div style={{ padding: 10, opacity: 0.6 }}>No eligible tokens.</div>
        ) : (
          candidates.map((t, i) => {
            const key = t.path.join(".");
            const swatch = t.type === "color" ? toHex(t.resolvedValue ?? t.value) : null;
            const mismatch = currentType && t.type && currentType !== t.type;
            return (
              <div
                key={key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={`${listId}-${i}` === activeId}
                className={`row${selectedRef === key ? " active" : ""}${`${listId}-${i}` === activeId ? " highlighted" : ""}`}
                onClick={() => onPick(key)}
                style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: 8 }}
              >
                {swatch ? (
                  <span className="swatch" style={{ width: 12, height: 12 }}>
                    <span style={{ background: swatch }} />
                  </span>
                ) : (
                  <TypeIcon type={t.type} />
                )}
                <span
                  className="mono"
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {key}
                  {t.sourceFile && (
                    <span style={{ opacity: 0.55, fontSize: "0.8em" }}> · {t.sourceFile}</span>
                  )}
                </span>
                <span
                  title={mismatch ? "Type differs from this token" : undefined}
                  style={{
                    fontSize: "0.8em",
                    opacity: mismatch ? 1 : 0.5,
                    color: mismatch ? "var(--vscode-editorWarning-foreground)" : undefined,
                  }}
                >
                  {t.type ?? "—"}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
