/**
 * Markdown for the token hover card, shared by the JSON hover and the
 * exported-code hover. Pure: the host resolves the alias chain and file
 * labels, then wraps this string in a MarkdownString with supportHtml and
 * supportThemeIcons on.
 *
 * VS Code's hover sanitizer keeps <span style> only for color,
 * background-color and border-radius (hex or var(--vscode-*)), plus plain
 * tables and data: images — so every visual here is built from those.
 */
import type { TokenType } from "./types";
import type { ContrastTarget } from "./color";
import {
  CONTRAST_TARGETS,
  cssColorStrings,
  isDtcgColor,
  meetsContrast,
  toContrastTarget,
  toHex,
  wcagContrast,
} from "./color";
import { PRIMITIVE_TYPES } from "./types";
import { dimensionConversions } from "./units";

export interface HoverHop {
  key: string;
  /** Workspace-relative file, only when the hop lives in another file. */
  label?: string;
  resolved: boolean;
}

export interface HoverInput {
  name: string;
  path: string[];
  type?: TokenType;
  description?: string;
  deprecated?: boolean | string;
  /** Raw `$value`. */
  value: unknown;
  isAlias: boolean;
  /** Alias hops, first to last. */
  chain?: HoverHop[];
  /** Concrete value at the end of the alias chain; undefined when unresolved. */
  final?: unknown;
  /** Non-alias value with nested references substituted, when it had any. */
  resolvedComposite?: unknown;
  rootPx: number;
  /** WCAG level each contrast ratio is judged against; AA when absent. */
  contrastTarget?: ContrastTarget;
  definedIn?: { label: string; href: string };
  /** The token an `$extends` copy came from (`TokenNode.inheritedFrom`). */
  inheritedFrom?: string;
}

const span = (style: string, s: string) => `<span style="${style}">${s}</span>`;
const muted = (s: string) => span("color:var(--vscode-descriptionForeground);", s);
const warn = (s: string) => span("color:var(--vscode-editorWarning-foreground);", s);
const pass = (s: string) => span("color:var(--vscode-testing-iconPassed);", s);
const fail = (s: string) => span("color:var(--vscode-errorForeground);", s);
const pill = (s: string) =>
  span(
    "color:var(--vscode-badge-foreground);background-color:var(--vscode-badge-background);border-radius:4px;",
    `&nbsp;${s}&nbsp;`,
  );
const warnPill = (s: string) =>
  span(
    "color:var(--vscode-editor-background);background-color:var(--vscode-editorWarning-foreground);border-radius:4px;",
    `&nbsp;${s}&nbsp;`,
  );

/** Escape user text for markdown, HTML, and `$(icon)` syntax. */
export function escapeHover(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]#|~])/g, "\\$1")
    .replace(/\$\(/g, "\\$(");
}

const code = (s: string) => `<code>${s.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code>`;

/** Two-column table: muted label, then an HTML cell. */
function table(rows: Array<[string, string]>): string {
  return (
    "<table>" +
    rows
      .map(([k, v]) => `<tr><td>${muted(escapeHover(k))}</td><td>&nbsp;&nbsp;${v}</td></tr>`)
      .join("") +
    "</table>"
  );
}
const codeRows = (rows: Array<[string, string]>) => table(rows.map(([k, v]) => [k, code(v)]));

const REF = /^\{[^{}]+\}$/;
const isRef = (v: unknown): v is string => typeof v === "string" && REF.test(v);
const colorish = (v: unknown) => isDtcgColor(v) || (typeof v === "string" && v.startsWith("#"));
const chip = (hex: string) =>
  span(`background-color:${hex};border-radius:3px;`, "&nbsp;&nbsp;&nbsp;&nbsp;");

/** Compact plain-text form of a (sub-)value. */
function fmt(v: unknown): string {
  if (isRef(v)) return v;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.value === "number" && typeof o.unit === "string") return `${o.value}${o.unit}`;
  }
  if (colorish(v)) return toHex(v) ?? String(v);
  if (Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number")) {
    return `cubic-bezier(${v.join(", ")})`;
  }
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v.join(", ");
  if (v === null || typeof v !== "object") return String(v);
  return JSON.stringify(v);
}

