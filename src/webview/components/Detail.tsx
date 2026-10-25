import { useMemo, useState } from "react"
import type { TokenNode, TokenType, ValidationIssue } from "../../core/types"
import { getEditor } from "../editors/registry"
import { summarize } from "../lib/css"
import { AliasPicker } from "./AliasPicker"
import { TextInput } from "../editors/fields"
import { Glyph } from "./Glyph"
import { Link, Unlink } from "../icons"
import { Preview } from "./Preview"
import {
  DeprecatedField,
  DeprecatedPill,
  InheritedPill,
  NodeHeader,
  Problems,
  Section,
  TypeSelect,
} from "./shared"
import { defaultValueFor, isPlaceholderValue } from "../lib/defaults"

interface DetailProps {
  token: TokenNode
  allTokens: TokenNode[]
  externalTokens: TokenNode[]
  issues?: ValidationIssue[]
  onChangeValue: (value: unknown) => void
  onChangeDescription: (description: string) => void
  onRename: (newName: string) => void
  onDelete: () => void
  onMove: (direction: "up" | "down") => void
  onClose: () => void
  /** Opens a group from the header's breadcrumb. */
  onOpenPath?: (path: string[]) => void
  onChangeDeprecated: (
    deprecated: boolean | string | undefined,
    replacement?: string,
  ) => void
  onChangeType: (type: TokenType | undefined, starterValue?: unknown) => void
}

export function Detail({
  token,
  allTokens,
  externalTokens,
  issues,
  onChangeValue,
  onChangeDescription,
  onRename,
  onDelete,
  onMove,
  onClose,
  onOpenPath,
  onChangeDeprecated,
  onChangeType,
}: DetailProps) {
  // The token is a value or a reference, never both — so there is one Value
  // section showing whichever it is, and a link button that swaps between them.
  // `picking` is the token list, open while choosing a target.
  const [picking, setPicking] = useState(false)
  // Two edits can be sent before the host answers the first (a field's blur
  // commit, then the click that caused it), so the editors build on the value
  // last sent until the host's next update replaces it.
  const [sent, setSent] = useState<{ value: unknown } | null>(null)
  const [answered, setAnswered] = useState(token)
  if (answered !== token) {
    setAnswered(token)
    setSent(null)
  }
  const value = sent ? sent.value : token.value
  const changeValue = (next: unknown) => {
    setSent({ value: next })
    onChangeValue(next)
  }
  const referenceCandidates = useMemo(
    () => [...allTokens, ...externalTokens],
    [allTokens, externalTokens],
  )

  // A replacement of the same type, never the token itself.
  const replacements = useMemo(() => {
    const type = token.resolvedType ?? token.type
    const self = token.path.join(".")
    const keys = referenceCandidates
      .filter(t => !type || (t.resolvedType ?? t.type) === type)
      .map(t => t.path.join("."))
      .filter(k => k !== self)
    return [...new Set(keys)].sort()
  }, [referenceCandidates, token])

  const TypeEditor = token.isAlias ? undefined : getEditor(token.type)
  const resolvedType = token.resolvedType ?? token.type
  const resolvedText =
    token.resolvedValue === undefined
      ? ""
      : summarize(token.resolvedValue, resolvedType)
  // An alias with no $type of its own (none declared, none from a group)
  // takes the referenced token's type.
  const typeViaReference =
    !token.type && token.isAlias ? token.resolvedType : undefined

  const unresolved = token.resolvedValue === undefined
  const linkButton = token.isAlias ? (
    <button
      className="ghost"
      disabled={unresolved}
      title={
        unresolved
          ? "Unresolved: there is no value to unlink to"
          : "Use the value it resolves to instead of the reference"
      }
      aria-label="Unlink from token"
      onClick={() => {
        // Materialize the alias into a concrete value.
        onChangeValue(token.resolvedValue)
        setPicking(false)
      }}
    >
      <Unlink />
    </button>
  ) : (
    <button
      className="ghost"
      title="Reference another token instead of this value"
      aria-label="Link to token"
      onClick={() => setPicking(p => !p)}
    >
      <Link />
    </button>
  )

  const aliasPicker = (
    <div style={{ marginTop: 8 }}>
      <AliasPicker
        tokens={referenceCandidates}
        currentPath={token.path}
        currentType={token.type}
        selectedRef={token.reference}
        autoFocus
        onPick={reference => {
          onChangeValue(`{${reference}}`)
          setPicking(false)
        }}
      />
    </div>
  )

  return (
    <div style={{ padding: "14px 20px 24px" }}>
      <NodeHeader
        name={token.name}
        path={token.path}
        badge={
          <>
            <InheritedPill from={token.inheritedFrom} />
            <DeprecatedPill value={token.deprecated} />
          </>
        }
        below={
          <TypeSelect
            value={token.typeIsInherited ? undefined : token.type}
            inherited={token.typeIsInherited ? token.type : typeViaReference}
            from={typeViaReference ? "reference" : "group"}
            onChange={next => {
              // A fresh token has no type at all and still holds the bare 0
              // it was created with; give it a value the new type's editor
              // can work with. Typed tokens keep their value even when it
              // is 0. Both edits go in one intent so the host sequences them.
              const fill =
                next &&
                !token.type &&
                !token.isAlias &&
                isPlaceholderValue(token.value)
              onChangeType(next, fill ? defaultValueFor(next) : undefined)
            }}
          />
        }
        summary={resolvedText && <span className="mono">{resolvedText}</span>}
        onOpenPath={onOpenPath}
        onRename={onRename}
        onMove={onMove}
        onDelete={onDelete}
        onClose={onClose}
      />

      <Problems issues={issues} />

      <Preview token={token} />

      <Section label="Value" aside={linkButton}>
        {token.isAlias ? (
          <>
            <div className="ref-row">
              <button
                className="ref-chip"
                title="Pick a different token"
                onClick={() => setPicking(p => !p)}
              >
                <code>{token.reference}</code>
              </button>
              {token.resolvedValue !== undefined ? (
                <span className="resolved mono" title={resolvedText}>
                  <span className="arrow">→</span>
                  <Glyph value={token.resolvedValue} type={resolvedType} />
                  {resolvedText}
                </span>
              ) : (
                <span className="sev-error" style={{ fontSize: "0.9em" }}>
                  unresolved
                </span>
              )}
            </div>
            {picking && aliasPicker}
          </>
        ) : (
          <>
            {TypeEditor ? (
              <>
                <TypeEditor
                  value={value}
                  resolved={token.resolvedValue}
                  onChange={changeValue}
                />
                <AdvancedJson value={value} onChange={changeValue} />
              </>
            ) : (
              <RawJsonEditor value={value} onChange={changeValue} />
            )}
            {picking && aliasPicker}
          </>
        )}
      </Section>

      <Section label="Description">
        <TextInput
          key={token.path.join(".")}
          value={token.description ?? ""}
          placeholder="Optional $description"
          onCommit={onChangeDescription}
        />
      </Section>

      <DeprecatedField
        value={token.deprecated}
        onChange={onChangeDeprecated}
        replacements={replacements}
      />
    </div>
  )
}

