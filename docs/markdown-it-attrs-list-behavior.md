# Comparison: List Attr Behavior in `markdown-it-attrs` and This Plugin

This document summarizes how list-related attrs are attached:

- in `markdown-it + markdown-it-attrs` (baseline), and
- in `markdown-it + markdown-it-attrs + @peaceroad/markdown-it-numbering-ul-regarded-as-ol`.

## Baseline Rule

`markdown-it-attrs` applies attr blocks (`{.class}`, `{#id}`, `{k=v}`, `{flag}`) to the nearest recognized block in that position.  
Attrs are not auto-promoted to an outer/root list.

## Example A: Plain nested bullet list (no conversion case)

Markdown:

```markdown
- Parent
    - Child1
    - Child2
    {.nested-end}
{.root-end}
```

HTML (`markdown-it-attrs` only):

```html
<ul>
<li>Parent
<ul class="root-end">
<li>Child1</li>
<li class="nested-end">Child2
</li>
</ul>
</li>
</ul>
```

HTML (with this plugin):

```html
<ul>
<li>Parent
<ul class="root-end">
<li>Child1</li>
<li class="nested-end">Child2
</li>
</ul>
</li>
</ul>
```

Result: same behavior.  
`{.nested-end}` attaches to nested child `<li>`, `{.root-end}` attaches to nested `<ul>`.

## Example B: Numbered marker conversion case

Markdown:

```markdown
- 1. Parent
    - a. Child1
    - b. Child2
    {.nested-end}
{.root-end}
```

HTML (`markdown-it-attrs` only):

```html
<ul>
<li>
<ol>
<li>Parent</li>
</ol>
<ul class="root-end">
<li>a. Child1</li>
<li class="nested-end">b. Child2
</li>
</ul>
</li>
</ul>
```

HTML (with this plugin):

```html
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>Parent
<ol type="a" class="ol-lower-latin root-end" data-marker-suffix=".">
<li>Child1</li>
<li class="nested-end">Child2
</li>
</ol>
</li>
</ol>
```

Result: structure changes (`ul`/text markers become normalized `ol`), but attr anchoring rule is still nearest-block.  
No post-pass migration to a parent/root list is performed.

## Example C: Tail attrs after a `- 1.` list

Markdown:

```markdown
- 1. aaa
- 2. bbb
{.list-end}
```

HTML (`markdown-it-attrs` only):

```html
<ul>
<li>
<ol>
<li>aaa</li>
</ol>
</li>
<li>
<ol start="2" class="list-end">
<li>bbb</li>
</ol>
</li>
</ul>
```

HTML (with this plugin):

```html
<ol type="1" class="ol-decimal list-end" data-marker-suffix=".">
<li>aaa</li>
<li>bbb</li>
</ol>
```

Result: the plugin flattens list scaffolding, so the nearest target list is different; attrs stay nearest-block in both modes.

## Notes

- Plugin order (`attrs -> plugin` vs `plugin -> attrs`) is expected to produce the same output for these covered list cases.
- `{attrs}` means a boolean attribute named `attrs` (`attrs=""`).  
  Use `{.attrs}` if you intend a CSS class.
