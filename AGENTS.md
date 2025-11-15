# markdown-it-numbering-ul-regarded-as-ol 開発ガイド

## 開発の基本方針

### テスト駆動開発
- `npm test`を順次パスしていくように開発を進める
- テスト出力の見方: **実際の出力がH**、**期待値がC**

### コード品質
- デバッグ用のコンソール出力は、必要がなくなったら削除
- 使われていない関数や、不要なコメントは削除
- 各ファイルは、上から下へ読むと分かるような構成にする
- 必要に応じて`index.js`からの処理フローを再確認

### 重要な設計原則
- **DRY原則**: 重複コードを排除し、ヘルパー関数を活用
- **カプセル化**: listTypes.jsonへは必ずtypes-utility.js経由でアクセス
- **パフォーマンス**: O(n)検索を避ける
- **保守性**: 関数名は明確に、複雑な処理にはコメント必須

## プラグインのアーキテクチャ

### ファイル構成

**実行時使用ファイル:**
- `index.js`: メインエントリーポイント
- `listTypes.json`: マーカータイプ定義（データソース）
- `src/types-utility.js`: listTypes.json唯一のアクセスポイント（772行）
- `src/list-helpers.js`: 共通ヘルパー関数（findMatchingClose等）
- `src/phase0-description-list.js`: Description List処理
- `src/phase1-analyze.js`: リスト構造解析
- `src/phase2-convert.js`: bullet_list→ordered_list変換
- `src/phase3-attributes.js`: HTML属性付与
- `src/phase4-html-blocks.js`: HTMLブロック整形
- `src/phase5-spans.js`: マーカーspan生成
- `src/phase6-attrs-migration.js`: ネストリスト属性移動

### list-helpers.js（共通ヘルパー）

**目的:**
重複コードの排除。Phase 0, 1, 2, 3, 5で使用されていた`findMatchingClose`を共通化。

**エクスポート関数:**
```javascript
export const findMatchingClose = (tokens, startIdx, openType, closeType)
export const findListEnd = (tokens, startIndex)
export const findListItemEnd = (tokens, startIndex)
```

**使用例:**
```javascript
import { findMatchingClose } from './list-helpers.js'

const closeIdx = findMatchingClose(tokens, i, 'ordered_list_open', 'ordered_list_close')
if (closeIdx === -1) {
  // Not found
}
```

**戻り値:**
- 見つかった場合: closeトークンのインデックス
- 見つからない場合: `-1`

**注意:**
Phase 0では歴史的理由で`tokens.length - 1`を期待する箇所があるため、ラッパー関数で変換している。

### listTypes.jsonとtypes-utility.js

#### listTypes.json（マーカー定義）

マーカータイプの唯一の情報源:

```json
{
  "types": [
    {
      "name": "decimal",
      "range": [0, 50],
      "start": 0,
      "patterns": "common"
    },
    {
      "name": "katakana-iroha",
      "symbols": ["イ", "ロ", "ハ", ...],
      "start": 1,
      "patterns": "japanese"
    }
  ],
  "patterns": [
    {
      "name": "common",
      "patterns": [
        {"prefix": "", "suffix": "."},
        {"prefix": "", "suffix": ")"},
        {"prefix": "(", "suffix": ")"}
      ]
    }
  ]
}
```

**プロパティ:**
- `name`: マーカータイプ名
- `symbols`: シンボル配列（カタカナ、ローマ数字など）
- `range`: 範囲（数字、アルファベット）
- `start`: 開始値（0または1）
- `patterns`: パターングループ名（"common", "japanese", "no-suffix"）

#### types-utility.js（データアクセス層）

**責任:**
- listTypes.jsonへの唯一のアクセスポイント
- マーカー検出、型判定、属性生成

