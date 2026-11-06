/**
 * `token-atlas.lint.json` — the project's own lint conventions, read and checked.
 *
 * The vocabulary (`tiers`, `vocabularies`, `rampPaths`, `rules`, off|warn|error)
 * is shared with other token tooling, so a project describes its conventions once.
 * Nothing here has an opinion: an absent key means its rule stays silent.
 *
 * A config is never half-read. Any problem becomes an issue for the host to
 * show on the config file, and every rule that reads the broken key is
 * silenced rather than run on a guess. Unknown keys are reported but break
 * nothing. `_`-prefixed keys are documentary comments.
 * `schemas/token-atlas.lint.schema.json` gives the editor the same shape for
 * completion; a test keeps the two in step.
 */
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser"
import { CONTRAST_TARGETS, type ContrastTarget } from "../color"

export const LINT_RULE_IDS = [
  "token-atlas/tier-alias-inverted",
  "token-atlas/vocabulary-invalid",
  "token-atlas/ramp-not-monotonic",
  "token-atlas/name-case",
  "token-atlas/contrast-insufficient",
] as const
export type LintRuleId = (typeof LINT_RULE_IDS)[number]

export const NAME_CASES = [
  "kebab-case",
  "camelCase",
  "snake_case",
  "PascalCase",
] as const
export type NameCase = (typeof NAME_CASES)[number]

export type LintSeverity = "off" | "warn" | "error"
const SEVERITIES: readonly string[] = ["off", "warn", "error"]

export interface Vocabulary {
  paths: string[]
  values: string[]
}

/** A foreground/background pair and the WCAG ratio it must reach. */
export interface ContrastPair {
  foreground: string
  background: string
  /** A named WCAG threshold (the hover's vocabulary), or a ratio from 1 to 21. */
  target: ContrastTarget | number
}

export interface LintConfig {
  tiers?: string[]
  vocabularies?: Vocabulary[]
  rampPaths?: string[]
  naming?: { case: NameCase }
  contrastPairs?: ContrastPair[]
  rules: Partial<Record<LintRuleId, LintSeverity>>
  /** Rules whose config is broken: they emit nothing. */
  silenced: Set<LintRuleId>
}

export interface LintConfigIssue {
  message: string
  /** JSON path of the offending value; `[]` is the whole file. */
  path: Array<string | number>
  /** Set for a JSON syntax error, which has a position but no path. */
  offset?: number
}

/** Which rules read each key, so a broken key silences exactly those. */
const READERS: Record<string, LintRuleId[]> = {
  tiers: ["token-atlas/tier-alias-inverted"],
  vocabularies: ["token-atlas/vocabulary-invalid", "token-atlas/name-case"],
  rampPaths: ["token-atlas/ramp-not-monotonic"],
  naming: ["token-atlas/name-case"],
  contrastPairs: ["token-atlas/contrast-insufficient"],
  rules: [],
  $schema: [],
}

/** Plain wording for the jsonc-parser errors a hand-edited file produces. */
const SYNTAX: Partial<Record<string, string>> = {
  InvalidSymbol: "an unexpected character",
  PropertyNameExpected:
    "a property name in double quotes was expected (is there a trailing comma?)",
  ValueExpected: "a value was expected (is there a trailing comma?)",
  ColonExpected: "a colon was expected",
  CommaExpected: "a comma was expected",
  CloseBraceExpected: "a closing } was expected",
  CloseBracketExpected: "a closing ] was expected",
  EndOfFileExpected: "there is text after the end of the object",
  InvalidCommentToken: "comments are not allowed in JSON",
  UnexpectedEndOfComment: "comments are not allowed in JSON",
  UnexpectedEndOfString: "a string is missing its closing quote",
}

export function parseLintConfig(text: string): {
  config: LintConfig
  issues: LintConfigIssue[]
} {
  const config: LintConfig = { rules: {}, silenced: new Set() }
  const issues: LintConfigIssue[] = []
  if (!text.trim()) return { config, issues }

  const errors: ParseError[] = []
  const data: unknown = parse(text, errors, {
    disallowComments: true,
    allowTrailingComma: false,
  })
  if (errors.length) {
    const [e] = errors
    const why = SYNTAX[printParseErrorCode(e.error)] ?? "it is malformed"
    issues.push({
      message: `token-atlas.lint.json is not valid JSON, so no lint rule runs: ${why}.`,
      path: [],
      offset: e.offset,
    })
    return { config, issues }
  }
  if (!isObject(data)) {
    issues.push({
      message: "token-atlas.lint.json must be a JSON object.",
      path: [],
    })
    return { config, issues }
  }

  const fail = (
    key: string,
    path: LintConfigIssue["path"],
    message: string,
  ) => {
    issues.push({ message, path })
    for (const id of READERS[key] ?? []) config.silenced.add(id)
  }

  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("_")) continue
    switch (key) {
      case "$schema":
        break
      case "tiers":
        config.tiers = strings(
          value,
          [key],
          (p, m) => fail(key, p, m),
          "tier names, primitive first",
        )
        break
      case "rampPaths":
        config.rampPaths = strings(
          value,
          [key],
          (p, m) => fail(key, p, m),
          "ramp path patterns",
        )
        break
      case "vocabularies":
        config.vocabularies = vocabularies(value, (p, m) => fail(key, p, m))
        break
      case "naming":
        if (!isObject(value)) {
          fail(
            key,
            [key],
            `"naming" must be an object such as { "case": "kebab-case" }.`,
          )
        } else if (!(NAME_CASES as readonly unknown[]).includes(value.case)) {
          fail(
            key,
            [key, "case"],
            `"naming.case" must be one of ${NAME_CASES.join(", ")}.`,
          )
        } else {
          config.naming = { case: value.case as NameCase }
        }
        break
      case "contrastPairs":
        config.contrastPairs = contrastPairs(value, (p, m) => fail(key, p, m))
        break
      case "rules":
        readRules(value, config, issues)
        break
      default:
        issues.push({
          message: `Unknown key "${key}"; token-atlas.lint.json reads tiers, vocabularies, rampPaths, naming, contrastPairs and rules.`,
          path: [key],
        })
    }
  }
  return { config, issues }
}

