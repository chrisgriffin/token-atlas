/** Header, section, and delete button shared by the token and group panels. */
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Close, ErrorIcon, Trash, TypeIcon, WarningIcon } from "../icons";
import {
  COMPOSITE_TYPES,
  PRIMITIVE_TYPES,
  type TokenType,
  type ValidationIssue,
} from "../../core/types";
import { replacementKey } from "../../core/validate";

interface HeaderProps {
  name: string;
  path: string[];
  /** Rendered after the name (pills). */
  badge?: ReactNode;
  /** Rendered under the name, first on the meta line (type select). */
  below?: ReactNode;
  /** Rendered after `below` on the meta line (resolved value, token count). */
  summary?: ReactNode;
  /** Opens the group at a parent path; the breadcrumb segments call it. */
  onOpenPath?: (path: string[]) => void;
  /** False refuses the name (a sibling has it): Enter keeps the box open. */
  onRename: (newName: string) => boolean | void;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Panel header, pinned to the top of the panel: a wrapping breadcrumb of the
 *  parent groups on its own line, close in the corner (it acts on the panel,
 *  not the node), the click-to-rename name beside the move and delete group,
 *  and the type and a value summary under the name. */
export function NodeHeader({
  name,
  path,
  badge,
  below,
  summary,
  onOpenPath,
  onRename,
  onMove,
  onDelete,
  onClose,
}: HeaderProps) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [bad, setBad] = useState(false);
  // Set once Enter or Escape has closed the box, so the blur that follows
  // neither renames again nor renames a cancelled draft.
  const closed = useRef(false);
  const startRename = () => {
    closed.current = false;
    setNameDraft(name);
    setBad(false);
    setRenaming(true);
  };
  /** Renames to the draft; false when the name is refused. */
  const submit = () => {
    const next = nameDraft.trim();
    return !next || next === name || onRename(next) !== false;
  };
  const close = () => {
    closed.current = true;
    setRenaming(false);
  };
  const parents = path.slice(0, -1);
  return (
    <header className="node-header">
      <nav className="node-header-path" aria-label="Path">
        {parents.map((segment, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="crumb-sep">/</span>}
            <button
              className="crumb"
              title={`Open ${parents.slice(0, i + 1).join(".")}`}
              onClick={() => onOpenPath?.(parents.slice(0, i + 1))}
            >
              {segment}
            </button>
          </Fragment>
        ))}
      </nav>
      <button
        className="node-header-close"
        onClick={onClose}
        title="Close (Esc)"
        aria-label="Close"
      >
        <Close />
      </button>
      <div className="node-header-row">
        <div className="node-header-name">
          {renaming ? (
            <input
              autoFocus
              className={`mono${bad ? " bad" : ""}`}
              value={nameDraft}
              onChange={(e) => {
                setNameDraft(e.target.value);
                setBad(false);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter") {
                  if (submit()) close();
                  else setBad(true);
                } else if (e.key === "Escape") {
                  // Cancels the rename only; the panel's own Escape closes it.
                  e.stopPropagation();
                  close();
                }
              }}
              onBlur={() => {
                if (!closed.current) submit(); // a refused name simply reverts
                setRenaming(false);
              }}
            />
          ) : (
            // The name is a button, so Tab reaches it and Enter or Space renames.
            <h2 onClick={startRename}>
              <button className="node-name" title="Click to rename">
                {name}
              </button>
            </h2>
          )}
          {badge}
        </div>
        <div className="btn-group" role="group" aria-label="Actions">
          <button
            className="ghost"
            onClick={() => onMove("up")}
            title="Move up"
            aria-label="Move up"
          >
            <ArrowUp />
          </button>
          <button
            className="ghost"
            onClick={() => onMove("down")}
            title="Move down"
            aria-label="Move down"
          >
            <ArrowDown />
          </button>
          <DeleteButton onDelete={onDelete} />
        </div>
      </div>
      {(below || summary) && (
        <div className="node-header-meta">
          {below}
          {below && summary && <span className="meta-sep">·</span>}
          {summary && <span className="node-header-summary">{summary}</span>}
        </div>
      )}
    </header>
  );
}

/** Two-step delete: first click arms it, second click within 3s deletes.
 *  (window.confirm is blocked inside VS Code webviews.) */
