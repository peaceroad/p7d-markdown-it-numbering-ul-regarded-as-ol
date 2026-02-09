# `enableLiteralNumberingFix` Diff Details (`false` -> `true`)

This file lists concrete changed cases for the currently observed diff files.
Total changed cases in these files: 18.

## examples-default-14-repeated-numbers.txt (7)

Changed case numbers: 15, 16, 24, 26, 28, 29, 30

### Case 15

[Markdown]
```md
- a) Parent B
    2. Child B1
    1. Child B2
```

[HTML `false`]
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

[HTML `true`]
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

### Case 16

[Markdown]
```md
1) Parent B
    2. Child B1
    1. Child B2
```

[HTML `false`]
```html
<ol type="1" class="ol-decimal" data-marker-suffix=")">
<li>Parent B
2. Child B1
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>Child B2</li>
</ol>
</li>
</ol>
```

[HTML `true`]
```html
<ol type="1" class="ol-decimal" data-marker-suffix=")">
<li>Parent B
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>Child B1</li>
<li value="1">Child B2</li>
</ol>
</li>
</ol>
```

### Case 24

[Markdown]
```md
1. aaa
    2. bbb
1. aaa
    2. bbb

1. aaa
```

[HTML `false`]
```html
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>
<p>aaa
2. bbb</p>
</li>
<li>
<p>aaa
2. bbb</p>
</li>
<li>
<p>aaa</p>
</li>
</ol>
```

[HTML `true`]
```html
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>
<p>aaa</p>
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>bbb</li>
</ol>
</li>
<li>
<p>aaa</p>
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>bbb</li>
</ol>
</li>
<li>
<p>aaa</p>
</li>
</ol>
```

### Case 26

[Markdown]
```md
1. Outer gap
    2. Inner ready

        4. Deep start

        6. Deep continue

1. Outer plain
```

[HTML `false`]
```html
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>
<p>Outer gap
2. Inner ready</p>
<pre><code> 4. Deep start

 6. Deep continue
</code></pre>
</li>
<li>
<p>Outer plain</p>
</li>
</ol>
```

[HTML `true`]
```html
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>
<p>Outer gap</p>
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>Inner ready</li>
</ol>
<pre><code> 4. Deep start

 6. Deep continue
</code></pre>
</li>
<li>
<p>Outer plain</p>
</li>
</ol>
```

### Case 28

[Markdown]
```md
1. aaa
    2. bbb

    2. bbb

1. aaa
```

[HTML `false`]
```html
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>
<p>aaa
2. bbb</p>
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>bbb</li>
</ol>
</li>
<li>
<p>aaa</p>
</li>
</ol>
```

[HTML `true`]
```html
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>
<p>aaa</p>
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>
<p>bbb</p>
</li>
<li value="2">
<p>bbb</p>
</li>
</ol>
</li>
<li>
<p>aaa</p>
</li>
</ol>
```

### Case 29

[Markdown]
```md
1. aaa
    2. bbb

        ccc

1. aaa
```

[HTML `false`]
```html
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>
<p>aaa
2. bbb</p>
<pre><code> ccc
</code></pre>
</li>
<li>
<p>aaa</p>
</li>
</ol>
```

[HTML `true`]
```html
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>
<p>aaa</p>
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>bbb</li>
</ol>
<pre><code> ccc
</code></pre>
</li>
<li>
<p>aaa</p>
</li>
</ol>
```

### Case 30

[Markdown]
```md
1. aaa
    2. bbb

        ccc
```

[HTML `false`]
```html
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>
<p>aaa
2. bbb</p>
<pre><code> ccc
</code></pre>
</li>
</ol>
```

[HTML `true`]
```html
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>
<p>aaa</p>
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>bbb</li>
</ol>
<pre><code> ccc
</code></pre>
</li>
</ol>
```

## examples-option-literal-numbering-attrs.txt (1)

Changed case numbers: 1

### Case 1

[Markdown]
```md
- Parent
  2. Child {.red}
  3. Child two {.blue}
```

[HTML `false`]
```html
<ul>
<li>Parent
2. Child {.red}
3. Child two {.blue}</li>
</ul>
```

