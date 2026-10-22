/**
 * DTCG 2025.10 color model helpers, backed by colorjs.io.
 *
 * Pure TS (no DOM, no vscode) so both the webview editors and the host's
 * DocumentColorProvider share one implementation. The spec color value is an
 * object: { colorSpace, components, alpha?, hex? }. colorjs handles gamut and
 * cross-space conversions; this module maps DTCG colorSpace names to colorjs
 * space ids and shapes results back into DTCG objects.
 */
import Color from "colorjs.io";

export const COLOR_SPACES = [
  "srgb",
  "srgb-linear",
  "hsl",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "display-p3",
  "a98-rgb",
  "prophoto-rgb",
  "rec2020",
  "xyz-d65",
  "xyz-d50",
] as const;

export type DtcgColorSpace = (typeof COLOR_SPACES)[number];

export const CHANNEL_LABELS: Record<string, string[]> = {
  srgb: ["R", "G", "B"],
  "srgb-linear": ["R", "G", "B"],
  hsl: ["H", "S", "L"],
  hwb: ["H", "W", "B"],
  lab: ["L", "a", "b"],
  lch: ["L", "C", "H"],
  oklab: ["L", "a", "b"],
  oklch: ["L", "C", "H"],
  "display-p3": ["R", "G", "B"],
  "a98-rgb": ["R", "G", "B"],
  "prophoto-rgb": ["R", "G", "B"],
  rec2020: ["R", "G", "B"],
  "xyz-d65": ["X", "Y", "Z"],
  "xyz-d50": ["X", "Y", "Z"],
};

const TO_COLORJS: Record<string, string> = {
  srgb: "srgb",
  "srgb-linear": "srgb-linear",
  hsl: "hsl",
  hwb: "hwb",
  lab: "lab",
  lch: "lch",
  oklab: "oklab",
  oklch: "oklch",
  "display-p3": "p3",
  "a98-rgb": "a98rgb",
  "prophoto-rgb": "prophoto",
  rec2020: "rec2020",
  "xyz-d65": "xyz-d65",
  "xyz-d50": "xyz-d50",
};

