/**
 * Editors for the DTCG primitive types.
 */
import type { EditorProps } from "./registry";
import { FONT_WEIGHT_KEYWORDS } from "../../core/types";
import {
  ColorSwatchInput,
  DimensionField,
  DurationField,
  NumberInput,
  Row,
  Select,
  TextInput,
  type Dimension,
  type Duration,
} from "./fields";
import { WEIGHT_VALUES, weightCss, weightKeyword } from "../lib/css";
import {
  COLOR_SPACES,
  CHANNEL_LABELS,
  buildFromColor,
  buildFromComponents,
  buildFromHex,
  isDtcgColor,
  toColor,
  toHex,
  type DtcgColor,
} from "./color";

export function ColorEditor({ value, onChange }: EditorProps) {
  const color: DtcgColor = isDtcgColor(value)
    ? value
    : toColor(value)
      ? buildFromColor(toColor(value)!, "srgb")
      : { colorSpace: "srgb", components: [0, 0, 0] };

  const hex = toHex(color) ?? "#000000";
  const labels = CHANNEL_LABELS[color.colorSpace] ?? ["1", "2", "3"];

  const changeSpace = (space: string) => {
    const c = toColor(color);
    if (c) onChange(buildFromColor(c, space, color.alpha));
  };

  const changeHex = (h: string) => {
    const next = buildFromHex(h, color.colorSpace);
    if (next) onChange({ ...next, alpha: color.alpha });
  };

  const changeComponent = (i: number, n: number) => {
    const comps = [...color.components];
    comps[i] = n;
    const next = buildFromComponents(color.colorSpace, comps, color.alpha);
    if (next) onChange(next);
  };

  const changeAlpha = (a: number) => {
    const c = toColor(color);
    if (c) onChange(buildFromColor(c, color.colorSpace, Math.max(0, Math.min(1, a))));
  };

  return (
    <div>
      <Row gap={12}>
        <ColorSwatchInput hex={hex} size={30} onPick={changeHex} />
        <label style={{ width: 120 }}>
          <span className="field-label">Hex</span>
          <TextInput mono value={hex} onCommit={changeHex} />
        </label>
        <label>
          <span className="field-label">Color space</span>
          <Select value={color.colorSpace} options={COLOR_SPACES} onChange={changeSpace} />
        </label>
      </Row>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {color.components.map((comp, i) => (
          <label key={i}>
            <span className="field-label">{labels[i] ?? `c${i + 1}`}</span>
            <NumberInput value={comp} step={0.001} onCommit={(n) => changeComponent(i, n)} />
          </label>
        ))}
        <label>
          <span className="field-label">Alpha</span>
          <NumberInput
            value={color.alpha ?? 1}
            step={0.05}
            min={0}
            max={1}
            onCommit={changeAlpha}
          />
        </label>
      </div>
    </div>
  );
}

export function DimensionEditor({ value, onChange }: EditorProps) {
  return <DimensionField value={value as Dimension | undefined} onChange={(d) => onChange(d)} />;
}

export function NumberEditor({ value, onChange }: EditorProps) {
  return (
    <NumberInput
      value={typeof value === "number" ? value : 0}
      step={0.1}
      onCommit={(n) => onChange(n)}
    />
  );
}

export function DurationEditor({ value, onChange }: EditorProps) {
  return <DurationField value={value as Duration | undefined} onChange={(d) => onChange(d)} />;
}

export function FontFamilyEditor({ value, onChange }: EditorProps) {
  // DTCG allows a string or an array of strings (fallback stack).
  const isList = Array.isArray(value);
  const text = isList ? (value as string[]).join(", ") : typeof value === "string" ? value : "";
  return (
    <div>
      <TextInput
        value={text}
        placeholder="Inter, system-ui, sans-serif"
        onCommit={(v) => {
          const parts = v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          onChange(parts.length > 1 ? parts : (parts[0] ?? ""));
        }}
      />
      <div style={{ fontSize: "0.8em", opacity: 0.6, marginTop: 3 }}>
        Comma-separated for a fallback stack (stored as an array).
      </div>
    </div>
  );
}

/** Number and keyword stay in step: a keyword shows its weight, a number
 *  shows the keyword naming it, and an in-between weight shows "custom". */
export function FontWeightEditor({ value, onChange }: EditorProps) {
  const asNumber = weightCss(value) ?? 400;
  const keyword =
    typeof value === "string" && value in WEIGHT_VALUES ? value : weightKeyword(asNumber);
  return (
    <Row>
      <NumberInput
        value={asNumber}
        step={100}
        min={1}
        max={1000}
        width={100}
        onCommit={(n) => onChange(n)}
      />
      <select
        value={keyword ?? ""}
        aria-label="Weight keyword"
        onChange={(e) => onChange(e.target.value || asNumber)}
      >
        <option value="">custom</option>
        {FONT_WEIGHT_KEYWORDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    </Row>
  );
}

export function CubicBezierEditor({ value, onChange }: EditorProps) {
  const arr =
    Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === "number")
      ? (value as number[])
      : [0.25, 0.1, 0.25, 1];
  const labels = ["x1", "y1", "x2", "y2"];
  const change = (i: number, n: number) => {
    const next = [...arr];
    // DTCG 2025.10 bounds the x coordinates to [0, 1]; y may overshoot.
    next[i] = i % 2 === 0 ? Math.max(0, Math.min(1, n)) : n;
    onChange(next);
  };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {arr.map((n, i) => (
        <label key={i} style={{ flex: 1 }}>
          <span className="field-label">{labels[i]}</span>
          <NumberInput value={n} step={0.01} onCommit={(v) => change(i, v)} />
        </label>
      ))}
    </div>
  );
}
