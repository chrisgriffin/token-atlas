# Tasks: Core model follows DTCG 2025.10 and keeps the file's formatting

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

Each task writes its test first, runs it red against the unfixed code, then fixes the code.

## Phase 1: Reading files

- [x] T001 Parse: `$root` tokens and pointers through them; comments and trailing commas; syntax errors and unknown `$` keys on `model.issues`, reported by `validate`, with the diagnostic range at a syntax error's offset.
- [x] T002 Resolver: accept `"2025.10"` and ask for it; unescape modifier references; list a modifier once however often the order names it; move every pinned resolver file and test to `2025.10`.

## Phase 2: Validation

- [x] T003 Unknown `$type` on a token or group; dimension and duration units; color objects (space, components, alpha, hex).
- [x] T004 Composite values: members per type, unknown members, primitive checks on sub-values, references allowed; the legacy quick fix reaches composite sub-values; correct the example files the new checks flag.
- [x] T005 Cycles through composite values; a dangling chain names the missing token.

## Phase 3: Types and inherited tokens

- [x] T006 Alias type precedence (§5.2.2) at the token and at every hop.
- [x] T007 Mode columns include `$extends`-inherited tokens; `expandExtends` re-derives inherited types on a cached model; `wouldCycle` follows `$ref` and composite references.

## Phase 4: Edits

- [x] T008 Infer indentation and line ending; one-line objects stay one line when a property is added or removed.
- [x] T009 Refuse illegal rename names in core; host F2 and the visual editor show the core's message.

## Phase 5: Verification

- [x] T010 Run the gate: `npm run format:check && npm run typecheck && npm test && npm run build && npm run test:integration`, and the runnable line.