**最適化:**
- 4層キャッシング: `_symbolBasedTypes`, `_rangeBasedTypes`, `_sortedSymbolTypes`, `_typeInfoByName`
- O(1)検索: `Map<name, typeInfo>`使用
- ヘルパー関数: `getStartValue()`, `extractPureSymbol()`, `tryMatchPattern()`, `createMarkerResult()`

**主要エクスポート:**

```javascript
// Phase 1で使用
export const detectMarkerType = (content, allContents = null)
export const detectSequencePattern = (allContents)

// Phase 3, 5で使用
export const getTypeAttributes = (markerType, markerInfo = null)
export const getSymbolForNumber = (markerType, number)

// その他
export const isConvertibleMarkerType = (markerType)
export const compiledTypes = (() => { ... })()
export const prefixs = [['(', 'round'], ...]
export const suffixs = [[')', 'round'], ...]
```

**設計原則:**
- 各フェーズはlistTypes.jsonに直接アクセス禁止
- 全てtypes-utility.js経由でアクセス

### 処理フロー

#### index.jsでの実行順序

```javascript
// 1. メインプロセッサ（inline前）
md.core.ruler.before('inline', 'numbering_ul_phases', listProcessor)

// 2. Attribute移動（curly_attributes後）
md.core.ruler.after('curly_attributes', 'numbering_dl_attrs', attributeProcessor)

// 3. カスタムレンダラー登録
md.renderer.rules.dl_open = renderDLOpen
md.renderer.rules.dt_open = renderDTOpen
md.renderer.rules.dd_open = renderDDOpen
// ...
```

#### listProcessor内の処理順序

1. **Phase 0**: `processDescriptionList(tokens, options)`
   - `**Term**`パターン → `<dl><dt>Term</dt><dd>Description</dd></dl>`
   - types-utility.js使用: なし

2. **Phase 1**: `analyzeListStructure(tokens)`
   - マーカー検出、`listInfo`配列作成
   - types-utility.js使用: `detectMarkerType()`

3. **Phase 2**: `convertLists(tokens, listInfo, opt)`
   - `bullet_list` → `ordered_list`
   - `simplifyNestedBulletLists()`でフラット化
   - Loose/tight判定
   - types-utility.js使用: なし

4. **Phase 3**: `addAttributes(tokens, listInfo, options)`
   - `type`, `role`, `class`, `data-*`属性付与
   - types-utility.js使用: `getTypeAttributes()`

5. **Phase 4**: `processHtmlBlocks(tokens)`
   - リスト内HTMLブロックのインデント除去
   - types-utility.js使用: なし

6. **Phase 5**: `generateSpans(tokens, listInfo, options)`
   - `alwaysMarkerSpan: true`時のマーカーspan化
   - types-utility.js使用: `getTypeAttributes()`, `getSymbolForNumber()`

#### 追加プロセッサ（Phase 6）

markdown-it-attrsプラグインとの連携のため、別ルールとして登録:

```javascript
// Phase 6: ネストリスト属性移動（curly_attributes後に実行）
md.core.ruler.after('curly_attributes', 'numbering_ul_nested_attrs', nestedListAttrProcessor)
```

**Phase 6**: `moveNestedListAttributes(tokens)`
- フラット化されたネストリスト（`- 1. Parent\n    - a. Child\n{.class}`）の属性を親リストに移動
- markdown-it-attrsが`{.class}`を最後の`<li>`に付与するため、それを親`<ol>`に移動
- 処理対象: `list_item_close`の直後に`ordered_list_close`または`bullet_list_close`がある場合
- types-utility.js使用: なし
- list-helpers.js使用: なし（直接トークン走査）

**Phase 6実装の背景:**
markdown-it-attrsプラグインは`{.class}`をリストの最後の要素（`<li>`や`<p>`）に付与する。
しかし、ネストリストのフラット化後は、子リストの`{.class}`が親リストに適用されるべき。
Phase 6はこの属性移動を自動的に行う。

**例:**
```markdown
- 1. Parent
    - a. Child A
    - b. Child B
{.parent-class}
```

