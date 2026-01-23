# Markdown-it Numbering UL Developer Guide

## Working Style

- **Test-driven**: always run `npm test` and keep the suite green. Test reports show *H* (actual) vs *C* (expected).
- **Code hygiene**: remove debugging logs, unused code, and stray comments. Make files read top-to-bottom logically.
- **Design principles**
  - DRY - centralise shared logic.
  - Encapsulation - access `listTypes.json` only through `src/types-utility.js`.
  - Performance - avoid needless `O(n^2)` passes; precompute maps when possible.
  - Maintainability - name functions clearly and comment only when the flow is non-obvious.

## Runtime Files (core only)

| File | Responsibility |
| --- | --- |
| `index.js` | registers the processing pipeline |
| `listTypes.json` | canonical marker definitions |
| `src/types-utility.js` | marker detection, attributes, caches |
| `src/list-helpers.js` | shared helpers (`findMatchingClose`, etc.) |
| `src/preprocess-literal-lists.js` | rewrites "literal" nested ordered lists |
| `src/phase0-description-list.js` | description list conversion |
| `src/phase1-analyze.js` | list discovery + marker analysis |
| `src/phase2-convert.js` | convert / flatten lists |
| `src/phase3-attributes.js` | attach type/role/class/data-* |
| `src/phase4-html-blocks.js` | normalise HTML blocks inside lists |
| `src/phase5-spans.js` | optional marker span generation |
| `src/phase6-attrs-migration.js` | move attrs for flattened nested lists |

## Core Rules (registered in `index.js`)

1. **`numbering_dl_parser` (before `inline`)**
   - Runs `processDescriptionList` to rewrite bullet `**Term**` patterns into `<dl>/<dt>/<dd>` (optionally wrapped in `<div>`).

2. **`numbering_ul_phases` (after `numbering_dl_parser`)**
   - Runs the list pipeline: literal list normalisation, analysis, conversion, attribute attachment, HTML block normalisation, and optional marker spans.

3. **`numbering_ul_nested_attrs` (after `curly_attributes`)**
   - Runs `moveNestedListAttributes` only when flattening is enabled (`unremoveUlNest=false`).

4. **`numbering_dl_attrs` (after `curly_attributes`)**
   - Runs `moveParagraphAttributesToDL` only when description lists are enabled.

## Pipeline Flow (inside `numbering_ul_phases`)

1. **Literal ordered-list normalisation - `normalizeLiteralOrderedLists`**
   Runs only when `enableLiteralNumberingFix` is enabled. Markdown-it only emits nested `<ol>` when the child numbering starts at `1`. This normaliser scans paragraph content (after the first line) and splits it into literal segments and plain text, creates real `ordered_list` tokens with `_literalList` / `_literalTight` hints, preserves inline attributes, and merges immediately-following markdown-it `<ol>` tokens so each item ends up with a single child `<ol>`.
   The normaliser short-circuits when no literal list hints are present in the token stream. Literal detection uses the parent list marker width and accepts up to 3 extra indentation spaces (marker width + 0–3). Lines indented beyond that (code blocks) are left intact.
   Each synthetic list tracks `_literalStartLine` / `_literalLastLine` so later passes can decide whether blank lines existed between literal fragments and markdown-it generated lists; fabricated paragraphs stay tight unless the source truly had a gap. Generated list/list_item/paragraph tokens inherit `map` data when available to preserve map-aware behavior downstream.

2. **Phase 1 - `analyzeListStructure`**
   Walks the token stream, collects every list (top-level plus nested), and builds `listInfo` objects. It also writes metadata onto tokens to avoid index drift after mutations:
   - list open tokens: `_markerInfo`, `_shouldConvert` (bullet only), `_isLoose`.
   - list item open tokens: `_firstParagraphIsLoose`.
   This metadata is the source of truth for later phases.

3. **Phase 2 - `convertLists` + `simplifyNestedBulletLists`**
   - Converts eligible `bullet_list` instances into `ordered_list`, removes marker text from inline tokens, and stores `_markerInfo` on list tokens.
   - Flattens `ul > li > ol` scaffolding (the "- 1." pattern) **only when every `li` is literally just a nested list** (first child is the inner `ol` and there is no extra content). This guard prevents ordinary unordered parents (with paragraphs or inline text) from being rewritten.
   - During flattening we merge marker metadata from parent/child lists, honour `_literalList` so synthetic lists keep their numbering, and fix tight/loose states directly using `_literalTight`, `_literalLastLine`, token `map` data (when available), or list-level `_isLoose` as a fallback when maps are missing.

4. **Phase 3 - `addAttributes`**
   Applies `type`, `role`, `class`, `data-marker-*`, `start`, and `value` attributes to every ordered list and list item. Uses the stored `_markerInfo` plus `types-utility.js`.

