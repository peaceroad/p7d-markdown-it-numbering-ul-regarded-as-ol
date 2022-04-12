# p7d-markdown-it-numbering-ul-regarded-as-ol

This regard ul element with numbering lists as ol element.

Input Markdown:

```markdown
- i. a
- ii. b
- iii. c
```

Output HTML:

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
<li aria-label="i">a</li>
<li aria-label="ii">b</li>
<li aria-label="iii">c</li>
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
<ol role="list" class="ol-filled-circled-decimal">
<li aria-label="❶">a</li>
<li aria-label="❷">b</li>
<li aria-label="❸">c</li>
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
<ol start="2" role="list" class="ol-circled-decimal">
<li aria-label="②">a</li>
<li aria-label="③">b</li>
<li aria-label="④">c</li>
</ol>

[Markdown]
- (2). a
- (3). b
- (4). c
[HTML]
<ol start="2" role="list" class="ol-decimal-with-round-round">
<li aria-label="(2)">a</li>
<li aria-label="(3)">b</li>
<li aria-label="(4)">c</li>
</ol>

[Markdown]
- 2). a
- 3). b
- 4). c
[HTML]
<ol start="2" role="list" class="ol-decimal-with-none-round">
<li aria-label="2)">a</li>
<li aria-label="3)">b</li>
<li aria-label="4)">c</li>
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
<li aria-label="i">項目2-i</li>
<li aria-label="ii">項目2-ii</li>
<li aria-label="iii">項目2-iii</li>
</ol>
</li>
<li>項目3</li>
</ol>

[Markdown]
- ❸項目❸
- ❹項目❹
    - ②項目❹-②
    - ③項目❹-③
    - ④項目❹-④
- ❺項目❺
[HTML]
<ol start="3" role="list" class="ol-filled-circled-decimal">
<li aria-label="❸">項目❸</li>
<li aria-label="❹">項目❹
<ol start="2" role="list" class="ol-circled-decimal">
<li aria-label="②">項目❹-②</li>
<li aria-label="③">項目❹-③</li>
<li aria-label="④">項目❹-④</li>
</ol>
</li>
<li aria-label="❺">項目❺</li>
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
<li aria-label="i">項目2-i</li>
<li aria-label="ii">項目2-ii
<ol type="a" class="ol-lower-latin">
<li aria-label="a">項目2-ii-a</li>
<li aria-label="b">項目2-ii-b</li>
<li aria-label="c">項目2-ii-c</li>
</ol>
</li>
<li aria-label="iii">項目2-iii</li>
</ol>
</li>
<li>項目3</li>
</ol>
```