markdown-it-attrs処理後（Phase 6前）:
```html
<ol>
<li class="parent-class">Parent  <!-- 誤: liに付与 -->
<ol>
<li>Child A</li>
<li>Child B</li>
</ol>
</li>
</ol>
```

Phase 6処理後:
```html
<ol class="parent-class">  <!-- 正: 親olに移動 -->
<li>Parent
<ol>
<li>Child A</li>
<li>Child B</li>
</ol>
</li>
</ol>
```


### Description Listの処理

#### パターン判定

`isDLPattern()`関数で`**Term**`パターンを検出:

```javascript
const DL_PATTERN = /^\s*\*\*(.+?)\*\*(.*)$/s
```

最適化: `{isMatch: boolean, afterStrong: string}`オブジェクトを返し、重複regex実行を回避。

#### 構造変換

```
bullet_list         → dl
├─ list_item       → (削除)
   └─ paragraph    → dt + dd
      ├─ strong    → dt の内容
      └─ text      → dd の内容
```

#### 属性移動

markdown-it-attrsは`{.className}`を`<p>`に付与するため、Phase 0.5で`<dl>`に移動:

```markdown
- **Term** {.custom-dl}
    Description
```

変換: `<p class="custom-dl">` → `<dl class="custom-dl">`

### リスト構造の設計

#### フラット化

`- 1.`パターン: `ul > li > ol > li`構造を`ol > li`にフラット化

影響:
- Outer list_item内に直接のparagraphが存在しない
- markdown-itの`paragraph.hidden`だけでは判定不可
- 解決策: Tokenの`map`情報で空行位置を確認

#### listInfo

- 全レベルの情報を保持（レベル3以上も対応）
- 各レベルで独立してマーカータイプとloose/tight判定

### HTML属性の付与

#### type属性とrole属性

- type属性: `listTypes.json`定義に基づき付与（マーカー明記時は除外）
- role属性: type属性なしの場合に`role="list"`を付与（アクセシビリティ確保）

#### value属性

番号が連続する場合は不要。以下の場合のみ必要:
- 番号を飛ぶ
- 同じ番号
- 番号が小さくなる

### マーカータイプの判定

#### 判定方法

- `types-utility.js`: 判定ロジック
- `listTypes.json`: 定義と順序

#### 判定ルール

1. 同じネストレベルを確認
2. 決定できない場合: `listTypes.json`の定義順が早い方を採用
3. 注意: `i`などは複数タイプに含まれる

#### allContents配列

Phase 1で全マーカーを収集:

```javascript
allContents: ['i', 'ii', 'iii', 'iv'] // いろは順検出に必要
```

`detectMarkerType()`の第2引数で正確な判定を実現。

## Loose/Tight判定

### 基本ルール

各入れ子レベルごとに独立して判定。

- 判定基準: Markdownの空行
- 判定単位: 出力時の入れ子レベルごと

#### Looseになる条件（いずれか1つ）

1. 最初の項目直後が空行
2. 途中の項目前後に空行
3. 最後の項目前に空行

### 単一項目リストの判定

項目が1つの場合:

- 項目間の空行では判定しない
- 項目内の構造で判定

#### Looseになる条件（いずれか1つ）

1. 項目内に複数段落
2. 項目内にブロック要素（見出し、コードブロック、引用、HTMLブロックなど）

#### 判定実装

- `innerListIsLoose`: 複数段落検出
- `hasBlockElement`: ブロック要素検出（`paragraph.hidden=false`, `heading_open`, `html_block`など）
- 単一項目: `shouldBeLoose = innerListIsLoose || hasBlockElement`
- 複数項目: `shouldBeLoose = outerUlIsLoose || innerListIsLoose || hasBlockElement`

### 実装の考慮点

1. markdown-itの`paragraph.hidden`を基本使用
2. 単一項目: `outerUlIsLoose`除外
3. フラット化時: 各inner olの単一項目をチェック
4. 空行検出: `map`情報で実際の空行位置確認

