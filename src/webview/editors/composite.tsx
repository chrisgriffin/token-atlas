/**
 * Editors for the DTCG composite types. Each reuses the primitive field
 * controls so sub-values stay consistent with standalone tokens.
 *
 * Any sub-value may reference another token instead (`{a.b}` or a `$ref`);
 * `Field` shows those as the reference, so no control below ever reads or
 * spreads one as if it were a value.
 */
import type { ReactNode } from "react"
import type { EditorProps } from "./registry"
import {
  ColorSwatchInput,
  DimensionField,
  DurationField,
  isRef,
  Labeled,
  NumberInput,
  RefValue,
  Row,
  Select,
  TextInput,
  type Dimension,
  type Duration,
} from "./fields"
import { CubicBezierEditor, FontWeightEditor } from "./primitive"
import { buildFromHex, isDtcgColor, toHex } from "./color"
import { STROKE_KEYWORDS } from "../lib/css"
import { settings } from "../lib/settings"
import { starterColor } from "../lib/defaults"

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** One labelled sub-field: its control, or the reference it holds. Not a
 *  `<label>` around a reference, which would turn a click on the label text
 *  into a click on Unlink. */
function Field({
  label,
  value,
  resolved,
  onChange,
  children,
}: {
  label: string
  value: unknown
  resolved: unknown
  onChange: (value: unknown) => void
  children: ReactNode
}) {
  if (!isRef(value)) return <Labeled label={label}>{children}</Labeled>
  return (
    <div style={{ marginBottom: 10 }}>
      <span className="field-label">{label}</span>
      <RefValue value={value} resolved={resolved} onChange={onChange} />
    </div>
  )
}

/** `field(key, label, control)`: a `Field` for one of `v`'s sub-values. */
const fieldsOf =
  (
    v: Record<string, unknown>,
    r: Record<string, unknown>,
    set: (k: string, x: unknown) => void,
  ) =>
  (k: string, label: string, control: ReactNode) => (
    <Field
      key={k}
      label={label}
      value={v[k]}
      resolved={r[k]}
      onChange={x => set(k, x)}
    >
      {control}
    </Field>
  )

/** A compact color sub-field: swatch picker and hex text, writing a 2025.10
 *  colour object in the colour's own space (the configured one for a legacy
 *  string). Text that is not a colour writes nothing. Alpha digits left as
 *  shown keep the exact alpha, which the hex rounds and the native picker
 *  cannot show. */
function ColorSubField({
  value,
  onChange,
}: {
  value: unknown
  onChange: (c: unknown) => void
}) {
  const hex = toHex(value) ?? "#000000"
  const write = (input: string) => {
    const text = input.trim().toLowerCase()
    const space = isDtcgColor(value)
      ? value.colorSpace
      : settings().defaultColorSpace
    const next = buildFromHex(text, space)
    if (!next) return
    const keep =
      isDtcgColor(value) && text.slice(7) === hex.slice(7)
        ? value.alpha
        : undefined
    onChange(keep === undefined ? next : { ...next, alpha: keep })
  }
  return (
    <Row>
      <ColorSwatchInput
        hex={hex}
        size={26}
        onPick={picked => write(picked + hex.slice(7))}
      />
      <TextInput mono value={hex} onCommit={write} />
    </Row>
  )
}

// ---------- typography ----------
export function TypographyEditor({ value, onChange, resolved }: EditorProps) {
  const v = obj(value)
  const r = obj(resolved)
  const set = (k: string, val: unknown) => onChange({ ...v, [k]: val })
  const field = fieldsOf(v, r, set)
  return (
    <div>
      {field(
        "fontFamily",
        "Font family",
        <TextInput
          value={
            Array.isArray(v.fontFamily)
              ? (v.fontFamily as string[]).join(", ")
              : String(v.fontFamily ?? "")
          }
          placeholder="Inter, sans-serif"
          onCommit={s => {
            const parts = s
              .split(",")
              .map(p => p.trim())
              .filter(Boolean)
            set("fontFamily", parts.length > 1 ? parts : (parts[0] ?? ""))
          }}
        />,
      )}
      {field(
        "fontSize",
        "Font size",
        <DimensionField
          value={v.fontSize as Dimension | undefined}
          onChange={d => set("fontSize", d)}
        />,
      )}
      {field(
        "fontWeight",
        "Font weight",
        <FontWeightEditor
          value={v.fontWeight}
          onChange={w => set("fontWeight", w)}
        />,
      )}
      {field(
        "letterSpacing",
        "Letter spacing",
        <DimensionField
          value={v.letterSpacing as Dimension | undefined}
          onChange={d => set("letterSpacing", d)}
        />,
      )}
      {field(
        "lineHeight",
        "Line height (number)",
        <NumberInput
          value={typeof v.lineHeight === "number" ? v.lineHeight : 1.2}
          step={0.05}
          onCommit={n => set("lineHeight", n)}
        />,
      )}
    </div>
  )
}

