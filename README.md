# markdown-it-numbering-ul-regarded-as-ol

Note. I'll tidy it up a bit later.

A markdown-it plugin that detects numbering markers inside unordered list items (for example `- 1.`, `- a)`, `- IV.`) and converts those lists into real, semantic ordered lists (`<ol>`).

This plugin is useful when content uses bullet syntax with explicit markers and you want clean HTML ordered lists with correct numbering, attributes and styling hooks.

## Why this plugin?

- Converts bullet lists that contain manual markers into true ordered lists so the output is semantic and accessible.
- Supports many marker systems (decimal, roman, latin, circled numbers, katakana, iroha, and more) via `listTypes.json`.
- Preserves nesting, handles tight/loose lists, and supports optional behaviors (like preserving original `ul>li>ol` nesting).


## Core behavior

- Detects markers such as `1.`, `a)`, `IV.`, `①`, `イ.`, `一.` and converts a `bullet_list` into an `ordered_list` when appropriate.
- For standard HTML-compatible markers (decimal, latin, roman), the plugin sets the `type` attribute on `<ol>`.
- For custom marker systems, the plugin emits `role="list"`, CSS-ready class names (like `ol-circled-decimal`) and `data-*` attributes.
- Handles flattened patterns (e.g. `- 1.`) by converting `ul > li > ol` into a single `ol` if it makes sense, while providing an option to preserve the original nesting.


## Numbered List Examples

### Ordered list with type attribute

lowercase roman

```markdown
- i. Roman lowercase
- ii. Second item
- iii. Third item
```

Output:

```html
<ol type="i" class="ol-lower-roman" data-marker-suffix=".">
<li>Roman lowercase</li>
<li>Second item</li>
<li>Third item</li>
</ol>
```

Uppercase Latin

```markdown
- A) First
- B) Second
- C) Third
```

Output:

```html
<ol type="A" class="ol-upper-latin" data-marker-suffix=")">
<li>First</li>
<li>Second</li>
<li>Third</li>
</ol>
```

### Custom markers (circled numbers) with no `type` attribute

```markdown
- ① First
- ② Second
- ③ Third
```

Output as follows. Custom markers do not use the `type` attribute, ol element has `role="list"` instead, and markers are wrapped in `<span class="li-num">`.

```html
<ol role="list" class="ol-filled-circled-decimal">
<li><span class="li-num">①</span> First</li>
<li><span class="li-num">②</span> Second</li>
<li><span class="li-num">③</span> Third</li>
</ol>
```

### Special case: Decimal markers

Defaultly, `-` markers with decimal numbers are converted to `<ol type="1">` lists.

Input:

```markdown
- 1. First item
- 2. Second item
- 3. Third item
```

Output:

```html
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>First item</li>
<li>Second item</li>
<li>Third item</li>
</ol>
```

### Nested lists

```markdown
- 1. Parent item
    - a. Child item A
    - b. Child item B
- 2. Another parent
```

Output:

```html
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


## How marker types are chosen

- Marker definitions live in `listTypes.json`.
- The plugin detects the best matching marker system by inspecting markers at the same list level, using pattern checks and contextual heuristics when available.
- When multiple types match, the plugin prefers the type that best fits the whole list (and falls back to the JSON order when ambiguous).

## Developer notes (architecture)

Processing runs in multiple phases to keep logic separated and testable:

- Phase 0 — Description-list detection and conversion (if enabled)
- Phase 1 — Marker detection and list analysis (builds listInfo metadata)
- Phase 2 — Convert `bullet_list` tokens into `ordered_list` tokens and flatten nested patterns
- Phase 3 — Add attributes and `value` normalization
- Phase 4 — Normalize/remove list-related HTML block indentation
- Phase 5 — Optionally wrap markers with `<span>` elements for styling
- Phase 6 — Migrate attributes from nested list items to parent lists (for markdown-it-attrs integration)

The main code is under `src/` and marker systems are defined by `listTypes.json`.

**Note on Phase 6:** When using with [markdown-it-attrs](https://github.com/arve0/markdown-it-attrs), attributes placed after nested lists are automatically moved to the correct parent list element. This phase runs after `curly_attributes` processing to ensure proper attribute placement.


## Description Lists

When `descriptionList` option is enabled, the plugin detects `**Term**` patterns in bullet lists and converts them to semantic `<dl>` (description list) HTML.

### Basic syntax

```markdown
- **Term 1**
    Description text for term 1

- **Term 2**  
  Description text for term 2
```

Output:

```html
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
```

### Pattern variations

The plugin recognizes several patterns after `**Term**`:

1. **Two or more spaces** (including newlines): `**Term**  description`
2. **Colon**: `**Term**: description`
3. **Backslash**: `**Term**\ description`
4. **Term only**: `**Term**` (no description)
5. **With attributes**: `**Term** {.class}` (see markdown-it-attrs integration below)

### Multiple paragraphs

When the term is in its own paragraph:

```markdown
- **Term 1**

  Description paragraph 1
  
  Description paragraph 2

- **Term 2**

  Description paragraph
```

### Nested lists in descriptions

```markdown
- **Item with nested list**  
  Description text:
    - i. Nested item 1
    - ii. Nested item 2