/** Table cell for one sub-value: `{ref} → resolved`, colours with a chip. */
function cell(raw: unknown, res: unknown = raw): string {
  const via = isRef(raw) && res !== undefined && res !== raw ? `${code(raw)} → ` : "";
  const hex = colorish(res) ? toHex(res) : null;
  return via + (hex ? `${chip(hex)}&nbsp;${code(hex)}` : code(fmt(res)));
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Rows for a composite value; `res` is the value with references substituted. */
function compositeRows(
  type: TokenType | undefined,
  raw: unknown,
  res: unknown,
): Array<[string, string]> {
  if (type === "shadow") {
    const rawLayers = Array.isArray(raw) ? raw : [raw];
    const resLayers = Array.isArray(res) ? res : [res];
    return resLayers.map((l, n) => {
      const o = obj(l);
      const rawColor = obj(rawLayers[n]).color;
      const hex = toHex(o.color) ?? "transparent";
      const css = [o.offsetX, o.offsetY, o.blur, o.spread].map((d) => fmt(d ?? 0)).join(" ");
      const ref = isRef(rawColor) ? `&nbsp;${muted(escapeHover(rawColor))}` : "";
      return [
        resLayers.length > 1 ? `Layer ${n + 1}` : "Shadow",
        `${chip(hex)}&nbsp;${code(`${o.inset === true ? "inset " : ""}${css} ${hex}`)}${ref}`,
      ];
    });
  }
  if (type === "gradient" && Array.isArray(res)) {
    const rawStops = Array.isArray(raw) ? raw : [];
    return res.map((s, n) => {
      const o = obj(s);
      const pos = typeof o.position === "number" ? `${Math.round(o.position * 100)}%` : `${n + 1}`;
      return [pos, cell(obj(rawStops[n]).color, o.color)];
    });
  }
  if (Array.isArray(res)) return res.map((x, n) => [`${n + 1}`, cell((raw as unknown[])?.[n], x)]);
  const r = obj(raw);
  return Object.entries(obj(res)).map(([k, v]) => [k, cell(r[k], v)]);
}

/** Rounded swatch as an SVG data URI, checkerboard under it for alpha. */
function swatch(hex: string, w: number, h: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<defs><pattern id="c" width="8" height="8" patternUnits="userSpaceOnUse">` +
    `<rect width="8" height="8" fill="#f0f0f0"/><rect width="4" height="4" fill="#d4d4d4"/>` +
    `<rect x="4" y="4" width="4" height="4" fill="#d4d4d4"/></pattern>` +
    `<clipPath id="r"><rect width="${w}" height="${h}" rx="4"/></clipPath></defs>` +
    `<g clip-path="url(#r)"><rect width="${w}" height="${h}" fill="url(#c)"/>` +
    `<rect width="${w}" height="${h}" fill="${hex}"/></g>` +
    `<rect width="${w - 1}" height="${h - 1}" x="0.5" y="0.5" rx="4" fill="none" stroke="#80808066"/>` +
    `</svg>`;
  return `![swatch](data:image/svg+xml;base64,${btoa(svg)})`;
}

const isScalar = (v: unknown) => v === null || typeof v !== "object";

export function hoverMarkdown(i: HoverInput): string {
  const out: string[] = [];
  const unresolved = i.isAlias && i.final === undefined;
  const value = i.isAlias ? i.final : i.value;
  // A `$ref` can supply part of a colour or dimension (§7.3): judge the result.
  const shown = i.isAlias ? value : (i.resolvedComposite ?? value);
  const colors = !unresolved && i.type === "color" ? cssColorStrings(shown) : null;
  const dim = !unresolved && i.type === "dimension" ? dimensionConversions(shown, i.rootPx) : null;

  // Header: name, type pill, deprecated pill; then the dotted path, muted.
  const pills = [i.type ? pill(i.type) : muted("untyped")];
  if (i.deprecated !== undefined && i.deprecated !== false) pills.push(warnPill("deprecated"));
  // Compact (spec 040): a colour's swatch sits beside the name and the
  // defining file on the path line, so the card rarely needs to scroll.
  const defined = i.definedIn
    ? `&nbsp;&nbsp;$(go-to-file) [${escapeHover(i.definedIn.label)}](${i.definedIn.href})`
    : "";
  out.push(
    (colors ? `${swatch(colors.hex, 16, 16)}&nbsp;` : "") +
      `**${escapeHover(i.name)}**&nbsp;&nbsp;${pills.join("&nbsp;")}  \n` +
      muted(escapeHover(i.path.join("."))) +
      defined,
  );

  if (i.inheritedFrom) out.push(`$(type-hierarchy-sub) Inherited from ${code(i.inheritedFrom)}`);
  if (typeof i.deprecated === "string" && i.deprecated) {
    out.push(`$(warning) ${warn(escapeHover(i.deprecated))}`);
  }
  if (i.description) out.push(escapeHover(i.description));

  out.push("---");

  // Alias chain.
  if (i.isAlias) {
    const hops = (i.chain ?? []).map(
      (h) =>
        `$(arrow-right) ${code(h.key)}` +
        (h.label ? `&nbsp;${muted(escapeHover(h.label))}` : "") +
        (h.resolved ? "" : `&nbsp;${warn("not found")}`),
    );
    out.push(hops.join("  \n"));
    if (unresolved)
      out.push(`$(error) ${warn("Unresolved — the reference chain does not end in a value")}`);
  }

  // Value.
  if (colors) {
    out.push(
      codeRows([
        ["HEX", colors.hex],
        ["OKLCH", colors.oklch],
      ]),
    );
    const w = wcagContrast(shown, "#ffffff");
    const b = wcagContrast(shown, "#000000");
    if (w !== null && b !== null) {
      const target = toContrastTarget(i.contrastTarget);
      const { label, min } = CONTRAST_TARGETS[target];
      const verdict = (ratio: number, on: string) =>
        `${muted(`${ratio}:1 on ${on}`)}&nbsp;` +
        (meetsContrast(ratio, target) ? `$(pass) ${pass("pass")}` : `$(error) ${fail("fail")}`);
      out.push(
        `${muted(`Contrast, WCAG ${label} (${min}:1)`)}  \n` +
          `${verdict(w, "white")}&nbsp;&nbsp;${verdict(b, "black")}`,
      );
    }
  } else if (dim) {
    out.push(
      [dim.px, dim.rem, dim.pt].map(code).join(" · ") +
        `&nbsp;&nbsp;${muted(`rem at ${i.rootPx}px root`)}`,
    );
  } else if (!unresolved && value !== undefined) {
    const primitive = i.type !== undefined && PRIMITIVE_TYPES.includes(i.type);
    if (isScalar(value) || primitive) out.push(cell(value, i.resolvedComposite ?? value));
    else out.push(table(compositeRows(i.type, value, i.resolvedComposite ?? value)));
  }

  return out.join("\n\n");
}