// ---------- border ----------
export function BorderEditor({ value, onChange, resolved }: EditorProps) {
  const v = obj(value)
  const r = obj(resolved)
  const set = (k: string, val: unknown) => onChange({ ...v, [k]: val })
  const field = fieldsOf(v, r, set)
  return (
    <div>
      {field(
        "color",
        "Color",
        <ColorSubField value={v.color} onChange={c => set("color", c)} />,
      )}
      {field(
        "width",
        "Width",
        <DimensionField
          value={v.width as Dimension | undefined}
          onChange={d => set("width", d)}
        />,
      )}
      {field(
        "style",
        "Style",
        <Select
          value={
            (STROKE_KEYWORDS as readonly string[]).includes(String(v.style))
              ? (v.style as (typeof STROKE_KEYWORDS)[number])
              : "solid"
          }
          options={STROKE_KEYWORDS}
          onChange={s => set("style", s)}
        />,
      )}
    </div>
  )
}

// ---------- transition ----------
export function TransitionEditor({ value, onChange, resolved }: EditorProps) {
  const v = obj(value)
  const r = obj(resolved)
  const set = (k: string, val: unknown) => onChange({ ...v, [k]: val })
  const field = fieldsOf(v, r, set)
  return (
    <div>
      {field(
        "duration",
        "Duration",
        <DurationField
          value={v.duration as Duration | undefined}
          onChange={d => set("duration", d)}
        />,
      )}
      {field(
        "delay",
        "Delay",
        <DurationField
          value={v.delay as Duration | undefined}
          onChange={d => set("delay", d)}
        />,
      )}
      {field(
        "timingFunction",
        "Timing function (cubic Bézier)",
        <CubicBezierEditor
          value={v.timingFunction}
          onChange={b => set("timingFunction", b)}
        />,
      )}
    </div>
  )
}

// ---------- strokeStyle ----------
const LINE_CAPS = ["butt", "round", "square"] as const

export function StrokeStyleEditor({ value, onChange, resolved }: EditorProps) {
  const isObject = value && typeof value === "object" && !Array.isArray(value)
  const mode = isObject ? "custom" : "keyword"
  return (
    <div>
      <Labeled label="Mode">
        <Select
          value={mode}
          options={["keyword", "custom"] as const}
          onChange={m =>
            onChange(
              m === "keyword"
                ? "solid"
                : { dashArray: [{ value: 4, unit: "px" }], lineCap: "butt" },
            )
          }
        />
      </Labeled>
      {mode === "keyword" ? (
        <Labeled label="Keyword">
          <Select
            value={
              (STROKE_KEYWORDS as readonly string[]).includes(String(value))
                ? (value as (typeof STROKE_KEYWORDS)[number])
                : "solid"
            }
            options={STROKE_KEYWORDS}
            onChange={k => onChange(k)}
          />
        </Labeled>
      ) : (
        <CustomStroke
          value={obj(value)}
          resolved={obj(resolved)}
          onChange={onChange}
        />
      )}
    </div>
  )
}