export function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={`ghost danger${armed ? " armed" : ""}`}
      title={armed ? "Click again to delete" : "Delete"}
      aria-label="Delete"
      onClick={() => (armed ? onDelete() : setArmed(true))}
    >
      <Trash />
      {armed && "Delete?"}
    </button>
  );
}

/** A labelled block of the panel form. `aside` sits at the right of the label
 *  row (the Value/Alias switch). */
export function Section({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 20 }}>
      <div className="section-head">
        <div className="eyebrow">{label}</div>
        {aside}
      </div>
      <div>{children}</div>
    </section>
  );
}

/** `$deprecated` editor: a checkbox, and an optional reason once checked.
 *  DTCG allows `true` or a string explaining what to use instead. Given
 *  `replacements`, a token can also name the one its uses should move to: the
 *  reason's first `{reference}` (spec 015), which the host writes. */
export function DeprecatedField({
  value,
  onChange,
  replacements,
}: {
  value: boolean | string | undefined;
  onChange: (next: boolean | string | undefined, replacement?: string) => void;
  /** Dotted paths of the tokens that may replace this one. */
  replacements?: string[];
}) {
  const on = value !== undefined && value !== false;
  const reason = typeof value === "string" ? value : "";
  const current = replacementKey(reason) ?? "";
  const options =
    current && replacements && !replacements.includes(current)
      ? [current, ...replacements]
      : replacements;
  return (
    <Section label="Deprecated">
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: on ? 6 : 0 }}>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked ? true : undefined)}
        />
        <span>Mark as deprecated</span>
      </label>
      {on && (
        <input
          key={reason}
          defaultValue={reason}
          placeholder="Reason or replacement, e.g. use {color.brand.primary}"
          onBlur={(e) => onChange(e.target.value.trim() || true)}
        />
      )}
      {on && options && (
        <select
          aria-label="Replacement"
          title="The token its uses should move to, written as the reason's first {reference}"
          value={current}
          style={{ marginTop: 6 }}
          onChange={(e) => onChange(reason, e.target.value)}
        >
          <option value="">No replacement</option>
          {options.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      )}
    </Section>
  );
}

/** This node's validation problems, at the top of its panel. */
export function Problems({ issues }: { issues?: ValidationIssue[] }) {
  if (!issues?.length) return null;
  return (
    <Section label="Problems">
      <ul className="problems">
        {issues.map((issue, i) => (
          <li key={i} className={`sev-${issue.severity}`}>
            {issue.severity === "error" ? <ErrorIcon /> : <WarningIcon />}
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function DeprecatedPill({ value }: { value: boolean | string | undefined }) {
  if (value === undefined || value === false) return null;
  return (
    <span className="pill deprecated" title={typeof value === "string" ? value : "Deprecated"}>
      deprecated
    </span>
  );
}

/** Marks a token a group has through `$extends`; editing it writes an override. */
export function InheritedPill({ from }: { from: string | undefined }) {
  if (!from) return null;
  return (
    <span
      className="pill"
      title={`Inherited from ${from} ($extends). Editing it writes an override here.`}
    >
      inherited
    </span>
  );
}

/** `$type` picker rendered as a pill. `inherited` names the type a token or
 *  group gets when it declares none: from an ancestor group, or for an alias
 *  from the token it references (`from`). */
export function TypeSelect({
  value,
  inherited,
  from = "group",
  onChange,
}: {
  value: TokenType | undefined;
  inherited?: TokenType;
  from?: "group" | "reference";
  onChange: (type: TokenType | undefined) => void;
}) {
  const shown = value ?? inherited;
  const source = from === "reference" ? "from the referenced token" : "inherited from a group";
  return (
    <span className="type-picker">
      <TypeIcon type={shown} />
      <select
        className={`pill type-select${value ? "" : " inherited"}`}
        value={value ?? ""}
        title={
          value
            ? "$type set here"
            : inherited
              ? `$type ${inherited}, ${source} — pick one to set it here`
              : "No $type — pick one"
        }
        aria-label="Token type"
        onChange={(e) => onChange((e.target.value || undefined) as TokenType | undefined)}
        style={{ opacity: shown ? undefined : 0.6 }}
      >
        <option value="">
          {inherited
            ? `${inherited} ${from === "reference" ? "(via alias)" : "(inherited)"}`
            : "untyped"}
        </option>
        <optgroup label="Primitive">
          {PRIMITIVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </optgroup>
        <optgroup label="Composite">
          {COMPOSITE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </optgroup>
      </select>
    </span>
  );
}
