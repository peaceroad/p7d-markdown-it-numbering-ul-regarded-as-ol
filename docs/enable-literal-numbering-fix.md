# `enableLiteralNumberingFix` Notes (`false` default)

## Current Status

- `enableLiteralNumberingFix` default is `false` (legacy-compatible).
- `npm test` passes in default mode and with explicit `enableLiteralNumberingFix: true`.
- The main tradeoff is output compatibility, not parser correctness.
- The default flip is currently deferred; marker-schema changes are being handled separately.

## Behavior Summary

- `false` (default):
  - Keeps markdown-it default behavior for literal nested numbering lines (they may remain plain text).
- `true` (opt-in):
  - Recovers marker-like literal lines inside list items as real nested `<ol>` structures.
  - Example: `- Parent` + indented `2.` / `3.` becomes nested `<ol start="2">`.
  - Validates candidate lines against the original source indentation (parent list marker width + 0–3 spaces). If source line maps are unavailable, the recovery fails closed and leaves the original paragraph text unchanged.

## Compatibility Snapshot (`false` vs `true`)

- Corpus size: `399` fixture cases
- Changed output cases: `19`
- Changed files:
  - `examples-default-14-repeated-numbers.txt` (`7`)
  - `examples-option-literal-numbering-attrs-disabled.txt` (`1`)
  - `examples-option-literal-numbering-attrs.txt` (`1`)
  - `examples-option-literal-numbering-fix-disabled.txt` (`2`)
  - `examples-option-literal-numbering-fix.txt` (`4`)
  - `examples-option-literal-numbering-indent.txt` (`4`)

## Diff Classification

- `A` Desired conversion (`16`)
  - Real marker-like literal lines are normalized into structured nested lists.
- `B` Migration-only (`3`)
  - Legacy fixtures intentionally kept as plain text in default mode.
- `C` Unacceptable regression (`0`)

## Representative Example

[Markdown]

```md
- Parent
    2. Child one
    3. Child two
```

`false` (default):

```html
<ul>
<li>Parent
2. Child one
3. Child two</li>
</ul>
```

`true` (opt-in):

```html
<ul>
<li>Parent
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>Child one</li>
<li>Child two</li>
</ol>
</li>
</ul>
```

## Operational Guidance

- Keep default `false` when HTML snapshot/backward-compat stability is required.
- Keep `token.map` data when enabling this option; the raw-source indentation guard depends on source line numbers.
- Enable per project or per document when literal nested numbering normalization is desired:

```js
md.use(mditNumberingUl, { enableLiteralNumberingFix: true })
```

- Treat switching between `false` and `true` as a breaking-output configuration change.

## Default-Flip Readiness

- Keep `false` for the current release line.
- Consider `true` only in a clearly announced breaking-output release.
- Before changing the default, commit a repeatable `false` vs `true` corpus-diff tool and retain explicit `false` legacy fixtures.
- Add tab-stop, mixed tab/space, blockquote + tab, HTML-block, attrs-order, and mapless boundary coverage.
- Re-run median performance comparisons on real document/book corpora. Synthetic paired measurements show ordinary lists are nearly neutral, multiline non-literal lists pay a modest scan cost, and documents containing many recovered literal candidates pay the expected token-construction cost.
