# p7d-markdown-it-numbering-ul-regarded-as-ol

This regard ul element with numbering lists as ol element.

Input Markdown:

```markdown
- i. a
- ii. b
- iii. c
```

Output HTML:

```
<ol type="i" class="ol-lower-roman">
<li><span class="li-num">i<span class="li-num-joint">.</span></span> a</li>
<li><span class="li-num">ii<span class="li-num-joint">.</span></span> b</li>
<li><span class="li-num">iii<span class="li-num-joint">.</span></span> c</li>
</ol>
```

Using Option `describeListNumber: false` and `unsetListRole: false` output HTML:


```html
<ol type="i" class="ol-lower-roman">
<li aria-label="i">a</li>
<li aria-label="ii">b</li>
<li aria-label="iii">c</li>
</ol>
```

Notice. HTML output is still unstable.

## Install

```
npm i @peaceroad/markdown-it-numbering-ul-regarded-as-ol
```

Option

```js
const mdNumUl = require('@peaceroad/markdown-it-numbering-ul-regarded-as-ol');
md.use(mdNumUl);
```

When using options:

```js
md.use(mdNumUl, {
  describeListNumber: false,
  unsetListRole: false,
});
```

## Example

```
[Markdown]
1. a
2. b
3. c
[HTML]
<ol class="ol-decimal">
<li>a</li>
<li>b</li>
<li>c</li>
</ol>

[Markdown]
3. a
4. b
5. c
[HTML]
<ol start="3" class="ol-decimal">
<li>a</li>
<li>b</li>
<li>c</li>
</ol>

[Markdown]
1. a
3. b
4. c
[HTML]
<ol class="ol-decimal">
<li>a</li>
<li value="3">b</li>
<li>c</li>
</ol>


[Markdown]
- i. a
- ii. b
- iii. c
[HTML]
<ol type="i" class="ol-lower-roman">
<li><span class="li-num">i<span class="li-num-joint">.</span></span> a</li>
<li><span class="li-num">ii<span class="li-num-joint">.</span></span> b</li>
<li><span class="li-num">iii<span class="li-num-joint">.</span></span> c</li>
</ol>

[Markdown]
- a
- b
- c
[HTML]
<ul>
<li>a</li>
<li>b</li>
<li>c</li>
</ul>

[Markdown]
- ❶ a
- ❷ b
- ❸ c
[HTML]
<ol class="ol-filled-circled-decimal">
<li><span class="li-num">❶</span> a</li>
<li><span class="li-num">❷</span> b</li>
<li><span class="li-num">❸</span> c</li>
</ol>

[Markdown]
2. a
3. b
4. c
[HTML]
<ol start="2" class="ol-decimal">
<li>a</li>
<li>b</li>
<li>c</li>
</ol>

[Markdown]
- ② a
- ③ b
- ④ c
[HTML]
<ol start="2" class="ol-circled-decimal">
<li><span class="li-num">②</span> a</li>
<li><span class="li-num">③</span> b</li>
<li><span class="li-num">④</span> c</li>
</ol>

[Markdown]
- (2). a
- (3). b
- (4). c
[HTML]
<ol start="2" class="ol-decimal-with-round-round">
<li><span class="li-num">(2)</span> a</li>
<li><span class="li-num">(3)</span> b</li>
<li><span class="li-num">(4)</span> c</li>
</ol>

[Markdown]
- 2). a
- 3). b
- 4). c
[HTML]
<ol start="2" class="ol-decimal-with-none-round">
<li><span class="li-num">2)</span> a</li>
<li><span class="li-num">3)</span> b</li>
<li><span class="li-num">4)</span> c</li>
</ol>


[Markdown]
1. 項目1
2. 項目2
    - i. 項目2-i
    - ii. 項目2-ii
    - iii. 項目2-iii
3. 項目3
[HTML]
<ol class="ol-decimal">
<li>項目1</li>
<li>項目2
<ol type="i" class="ol-lower-roman">
<li><span class="li-num">i<span class="li-num-joint">.</span></span> 項目2-i</li>
<li><span class="li-num">ii<span class="li-num-joint">.</span></span> 項目2-ii</li>
<li><span class="li-num">iii<span class="li-num-joint">.</span></span> 項目2-iii</li>
</ol>
</li>
<li>項目3</li>
</ol>

[Markdown]
- i. 項目i
- ii. 項目ii
    1. 項目ii-1
    2. 項目ii-2
    3. 項目ii-3
- iii. 項目iii
[HTML]
<ol type="i" class="ol-lower-roman">
<li><span class="li-num">i<span class="li-num-joint">.</span></span> 項目i</li>
<li><span class="li-num">ii<span class="li-num-joint">.</span></span> 項目ii
<ol class="ol-decimal">
<li>項目ii-1</li>
<li>項目ii-2</li>
<li>項目ii-3</li>
</ol>
</li>
<li><span class="li-num">iii<span class="li-num-joint">.</span></span> 項目iii</li>
</ol>

[Markdown]
- ❸ 項目❸
- ❹ 項目❹
    - ② 項目❹-②
    - ③ 項目❹-③
    - ④ 項目❹-④
- ❺ 項目❺
[HTML]
<ol start="3" class="ol-filled-circled-decimal">
<li><span class="li-num">❸</span> 項目❸</li>
<li><span class="li-num">❹</span> 項目❹
<ol start="2" class="ol-circled-decimal">
<li><span class="li-num">②</span> 項目❹-②</li>
<li><span class="li-num">③</span> 項目❹-③</li>
<li><span class="li-num">④</span> 項目❹-④</li>
</ol>
</li>
<li><span class="li-num">❺</span> 項目❺</li>
</ol>

[Markdown]
1. 項目1
2. 項目2
    - i. 項目2-i
    - ii. 項目2-ii
        - a. 項目2-ii-a
        - b. 項目2-ii-b
        - c. 項目2-ii-c
    - iii. 項目2-iii
3. 項目3
[HTML]
<ol class="ol-decimal">
<li>項目1</li>
<li>項目2
<ol type="i" class="ol-lower-roman">
<li><span class="li-num">i<span class="li-num-joint">.</span></span> 項目2-i</li>
<li><span class="li-num">ii<span class="li-num-joint">.</span></span> 項目2-ii
<ol type="a" class="ol-lower-latin">
<li><span class="li-num">a<span class="li-num-joint">.</span></span> 項目2-ii-a</li>
<li><span class="li-num">b<span class="li-num-joint">.</span></span> 項目2-ii-b</li>
<li><span class="li-num">c<span class="li-num-joint">.</span></span> 項目2-ii-c</li>
</ol>
</li>
<li><span class="li-num">iii<span class="li-num-joint">.</span></span> 項目2-iii</li>
</ol>
</li>
<li>項目3</li>
</ol>
```