type Fail = (path: LintConfigIssue["path"], message: string) => void

/** A non-empty string array, or undefined after reporting what is wrong. */
function strings(
  value: unknown,
  path: LintConfigIssue["path"],
  fail: Fail,
  what: string,
): string[] | undefined {
  const name = path.join(".")
  if (!Array.isArray(value)) {
    fail(path, `"${name}" must be an array of ${what}.`)
    return undefined
  }
  const bad = value.findIndex(v => typeof v !== "string" || v.length === 0)
  if (bad >= 0) {
    fail([...path, bad], `Every entry of "${name}" must be a non-empty string.`)
    return undefined
  }
  return value as string[]
}

function vocabularies(value: unknown, fail: Fail): Vocabulary[] | undefined {
  if (!Array.isArray(value)) {
    fail(
      ["vocabularies"],
      `"vocabularies" must be an array of { "paths": [...], "values": [...] }.`,
    )
    return undefined
  }
  const out: Vocabulary[] = []
  let ok = true
  value.forEach((entry, i) => {
    const at: LintConfigIssue["path"] = ["vocabularies", i]
    if (!isObject(entry)) {
      fail(at, `Each vocabulary must be an object with "paths" and "values".`)
      ok = false
      return
    }
    for (const key of Object.keys(entry)) {
      if (key !== "paths" && key !== "values" && !key.startsWith("_")) {
        fail(
          [...at, key],
          `Unknown key "${key}" in a vocabulary; it takes "paths" and "values".`,
        )
        ok = false
      }
    }
    const paths = nonEmpty(entry.paths, [...at, "paths"], fail, "path patterns")
    const values = nonEmpty(
      entry.values,
      [...at, "values"],
      fail,
      "allowed leaf names",
    )
    if (paths && values) out.push({ paths, values })
    else ok = false
  })
  return ok ? out : undefined
}

const TARGETS = Object.keys(CONTRAST_TARGETS)

function contrastPairs(value: unknown, fail: Fail): ContrastPair[] | undefined {
  if (!Array.isArray(value)) {
    fail(
      ["contrastPairs"],
      `"contrastPairs" must be an array of { "foreground": ..., "background": ..., "target": ... }.`,
    )
    return undefined
  }
  const out: ContrastPair[] = []
  let ok = true
  value.forEach((entry, i) => {
    const at: LintConfigIssue["path"] = ["contrastPairs", i]
    const bad = (path: LintConfigIssue["path"], message: string) => {
      fail(path, message)
      ok = false
    }
    if (!isObject(entry)) {
      bad(
        at,
        `Each contrast pair must be an object with "foreground" and "background".`,
      )
      return
    }
    for (const key of Object.keys(entry)) {
      if (
        !["foreground", "background", "target"].includes(key) &&
        !key.startsWith("_")
      ) {
        bad(
          [...at, key],
          `Unknown key "${key}" in a contrast pair; it takes "foreground", "background" and "target".`,
        )
      }
    }
    for (const side of ["foreground", "background"] as const) {
      if (typeof entry[side] !== "string" || !entry[side]) {
        bad(
          [...at, side],
          `A contrast pair needs "${side}": a token path such as "color.text".`,
        )
      }
    }
    const { target = "AA" } = entry
    const named = typeof target === "string" && TARGETS.includes(target)
    const ratio = typeof target === "number" && target >= 1 && target <= 21
    if (!named && !ratio) {
      bad(
        [...at, "target"],
        `"target" must be one of ${TARGETS.join(", ")}, or a ratio from 1 to 21.`,
      )
    }
    if (ok) {
      out.push({
        foreground: entry.foreground as string,
        background: entry.background as string,
        target: target as ContrastPair["target"],
      })
    }
  })
  return ok ? out : undefined
}

function nonEmpty(
  value: unknown,
  path: LintConfigIssue["path"],
  fail: Fail,
  what: string,
): string[] | undefined {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    fail(
      path,
      `A vocabulary needs "${path[path.length - 1]}": a non-empty array of ${what}.`,
    )
    return undefined
  }
  return strings(value, path, fail, what)
}

function readRules(
  value: unknown,
  config: LintConfig,
  issues: LintConfigIssue[],
): void {
  if (!isObject(value)) {
    issues.push({
      message: `"rules" must be an object of rule id → "off" | "warn" | "error".`,
      path: ["rules"],
    })
    return
  }
  for (const [id, severity] of Object.entries(value)) {
    if (id.startsWith("_")) continue
    if (!(LINT_RULE_IDS as readonly string[]).includes(id)) {
      issues.push({
        message: `Unknown rule "${id}"; the rules are ${LINT_RULE_IDS.join(", ")}.`,
        path: ["rules", id],
      })
    } else if (typeof severity !== "string" || !SEVERITIES.includes(severity)) {
      issues.push({
        message: `"${id}" must be "off", "warn" or "error".`,
        path: ["rules", id],
      })
      config.silenced.add(id as LintRuleId)
    } else {
      config.rules[id as LintRuleId] = severity as LintSeverity
    }
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