5. **Phase 4 - `processHtmlBlocks`**
   Dedents HTML blocks nested inside lists, trims unnecessary blank lines, and standardises closing tags.

6. **Phase 5 - `generateSpans`** (optional)
   When `alwaysMarkerSpan` is true, inserts `<span class="li-num">...</span>` markers (with `aria-hidden`) in front of list item text. If a marker entry lacks a `marker` string, the span content is rebuilt from number + marker type.

7. **Phase 6 - `moveNestedListAttributes`**
   After `curly_attributes`, moves attributes that markdown-it-attrs attached to the last `<li>` onto the parent flattened `<ol>` so nested list classes survive flattening.

## Loose vs Tight Lists

- Tight/loose classification follows markdown-it exactly:
  - A blank line between items makes the entire list loose.
  - Multiple paragraphs or block-level content inside a list item also force loose output.
- Phase 1 uses `paragraph_open.hidden` to detect loose lists, caches the result on list tokens as `_isLoose`, and hides first paragraphs for tight lists at level 0.
- When flattening `- 1.` patterns:
  - If `token.map` is available, blank lines between items are detected via line numbers.
  - If `token.map` is missing (tokens constructed manually, cloned without `map`, or stripped by upstream plugins), the flattener falls back to list `_isLoose` and `paragraph.hidden`.
- Mapless fallback can render `- 1.` lists with blank lines as tight (no `<p>` wrappers). Avoid stripping `map` data or set `unremoveUlNest: true` if exact loose rendering is required.
- Values (`start`, `value`) are only emitted when numbering skips, repeats, or decreases.

## Marker & Attribute Notes

- `types-utility.js` wraps every interaction with `listTypes.json`. Do **not** access the JSON directly from other phases.
- Marker detection caches (`_symbolBasedTypes`, `_rangeBasedTypes`, `_sortedSymbolTypes`, `_typeInfoByName`) allow `detectMarkerType` and `getTypeAttributes` to run in linear time over the token stream.
- Custom markers (circled digits, kana, etc.) omit the `type` attribute, emit `role="list"`, and optionally `style="list-style: none;"` when `hasListStyleNone` is enabled.

## Description Lists

- `processDescriptionList` runs in a dedicated core rule before `inline`, so list analysis always sees already-converted `<dl>` structures.
- Attributes collected by markdown-it-attrs on the original `<p>` get moved to the generated `<dl>` (or wrapper `<div>` when `descriptionListWithDiv` is true).
- Generated `dl/dt/dd/div/p` tokens inherit `map` from the source list/paragraph tokens when available so source-line behavior remains consistent.
- Rendering uses markdown-it's default renderer; any needed attributes must be set on tokens (no custom renderer overrides).
- Phase 6 also handles description lists so nested `<ol>` structures created inside `<dd>` stay aligned with markdown-it-attrs output.

## HTML Blocks Inside Lists

- Markdown-it produces `html_block` tokens for `<div>`, `<table>`, etc. Phase 4 fixes indentation, removes redundant blank lines, and ensures the closing tags align with surrounding list markup.

## Debugging Tips

- Use `node debug/dump_tokens.mjs <testfile> <index>` or `node debug/dump_listinfos.mjs <testfile> <index>` when you need to inspect tokens or Phase 1 `listInfo` output.
- Literal nested list normalisation emits `_literalList`, `_literalTight`, `_literalLastLine`, and `_convertedFromFlatten`. When diagnosing tight/loose or merge issues, print those flags to confirm whether the normaliser created or altered a list.
- Useful flags on list and list-item tokens: `_markerInfo`, `_shouldConvert`, `_isLoose`, `_firstParagraphIsLoose`, `_parentIsLoose`.

## Caveats / Known Constraints

- Literal detection only runs on paragraph lines after the first line in a list item and uses marker-width indentation (marker width + 0–3 spaces). Lines indented beyond that are treated as code blocks or plain text and are not converted.
- When `token.map` is unavailable, flattened `- 1.` lists cannot detect blank lines between items, so tight/loose output may differ from mapful runs.
- Token metadata is attached to list tokens; if you clone or replace tokens, copy `_markerInfo`, `_shouldConvert`, `_isLoose`, and `_parentIsLoose` as needed.
- Flattening will **not** trigger when a parent `li` has visible text before the nested list. When debugging a case that still shows `<ul>` wrappers, confirm that the outer `li` has no inline content or paragraphs ahead of the literal child list.
- The debug scripts are ES modules (`node debug/...mjs`). Run them with `node` (>=18) or via `npm` scripts to avoid `require`-related errors.
