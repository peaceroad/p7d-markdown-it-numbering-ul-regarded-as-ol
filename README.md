# p7d-markdown-it-numbering-ul-regarded-as-ol

Markdown's default ordered list markers are limited. This plugin extends Markdown's unordered lists so they can use many kinds of ordered markers.

Also, this plugin option provides a description-list conversion. Unordered list items whose first line is wrapped in `**` and followed by two spaces are converted into `<dl>` elements.

## Ordered lists conversion behavior

This plugin detects unordered lists that use number-like markers (for example `- a.`, `- ①`) and converts them into appropriate ordered lists (`<ol>`). During conversion the plugin also attaches informative attributes to the generated elements.

Code. Conversion of a lowercase Roman numeral list.

```
[Markdown]
- i. First item
- ii. Second item
- iii. Third item

[HTML]
<ol type="i" class="ol-lower-roman" data-marker-suffix=".">
<li>First item</li>
<li>Second item</li>
<li>Third item</li>
</ol>
```

### Supported Marker Types

The plugin supports the following marker types.

- **HTML Standard Markers (with `type` attribute)**
    - decimal: `1`, `2`, `3`, pattern: common
    - lower-latin: `a`, `b`, `c`, pattern: common
    - upper-latin: `A`, `B`, `C`, pattern: common
    - lower-roman: `i`, `ii`, `iii`, pattern: common
    - upper-roman: `I`, `II`, `III`, pattern: common
- **Custom Markers (with `role="list"`)**
    - circled-decimal: `①`, `②`, `③`, pattern: enclosed
    - filled-circled-decimal: `❶`, `❷`, `❸`, pattern: enclosed
    - circled-lower-latin: `ⓐ`, `ⓑ`, `ⓒ`, pattern: enclosed
    - circled-upper-latin: `Ⓐ`, `Ⓑ`, `Ⓒ`, pattern: enclosed
    - filled-circled-upper-latin: `🅐`, `🅑`, `🅒`, pattern: enclosed
    - squared-decimal: `1⃣`, `2⃣`, `3⃣`, pattern: enclosed
    - squared-upper-latin: `🄰`, `🄱`, `🄲`, pattern: enclosed
    - filled-squared-upper-latin: `🅰`, `🅱`, `🅲`, pattern: enclosed
    - fullwidth-lower-roman: `ⅰ`, `ⅱ`, `ⅲ`, pattern: fullwidth
    - fullwidth-upper-roman: `Ⅰ`, `Ⅱ`, `Ⅲ`, pattern: fullwidth
    - japanese-informal: `一`, `二`, `三`, pattern: fullwidth
    - katakana: `ア`, `イ`, `ウ`, pattern: fullwidth
    - katakana-iroha: `イ`, `ロ`, `ハ`, pattern: fullwidth
    - lower-greek: `α`, `β`, `γ`, pattern: common

Marker separators differ depending on the character style used for the ordinal marker: ASCII markers (`- a.`, `- a)`, `(a)`), fullwidth markers (`- 一、`, `- 一．`), or enclosed glyphs (`- ①`, `- ❶`). The `pattern` value for each marker type indicates which separator rules apply:

- `common`: examples include `a.`, `a)`, `(a)`;
- `fullwidth`: includes fullwidth separators such as `イ．`, `イ）`, `（イ）`;
- `enclosed`: enclosed glyphs like `①` which do not use `.` or `)` as separators.

After the marker separator, an ASCII space is normally expected. For `fullwidth` and `enclosed` patterns a fullwidth space is accepted in place of the ASCII space; enclosed markers may also appear without a following space. See `listTypes.json` for the canonical marker definitions.

### Attributes and markers