const pretty = (v: unknown) => JSON.stringify(v, null, 2)

/** True when `text` parses to JSON that prints as `json`. */
const sameJson = (text: string, json: string) => {
  try {
    return pretty(JSON.parse(text)) === json
  } catch {
    return false
  }
}

/** Raw JSON editor used for any type without a dedicated editor. Untouched,
 *  it follows the value; edited, a change to the value underneath it is
 *  flagged and Save refused until the box is reloaded, so a save never puts
 *  back a value older than the current one. */
function RawJsonEditor({
  value,
  onChange,
}: {
  value: unknown
  onChange: (v: unknown) => void
}) {
  const current = pretty(value)
  // `base` is the value the text was last loaded from.
  const [base, setBase] = useState(current)
  const [text, setText] = useState(current)
  const [error, setError] = useState<string | null>(null)
  if (current !== base && (text === base || sameJson(text, current))) {
    setBase(current)
    setText(current)
  }
  const stale = current !== base
  return (
    <div>
      <textarea
        value={text}
        rows={Math.min(12, Math.max(3, text.split("\n").length))}
        spellCheck={false}
        onChange={e => setText(e.target.value)}
      />
      {stale && (
        <div
          style={{
            marginTop: 6,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ color: "var(--vscode-editorWarning-foreground)" }}>
            The value changed since you started editing.
          </span>
          <button
            className="secondary"
            onClick={() => {
              setBase(current)
              setText(current)
              setError(null)
            }}
          >
            Reload
          </button>
        </div>
      )}
      <div
        style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10 }}
      >
        <button
          disabled={stale}
          onClick={() => {
            try {
              const parsed = JSON.parse(text)
              setError(null)
              onChange(parsed)
            } catch {
              setError("Not valid JSON — fix before saving.")
            }
          }}
        >
          Save value
        </button>
        {error && (
          <span style={{ color: "var(--vscode-errorForeground)" }}>
            {error}
          </span>
        )}
      </div>
    </div>
  )
}

/** Collapsible raw-JSON escape hatch shown beneath a dedicated editor. */
function AdvancedJson({
  value,
  onChange,
}: {
  value: unknown
  onChange: (v: unknown) => void
}) {
  return (
    <details style={{ marginTop: 12 }}>
      <summary style={{ cursor: "pointer", opacity: 0.7, fontSize: "0.85em" }}>
        Edit as JSON
      </summary>
      <div style={{ marginTop: 8 }}>
        <RawJsonEditor value={value} onChange={onChange} />
      </div>
    </details>
  )
}
