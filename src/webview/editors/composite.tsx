/**
 * Editors for the DTCG composite types. Each reuses the primitive field
 * controls so sub-values stay consistent with standalone tokens.
 */
import type { EditorProps } from "./registry";
import {
  ColorSwatchInput,
  DimensionField,
  DurationField,
  Labeled,
  NumberInput,
  Row,
  Select,
  TextInput,
  type Dimension,
  type Duration,
} from "./fields";
import { CubicBezierEditor, FontWeightEditor } from "./primitive";
import { toHex } from "./color";

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** A compact color sub-field: swatch picker and hex text, writing a hex string.
 *  Picking keeps the existing alpha, which the native picker can't show. */
function ColorSubField({ value, onChange }: { value: unknown; onChange: (hex: string) => void }) {
  const hex = toHex(value) ?? "#000000";
  return (
    <Row>
      <ColorSwatchInput hex={hex} size={26} onPick={(picked) => onChange(picked + hex.slice(7))} />
      <TextInput mono value={hex} onCommit={(v) => onChange(v)} />
    </Row>
  );
}

// ---------- typography ----------
export function TypographyEditor({ value, onChange }: EditorProps) {
  const v = obj(value);
  const set = (k: string, val: unknown) => onChange({ ...v, [k]: val });
  return (
    <div>
      <Labeled label="Font family">
        <TextInput
          value={
            Array.isArray(v.fontFamily)
              ? (v.fontFamily as string[]).join(", ")
              : String(v.fontFamily ?? "")
          }
          placeholder="Inter, sans-serif"
          onCommit={(s) => {
            const parts = s
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);
            set("fontFamily", parts.length > 1 ? parts : (parts[0] ?? ""));
          }}
        />
      </Labeled>
      <Labeled label="Font size">
        <DimensionField
          value={v.fontSize as Dimension | undefined}
          onChange={(d) => set("fontSize", d)}
        />
      </Labeled>
      <Labeled label="Font weight">
        <FontWeightEditor value={v.fontWeight} onChange={(w) => set("fontWeight", w)} />
      </Labeled>
      <Labeled label="Letter spacing">
        <DimensionField
          value={v.letterSpacing as Dimension | undefined}
          onChange={(d) => set("letterSpacing", d)}
        />
      </Labeled>
      <Labeled label="Line height (number)">
        <NumberInput
          value={typeof v.lineHeight === "number" ? v.lineHeight : 1.2}
          step={0.05}
          onCommit={(n) => set("lineHeight", n)}
        />
      </Labeled>
    </div>
  );
}

// ---------- border ----------
const BORDER_STYLES = [
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "outset",
  "inset",
] as const;

export function BorderEditor({ value, onChange }: EditorProps) {
  const v = obj(value);
  const set = (k: string, val: unknown) => onChange({ ...v, [k]: val });
  return (
    <div>
      <Labeled label="Color">
        <ColorSubField value={v.color} onChange={(hex) => set("color", hex)} />
      </Labeled>
      <Labeled label="Width">
        <DimensionField
          value={v.width as Dimension | undefined}
          onChange={(d) => set("width", d)}
        />
      </Labeled>
      <Labeled label="Style">
        <Select
          value={
            (BORDER_STYLES as readonly string[]).includes(String(v.style))
              ? (v.style as (typeof BORDER_STYLES)[number])
              : "solid"
          }
          options={BORDER_STYLES}
          onChange={(s) => set("style", s)}
        />
      </Labeled>
    </div>
  );
}

// ---------- transition ----------
export function TransitionEditor({ value, onChange }: EditorProps) {
  const v = obj(value);
  const set = (k: string, val: unknown) => onChange({ ...v, [k]: val });
  return (
    <div>
      <Labeled label="Duration">
        <DurationField
          value={v.duration as Duration | undefined}
          onChange={(d) => set("duration", d)}
        />
      </Labeled>
      <Labeled label="Delay">
        <DurationField value={v.delay as Duration | undefined} onChange={(d) => set("delay", d)} />
      </Labeled>
      <Labeled label="Timing function (cubic Bézier)">
        <CubicBezierEditor value={v.timingFunction} onChange={(b) => set("timingFunction", b)} />
      </Labeled>
    </div>
  );
}

// ---------- strokeStyle ----------
const LINE_CAPS = ["butt", "round", "square"] as const;
const STROKE_KEYWORDS = [
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "outset",
  "inset",
] as const;

export function StrokeStyleEditor({ value, onChange }: EditorProps) {
  const isObject = value && typeof value === "object" && !Array.isArray(value);
  const mode = isObject ? "custom" : "keyword";
  return (
    <div>
      <Labeled label="Mode">
        <Select
          value={mode}
          options={["keyword", "custom"] as const}
          onChange={(m) =>
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
            onChange={(k) => onChange(k)}
          />
        </Labeled>
      ) : (
        <CustomStroke value={obj(value)} onChange={onChange} />
      )}
    </div>
  );
}