```

Output:

```html
<dl>
<dt>Item with nested list</dt>
<dd>
<p>Description text:</p>
<ol type="i" class="ol-lower-roman" data-marker-suffix=".">
<li>Nested item 1</li>
<li>Nested item 2</li>
</ol>
</dd>
</dl>
```

### `descriptionListWithDiv` option

Wraps each `<dt>`/`<dd>` pair with a `<div>`:

```javascript
md.use(mdNumberingUl, {
  descriptionList: true,
  descriptionListWithDiv: true
})
```

Output:

```html
<dl>
<div>
<dt>Term</dt>
<dd>
<p>Description</p>
</dd>
</div>
</dl>
```

### Integration with markdown-it-attrs

The plugin works seamlessly with [markdown-it-attrs](https://github.com/arve0/markdown-it-attrs) to add classes and other attributes using `{.className}` syntax. **Place attributes at the end of the description**:

```markdown
- **Term 1**

  Description 1

- **Term 2**

  Description 2
{.custom-dl}
```

Output:

```html
<dl class="custom-dl">
<dt>Term 1</dt>
<dd>
<p>Description 1</p>
</dd>
<dt>Term 2</dt>
<dd>
<p>Description 2</p>
</dd>
</dl>
```

**Plugin loading order:** Load markdown-it-attrs before or after this plugin - both orders work correctly:

```javascript
// Either order works:
md.use(require('markdown-it-attrs'))
  .use(mdNumberingUl, { descriptionList: true })

// Or:
md.use(mdNumberingUl, { descriptionList: true })
  .use(require('markdown-it-attrs'))
```

You can also apply attributes to individual `<dt>` or `<dd>` elements:

```markdown
- **Term** {.term-class}
    Description {.desc-class}
```

**Nested list attributes:** When using attributes with nested numbered lists, the plugin automatically moves attributes to the correct parent list:

```markdown
- 1. Parent item
    - a. Child A
    - b. Child B
{.parent-list}
```

Output (Phase 6 automatically moves the attribute to the parent `<ol>`):

```html
<ol type="1" class="ol-decimal parent-list" data-marker-suffix=".">
<li>Parent item
<ol type="a" class="ol-lower-latin" data-marker-suffix=".">
<li>Child A</li>
<li>Child B</li>
</ol>
</li>
</ol>
```

### Emphasis and formatting in terms

When used with [@peaceroad/markdown-it-strong-ja](https://github.com/peaceroad/markdown-it-strong-ja) or similar plugins, inline formatting is preserved in terms:

```markdown
- **API *endpoint* definition**
    This term contains emphasis

- ***Important* Term**
    This term has emphasis inside
```

Output:

```html
<dl>
<dt>API <em>endpoint</em> definition</dt>
<dd>
<p>This term contains emphasis</p>
</dd>
<dt><em>Important</em> Term</dt>
<dd>
<p>This term has emphasis inside</p>
</dd>
</dl>
```

### Compatibility with other plugins

This plugin works well with:

- **markdown-it-deflist**: Standard definition list syntax (`:` prefix) works alongside `**Term**` syntax
- **@peaceroad/markdown-it-strong-ja**: `*` for emphasis and `**` for strong in Japanese text
- **markdown-it-attrs**: Attribute syntax as shown above


## Supported Marker Types

See `listTypes.json` for full details. Main marker types:

### HTML Standard Markers (with `type` attribute)

- **decimal**: `1`, `2`, `3`
- **lower-latin**: `a`, `b`, `c`
- **upper-latin**: `A`, `B`, `C`
- **lower-roman**: `i`, `ii`, `iii`
- **upper-roman**: `I`, `II`, `III`

### Custom Markers (with `role="list"`)

- **circled-decimal**: `①`, `②`, `③` (circled numbers)
- **filled-circled-decimal**: `❶`, `❷`, `❸` (filled circled numbers)
- **circled-lower-latin**: `ⓐ`, `ⓑ`, `ⓒ` (circled lowercase)
- **circled-upper-latin**: `Ⓐ`, `Ⓑ`, `Ⓒ` (circled uppercase)
- **filled-circled-upper-latin**: `🅐`, `🅑`, `🅒` (filled circled uppercase)
- **squared-upper-latin**: `🄰`, `🄱`, `🄲` (squared uppercase)
- **filled-squared-upper-latin**: `🅰`, `🅱`, `🅲` (filled squared uppercase)
- **fullwidth-lower-roman**: `ⅰ`, `ⅱ`, `ⅲ` (fullwidth lowercase Roman)
- **fullwidth-upper-roman**: `Ⅰ`, `Ⅱ`, `Ⅲ` (fullwidth uppercase Roman)
- **japanese-informal**: `一`, `二`, `三` (Japanese Kanji numerals)
- **katakana**: `ア`, `イ`, `ウ` (Katakana)
- **katakana-iroha**: `イ`, `ロ`, `ハ` (Katakana Iroha order)
- **lower-greek**: `α`, `β`, `γ` (lowercase Greek)


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

## Options

The plugin accepts an options object when used. Key options:

- `alwaysMarkerSpan` (boolean) — Wrap markers in a `<span>` (class `li-num`) even when not strictly necessary. Useful for consistent styling.
- `unremoveUlNest` (boolean) — If `true`, keep the original `ul > li > ol` nesting instead of flattening into `ol > li`.
- `descriptionList` (boolean) — Enable conversion of special `**Term**` list patterns into `<dl>` description lists.
- `descriptionListWithDiv` (boolean) — Wrap `<dd>` content in `<div>` when descriptionList is enabled.
- `hasListStyleNone` (boolean) — When the plugin emits `role="list"`, also add `style="list-style: none;"` to the `<ol>`.
- `useCounterStyle` (boolean) — Set `useCounterStyle: true` to suppress marker spans and prefer native `start`/`value` attributes for CSS `@counter-style` usage.
