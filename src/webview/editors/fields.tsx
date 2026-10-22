/**
 * Small reusable, controlled form primitives shared by every type editor.
 *
 * Text/number inputs commit once typing pauses, and at once on blur or Enter,
 * so the table and the JSON follow along while you type. A pause — not every
 * keystroke — is one edit, which keeps the undo stack stepping through values
 * you actually stopped on. Selects commit immediately.
 */
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";

/** How long typing must pause before a text or number input commits. */
export const COMMIT_DELAY_MS = 400;

/**
 * Draft state for an input that commits while typing. `commit` receives the
 * draft and decides whether it is worth writing.
 *
 * While the input has focus the draft is left alone when `value` changes: the
 * change is usually this input's own commit coming back, and resyncing would
 * rewrite what is being typed ("1." becoming "1"). A pending commit is flushed,
 * not dropped, when the input unmounts — switching tokens mid-word keeps the
 * word.
 */
function useLiveDraft(value: string, commit: (draft: string) => void) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const pending = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestCommit = useRef(commit);
  latestCommit.current = commit;

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current === undefined) return;
    const d = pending.current;
    pending.current = undefined;
    latestCommit.current(d);
  };

  useEffect(() => flush, []);

  return {
    draft,
    setDraft,
    flush,
    props: {
      value: draft,
      onFocus: () => {
        focused.current = true;
      },
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        setDraft(e.target.value);
        pending.current = e.target.value;
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, COMMIT_DELAY_MS);
      },
    },
    blur: () => {
      focused.current = false;
      flush();
    },
  };
}

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function Row({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  return <div style={{ display: "flex", gap, alignItems: "flex-end" }}>{children}</div>;
}

/** A swatch over the transparency checkerboard that opens the native color
 *  picker. `hex` may carry alpha (#rrggbbaa); the picker itself is opaque-only,
 *  so `onPick` gets #rrggbb and callers keep the token's own alpha. Clicks stop
 *  here so a table row doesn't also enter text edit. */
export function ColorSwatchInput({
  hex,
  size,
  onPick,
}: {
  hex: string;
  size: number;
  onPick: (hex: string) => void;
}) {
  return (
    <span className="swatch picker" style={{ width: size, height: size }} title="Pick color">
      <span style={{ background: hex }} />
      <input
        type="color"
        value={hex.slice(0, 7)}
        aria-label="Pick color"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => onPick(e.target.value)}
      />
    </span>
  );
}

export function TextInput({
  value,
  onCommit,
  placeholder,
  mono,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  const latest = useRef(value);
  latest.current = value;
  const live = useLiveDraft(value, (d) => d !== latest.current && onCommit(d));
  return (
    <input
      className={mono ? "mono" : undefined}
      placeholder={placeholder}
      spellCheck={false}
      {...live.props}
      onBlur={live.blur}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function NumberInput({
  value,
  onCommit,
  step = 1,
  min,
  max,
  width,
}: {
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  width?: number;
}) {
  const latest = useRef(value);
  latest.current = value;
  // "", "-" and "1e" are on the way to a number, not a number: skip them
  // while typing, and put the real value back if the field is left that way.
  const parse = (d: string) => (d.trim() === "" ? NaN : Number(d));
  const live = useLiveDraft(String(value), (d) => {
    const n = parse(d);
    if (!Number.isNaN(n) && n !== latest.current) onCommit(n);
  });
  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      style={width ? { width } : undefined}
      {...live.props}
      onBlur={() => {
        live.blur();
        if (Number.isNaN(parse(live.draft))) live.setDraft(String(latest.current));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// ---- Composite-friendly value field types ----

export interface Dimension {
  value: number;
  unit: "px" | "rem";
}

export function DimensionField({
  value,
  onChange,
}: {
  value: Dimension | undefined;
  onChange: (d: Dimension) => void;
}) {
  const dim = value ?? { value: 0, unit: "px" as const };
  return (
    <Row>
      <NumberInput
        value={dim.value}
        step={dim.unit === "rem" ? 0.25 : 1}
        width={90}
        onCommit={(n) => onChange({ ...dim, value: n })}
      />
      <Select
        value={dim.unit}
        options={["px", "rem"] as const}
        onChange={(u) => onChange({ ...dim, unit: u })}
      />
    </Row>
  );
}

export interface Duration {
  value: number;
  unit: "ms" | "s";
}

export function DurationField({
  value,
  onChange,
}: {
  value: Duration | undefined;
  onChange: (d: Duration) => void;
}) {
  const dur = value ?? { value: 0, unit: "ms" as const };
  return (
    <Row>
      <NumberInput
        value={dur.value}
        step={dur.unit === "s" ? 0.1 : 50}
        width={90}
        onCommit={(n) => onChange({ ...dur, value: n })}
      />
      <Select
        value={dur.unit}
        options={["ms", "s"] as const}
        onChange={(u) => onChange({ ...dur, unit: u })}
      />
    </Row>
  );
}
