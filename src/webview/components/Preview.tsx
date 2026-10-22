/**
 * Rendered preview of a token's resolved value, shown above the editor so a
 * shadow is seen as a shadow and not as eight number boxes.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import type { TokenNode } from "../../core/types";
import {
  CONTRAST_TARGETS,
  cssColorStrings,
  meetsContrast,
  toContrastTarget,
  wcagContrast,
} from "../../core/color";
import { col, dim, familyCss, gradientCss, obj, shadowCss, weightCss } from "../lib/css";
import { dimensionConversions } from "../../core/units";
import { settings } from "../lib/settings";

const SAMPLE = "The quick brown fox jumps over the lazy dog";

type Backdrop = "theme" | "light" | "dark";
const BACKDROPS: Backdrop[] = ["theme", "light", "dark"];

/** Stage colors per backdrop: `ground` behind the sample, `surface` for a card
 *  sitting on it (shadow previews), `ink` for text. */
const STAGE: Record<Backdrop, { ground: string; surface: string; ink: string }> = {
  theme: {
    ground: "var(--vscode-editor-background)",
    // Widget background is near-identical to the editor in stock themes.
    surface: "color-mix(in srgb, var(--vscode-foreground) 12%, var(--vscode-editor-background))",
    ink: "var(--vscode-editor-foreground, var(--vscode-foreground))",
  },
  light: { ground: "#f4f4f5", surface: "#ffffff", ink: "#18181b" },
  dark: { ground: "#18181b", surface: "#27272a", ink: "#f4f4f5" },
};

// Kept across tokens for the session: the panel remounts per token, and the
// backdrop someone picked should not reset on every selection.
let lastBackdrop: Backdrop = "theme";

