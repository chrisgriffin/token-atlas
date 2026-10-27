/**
 * Inline colour swatches and the native colour picker, exercised inside a real
 * VS Code.
 *
 * `src/host/colorProvider.ts` registers a `DocumentColorProvider`, so it takes
 * `vscode.TextDocument`s and vitest cannot reach it at all. The two
 * halves it has to get right:
 *
 *   1. `provideDocumentColors` — one swatch per CONCRETE `color` token, ranged
 *      on that token's `$value`; nothing for an alias, and nothing at all
 *      unless the file is a token document (CLAUDE.md invariant 3).
 *   2. `provideColorPresentations` — what the picker writes back. A `$value`
 *      that was a hex string stays a hex string; a DTCG object stays an object
 *      in the colour space it already declared, never silently sRGB.
 *
 * Everything below goes through the `vscode` API, never the provider class:
 * `executeDocumentColorProvider` and `executeColorPresentationProvider`, the
 * same indirection `detection.test.ts` uses for hovers and symbols.
 */
import * as assert from "node:assert/strict"
import * as vscode from "vscode"
import type { TokenAtlasTestHooks } from "../../src/extension"

const workspace = vscode.workspace.workspaceFolders![0].uri
const file = (name: string) => vscode.Uri.joinPath(workspace, name)

interface Swatch {
  /** The source text the swatch's range covers — its `$value`, if it is right. */
  text: string
  start: number
  color: vscode.Color
  range: vscode.Range
}

async function swatchesIn(doc: vscode.TextDocument): Promise<Swatch[]> {
  const colors =
    (await vscode.commands.executeCommand<vscode.ColorInformation[]>(
      "vscode.executeDocumentColorProvider",
      doc.uri,
    )) ?? []
  return colors.map(c => ({
    text: doc.getText(c.range),
    start: doc.offsetAt(c.range.start),
    color: c.color,
    range: c.range,
  }))
}

/**
 * Where `key`'s `$value` begins in `text` — the offset of the first character
 * after `"$value":`. Computed from the fixture rather than hard-coded so a
 * reformat of it does not read as a provider bug, and compared against the
 * swatch's own start, which is what pins the range onto the `$value`.
 */
function valueOffsetOf(text: string, key: string): number {
  const keyAt = text.indexOf(`"${key}"`)
  assert.notEqual(keyAt, -1, `the fixture no longer holds a "${key}" token`)
  const valueAt = text.indexOf('"$value"', keyAt)
  assert.notEqual(valueAt, -1, `"${key}" no longer has a $value`)
  const afterColon = text.indexOf(":", valueAt) + 1
  return afterColon + /^\s*/.exec(text.slice(afterColon))![0].length
}

/** The one swatch sitting on `key`'s `$value`, or a failure naming the token. */
function swatchOn(swatches: Swatch[], text: string, key: string): Swatch {
  const offset = valueOffsetOf(text, key)
  const on = swatches.filter(s => s.start === offset)
  assert.equal(
    on.length,
    1,
    `expected exactly one swatch on ${key}'s $value (offset ${offset}), got ${on.length}` +
      ` — swatch offsets: ${swatches.map(s => s.start).join(", ")}`,
  )
  return on[0]
}

const open = (name: string) => vscode.workspace.openTextDocument(file(name))

/** The colour the picker hands back on a pick: pure sRGB red, opaque. */
const PICKED = new vscode.Color(1, 0, 0, 1)

async function presentationsFor(
  doc: vscode.TextDocument,
  range: vscode.Range,
): Promise<vscode.ColorPresentation[]> {
  return (
    (await vscode.commands.executeCommand<vscode.ColorPresentation[]>(
      "vscode.executeColorPresentationProvider",
      PICKED,
      { uri: doc.uri, range },
    )) ?? []
  )
}

interface Offer {
  newText: string
  /** Whether the edit replaces exactly the `$value` it was offered. */
  replacesValue: boolean
}

