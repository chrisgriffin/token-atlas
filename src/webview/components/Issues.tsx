import { useState } from "react"
import type { ValidationResult } from "../../core/types"
import { ChevronDown, ErrorIcon, WarningIcon } from "../icons"

/** Folded status line ("2 errors · 1 warning") that expands to the full list. */
export function Issues({
  validation,
  onSelect,
}: {
  validation: ValidationResult
  onSelect: (path: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const issues = validation.issues
  if (issues.length === 0) return null
  const errors = issues.filter(i => i.severity === "error").length
  const warnings = issues.length - errors

  return (
    <div className="statusbar">
      <button
        type="button"
        className="summary"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        title={open ? "Hide problems" : "Show problems"}
      >
        {errors > 0 && (
          <span className="sev-error">
            <ErrorIcon /> {errors} {errors === 1 ? "error" : "errors"}
          </span>
        )}
        {warnings > 0 && (
          <span className="sev-warning">
            <WarningIcon /> {warnings} {warnings === 1 ? "warning" : "warnings"}
          </span>
        )}
        <span className={`chevron${open ? "" : " folded"}`}>
          <ChevronDown />
        </span>
      </button>
      {open && (
        <div
          style={{
            maxHeight: 200,
            overflow: "auto",
            borderTop: "1px solid var(--vscode-panel-border)",
          }}
        >
          {issues.map((issue, i) => (
            <button
              type="button"
              key={i}
              className="row issue"
              onClick={() => onSelect(issue.path)}
            >
              <span
                className={`sev-${issue.severity}`}
                style={{ display: "inline-flex" }}
              >
                {issue.severity === "error" ? <ErrorIcon /> : <WarningIcon />}
              </span>
              <code style={{ fontSize: "0.85em", flexShrink: 0 }}>
                {issue.path.join(".")}
              </code>
              <span style={{ flex: 1, minWidth: 0 }}>{issue.message}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