- The generated `<ol>` receives a `class` of the form `ol-<marker-name>`. For example, a `- a.` marker results in `class="ol-lower-latin"` on the `<ol>`.
- Standard HTML markers (decimal, latin, roman) produce an `<ol>` with a `type` attribute (for example `type="1"`, `type="a"`, `type="i"`). Custom markers (circled numbers, Katakana, Kanji, etc.) do not set a `type` attribute by default; instead the plugin emits `role="list"` on the `<ol>`.
- When the starting number is not `1`, the plugin adds a native `start` attribute to the `<ol>` for both standard and custom markers.
- When a marker separator is present, the plugin adds `data-marker-prefix` and/or `data-marker-suffix` attributes with the matched strings. These attributes are omitted if there is no prefix/suffix (or if the suffix is visually only whitespace). For example, `- a.` results in `data-marker-suffix="."`.
- For custom markers the plugin inserts the visible marker text inside a `span` with the configured `markerSpanClass` (default: `li-num`). Example: `- ①` becomes `<li><span class="li-num" aria-hidden="true">①</span> A item.</li>`.
- When individual list item numbers jump, the plugin sets the native `value` attribute on the `li` element for both standard and custom markers.

### Structures

### How the marker type is chosen

The plugin uses the following deterministic selection procedure:

1. Collect all marker strings at the same nesting level and match each marker against the canonical definitions to produce candidate types. When appropriate, also detect whether the sequence appears to be a numeric enumeration.
2. For each candidate type evaluate how many items it would match and whether the numbering appears continuous (so that native `start`/`value` attributes would be correct). Prefer the type that explains the most items while preserving numeric continuity. If a type matches every item, select it.
3. If candidates remain tied or ambiguous, fall back to the order specified in `listTypes.json`.
- Flattening: A pattern like `- 1.` is represented by the default `ul > li > ol` nesting structure in markdown-it, but this plugin simplifies it to a single `ol` by default to match the representation of other markers.

Note: For custom marker lists (those rendered with `role="list"`) the plugin assumes you will hide the native marker via CSS (for example `ol[role="list"] { list-style: none; }`). The `hasListStyleNone` option can be enabled to add `style="list-style: none;"` directly to generated `<ol>` elements.

### Behavior customization

You can customize the conversion using options.

- `unremoveUlNest` (boolean) — If `true`, preserve the original `ul > li > ol` nesting instead of flattening into `ol > li`.
- `alwaysMarkerSpan` (boolean) — Wrap markers in a `<span>` (class `markerSpanClass`, default: `li-num`). When markers are rendered as custom markers the plugin emits `role="list"` and does not set a `type` attribute on the `<ol>`.
- `useCounterStyle` (boolean) — When `true` the plugin suppresses generated marker spans (no `span.li-num`) and prefers native `start`/`value` attributes so you can style lists with CSS `@counter-style`. Note that in this case the marker will not be selectable, as browsers currently do not support CSS `user-select` on markers.
- `markerSpanClass` (string) — Specify the class name applied to the marker `<span>` (default: `li-num`).
- `hasListStyleNone` (boolean) — When the plugin emits `role="list"`, also add `style="list-style: none;"` to the `<ol>`.
- `descriptionListDivClass` (string) — Class applied to the `<div>` wrappers when `descriptionListWithDiv` is enabled (empty string means no class).
- `omitMarkerMetadata` (boolean) — If `true`, omit the `data-marker-prefix` / `data-marker-suffix` attributes.

## Description lists conversion behavior

When the `descriptionList` option is enabled the plugin converts specially formatted bullet lists into HTML description lists (`<dl>`).

- Each list item must start with a `**Term**` line.
  - If the Term line is not separated from the description by a blank line, then the Term line must end with two ASCII spaces (a Markdown line-break) or a backslash `\` to indicate the description follows.

In the conversion the `**Term**` line becomes a `<dt>` and the subsequent lines become the corresponding `<dd>`.

Note: Currently the content inside `<dd>` elements is always wrapped in `<p>` elements.

### Description list options

- `descriptionList` (boolean) — Enable conversion of `**Term**` list patterns into `<dl>` description lists.
- `descriptionListWithDiv` (boolean) — Wrap `<dt>/<dd>` pairs in a `<div>` when enabled.
- `descriptionListDivClass` (string) — Class applied to the wrapper `<div>` when `descriptionListWithDiv` is enabled (empty string disables the class).

## Examples: Ordered Lists

HTML standard marker conversion (markers that set the `type` attribute). The plugin also accepts `)` as a separator in place of `.`:

```
[Markdown]
- A) First
- B) Second
- C) Third

[HTML]
<ol type="A" class="ol-upper-latin" data-marker-suffix=")">
<li>First</li>
<li>Second</li>
<li>Third</li>
</ol>
```

Custom marker conversion example:

```
[Markdown]
- ① First
- ② Second
- ③ Third