/**
 * Everything the picker could write at `range`.
 *
 * More than one provider answers: VS Code 1.140's own default colour
 * decorators recognise a bare `#rrggbb` literal in any document and offer a
 * presentation beside Token Atlas's (`editor.defaultColorDecorators`). So each
 * case below asserts about the offer it owns, never about the count.
 */
async function offersFor(
  doc: vscode.TextDocument,
  range: vscode.Range,
): Promise<Offer[]> {
  const presentations = await presentationsFor(doc, range)
  assert.ok(
    presentations.length > 0,
    "nothing offered, so a pick would write nothing",
  )
  return presentations.map(p => {
    const edit = p.textEdit
    assert.ok(edit, `the presentation ${p.label} carries no textEdit`)
    return {
      newText: edit.newText,
      replacesValue: edit.range.isEqual(range),
    }
  })
}

before(async () => {
  const ext = vscode.extensions.getExtension<TokenAtlasTestHooks>(
    "chrisgriffinio.token-atlas",
  )
  assert.ok(ext, "extension not found")
  await ext.activate()
})

afterEach(async () => {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors")
})

describe("Colour swatches", () => {
  it("puts one swatch on each concrete colour token's $value, and none on an alias", async () => {
    // Every concrete colour token in the fixture, in the order it is written.
    // The provider walks its tree with `stack.pop()` and so answers in no
    // meaningful order — each is located by its own offset, never by index.
    const concrete = [
      "white",
      "slate-100",
      "slate-800",
      "slate-900",
      "blue-400",
      "blue-600",
      "p3-red",
    ]
    const doc = await open("primitives.tokens.json")
    const text = doc.getText()
    const swatches = await swatchesIn(doc)

    assert.equal(
      swatches.length,
      concrete.length,
      `expected one swatch per concrete colour token, got ${swatches.length}`,
    )
    for (const key of concrete) {
      const swatch = swatchOn(swatches, text, key)
      // A range that covers a whole JSON value, not part of one.
      assert.doesNotThrow(
        () => JSON.parse(swatch.text) as unknown,
        `the swatch on ${key} does not cover a complete $value: ${swatch.text}`,
      )
    }

    // The colour itself, on the one token whose value needs no conversion.
    const white = swatchOn(swatches, text, "white").color
    assert.deepEqual(
      [white.red, white.green, white.blue, white.alpha],
      [1, 1, 1, 1],
      "color.base.white did not come back as opaque white",
    )

    // light.tokens.json is nothing but aliases into this file. Painting a
    // swatch on a reference would be wrong — the value lives in the other
    // file. Two independent things hold this up: the provider skips
    // `node.isAlias`, and a token's `value` is its RAW `$value`, so
    // `toRgba01("{color.base.white}")` is null anyway. Removing either alone
    // keeps this green: it pins the outcome, not one line.
    assert.deepEqual(await swatchesIn(await open("light.tokens.json")), [])
  })

  it("offers no swatch in ordinary JSON", async () => {
    assert.deepEqual(await swatchesIn(await open("detection-plain.json")), [])

    // The same colours as the fixture above, written as plain JSON with no
    // DTCG key. Honest about what this pins: a token needs `$value`, and any
    // file holding `$value` sniffs as a token document, so no fixture can be
    // both ordinary JSON and swatch-bearing — this records the observed
    // behaviour and cannot fail on a loosened sniff by itself. The case that
    // can is detection.test.ts's document-symbol assertion, which needs no
    // `$value` to produce a symbol.
    const plain = await vscode.workspace.openTextDocument({
      content: '{ "palette": { "white": "#ffffff", "red": "#ff0000" } }\n',
      language: "json",
    })
    assert.deepEqual(await swatchesIn(plain), [])
  })

  it("round-trips a swatch edit: a hex string stays a hex string, a DTCG object keeps its colorSpace", async () => {
    // dist/copy.tokens.json is the workspace's one hex-string $value. It sits
    // under a `tokenAtlas.exclude` default, which keeps a file out of SCANNING
    // only — opened directly it still gets language features (see the comment
    // on `excludeGlobs()` in src/host/workspaceIndex.ts).
    const hexDoc = await open("dist/copy.tokens.json")
    const hexSwatch = swatchOn(
      await swatchesIn(hexDoc),
      hexDoc.getText(),
      "accent",
    )
    assert.equal(
      hexSwatch.text,
      '"#123456"',
      "the hex-string fixture changed shape",
    )
    const hexOffers = await offersFor(hexDoc, hexSwatch.range)
    // Every offer writes the hex string, Token Atlas's and the built-in's alike:
    // whichever the person picks, the file keeps the shape it had.
    assert.deepEqual(
      [...new Set(hexOffers.map(o => o.newText))],
      ['"#ff0000"'],
      "a hex-string $value must be rewritten as a hex string",
    )
    assert.ok(
      hexOffers.every(o => o.replacesValue),
      "an offer replaces something other than the $value it was given",
    )

    // color.base.p3-red is declared in display-p3 on purpose: the provider
    // falls back to "srgb", so an sRGB-only fixture would pass this even if it
    // stopped reading the token's own colorSpace.
    const dtcgDoc = await open("primitives.tokens.json")
    const dtcgSwatch = swatchOn(
      await swatchesIn(dtcgDoc),
      dtcgDoc.getText(),
      "p3-red",
    )
    const dtcgOffers = await offersFor(dtcgDoc, dtcgSwatch.range)
    // Token Atlas's is the one that writes an object back. (The built-in's other
    // offer here would flatten the token to a bare hex string — VS Code's own
    // behaviour on a colour literal it recognises inside the value, not
    // Token Atlas's to change from a test.)
    const objects = dtcgOffers.filter(o => o.newText.startsWith("{"))
    assert.equal(
      objects.length,
      1,
      `expected one object offer, got ${JSON.stringify(dtcgOffers.map(o => o.newText))}`,
    )
    assert.ok(
      objects[0].replacesValue,
      "the object offer does not replace the $value",
    )
    const written = JSON.parse(objects[0].newText) as {
      colorSpace?: unknown
      components?: unknown
    }
    assert.equal(
      written.colorSpace,
      "display-p3",
      "a DTCG object $value must keep the colour space it declared",
    )
    assert.ok(
      Array.isArray(written.components) && written.components.length === 3,
      `expected three components back, got ${JSON.stringify(written.components)}`,
    )
  })

  it("writes a picked color as the visual editor writes it, keeping an explicit alpha of 1", async () => {
    const text = `{
  "brand": {
    "$type": "color",
    "red": {
      "$value": {
        "colorSpace": "srgb",
        "components": [0.5, 0, 0],
        "alpha": 1
      }
    }
  }
}
`
    const doc = await vscode.workspace.openTextDocument({
      content: text,
      language: "json",
    })
    const [swatch] = await swatchesIn(doc)
    assert.ok(swatch, "no swatch on brand.red")
    const objects = (await offersFor(doc, swatch.range)).filter(o =>
      o.newText.startsWith("{"),
    )
    assert.equal(objects.length, 1, "expected one object offer")
    assert.ok(
      objects[0].replacesValue,
      "the object offer does not replace the $value",
    )

    // Written as the visual editor writes it (core computeSetEdits): laid out
    // over lines at the value's own indent, never one compact line, and the
    // explicit `"alpha": 1` kept.
    const written = objects[0].newText
    assert.deepEqual(JSON.parse(written), {
      colorSpace: "srgb",
      components: [1, 0, 0],
      alpha: 1,
      hex: "#ff0000",
    })
    assert.match(written, /^\{\n {8}"colorSpace": "srgb",\n/)
    assert.match(written, /\n {8}"alpha": 1,\n/)
  })
})