### フラット化時の判定

`- 1.`パターンのフラット化では、特殊な判定が必要。以下の課題と解決策を理解すること。

#### 課題1: outerUlIsLoose判定

**問題**: `paragraph.hidden`で判定不可（outer list_item直下にparagraphなし）

**解決**: map情報でouter list_item間の空行検出

```javascript
let currentEndLine = null
for (let k = currentItem.outerItemClose - 1; k > currentItem.outerItemOpen; k--) {
  if (tokens[k].map && tokens[k].map[1]) {
    currentEndLine = tokens[k].map[1]
    break
  }
}
const lineGap = nextMap[0] - currentEndLine
if (lineGap > 0) outerUlIsLoose = true
```

#### 課題2: paragraph.hidden修正

**問題**: `outerUlIsLoose=true`でもinner ol項目が`hidden=true`のまま

**解決**: `innerListIsLooseDueToBlankLines`判定**後**にparagraph.hidden修正

```javascript
if (outerUlIsLoose && !(itemIndices.length === 1)) {
  tokens[k].hidden = false
}
```

注意: 判定**前**に修正すると子リストへ誤伝播。

#### 課題3: innerListIsLooseDueToBlankLines判定

**問題**: Outer list_item間の空行チェック（outerUlIsLooseと重複）

**解決**: Inner ol内のlist_item間の空行をチェック

```javascript
const innerListItems = []
for (let j = item.innerListOpen + 1; j < item.innerListClose; j++) {
  if (tokens[j].type === 'list_item_open' && 
      tokens[j].level === tokens[item.innerListOpen].level + 1) {
    const itemOpen = j
    const itemClose = findMatchingClose(tokens, j, 'list_item_open', 'list_item_close')
    innerListItems.push({ open: itemOpen, close: itemClose })
  }
}
if (innerListItems.length > 1) {
  // 項目間のlineGapチェック
}
```

#### 判定まとめ

1. `outerUlIsLoose`: Outer list_item間の空行（map使用）
2. `innerListIsLooseDueToBlankLines`: Inner ol内のlist_item間の空行
3. `shouldPropagateLooseToChildren`: `innerListIsLooseDueToBlankLines`のみ（`outerUlIsLoose`除外）
4. paragraph.hidden修正: `innerListIsLooseDueToBlankLines`判定後

**例:**

```markdown
- 1. Parent item

    - a. Child item a
    - b. Child item b

- 2. Parent item 2
```

- `outerUlIsLoose = true`: 親ul項目間に空行
- `innerListIsLooseDueToBlankLines = false`: Inner ol内は単一項目
- 結果: `1. Parent item`は`<p>`あり（loose）、`a.`, `b.`は`<p>`なし（tight）

## HTMLブロックの処理

### 基本方針

リスト内のHTMLブロック（`<div>`, `<table>`など）は`html_block`トークンとして処理（`html: true`オプション必須）。

### インデント処理

1. **HTMLブロック前後の空行削除**: 出力HTMLには不要
2. **リストインデント除去**: リスト項目の直接の子要素として出力
3. **改行正規化**: `</div></li>` → `</div>\n</li>`

### 実装

Phase 4 (`processHtmlBlocks`) で`html_block`トークンの`content`プロパティを直接編集。

## 実装時の注意点

### トークン操作
- トークン削除時: インデックスを逆順でループ
- トークン挿入時: `splice()`の位置に注意
- `map`プロパティ: 行番号情報、空行検出に使用

### パフォーマンス
- ループ内で`find()`や`filter()`を避ける
- 事前にMap化できるものはMap化
- `includes() + indexOf()`の重複を避ける

### デバッグ
- トークン構造: `debug-*.js`ファイル参照
- テスト: `npm test`で全テスト実行
- 個別テスト: `node debug-*.js`で確認