[HTML]
<ol role="list" class="ol-filled-circled-decimal">
<li><span class="li-num" aria-hidden="true">①</span> First</li>
<li><span class="li-num" aria-hidden="true">②</span> Second</li>
<li><span class="li-num" aria-hidden="true">③</span> Third</li>
</ol>
<!-- In this case the stylesheet is expected to hide the native marker, e.g. ol[role="list"] { list-style: none; } -->
```

Standard numeric markdown is converted as usual:

```
[Markdown]
1. First item
2. Second item

[HTML]
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>First item</li>
<li>Second item</li>
</ol>
```

For lists written in the `- 1.` style this plugin flattens the default `ul > li > ol` nesting into a single `ol > li` structure to match other conversion patterns:

```
[Markdown]
- 1. First item
- 2. Second item
- 3. Third item

[HTML]
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>First item</li>
<li>Second item</li>
<li>Third item</li>
</ol>
```

Nested lists are supported as well:

```
[Markdown]
- ② First item
    - i. Subitem A
    - iii. Subitem C
- ④ Second item

[HTML]
<ol role="list" start="2" class="ol-circled-decimal">
<li><span class="li-num" aria-hidden="true">②</span> First item
<ol type="i" class="ol-lower-roman" data-marker-suffix=".">
<li>Subitem A</li>
<li value="3">Subitem C</li>
</ol>
</li>
<li value="4"><span class="li-num" aria-hidden="true">④</span> Second item</li>
</ol>

[Markdown]
- 1. Parent item
    - a. Child item A
    - b. Child item B
- 2. Another parent

[HTML]
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>Parent item
<ol type="a" class="ol-lower-latin" data-marker-suffix=".">
<li>Child item A</li>
<li>Child item B</li>
</ol>
</li>
<li>Another parent</li>
</ol>
```

The plugin also handles loose lists (lists where items are separated by blank lines):

```
[Markdown]
- a. First item

- b. Second item

[HTML]
<ol type="a" class="ol-lower-latin" data-marker-suffix=".">
<li>
<p>First item</p>
</li>
<li>
<p>Second item</p>
</li>
</ol>


[Markdown]
- a. First item first paragraph.

    First item second paragraph.

- b. Second item first paragraph.

    Second item second paragraph.

[HTML]
<ol type="a" class="ol-lower-latin" data-marker-suffix=".">
<li>
<p>First item first paragraph.</p>
<p>First item second paragraph.</p>
</li>
<li>
<p>Second item first paragraph.</p>
<p>Second item second paragraph.</p>
</li>
</ol>
```

## Examples: Description Lists

When description lists are enabled the plugin can convert the following patterns:

```
[Markdown]
- **Term 1**  
Description text for term 1
- **Term 2**  
Description text for term 2

[HTML]
<dl>
<dt>Term 1</dt>
<dd>
<p>Description text for term 1</p>
</dd>
<dt>Term 2</dt>
<dd>
<p>Description text for term 2</p>
</dd>
</dl>

[Markdown]
- **Term 1**\
Description text for term 1
- **Term 2**\
Description text for term 2

[HTML]
<dl>
<dt>Term 1</dt>
<dd>
<p>Description text for term 1</p>
</dd>
<dt>Term 2</dt>
<dd>
<p>Description text for term 2</p>
</dd>
</dl>

[Markdown]
- **Term 1**

    Description 1, line 1.

    Description 1, line 2.

- **Term 2**

    Description 2, line 1.

    Description 2, line 2.

[HTML]
<dl>
<dt>Term 1</dt>
<dd>
<p>Description 1, line 1.</p>
<p>Description 1, line 2.</p>
</dd>
<dt>Term 2</dt>
<dd>
<p>Description 2, line 1.</p>
<p>Description 2, line 2.</p>
</dd>
</dl>
```

## Install

```pwsh
npm install @peaceroad/markdown-it-numbering-ul-regarded-as-ol
```

## Basic usage

```js
import mdit from 'markdown-it'
import mditNumberingUl from '@peaceroad/markdown-it-numbering-ul-regarded-as-ol'

const md = new mdit()
md.use(mditNumberingUl)

const html = md.render(`- a. First\n- b. Second`)
console.log(html)
```
