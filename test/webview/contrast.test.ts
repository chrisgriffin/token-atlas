import { describe, expect, it } from "vitest";
import { css } from "../../src/webview/styles";

/**
 * The faint text in the visual editor, measured the way a reader sees it: its
 * colour and opacity read from the real stylesheet, composited over the
 * background it sits on, in VS Code's stock Light+ and Dark+ themes. WCAG 2.1
 * asks 4.5:1 for normal text.
 */

type Rgba = [number, number, number, number];
const hex = (h: string, a = 1): Rgba => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
  a,
];

/** Defaults from microsoft/vscode `main`: `baseColors.ts` (foreground,
 *  descriptionForeground), `light_vs.json`/`dark_vs.json` (editor),
 *  `theme.ts` (sideBar), `listColors.ts` (list.hoverBackground). */
const THEMES: Record<string, Record<string, Rgba>> = {
  "Light+": {
    foreground: hex("#616161"),
    descriptionForeground: hex("#717171"),
    "editor-background": hex("#FFFFFF"),
    "sideBar-background": hex("#F3F3F3"),
    "list-hoverBackground": hex("#F0F0F0"),
  },
  "Dark+": {
    foreground: hex("#CCCCCC"),
    descriptionForeground: hex("#CCCCCC", 0.7),
    "editor-background": hex("#1E1E1E"),
    "sideBar-background": hex("#252526"),
    "list-hoverBackground": hex("#2A2D2E"),
  },
};

const RULES = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)];
const hasRule = (selector: string) =>
  RULES.some(([, sel]) => sel.split(",").some((s) => s.replace(/\s+/g, " ").trim() === selector));

/** The value of `prop` in the last rule whose selector list names `selector`. */
function decl(selector: string, prop: string): string | undefined {
  let found: string | undefined;
  for (const [, sel, body] of RULES) {
    const names = sel.split(",").map((s) => s.replace(/\s+/g, " ").trim());
    if (!names.includes(selector)) continue;
    const m = body.match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`));
    if (m) found = m[1].trim();
  }
  return found;
}

function resolve(color: string | undefined, theme: Record<string, Rgba>): Rgba {
  if (!color || color === "inherit") return theme.foreground;
  const v = color.match(/^var\(--vscode-([\w-]+)/);
  if (!v || !theme[v[1]]) throw new Error(`unmeasurable colour: ${color}`);
  return theme[v[1]];
}

const lum = ([r, g, b]: Rgba) => {
  const c = [r, g, b].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

function contrast(fg: Rgba, opacity: number, bg: Rgba): number {
  const a = fg[3] * opacity;
  const seen: Rgba = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)) as unknown as Rgba;
  const [hi, lo] = [lum(seen), lum(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Each faint text, the rule that styles it, the parent rule it inherits
 *  from (colour and opacity), and the background it is read on. */
const TARGETS = [
  { name: "description text", sel: "table.tokens .cell.dim", bg: "editor-background" },
  {
    name: "empty-cell hint (shown on a hovered row)",
    sel: "table.tokens .cell .placeholder",
    parent: "table.tokens .cell.dim",
    bg: "list-hoverBackground",
  },
  {
    name: "group heading's parent path",
    sel: "table.tokens tr.section .section-parent",
    bg: "editor-background",
  },
  { name: "Type column", sel: "table.tokens .type-cell", bg: "editor-background" },
  { name: "panel section label", sel: ".eyebrow", bg: "sideBar-background" },
  ...[
    ["description text", ".cell.dim"],
    ["Type column", ".type-cell"],
  ].map(([name, sel]) => ({
    name: `${name} on a hovered row`,
    sel: `table.tokens tr.token:hover:not(.active) ${sel}`,
    parent: `table.tokens ${sel}`,
    bg: "list-hoverBackground",
  })),
];

describe("faint text contrast", () => {
  for (const [themeName, theme] of Object.entries(THEMES)) {
    for (const t of TARGETS) {
      it(`${t.name} reads at 4.5:1 or more in ${themeName}`, () => {
        expect(hasRule(t.sel) || !!t.parent, `no rule for ${t.sel}`).toBe(true);
        const opacity = (s?: string) => Number((s && decl(s, "opacity")) ?? 1);
        const color = decl(t.sel, "color") ?? (t.parent && decl(t.parent, "color"));
        const ratio = contrast(
          resolve(color, theme),
          opacity(t.sel) * opacity(t.parent),
          theme[t.bg],
        );
        expect(ratio, `${t.name}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("lets a selected row's secondary text take the selection foreground", () => {
    for (const sel of [".type-cell", ".cell.dim", ".cell .placeholder"]) {
      expect(decl(`table.tokens tr.active ${sel}`, "color"), sel).toBe("inherit");
    }
  });
});
