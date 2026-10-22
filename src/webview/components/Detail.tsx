import { useMemo, useState } from "react";
import type { TokenNode, TokenType, ValidationIssue } from "../../core/types";
import { getEditor } from "../editors/registry";
import { summarize } from "../lib/css";
import { AliasPicker } from "./AliasPicker";
import { TextInput } from "../editors/fields";
import { Glyph } from "./Glyph";
import { Link, Unlink } from "../icons";
import { Preview } from "./Preview";
import {
  DeprecatedField,
  DeprecatedPill,
  InheritedPill,
  NodeHeader,
  Problems,
  Section,
  TypeSelect,
} from "./shared";
import { defaultValueFor, isPlaceholderValue } from "../lib/defaults";

interface DetailProps {
  token: TokenNode;
  allTokens: TokenNode[];
  externalTokens: TokenNode[];
  issues?: ValidationIssue[];
  onChangeValue: (value: unknown) => void;
  onChangeDescription: (description: string) => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
  onClose: () => void;
  /** Opens a group from the header's breadcrumb. */
  onOpenPath?: (path: string[]) => void;
  onChangeDeprecated: (deprecated: boolean | string | undefined) => void;
  onChangeType: (type: TokenType | undefined, starterValue?: unknown) => void;
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
  const [picking, setPicking] = useState(false);
  const referenceCandidates = useMemo(
    () => [...allTokens, ...externalTokens],
    [allTokens, externalTokens],
  );

  const TypeEditor = token.isAlias ? undefined : getEditor(token.type);
  const resolvedType = token.resolvedType ?? token.type;
  const resolvedText =
    token.resolvedValue === undefined ? "" : summarize(token.resolvedValue, resolvedType);
  // An alias with no $type of its own (none declared, none from a group)
  // takes the referenced token's type.
  const typeViaReference = !token.type && token.isAlias ? token.resolvedType : undefined;

  const linkButton = token.isAlias ? (
    <button
      className="ghost"
      title="Use the value it resolves to instead of the reference"
      aria-label="Unlink from token"
      onClick={() => {
        // Materialize the alias into a concrete value.
        onChangeValue(token.resolvedValue ?? "");
        setPicking(false);
      }}
    >
      <Unlink />
    </button>
  ) : (
    <button
      className="ghost"
      title="Reference another token instead of this value"
      aria-label="Link to token"
      onClick={() => setPicking((p) => !p)}
    >
      <Link />
    </button>
  );

  const aliasPicker = (
    <div style={{ marginTop: 8 }}>
      <AliasPicker
        tokens={referenceCandidates}
        currentPath={token.path}
        currentType={token.type}
        selectedRef={token.reference}
        autoFocus
        onPick={(reference) => {
          onChangeValue(`{${reference}}`);
          setPicking(false);
        }}
      />
    </div>
  );

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
            onChange={(next) => {
              // A fresh token has no type at all and still holds the bare 0
              // it was created with; give it a value the new type's editor
              // can work with. Typed tokens keep their value even when it
              // is 0. Both edits go in one intent so the host sequences them.
              const fill = next && !token.type && !token.isAlias && isPlaceholderValue(token.value);
              onChangeType(next, fill ? defaultValueFor(next) : undefined);
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
                onClick={() => setPicking((p) => !p)}
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
                <TypeEditor value={token.value} onChange={onChangeValue} />
                <AdvancedJson value={token.value} onChange={onChangeValue} />
              </>
            ) : (
              <RawJsonEditor value={token.value} onChange={onChangeValue} />
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

      <DeprecatedField value={token.deprecated} onChange={onChangeDeprecated} />
    </div>
  );
}

/** Raw JSON editor used for any type without a dedicated editor. */
function RawJsonEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <textarea
        value={text}
        rows={Math.min(12, Math.max(3, text.split("\n").length))}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
      />
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => {
            try {
              const parsed = JSON.parse(text);
              setError(null);
              onChange(parsed);
            } catch {
              setError("Not valid JSON — fix before saving.");
            }
          }}
        >
          Save value
        </button>
        {error && <span style={{ color: "var(--vscode-errorForeground)" }}>{error}</span>}
      </div>
    </div>
  );
}

/** Collapsible raw-JSON escape hatch shown beneath a dedicated editor. */
function AdvancedJson({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  return (
    <details style={{ marginTop: 12 }}>
      <summary style={{ cursor: "pointer", opacity: 0.7, fontSize: "0.85em" }}>
        Edit as JSON
      </summary>
      <div style={{ marginTop: 8 }}>
        <RawJsonEditor value={value} onChange={onChange} />
      </div>
    </details>
  );
}