[HTML `true`]
```html
<ul>
<li>Parent
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>Child {.red}</li>
<li>Child two {.blue}</li>
</ol>
</li>
</ul>
```

## examples-option-literal-numbering-fix-disabled.txt (2)

Changed case numbers: 1, 3

### Case 1

[Markdown]
```md
- Parent
    2. Child one
    3. Child two
```

[HTML `false`]
```html
<ul>
<li>Parent
2. Child one
3. Child two</li>
</ul>
```

[HTML `true`]
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

### Case 3

[Markdown]
```md
- Parent
     2. Code child
     3. Code child two
```

[HTML `false`]
```html
<ul>
<li>Parent
2. Code child
3. Code child two</li>
</ul>
```

[HTML `true`]
```html
<ul>
<li>Parent
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>Code child</li>
<li>Code child two</li>
</ol>
</li>
</ul>
```

## examples-option-literal-numbering-fix.txt (4)

Changed case numbers: 1, 2, 4, 9

### Case 1

[Markdown]
```md
- Parent
    2. Child one
    3. Child two
```

[HTML `false`]
```html
<ul>
<li>Parent
2. Child one
3. Child two</li>
</ul>
```

[HTML `true`]
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

### Case 2

[Markdown]
```md
- Parent
    ② Child two
    ③ Child three
```

[HTML `false`]
```html
<ul>
<li>Parent
② Child two
③ Child three</li>
</ul>
```

[HTML `true`]
```html
<ul>
<li>Parent
<ol role="list" start="2" class="ol-circled-decimal">
<li><span class="li-num" aria-hidden="true">②</span> Child two</li>
<li><span class="li-num" aria-hidden="true">③</span> Child three</li>
</ol>
</li>
</ul>
```

### Case 4

[Markdown]
```md
- Parent
     2. Code child
     3. Code child two
```

[HTML `false`]
```html
<ul>
<li>Parent
2. Code child
3. Code child two</li>
</ul>
```

[HTML `true`]
```html
<ul>
<li>Parent
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>Code child</li>
<li>Code child two</li>
</ol>
</li>
</ul>
```

### Case 9

[Markdown]
```md
- Parent
    3. Child
        deep note line
        another note
```

[HTML `false`]
```html
<ul>
<li>Parent
3. Child
deep note line
another note</li>
</ul>
```

[HTML `true`]
```html
<ul>
<li>Parent
<ol type="1" start="3" class="ol-decimal" data-marker-suffix=".">
<li>Child</li>
</ol>
<p>      deep note line
another note</p>
</li>
</ul>
```

## examples-option-literal-numbering-indent.txt (4)

Changed case numbers: 3, 4, 7, 8

### Case 3

[Markdown]
```md
- Parent
  2. Child
  3. Child two
```

[HTML `false`]
```html
<ul>
<li>Parent
2. Child
3. Child two</li>
</ul>
```

[HTML `true`]
```html
<ul>
<li>Parent
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>Child</li>
<li>Child two</li>
</ol>
</li>
</ul>
```

### Case 4

[Markdown]
```md
- Parent
     2. Child
     3. Child two
```

[HTML `false`]
```html
<ul>
<li>Parent
2. Child
3. Child two</li>
</ul>
```

[HTML `true`]
```html
<ul>
<li>Parent
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>Child</li>
<li>Child two</li>
</ol>
</li>
</ul>
```

### Case 7

[Markdown]
```md
- Parent
	2. Child
	3. Child two
```

[HTML `false`]
```html
<ul>
<li>Parent
2. Child
3. Child two</li>
</ul>
```

[HTML `true`]
```html
<ul>
<li>Parent
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>Child</li>
<li>Child two</li>
</ol>
</li>
</ul>
```

### Case 8

[Markdown]
```md
1. Parent
   2. Child
   3. Child two
```

[HTML `false`]
```html
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>Parent
2. Child
3. Child two</li>
</ol>
```

[HTML `true`]
```html
<ol type="1" class="ol-decimal" data-marker-suffix=".">
<li>Parent
<ol type="1" start="2" class="ol-decimal" data-marker-suffix=".">
<li>Child</li>
<li>Child two</li>
</ol>
</li>
</ol>
```


Note: Counts in this detail file are generated from current working tree behavior.