function CustomStroke({
  value,
  resolved,
  onChange,
}: {
  value: Record<string, unknown>
  resolved: Record<string, unknown>
  onChange: (v: unknown) => void
}) {
  const dashArray = list(value.dashArray)
  const setDash = (next: unknown[]) => onChange({ ...value, dashArray: next })
  const setOne = (i: number, d: unknown) =>
    setDash(dashArray.map((x, j) => (j === i ? d : x)))
  // Not a <label>: it holds several controls, a reference's Unlink among them.
  return (
    <div>
      <Field
        label="Dash array"
        value={value.dashArray}
        resolved={resolved.dashArray}
        onChange={d => onChange({ ...value, dashArray: d })}
      >
        <div>
          {dashArray.map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              {isRef(d) ? (
                <RefValue
                  value={d}
                  resolved={list(resolved.dashArray)[i]}
                  onChange={x => setOne(i, x)}
                />
              ) : (
                <DimensionField
                  value={d as Dimension}
                  onChange={nd => setOne(i, nd)}
                />
              )}
              <button
                className="secondary"
                aria-label={`Remove dash ${i + 1}`}
                onClick={() => setDash(dashArray.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            className="secondary"
            onClick={() => setDash([...dashArray, { value: 4, unit: "px" }])}
          >
            + Add dash
          </button>
        </div>
      </Field>
      <Labeled label="Line cap">
        <Select
          value={
            (LINE_CAPS as readonly string[]).includes(String(value.lineCap))
              ? (value.lineCap as (typeof LINE_CAPS)[number])
              : "butt"
          }
          options={LINE_CAPS}
          onChange={c => onChange({ ...value, lineCap: c })}
        />
      </Labeled>
    </div>
  )
}

// ---------- shadow (single object or array of layers) ----------
type Shadow = Record<string, unknown>

const emptyShadow = (): Shadow => ({
  color: starterColor("#000000"),
  offsetX: { value: 0, unit: "px" },
  offsetY: { value: 2, unit: "px" },
  blur: { value: 4, unit: "px" },
  spread: { value: 0, unit: "px" },
  inset: false,
})

/** A shadow's layers: an array as it is, one object as a list of one. */
const layersOf = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []

export function ShadowEditor({ value, onChange, resolved }: EditorProps) {
  const written = layersOf(value)
  const layers = (written.length ? written : [emptyShadow()]) as Shadow[]
  const resolvedLayers = layersOf(resolved)

  const commit = (next: Shadow[]) =>
    onChange(next.length === 1 ? next[0] : next)
  const setLayer = (i: number, layer: Shadow) =>
    commit(layers.map((l, j) => (j === i ? layer : l)))

  return (
    <div>
      {layers.map((layer, i) => {
        const set = (k: string, val: unknown) =>
          setLayer(i, { ...layer, [k]: val })
        const r = obj(resolvedLayers[i])
        const field = fieldsOf(layer, r, set)
        return (
          <div key={i} className="layer" style={{ marginBottom: 10 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <strong style={{ fontSize: "0.85em", opacity: 0.8 }}>
                Layer {i + 1}
              </strong>
              {layers.length > 1 && (
                <button
                  className="secondary"
                  aria-label={`Remove layer ${i + 1}`}
                  onClick={() => commit(layers.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              )}
            </div>
            {isRef(layer) ? (
              <RefValue
                value={layer}
                resolved={resolvedLayers[i]}
                onChange={x =>
                  commit(layers.map((l, j) => (j === i ? (x as Shadow) : l)))
                }
              />
            ) : (
              <>
                {field(
                  "color",
                  "Color",
                  <ColorSubField
                    value={layer.color}
                    onChange={c => set("color", c)}
                  />,
                )}
                <Row gap={12}>
                  {(["offsetX", "offsetY"] as const).map(k =>
                    field(
                      k,
                      k === "offsetX" ? "Offset X" : "Offset Y",
                      <DimensionField
                        value={layer[k] as Dimension}
                        onChange={d => set(k, d)}
                      />,
                    ),
                  )}
                </Row>
                <Row gap={12}>
                  {(["blur", "spread"] as const).map(k =>
                    field(
                      k,
                      k === "blur" ? "Blur" : "Spread",
                      <DimensionField
                        value={layer[k] as Dimension}
                        onChange={d => set(k, d)}
                      />,
                    ),
                  )}
                </Row>
                <label
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    fontSize: "0.85em",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={layer.inset === true}
                    style={{ width: "auto" }}
                    onChange={e => set("inset", e.target.checked)}
                  />
                  Inset
                </label>
              </>
            )}
          </div>
        )
      })}
      <button
        className="secondary"
        onClick={() => commit([...layers, emptyShadow()])}
      >
        + Add shadow layer
      </button>
    </div>
  )
}

// ---------- gradient (array of { color, position }) ----------
type Stop = { color?: unknown; position?: unknown }

export function GradientEditor({ value, onChange, resolved }: EditorProps) {
  const stops = list(value) as Stop[]
  const resolvedStops = list(resolved)
  const commit = (next: unknown[]) => onChange(next)
  const setStop = (i: number, stop: unknown) =>
    commit(stops.map((s, j) => (j === i ? stop : s)))

  return (
    <div>
      {stops.map((stop, i) => {
        const r = obj(resolvedStops[i])
        const set = (k: keyof Stop, val: unknown) =>
          setStop(i, { ...stop, [k]: val })
        const remove = (
          <button
            className="secondary"
            aria-label={`Remove stop ${i + 1}`}
            onClick={() => commit(stops.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        )
        return (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              marginBottom: 8,
            }}
          >
            {isRef(stop) ? (
              <div style={{ flex: 1 }}>
                <span className="field-label">{`Stop ${i + 1}`}</span>
                <RefValue
                  value={stop}
                  resolved={resolvedStops[i]}
                  onChange={x => setStop(i, x)}
                />
              </div>
            ) : (
              <>
                <div style={{ flex: 1 }}>
                  <Field
                    label={`Stop ${i + 1} color`}
                    value={stop.color}
                    resolved={r.color}
                    onChange={x => set("color", x)}
                  >
                    <ColorSubField
                      value={stop.color}
                      onChange={c => set("color", c)}
                    />
                  </Field>
                </div>
                <Field
                  label="Position (0–1)"
                  value={stop.position}
                  resolved={r.position}
                  onChange={x => set("position", x)}
                >
                  <NumberInput
                    value={
                      typeof stop.position === "number" ? stop.position : 0
                    }
                    step={0.05}
                    min={0}
                    max={1}
                    width={90}
                    onCommit={n => set("position", n)}
                  />
                </Field>
              </>
            )}
            {remove}
          </div>
        )
      })}
      <button
        className="secondary"
        onClick={() =>
          commit([
            ...stops,
            { color: starterColor("#000000"), position: stops.length ? 1 : 0 },
          ])
        }
      >
        + Add stop
      </button>
    </div>
  )
}
