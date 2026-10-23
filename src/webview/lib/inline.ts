/**
 * Parse text typed into a table cell back into a token value. Returns
 * `undefined` when the text cannot be read as the token's type, so the cell
 * can refuse the edit instead of writing garbage.
 */
import { buildFromHex, isDtcgColor } from "../../core/color";
import { FONT_WEIGHT_KEYWORDS } from "../../core/types";
import type { EditorSettings } from "../../shared/protocol";
import { settings as currentSettings } from "./settings";
import { STROKE_KEYWORDS } from "./css";

const num = (s: string): number | undefined => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) ? n : undefined;
};

const json = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

const unitValue = (s: string, units: string[]) => {
  const m = s.trim().match(/^(-?\d*\.?\d+)\s*([a-z]+)$/i);
  if (!m || !units.includes(m[2])) return undefined;
  return { value: Number(m[1]), unit: m[2] };
};

export function parseInline(
  text: string,
  type: string | undefined,
  current: unknown,
  s: EditorSettings = currentSettings(),
): unknown {
  const t = text.trim();
  if (t === "") return undefined;
  // `{path.to.token}` is an alias regardless of type; `{"key": …}` is JSON.
  if (/^\{[^{}]+\}$/.test(t) && json(t) === undefined) return t;
  switch (type) {
    case "color": {
      const space = isDtcgColor(current) ? current.colorSpace : s.defaultColorSpace;
      return buildFromHex(t, space) ?? undefined;
    }
    case "dimension":
      return unitValue(t, ["px", "rem"]);
    case "duration":
      return unitValue(t, ["ms", "s"]);
    case "number":
      return num(t);
    case "fontWeight":
      return num(t) ?? ((FONT_WEIGHT_KEYWORDS as readonly string[]).includes(t) ? t : undefined);
    case "fontFamily": {
      const parts = t
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      return parts.length > 1 ? parts : parts[0];
    }
    case "cubicBezier": {
      const m = t.match(/^(?:cubic-bezier\()?\s*([^()]+?)\s*\)?$/);
      const nums = m ? m[1].split(",").map((s) => num(s)) : [];
      return nums.length === 4 && nums.every((n) => n !== undefined) ? nums : undefined;
    }
    case "strokeStyle": {
      if ((STROKE_KEYWORDS as readonly string[]).includes(t)) return t;
      const custom = json(t);
      return custom && typeof custom === "object" && !Array.isArray(custom) ? custom : undefined;
    }
    default:
      // Composite / unknown types take JSON; plain strings otherwise.
      return json(t) ?? (type === undefined ? t : undefined);
  }
}
