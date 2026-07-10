# `listTypes.json` schema

`listTypes.json` is the human-editable source of truth for marker recognition and native HTML list-type mapping. Runtime code validates the file at module initialization, then compiles regexes, symbol-index maps, and leading-character buckets once.

## Top-level fields

- `schemaVersion`: currently `1`.
- `types`: marker types in detection-priority order. Array order is the final tiebreaker.
- `patternGroups`: reusable prefix, suffix, and spacing rules.

## Marker type fields

Every type requires:

- `name`: unique output name used by the generated `ol-<name>` class.
- exactly one marker source:
  - `numeric: true` for arbitrary ASCII decimal values;
  - `symbols` for explicit or irregular finite sequences;
  - `range` for a continuous Unicode code-point range.
- `start`: number represented by the first symbol or range character.
- `pattern`: the name of one entry in `patternGroups`.

Optional fields:

- `htmlType`: one of `1`, `a`, `A`, `i`, or `I`. Its presence makes the marker a native HTML ordered-list type; omission makes it a custom span-rendered type.
- `contextSequence: true`: include an explicit `symbols` sequence in list-wide ambiguity resolution. When one ambiguous symbol repeats, the sequence where that symbol occurs earliest wins; array order breaks ties.

### Numeric example

```json
{
  "name": "decimal",
  "numeric": true,
  "start": 0,
  "pattern": "common",
  "htmlType": "1"
}
```

### Explicit sequence example

Use `symbols` when values are irregular, finite, non-contiguous, or culturally defined:

```json
{
  "name": "katakana",
  "symbols": ["ア", "イ", "ウ"],
  "start": 1,
  "pattern": "fullwidth",
  "contextSequence": true
}
```

### Unicode range example

Use `range` only when every code point from the first character through the last character belongs to the same sequence:

```json
{
  "name": "filled-squared-upper-latin",
  "range": ["🅰", "🆉"],
  "start": 1,
  "pattern": "enclosed"
}
```

Finite custom ranges stop at the declared endpoint. Native Latin `htmlType` values continue past `z` as `aa`, `ab`, and so on to match ordered-list numbering.

## Pattern groups

Each pattern has string `prefix` and `suffix` fields plus one spacing mode:

- `half`: one or more ASCII spaces are required.
- `both`: one or more ASCII or fullwidth spaces are required.
- `none_or_both`: separator spacing is optional when a suffix exists. For a suffixless marker, following item text must still be separated by ASCII/fullwidth whitespace; end-of-line is also valid.

## Editing checklist

1. Keep type names and pattern-group names unique.
2. Use exactly one of `numeric`, `symbols`, or `range`.
3. Prefer explicit `symbols` for any sequence with gaps or exceptions.
4. Verify a Unicode `range` against the Unicode NamesList before extending it.
5. Add detection, number calculation, first/last value, and out-of-range tests.
6. For overlapping sequences, add repeated-marker and consecutive-marker tests.
7. Run `npm test` and `npm run perf`.