export function Preview({ token }: { token: TokenNode }) {
  const [backdrop, setBackdropState] = useState<Backdrop>(lastBackdrop);
  const setBackdrop = (b: Backdrop) => {
    lastBackdrop = b;
    setBackdropState(b);
  };
  const stage = STAGE[backdrop];
  const value = token.resolvedValue ?? token.value;
  const type = token.resolvedType ?? token.type;
  if (value === undefined || value === null) return null;

  /** A preview whose look depends on what it sits on, with a backdrop switch. */
  const staged = (content: ReactNode, style?: CSSProperties) => (
    <div className="preview staged">
      <div className="backdrop-switch" role="radiogroup" aria-label="Preview backdrop">
        {BACKDROPS.map((b) => (
          <button
            key={b}
            role="radio"
            aria-checked={backdrop === b}
            className={backdrop === b ? "active" : ""}
            onClick={() => setBackdrop(b)}
          >
            {b[0].toUpperCase() + b.slice(1)}
          </button>
        ))}
      </div>
      <div className="stage" style={{ background: stage.ground, color: stage.ink, ...style }}>
        {content}
      </div>
    </div>
  );

  switch (type) {
    case "color": {
      const css = cssColorStrings(value);
      if (!css) return null;
      // VS Code sets its theme colours inline on <html>. Read at render, so a
      // theme switch shows on the next selection, not live.
      const editorBg = document.documentElement.style
        .getPropertyValue("--vscode-editor-background")
        .trim();
      const onEditor = editorBg ? wcagContrast(value, editorBg) : null;
      return (
        <div className="preview">
          <span className="swatch" style={{ width: 56, height: 56, borderRadius: 6 }}>
            <span style={{ background: css.hex }} />
          </span>
          <div className="meta">
            <code>{css.hex}</code>
            <code>{css.oklch}</code>
            <span className="contrast">
              <Contrast label="on white" ratio={wcagContrast(value, "#ffffff")} />
              <Contrast label="on black" ratio={wcagContrast(value, "#000000")} />
              {onEditor !== null && <Contrast label="on editor" ratio={onEditor} />}
            </span>
          </div>
        </div>
      );
    }
    case "typography": {
      const v = obj(value);
      const style: CSSProperties = {
        fontFamily: familyCss(v.fontFamily),
        fontSize: dim(v.fontSize) ?? undefined,
        fontWeight: weightCss(v.fontWeight),
        letterSpacing: dim(v.letterSpacing) ?? undefined,
        lineHeight: typeof v.lineHeight === "number" ? v.lineHeight : undefined,
        margin: 0,
        overflowWrap: "anywhere",
      };
      return staged(<p style={style}>{SAMPLE}</p>);
    }
    case "fontFamily":
    case "fontWeight": {
      const style: CSSProperties =
        type === "fontFamily"
          ? { fontFamily: familyCss(value), fontSize: 20 }
          : { fontWeight: weightCss(value), fontSize: 20 };
      return staged(
        <p style={{ ...style, margin: 0, whiteSpace: "nowrap", overflow: "hidden" }}>{SAMPLE}</p>,
      );
    }
    case "shadow":
      return staged(
        <div
          style={{
            width: 120,
            height: 56,
            borderRadius: 8,
            background: stage.surface,
            boxShadow: shadowCss(value),
          }}
        />,
        { padding: 24 },
      );
    case "border": {
      const v = obj(value);
      return staged(
        <div
          style={{
            width: 120,
            height: 48,
            borderRadius: 6,
            border: `${dim(v.width) ?? "1px"} ${typeof v.style === "string" ? v.style : "solid"} ${col(v.color)}`,
          }}
        />,
        { padding: 20 },
      );
    }
    case "gradient": {
      const css = gradientCss(value);
      if (!css) return null;
      return (
        <div className="preview">
          <span className="swatch" style={{ flex: 1, height: 40 }}>
            <span style={{ background: css }} />
          </span>
        </div>
      );
    }
    case "dimension": {
      const css = dim(value);
      if (!css) return null;
      const root = settings().rootFontSize;
      const conv = dimensionConversions(value, root);
      return (
        <div className="preview">
          <div style={{ flex: 1 }}>
            <div
              style={{
                height: 8,
                width: css,
                maxWidth: "100%",
                background: "var(--vscode-focusBorder)",
                borderRadius: 2,
              }}
            />
          </div>
          <code>{conv ? `${conv.px} · ${conv.rem}` : css}</code>
        </div>
      );
    }
    case "cubicBezier":
    case "transition": {
      const bez = type === "transition" ? obj(value).timingFunction : value;
      if (!Array.isArray(bez) || bez.length !== 4) return null;
      const [x1, y1, x2, y2] = bez.map((n) => (typeof n === "number" ? n : 0));
      const S = 64;
      const px = (x: number) => x * S;
      const py = (y: number) => S - y * S;
      const t = type === "transition" ? obj(value) : null;
      return (
        <div className="preview">
          <svg
            width={S}
            height={S}
            viewBox={`-2 -2 ${S + 4} ${S + 4}`}
            style={{ overflow: "visible", flexShrink: 0 }}
          >
            <line
              x1={0}
              y1={S}
              x2={px(x1)}
              y2={py(y1)}
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeDasharray="2 2"
            />
            <line
              x1={S}
              y1={0}
              x2={px(x2)}
              y2={py(y2)}
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeDasharray="2 2"
            />
            <path
              d={`M0 ${S} C ${px(x1)} ${py(y1)}, ${px(x2)} ${py(y2)}, ${S} 0`}
              fill="none"
              stroke="var(--vscode-focusBorder)"
              strokeWidth={2}
            />
          </svg>
          <div className="meta">
            <code>cubic-bezier({[x1, y1, x2, y2].join(", ")})</code>
            {t && (
              <span>
                {dim(t.duration) ?? "—"}
                {t.delay ? ` · delay ${dim(t.delay)}` : ""}
              </span>
            )}
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

/** A contrast ratio with its verdict against `tokenAtlas.contrastTarget`. */
function Contrast({ label, ratio }: { label: string; ratio: number | null }) {
  if (ratio === null) return <span>{label} —</span>;
  const target = toContrastTarget(settings().contrastTarget);
  const { label: level, min } = CONTRAST_TARGETS[target];
  const ok = meetsContrast(ratio, target);
  return (
    <span title={`WCAG ${level} needs ${min}:1; this is ${ratio}:1`}>
      {ratio} {label}{" "}
      <span className={`level ${ok ? "pass" : "fail"}`}>
        {ok ? "✓" : "✗"} {level}
      </span>
    </span>
  );
}
