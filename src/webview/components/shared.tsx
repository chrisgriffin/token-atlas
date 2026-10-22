/** Header, section, and delete button shared by the token and group panels. */
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Close, ErrorIcon, Trash, TypeIcon, WarningIcon } from "../icons";
import {
  COMPOSITE_TYPES,
  PRIMITIVE_TYPES,
  type TokenType,
  type ValidationIssue,
} from "../../core/types";

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
  onRename: (newName: string) => void;
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
  const startRename = () => {
    setNameDraft(name);
    setRenaming(true);
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
              className="mono"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setNameDraft(name);
                  setRenaming(false);
                }
              }}
              onBlur={() => {
                const next = nameDraft.trim();
                if (next && next !== name) onRename(next);
                setRenaming(false);
              }}
            />
          ) : (
            <h2 onClick={startRename} title="Click to rename">
              {name}
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
 *  DTCG allows `true` or a string explaining what to use instead. */
export function DeprecatedField({
  value,
  onChange,
}: {
  value: boolean | string | undefined;
  onChange: (next: boolean | string | undefined) => void;
}) {
  const on = value !== undefined && value !== false;
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
          defaultValue={typeof value === "string" ? value : ""}
          placeholder="Reason or replacement, e.g. use {color.brand.primary}"
          onBlur={(e) => onChange(e.target.value.trim() || true)}
        />
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
