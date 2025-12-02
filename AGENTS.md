
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

## Pipeline Flow (registered in `index.js`)

1. **Phase 0 - `processDescriptionList`**  
   Detects `**Term**` bullet patterns and rewrites them into `<dl>/<dt>/<dd>`, optionally wrapping each pair in `<div>` when `descriptionListWithDiv` is enabled.

2. **Literal ordered-list normalisation - `normalizeLiteralOrderedLists`**  
   Markdown-it only emits nested `<ol>` when the child numbering starts at `1`. This normaliser runs two quick passes:
   - **Paragraph pass** (guarded by a cheap indented-line regex). It splits the paragraph into literal segments and plain text, creates real `ordered_list` tokens with `_literalList` / `_literalTight` hints, preserves inline attributes, and merges immediately-following markdown-it `<ol>` tokens so each item ends up with a single child `<ol>`.
   - **Code-block pass** (guarded by another regex). It detects `code_block` tokens that markdown-it produced for literal lists. When the block is a continuation of a literal list, it is removed, converted into real `<p>` tokens (dedented, multi-paragraph-aware), and inserted before the parent `li` close.
   Each synthetic list tracks `_literalStartLine` / `_literalLastLine` so later passes can decide whether blank lines existed between literal fragments and markdown-it generated lists; fabricated paragraphs stay tight unless the source truly had a gap.

3. **Phase 1 - `analyzeListStructure`**  
   Walks the token stream, collects every list (top-level plus nested), and builds `listInfo` objects with:
   - `items`, their inline content, nested lists, and looseness hints.
   - `markerInfo` (type, sequence count, literal numbers) via `detectMarkerType`.

4. **Phase 2 - `convertLists` + `simplifyNestedBulletLists`**  
   - Converts eligible `bullet_list` instances into `ordered_list`, removes marker text from inline tokens, and stores `_markerInfo`.
   - Flattens `ul > li > ol` scaffolding (the "- 1." pattern). When flattening, it merges marker metadata from parent and child lists, honours `_literalList` so synthetic lists keep their numbering, and fixes tight/loose states directly (no temporary flags) using `_literalTight`, `_literalLastLine`, and real blank-line checks from token `map` info.

5. **Phase 3 - `addAttributes`**  
   Applies `type`, `role`, `class`, `data-marker-*`, `start`, and `value` attributes to every ordered list and list item. Uses the stored `_markerInfo` plus `types-utility.js`.

6. **Phase 4 - `processHtmlBlocks`**  
   Dedents HTML blocks nested inside lists, trims unnecessary blank lines, and standardises closing tags.

7. **Phase 5 - `generateSpans`** (optional)  
   When `alwaysMarkerSpan` is true, inserts `<span class="li-num">...</span>` markers (with `aria-hidden`) in front of list item text.

8. **Phase 6 - `moveNestedListAttributes`**  
   After `curly_attributes`, moves attributes that markdown-it-attrs attached to the last `<li>` onto the parent flattened `<ol>` so nested list classes survive flattening.

## Loose vs Tight Lists

- Tight/loose classification follows markdown-it exactly:
  - A blank line between items makes the entire list loose.
  - Multiple paragraphs or block-level content inside a list item also force loose output.
- When flattening `- 1.` patterns, use token `map` data (or `_literalStartLine` / `_literalLastLine`) to detect blank lines between the original outer `<li>` blocks. Honour `_literalTight` (and unhide literal code-block parents) to prevent fabricated paragraphs from being forcefully shown.
- Phase 1 marks an ordered list tight only when there really wasn’t a blank line; for tight lists it rewrites the first paragraph’s `hidden` flag so Phase 2 doesn’t accidentally show it again.
- Values (`start`, `value`) are only emitted when numbering skips, repeats, or decreases.

## Marker & Attribute Notes

- `types-utility.js` wraps every interaction with `listTypes.json`. Do **not** access the JSON directly from other phases.
- Marker detection caches (`_symbolBasedTypes`, `_rangeBasedTypes`, `_sortedSymbolTypes`, `_typeInfoByName`) allow `detectMarkerType` and `getTypeAttributes` to run in linear time over the token stream.
- Custom markers (circled digits, kana, etc.) omit the `type` attribute, emit `role="list"`, and optionally `style="list-style: none;"` when `hasListStyleNone` is enabled.

## Description Lists

- `src/phase0-description-list.js` rewrites bullet list patterns `- **Term** ...` into `<dl>` structures. Attributes collected by markdown-it-attrs on the original `<p>` get moved to the generated `<dl>` (or wrapper `<div>` when `descriptionListWithDiv` is true).
- Phase 6 also handles description lists so nested `<ol>` structures created inside `<dd>` stay aligned with markdown-it-attrs output.

## HTML Blocks Inside Lists

- Markdown-it produces `html_block` tokens for `<div>`, `<table>`, etc. Phase 4 fixes indentation, removes redundant blank lines, and ensures the closing tags align with surrounding list markup.

## Debugging Tips

- Use `node debug/dump_tokens.mjs <testfile> <index>` or `node debug/dump_listinfos.mjs <testfile> <index>` when you need to inspect tokens or Phase 1 `listInfo` output.
- Literal nested list normalisation emits `_literalList`, `_literalTight`, `_literalLastLine`, and `_convertedFromFlatten`. When diagnosing tight/loose or merge issues, print those flags to confirm whether the normaliser created or altered a list.

## Caveats / Known Constraints

- Literal detection relies on simple regex guards (indented ASCII markers). If you add marker types that don’t fit that shape, update the hints or the normaliser will skip them entirely.
- Code-block conversion assumes the `code_block` sits directly under a list item. Nested wrappers (blockquotes, additional lists) may confuse the current parent search.
- Blank-line checks depend on markdown-it `map` data. If maps are disabled/stripped, Phase 2 can’t reliably determine loose vs tight states for flattened lists.
- Phase 3+ reuse Phase 1 `listInfos` built before token surgery. Any new preprocessing must keep token order compatible or re-run analysis, otherwise later phases may read stale indices/marker info.
- The debug scripts are ES modules (`node debug/...mjs`). Run them with `node` (>=18) or via `npm` scripts to avoid `require`-related errors.