function CustomStroke({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (v: unknown) => void;
}) {
  const dashArray = Array.isArray(value.dashArray) ? (value.dashArray as Dimension[]) : [];
  const setDash = (next: Dimension[]) => onChange({ ...value, dashArray: next });
  return (
    <div>
      <Labeled label="Dash array">
        <div>
          {dashArray.map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <DimensionField
                value={d}
                onChange={(nd) => setDash(dashArray.map((x, j) => (j === i ? nd : x)))}
              />
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
      </Labeled>
      <Labeled label="Line cap">
        <Select
          value={
            (LINE_CAPS as readonly string[]).includes(String(value.lineCap))
              ? (value.lineCap as (typeof LINE_CAPS)[number])
              : "butt"
          }
          options={LINE_CAPS}
          onChange={(c) => onChange({ ...value, lineCap: c })}
        />
      </Labeled>
    </div>
  );
}

// ---------- shadow (single object or array of layers) ----------
type Shadow = Record<string, unknown>;

const emptyShadow = (): Shadow => ({
  color: "#000000",
  offsetX: { value: 0, unit: "px" },
  offsetY: { value: 2, unit: "px" },
  blur: { value: 4, unit: "px" },
  spread: { value: 0, unit: "px" },
  inset: false,
});

export function ShadowEditor({ value, onChange }: EditorProps) {
  const layers: Shadow[] = Array.isArray(value)
    ? (value as Shadow[])
    : value && typeof value === "object"
      ? [value as Shadow]
      : [emptyShadow()];

  const commit = (next: Shadow[]) => onChange(next.length === 1 ? next[0] : next);
  const setLayer = (i: number, layer: Shadow) =>
    commit(layers.map((l, j) => (j === i ? layer : l)));

  return (
    <div>
      {layers.map((layer, i) => {
        const set = (k: string, val: unknown) => setLayer(i, { ...layer, [k]: val });
        return (
          <div key={i} className="layer" style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: "0.85em", opacity: 0.8 }}>Layer {i + 1}</strong>
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
            <Labeled label="Color">
              <ColorSubField value={layer.color} onChange={(hex) => set("color", hex)} />
            </Labeled>
            <Row gap={12}>
              <Labeled label="Offset X">
                <DimensionField
                  value={layer.offsetX as Dimension}
                  onChange={(d) => set("offsetX", d)}
                />
              </Labeled>
              <Labeled label="Offset Y">
                <DimensionField
                  value={layer.offsetY as Dimension}
                  onChange={(d) => set("offsetY", d)}
                />
              </Labeled>
            </Row>
            <Row gap={12}>
              <Labeled label="Blur">
                <DimensionField value={layer.blur as Dimension} onChange={(d) => set("blur", d)} />
              </Labeled>
              <Labeled label="Spread">
                <DimensionField
                  value={layer.spread as Dimension}
                  onChange={(d) => set("spread", d)}
                />
              </Labeled>
            </Row>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.85em" }}>
              <input
                type="checkbox"
                checked={layer.inset === true}
                style={{ width: "auto" }}
                onChange={(e) => set("inset", e.target.checked)}
              />
              Inset
            </label>
          </div>
        );
      })}
      <button className="secondary" onClick={() => commit([...layers, emptyShadow()])}>
        + Add shadow layer
      </button>
    </div>
  );
}

// ---------- gradient (array of { color, position }) ----------
type Stop = { color?: unknown; position?: number };

export function GradientEditor({ value, onChange }: EditorProps) {
  const stops: Stop[] = Array.isArray(value) ? (value as Stop[]) : [];
  const commit = (next: Stop[]) => onChange(next);
  const setStop = (i: number, stop: Stop) => commit(stops.map((s, j) => (j === i ? stop : s)));

  return (
    <div>
      {stops.map((stop, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <Labeled label={`Stop ${i + 1} color`}>
              <ColorSubField
                value={stop.color}
                onChange={(hex) => setStop(i, { ...stop, color: hex })}
              />
            </Labeled>
          </div>
          <Labeled label="Position (0–1)">
            <NumberInput
              value={typeof stop.position === "number" ? stop.position : 0}
              step={0.05}
              min={0}
              max={1}
              width={90}
              onCommit={(n) => setStop(i, { ...stop, position: n })}
            />
          </Labeled>
          <button
            className="secondary"
            aria-label={`Remove stop ${i + 1}`}
            onClick={() => commit(stops.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        className="secondary"
        onClick={() => commit([...stops, { color: "#000000", position: stops.length ? 1 : 0 }])}
      >
        + Add stop
      </button>
    </div>
  );
}