export interface DtcgColor {
  colorSpace: string;
  components: number[];
  alpha?: number;
  hex?: string;
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function isDtcgColor(v: unknown): v is DtcgColor {
  return (
    !!v &&
    typeof v === "object" &&
    "colorSpace" in (v as Record<string, unknown>) &&
    Array.isArray((v as DtcgColor).components)
  );
}

function colorjsId(space: string): string {
  return TO_COLORJS[space] ?? "srgb";
}

function num(n: number): number {
  // Coords colorjs parsed from a CSS string are `Number` objects, not primitives.
  const v = Number(n);
  if (Number.isNaN(v)) return 0;
  return Math.round(v * 10000) / 10000;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Parse any token color value into a colorjs Color, or null. */
export function toColor(value: unknown): Color | null {
  try {
    if (typeof value === "string") return new Color(value);
    if (isDtcgColor(value)) {
      const coords = value.components.map((c) => (typeof c === "number" ? c : 0)) as [
        number,
        number,
        number,
      ];
      return new Color(colorjsId(value.colorSpace), coords, value.alpha ?? 1);
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** An sRGB hex string for swatches / native color inputs, or null. */
export function toHex(value: unknown): string | null {
  const c = toColor(value);
  if (!c) return null;
  try {
    // collapse:false keeps full #rrggbb — required by <input type="color">.
    return c.to("srgb").toString({ format: "hex", collapse: false });
  } catch {
    return null;
  }
}

/** Convert a token color value to clamped sRGB RGBA in 0..1 (for vscode.Color). */
export function toRgba01(value: unknown): Rgba | null {
  const c = toColor(value);
  if (!c) return null;
  try {
    const srgb = c.to("srgb");
    const [r, g, b] = srgb.coords;
    return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: srgb.alpha ?? 1 };
  } catch {
    return null;
  }
}

/** Build a DTCG color from sRGB RGBA (0..1), expressed in `colorSpace`. */
export function fromRgba01(rgba: Rgba, colorSpace: string): DtcgColor | null {
  try {
    const c = new Color("srgb", [rgba.r, rgba.g, rgba.b], rgba.a);
    return buildFromColor(c, colorSpace, rgba.a);
  } catch {
    return null;
  }
}

/** An sRGB hex string (#rrggbb / #rrggbbaa) from RGBA 0..1. */
export function rgba01ToHex(rgba: Rgba): string {
  try {
    return new Color("srgb", [rgba.r, rgba.g, rgba.b], rgba.a).toString({
      format: "hex",
      collapse: false,
    });
  } catch {
    return "#000000";
  }
}

export interface CssColorStrings {
  hex: string;
  rgb: string;
  hsl: string;
  hwb: string;
  oklch: string;
}

/**
 * CSS serializations of a token color value, for hovers and docs.
 * Hand-formatted for readability: RGB channels as 0–255 integers, hues in
 * whole degrees, percentages whole — only OKLCH chroma keeps 3 decimals
 * (its useful range is ~0–0.4).
 */
export function cssColorStrings(value: unknown): CssColorStrings | null {
  const c = toColor(value);
  if (!c) return null;
  try {
    const alpha = c.alpha ?? 1;
    const suffix = alpha < 1 ? ` / ${Math.round(alpha * 100)}%` : "";
    // sRGB-based notations need an in-gamut color: a P3/OKLCH value outside
    // sRGB otherwise yields nonsense like `hsl(157 297% 21%)`.
    const inSrgb = c.to("srgb").toGamut({ space: "srgb" });
    const [r, g, b] = inSrgb.coords.map(to255);
    const [hslH, hslS, hslL] = inSrgb.to("hsl").coords;
    const [hwbH, hwbW, hwbB] = inSrgb.to("hwb").coords;
    const [okL, okC, okH] = c.to("oklch").coords;
    return {
      hex: c.to("srgb").toString({ format: "hex", collapse: false }),
      rgb: `rgb(${r} ${g} ${b}${suffix})`,
      hsl: `hsl(${deg(hslH)} ${pct(hslS)} ${pct(hslL)}${suffix})`,
      hwb: `hwb(${deg(hwbH)} ${pct(hwbW)} ${pct(hwbB)}${suffix})`,
      oklch: `oklch(${pct(okL * 100)} ${dec3(okC)} ${deg(okH)}${suffix})`,
    };
  } catch {
    return null;
  }
}

function to255(n: number): number {
  return Math.max(0, Math.min(255, Math.round((Number.isNaN(n) ? 0 : n) * 255)));
}
function deg(n: number): number {
  return Number.isNaN(n) ? 0 : Math.round(n);
}
function pct(n: number): string {
  return `${Number.isNaN(n) ? 0 : Math.round(n)}%`;
}
function dec3(n: number): number {
  return Number.isNaN(n) ? 0 : Math.round(n * 1000) / 1000;
}

/** Build a DTCG color object in `colorSpace` from a source color + optional alpha. */
export function buildFromColor(source: Color, colorSpace: string, alpha?: number): DtcgColor {
  const converted = source.to(colorjsId(colorSpace));
  const a = alpha ?? source.alpha ?? 1;
  const out: DtcgColor = {
    colorSpace,
    components: converted.coords.map(num),
  };
  if (a !== 1) out.alpha = num(a);
  out.hex = converted.to("srgb").toString({ format: "hex", collapse: false });
  return out;
}

/**
 * A DTCG color from any CSS color string colorjs reads (hex, `rgb()`,
 * `oklch()`, named …), kept in its own space when DTCG has that space, else
 * sRGB. Null when the string is not a color.
 */
export function fromCssColor(text: string): DtcgColor | null {
  try {
    const source = new Color(text);
    const space = COLOR_SPACES.find((s) => TO_COLORJS[s] === source.space.id) ?? "srgb";
    return buildFromColor(source, space);
  } catch {
    return null;
  }
}

/** Build a DTCG color from an sRGB hex string, expressed in `colorSpace`. */
export function buildFromHex(hex: string, colorSpace: string): DtcgColor | null {
  try {
    return buildFromColor(new Color(hex), colorSpace);
  } catch {
    return null;
  }
}

/** Build a DTCG color from explicit components in a space. */
export function buildFromComponents(
  colorSpace: string,
  components: number[],
  alpha?: number,
): DtcgColor | null {
  try {
    const c = new Color(colorjsId(colorSpace), components as [number, number, number], alpha ?? 1);
    return buildFromColor(c, colorSpace, alpha);
  } catch {
    return null;
  }
}

/**
 * WCAG 2.1 contrast ratio between two token color values (1..21), or null.
 * Truncated, not rounded, to 2 decimals: WCAG judges the exact ratio, so
 * 4.496 must read 4.49 and fail AA rather than read 4.5 and pass.
 */
export function wcagContrast(value: unknown, against: unknown): number | null {
  const a = toColor(value);
  const b = toColor(against);
  if (!a || !b) return null;
  try {
    // The epsilon keeps a float like 20.999999999 from truncating to 20.99.
    return Math.floor(a.contrast(b, "WCAG21") * 100 + 1e-6) / 100;
  } catch {
    return null;
  }
}

/** Every WCAG 2.2 contrast threshold, keyed by the `tokenAtlas.contrastTarget` value. */
export const CONTRAST_TARGETS = {
  AA: { label: "AA", min: 4.5 }, // 1.4.3, normal text
  "AA-large": { label: "AA large text", min: 3 }, // 1.4.3, 18pt or 14pt bold
  AAA: { label: "AAA", min: 7 }, // 1.4.6, normal text
  "AAA-large": { label: "AAA large text", min: 4.5 }, // 1.4.6, 18pt or 14pt bold
  "non-text": { label: "AA non-text", min: 3 }, // 1.4.11, UI components and graphics
} as const;
export type ContrastTarget = keyof typeof CONTRAST_TARGETS;

/**
 * The target a setting names, or AA for any value outside `CONTRAST_TARGETS`:
 * VS Code hands a hand-typed `"aa"` or `"AA large"` through `get()` unchecked.
 */
export const toContrastTarget = (value: unknown): ContrastTarget =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(CONTRAST_TARGETS, value)
    ? (value as ContrastTarget)
    : "AA";

/** Whether a ratio from `wcagContrast` meets a target. */
export const meetsContrast = (ratio: number, target: ContrastTarget): boolean =>
  ratio >= CONTRAST_TARGETS[target].min;
