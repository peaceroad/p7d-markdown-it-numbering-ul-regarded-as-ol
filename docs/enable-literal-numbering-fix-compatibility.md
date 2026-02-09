# `enableLiteralNumberingFix` Compatibility Notes (`false` -> `true`)

This document explains what changes when `enableLiteralNumberingFix` is switched from `false` to `true`, why those changes happen, and what still remains as risk.

## Summary

- `false`: markdown-it default behavior is kept for multiline text inside list items.
- `true`: marker-like lines after the first line in a list item are normalized into real nested ordered lists (`<ol>`), even when numbering starts from `2` or custom markers.
- This is an output-changing option by design. Treat default flip (`false` -> `true`) as a breaking change.

## Current Diff Snapshot (test corpus)

- Compared on current fixture corpus: `394` markdown cases.
- Output differs in `18` cases when switching `false` -> `true`.
- Changed files:
  - `examples-default-14-repeated-numbers.txt` (`7`)
  - `examples-option-literal-numbering-attrs.txt` (`1`)
  - `examples-option-literal-numbering-fix-disabled.txt` (`2`)
  - `examples-option-literal-numbering-fix.txt` (`4`)
  - `examples-option-literal-numbering-indent.txt` (`4`)
- Full per-case markdown/HTML diff details: `docs/enable-literal-numbering-fix-diff-details.md`.

## Why HTML Changes

markdown-it normally creates nested `<ol>` only for patterns it can parse as nested lists directly.  
For multiline paragraph content like:

```md
- Parent
    2. Child one
    3. Child two
```

the `2.` / `3.` lines are often left as plain text unless special normalization is done.

`enableLiteralNumberingFix: true` adds that normalization pass before later list phases.

## Concrete Cases

### 1) Basic literal nested numbering (start from 2)

```md
- Parent
    2. Child one
    3. Child two
```

`false`:

```html
<ul>
<li>Parent
2. Child one
3. Child two</li>
</ul>
```

`true`:

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

### 2) Number reset / jump now becomes native list semantics

```md
- a) Parent B
    2. Child B1
    1. Child B2
```

`false`:

```html
<ol type="a" class="ol-lower-latin" data-marker-suffix=")">
<li>Parent B
2. Child B1
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>Child B2</li>
</ol>
</li>
</ol>
```

`true`:

```html
<ol type="a" class="ol-lower-latin" data-marker-suffix=")">
<li>Parent B
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>Child B1</li>
<li value="1">Child B2</li>
</ol>
</li>
</ol>
```

### 3) Not only `ul`: ordered parent items can also change

```md
1. aaa
    2. bbb
1. aaa
    2. bbb

1. aaa
```

`false` keeps `2. bbb` as paragraph text in each item.  
`true` turns each `2. bbb` into nested `<ol start="2">`.

### 4) Interaction with `markdown-it-attrs` can change attachment target

Input:

```md
- Parent
  2. Child {.red}
  3. Child two {.blue}
```

with `markdown-it-attrs`:

`false`:

```html
<ul>
<li class="blue">Parent
2. Child {.red}
3. Child two</li>
</ul>
```

`true`:

```html
<ul>
<li>Parent
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li class="red">Child</li>
<li class="blue">Child two</li>
</ol>
</li>
</ul>
```

Reason: once literal lines become real list items, attrs are attached to those list items (nearest-block behavior).

### 5) Ambiguous mixed-indentation case (fail-closed guard)

```md
- Parent
    3. Child
        5. Deep marker-like
        6. Deep marker-like
```

Current behavior (`true`): intentionally does **not** partially convert this paragraph; output stays same as `false`.

This avoids surprising half-converted HTML when literal-depth and code-block-depth marker-like lines are mixed.

## Remaining Risks Even After Mitigation

- Some output differences are unavoidable because this option changes parse/transform semantics intentionally.
- On multiline-heavy inputs, extra normalization work remains a cost center.
- Ambiguous mixed-indentation inputs are now conservative (skip conversion), which can be seen as under-conversion in some authoring styles.
- If upstream processing strips `token.map`, tight/loose fidelity limits still apply (known plugin-wide constraint).

## Release Guidance

- Keep default `false` for patch/minor releases.
- If default is changed to `true`, treat it as major (breaking output behavior).
