/**
 * Small reusable, controlled form primitives shared by every type editor.
 *
 * Text/number inputs commit once typing pauses, and at once on blur or Enter,
 * so the table and the JSON follow along while you type. A pause — not every
 * keystroke — is one edit, which keeps the undo stack stepping through values
 * you actually stopped on. Selects commit immediately.
 */
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react"
import { isReference, referenceTarget, refPointer } from "../../core/parse"
import { Unlink } from "../icons"

/** How long typing must pause before a text or number input commits. */
export const COMMIT_DELAY_MS = 400

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
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  const pending = useRef<string | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latestCommit = useRef(commit)
  latestCommit.current = commit

  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])

  const flush = () => {
    clearTimeout(timer.current)
    if (pending.current === undefined) return
    const d = pending.current
    pending.current = undefined
    latestCommit.current(d)
  }

  useEffect(() => flush, [])

  return {
    draft,
    setDraft,
    flush,
    props: {
      value: draft,
      onFocus: () => {
        focused.current = true
      },
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        setDraft(e.target.value)
        pending.current = e.target.value
        clearTimeout(timer.current)
        timer.current = setTimeout(flush, COMMIT_DELAY_MS)
      },
    },
    blur: () => {
      focused.current = false
      flush()
    },
  }
}

export function Labeled({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

export function Row({
  children,
  gap = 8,
}: {
  children: ReactNode
  gap?: number
}) {
  return (
    <div style={{ display: "flex", gap, alignItems: "flex-end" }}>
      {children}
    </div>
  )
}

/** A swatch over the transparency checkerboard that opens the native color
 *  picker. `hex` may carry alpha (#rrggbbaa); the picker itself is opaque-only,
 *  so `onPick` gets #rrggbb and callers keep the token's own alpha. Clicks stop
 *  here so a table row doesn't also enter text edit.
 *
 *  A drag in the picker fires `input` on every step; the swatch previews
 *  those and `onPick` runs once, on the native `change` that ends the pick,
 *  so one pick is one edit. (React's onChange is the `input` event here.) */
export function ColorSwatchInput({
  hex,
  size,
  onPick,
  tabbable = true,
}: {
  hex: string
  size: number
  onPick: (hex: string) => void
  /** In the Tab order; the table passes false for every row but the selected one. */
  tabbable?: boolean
}) {
  const [dragging, setDragging] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const pick = useRef(onPick)
  pick.current = onPick
  useEffect(() => {
    const el = input.current!
    const commit = () => {
      setDragging(null)
      pick.current(el.value)
    }
    el.addEventListener("change", commit)
    return () => el.removeEventListener("change", commit)
  }, [])
  const shown = dragging ? dragging + hex.slice(7) : hex
  return (
    <span
      className="swatch picker"
      style={{ width: size, height: size }}
      title="Pick color"
    >
      <span style={{ background: shown }} />
      <input
        ref={input}
        type="color"
        value={shown.slice(0, 7)}
        aria-label="Pick color"
        tabIndex={tabbable ? 0 : -1}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onChange={e => setDragging(e.target.value)}
      />
    </span>
  )
}

/** A curly reference or a `{ "$ref": … }` pointer, rather than a value. */
export const isRef = (v: unknown): boolean =>
  isReference(v) || refPointer(v) !== undefined

/** A value that references another token, shown as that reference and never
 *  edited in place. Unlink writes `resolved`, what the reference resolves to;
 *  with nothing resolved (or only the reference itself back) it is disabled. */
export function RefValue({
  value,
  resolved,
  onChange,
}: {
  value: unknown
  resolved: unknown
  onChange: (value: unknown) => void
}) {
  const shown = isReference(value) ? referenceTarget(value) : refPointer(value)
  const unresolved = resolved === undefined || isRef(resolved)
  return (
    <div className="ref-row">
      <span
        className="ref-chip"
        style={{ cursor: "default" }}
        title="References another token"
      >
        <code>{shown}</code>
      </span>
      <button
        className="ghost"
        disabled={unresolved}
        title={
          unresolved
            ? "Unresolved: there is no value to unlink to"
            : "Use the value it resolves to instead of the reference"
        }
        aria-label="Unlink from token"
        onClick={() => onChange(resolved)}
      >
        <Unlink />
      </button>
    </div>
  )
}

export function TextInput({
  value,
  onCommit,
  placeholder,
  mono,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  const latest = useRef(value)
  latest.current = value
  const live = useLiveDraft(value, d => d !== latest.current && onCommit(d))
  return (
    <input
      className={mono ? "mono" : undefined}
      placeholder={placeholder}
      spellCheck={false}
      {...live.props}
      onBlur={live.blur}
      onKeyDown={e => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing)
          (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

export function NumberInput({
  value,
  onCommit,
  step = 1,
  min,
  max,
  width,
}: {
  value: number
  onCommit: (v: number) => void
  step?: number
  min?: number
  max?: number
  width?: number
}) {
  const latest = useRef(value)
  latest.current = value
  // "", "-" and "1e" are on the way to a number, not a number: skip them
  // while typing, and put the real value back if the field is left that way.
  const parse = (d: string) => (d.trim() === "" ? NaN : Number(d))
  const live = useLiveDraft(String(value), d => {
    const n = parse(d)
    if (!Number.isNaN(n) && n !== latest.current) onCommit(n)
  })
  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      style={width ? { width } : undefined}
      {...live.props}
      onBlur={() => {
        live.blur()
        if (Number.isNaN(parse(live.draft)))
          live.setDraft(String(latest.current))
      }}
      onKeyDown={e => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing)
          (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: readonly T[]
  onChange: (v: T) => void
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as T)}>
      {options.map(o => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

// ---- Composite-friendly value field types ----

export interface Dimension {
  value: number
  unit: "px" | "rem"
}

/** `{value, unit}`, the only shape the dimension and duration fields spread:
 *  anything else (a legacy "16px", a reference) would spread into garbage. */
const unitObject = <T,>(v: unknown): T | undefined =>
  v &&
  typeof v === "object" &&
  typeof (v as { value?: unknown }).value === "number"
    ? (v as T)
    : undefined

export function DimensionField({
  value,
  onChange,
}: {
  value: Dimension | undefined
  onChange: (d: Dimension) => void
}) {
  const dim = unitObject<Dimension>(value) ?? { value: 0, unit: "px" as const }
  return (
    <Row>
      <NumberInput
        value={dim.value}
        step={dim.unit === "rem" ? 0.25 : 1}
        width={90}
        onCommit={n => onChange({ ...dim, value: n })}
      />
      <Select
        value={dim.unit}
        options={["px", "rem"] as const}
        onChange={u => onChange({ ...dim, unit: u })}
      />
    </Row>
  )
}

export interface Duration {
  value: number
  unit: "ms" | "s"
}

export function DurationField({
  value,
  onChange,
}: {
  value: Duration | undefined
  onChange: (d: Duration) => void
}) {
  const dur = unitObject<Duration>(value) ?? { value: 0, unit: "ms" as const }
  return (
    <Row>
      <NumberInput
        value={dur.value}
        step={dur.unit === "s" ? 0.1 : 50}
        width={90}
        onCommit={n => onChange({ ...dur, value: n })}
      />
      <Select
        value={dur.unit}
        options={["ms", "s"] as const}
        onChange={u => onChange({ ...dur, unit: u })}
      />
    </Row>
  )
}
