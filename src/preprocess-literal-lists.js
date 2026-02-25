// Normalize literal ordered-list lines that markdown-it failed to parse
// e.g. nested "2. Child" without preceding "- ".
import { detectMarkerType } from './types-utility.js'
import { findMatchingClose, findListItemEnd } from './list-helpers.js'

// markdown-it treats indent >= marker width + 4 as code blocks inside list items.
const MAX_LITERAL_INLINE_INDENT = 3
const LITERAL_SUFFIX_CHARS = new Set(['.', ')', '．', '）', '、'])
const LITERAL_OPEN_CLOSE_PAIRS = new Map([
  ['(', ')'],
  ['（', '）']
])
const ASCII_ALNUM_OR_FULLWIDTH_DIGIT_REGEX = /^[A-Za-z0-9０-９]+$/
const getIndentWidth = (indentText) => indentText.replace(/\t/g, '    ').length
const buildLineMap = (startLine, endLine = null) => {
  if (typeof startLine !== 'number') {
    return null
  }
  const normalizedEnd = typeof endLine === 'number' ? endLine + 1 : startLine + 1
  return [startLine, normalizedEnd]
}

const getListItemMarkerWidth = (listItem) => {
  if (!listItem) {
    return 1
  }
  const info = typeof listItem.info === 'string' ? listItem.info : ''
  const markup = typeof listItem.markup === 'string' ? listItem.markup : ''
  const markerLength = info.length + markup.length
  return markerLength > 0 ? markerLength + 1 : 1
}

const getLineTokenWithIndent = (line) => {
  if (typeof line !== 'string' || line.length === 0) {
    return null
  }
  const match = line.match(/^([ \t]*)(\S+)(?:\s|$)/)
  if (!match) {
    return null
  }
  return {
    indentWidth: getIndentWidth(match[1]),
    token: match[2]
  }
}

const hasLikelyLiteralMarkerToken = (token) => {
  if (typeof token !== 'string' || token.length === 0) {
    return false
  }

  let core = token
  let hasSuffix = false
  const firstChar = core[0]
  const closingPair = LITERAL_OPEN_CLOSE_PAIRS.get(firstChar)
  if (closingPair) {
    const closeIdx = core.indexOf(closingPair, 1)
    if (closeIdx <= 1) {
      return false
    }
    const inner = core.slice(1, closeIdx)
    const rest = core.slice(closeIdx + 1)
    if (rest.length > 1) {
      return false
    }
    if (rest.length === 1) {
      if (!LITERAL_SUFFIX_CHARS.has(rest)) {
        return false
      }
      hasSuffix = true
    }
    core = inner
  } else {
    const tail = core[core.length - 1]
    if (LITERAL_SUFFIX_CHARS.has(tail)) {
      core = core.slice(0, -1)
      hasSuffix = true
    }
  }

  if (!core) {
    return false
  }

  // For ASCII tokens, require explicit suffix to avoid treating normal words as list markers.
  if (ASCII_ALNUM_OR_FULLWIDTH_DIGIT_REGEX.test(core)) {
    return hasSuffix
  }

  // Non-ASCII marker cores (circled digits, kana, kanji, etc.) are typically short.
  return core.length <= 4
}

const scanLiteralLineHints = (content) => {
  if (typeof content !== 'string' || !content.includes('\n')) {
    return { hasInlineLiteralHint: false, hasOverIndentedMarkerHint: false, lines: null }
  }
  const lines = content.split('\n')
  let hasInlineLiteralHint = false
  let hasOverIndentedMarkerHint = false
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line || line.trim().length === 0) {
      continue
    }
    const tokenInfo = getLineTokenWithIndent(line)
    if (!tokenInfo || !hasLikelyLiteralMarkerToken(tokenInfo.token)) {
      continue
    }
    if (tokenInfo.indentWidth > MAX_LITERAL_INLINE_INDENT) {
      hasOverIndentedMarkerHint = true
    } else {
      hasInlineLiteralHint = true
    }
    if (hasInlineLiteralHint && hasOverIndentedMarkerHint) {
      break
    }
  }
  return { hasInlineLiteralHint, hasOverIndentedMarkerHint, lines }
}

/**
 * Normalize literal nested ordered lists inside list items.
 * Converts indented numeric lines into proper ordered_list tokens before Phase 1.
 * @param {Array} tokens
 */
export function normalizeLiteralOrderedLists(tokens, opt) {
  if (!opt?.enableLiteralNumberingFix) {
    return
  }
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return
  }
  const TokenClass = tokens[0]?.constructor
  if (!TokenClass) {
    return
  }

  let hasInlineLiteralHint = false
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!hasInlineLiteralHint &&
        token.type === 'inline' &&
        token.content &&
        token.content.includes('\n')) {
      hasInlineLiteralHint = true
      break
    }
  }

  if (!hasInlineLiteralHint) {
    return
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type !== 'list_item_open') {
      continue
    }
    let listItemClose = findListItemEnd(tokens, i)
    if (listItemClose === -1) {
      listItemClose = tokens.length - 1
    }

    const markerWidth = getListItemMarkerWidth(tokens[i])
    let j = i + 1
    while (j < listItemClose) {
      const current = tokens[j]
      if (current.type === 'paragraph_open') {
        const inlineIdx = j + 1
        const paragraphCloseIdx = j + 2
        if (inlineIdx >= listItemClose ||
            paragraphCloseIdx >= tokens.length ||
            tokens[inlineIdx].type !== 'inline' ||
            tokens[paragraphCloseIdx].type !== 'paragraph_close') {
          j++
          continue
        }

        const inlineToken = tokens[inlineIdx]
        if (!inlineToken.content.includes('\n')) {
          j = paragraphCloseIdx + 1
          continue
        }
        const literalHints = scanLiteralLineHints(inlineToken.content)
        if (!literalHints.hasInlineLiteralHint) {
          j = paragraphCloseIdx + 1
          continue
        }
        // Be conservative when deeply-indented marker-like lines are present.
        // These lines are often code blocks; partial literal conversion is more surprising
        // than preserving markdown-it's original rendering in this ambiguous case.
        if (literalHints.hasOverIndentedMarkerHint) {
          j = paragraphCloseIdx + 1
          continue
        }
        const baseLine = tokens[j].map ? tokens[j].map[0] : null
        const segments = parseSegments(literalHints.lines, markerWidth, baseLine)
        if (!segments.hasLiteral) {
          j = paragraphCloseIdx + 1
          continue
        }

        const listItemLevel = tokens[i].level ?? 0
        const { tokens: replacementTokens, literalListPositions } = buildReplacementTokens(
          segments.list,
          listItemLevel,
          TokenClass,
          tokens[j],
          tokens[inlineIdx],
          tokens[paragraphCloseIdx]
        )

        const originalLength = paragraphCloseIdx - j + 1
        tokens.splice(j, originalLength, ...replacementTokens)

        const delta = replacementTokens.length - originalLength
        listItemClose += delta

        let mergeDelta = 0
        for (const info of literalListPositions) {
          const absoluteIdx = j + info.relativeIndex
          mergeDelta += mergeFollowingLists(tokens, absoluteIdx)
        }
        listItemClose += mergeDelta

        j = j + replacementTokens.length
        continue
      }

      j++
    }
    i = listItemClose
  }
}

function parseSegments(contentOrLines, markerWidth, baseLine = null) {
  if (!contentOrLines) {
    return { hasLiteral: false, list: [{ type: 'text', text: '', tight: false }] }
  }

  const lines = Array.isArray(contentOrLines) ? contentOrLines : contentOrLines.split('\n')
  if (lines.length === 0) {
    return { hasLiteral: false, list: [{ type: 'text', text: '', tight: false }] }
  }
  const literalCache = new Array(lines.length)
  const segments = []
  let buffer = []
  let blankLinesInBuffer = 0
  let hasLiteral = false
  let idx = 0

  const flushBuffer = ({ trimTrailing = false } = {}) => {
    if (buffer.length === 0) return
    const hadBlankLine = blankLinesInBuffer > 0
    if (trimTrailing) {
      while (buffer.length > 0 && buffer[buffer.length - 1].trim().length === 0) {
        buffer.pop()
        blankLinesInBuffer = Math.max(0, blankLinesInBuffer - 1)
      }
      if (buffer.length === 0) {
        return
      }
    }
    const textValue = buffer.join('\n')
    segments.push({ type: 'text', text: textValue, tight: !hadBlankLine })
    buffer = []
    blankLinesInBuffer = 0
  }

  while (idx < lines.length) {
    const isFirstLine = idx === 0
    if (isFirstLine && lines[idx].trim().length > 0) {
      buffer.push(lines[idx])
      idx++
      continue
    }

    const literalInfo = getLiteralInfo(lines, idx, literalCache, markerWidth)
    if (!literalInfo) {
      buffer.push(lines[idx])
      if (lines[idx].trim().length === 0) {
        blankLinesInBuffer++
      }
      idx++
      continue
    }

    hasLiteral = true
    flushBuffer({ trimTrailing: true })
    const { lists, nextIndex } = parseLiteralBlock(lines, idx, literalCache, markerWidth, baseLine)
    if (lists.length > 0) {
      segments.push({ type: 'literal', lists })
    }
    idx = nextIndex
  }

  flushBuffer()
  return { hasLiteral, list: segments }
}

function detectLiteralLine(line, markerWidth) {
  if (!line) return null
  if (/^\s*$/.test(line)) {
    return null
  }
  const match = line.match(/^([ \t]*)(\S.*)$/)
  if (!match) {
    return null
  }
  const indentWidth = getIndentWidth(match[1])
  if (indentWidth > MAX_LITERAL_INLINE_INDENT) {
    return null
  }
  const trimmed = match[2]
  if (!trimmed) {
    return null
  }
  const markerInfo = detectMarkerType(trimmed)
  if (!markerInfo || !markerInfo.marker) {
    return null
  }
  if (!trimmed.startsWith(markerInfo.marker)) {
    return null
  }
  const remainder = trimmed.slice(markerInfo.marker.length).trimStart()
  const safeMarkerWidth = Number.isFinite(markerWidth) ? markerWidth : 1
  return {
    indent: safeMarkerWidth + indentWidth,
    markerInfo,
    content: remainder
  }
}

function parseLiteralBlock(lines, startIndex, literalCache = null, markerWidth = 1, baseLine = null) {
  const rootLists = []
  const stack = []
  let idx = startIndex
  let baseIndent = null

  while (idx < lines.length) {
    const rawLine = lines[idx]
    if (rawLine !== undefined && rawLine.trim().length === 0) {
      if (stack.length > 0) {
        stack[stack.length - 1].list.isLoose = true
        if (baseLine !== null) {
          stack[stack.length - 1].list.lastLine = baseLine + idx
        }
      }
      idx++
      continue
    }

    const literalInfo = getLiteralInfo(lines, idx, literalCache, markerWidth)
    if (!literalInfo) {
      break
    }
    if (baseIndent === null) {
      baseIndent = literalInfo.indent
    }
    if (literalInfo.indent < baseIndent) {
      break
    }

    while (stack.length > 0 && literalInfo.indent < stack[stack.length - 1].indent) {
      stack.pop()
    }

    if (stack.length === 0 || literalInfo.indent > stack[stack.length - 1].indent) {
      const newList = createListNode(literalInfo, baseIndent === null || baseLine === null ? null : baseLine + idx)
      if (stack.length === 0) {
        rootLists.push(newList)
      } else {
        const parent = stack[stack.length - 1].list
        const parentItems = parent.items
        const parentItem = parentItems[parentItems.length - 1]
        if (parentItem) {
          parentItem.children.push(newList)
        } else {
          rootLists.push(newList)
        }
      }
      stack.push({ indent: literalInfo.indent, list: newList })
    }

    const currentList = stack[stack.length - 1]?.list
    if (!currentList) {
      break
    }

    const lineNumber = typeof baseLine === 'number' ? baseLine + idx : null
    currentList.items.push({
      markerInfo: literalInfo.markerInfo,
      content: literalInfo.content,
      children: [],
      line: lineNumber
    })
    if (typeof lineNumber === 'number') {
      currentList.lastLine = lineNumber
    }
    idx++
  }

  return { lists: rootLists, nextIndex: idx }
}

function getLiteralInfo(lines, index, cache = null, markerWidth = 1) {
  if (!cache) {
    return detectLiteralLine(lines[index], markerWidth)
  }
  if (cache[index] === undefined) {
    cache[index] = detectLiteralLine(lines[index], markerWidth) || null
  }
  return cache[index]
}

function createListNode(literalInfo, lineNumber = null) {
  const markerInfo = literalInfo.markerInfo || {}
  return {
    markerType: markerInfo.type || 'decimal',
    suffix: markerInfo.suffix || '.',
    prefix: markerInfo.prefix || '',
    startNumber: markerInfo.number || 1,
    items: [],
    isLoose: false,
    startLine: lineNumber,
    lastLine: lineNumber
  }
}

function buildReplacementTokens(segments, listItemLevel, TokenClass, paragraphOpen, inlineToken, paragraphClose) {
  const tokens = []
  const literalListPositions = []
  let templateUsed = false
  const paragraphMap = paragraphOpen?.map ? paragraphOpen.map.slice() : null

  for (const segment of segments) {
    if (segment.type === 'text') {
      if (!segment.text) {
        templateUsed = true
        continue
      }
      const template = !templateUsed ? { open: paragraphOpen, inline: inlineToken, close: paragraphClose } : null
      tokens.push(...createParagraphTokens(segment.text, listItemLevel, TokenClass, template, segment.tight, paragraphMap))
      templateUsed = true
    } else if (segment.type === 'literal') {
      for (const listNode of segment.lists) {
        const relativeIndex = tokens.length
        tokens.push(...buildListTokens(listNode, listItemLevel + 1, TokenClass))
        literalListPositions.push({ relativeIndex })
      }
      templateUsed = true
    }
  }

  return { tokens, literalListPositions }
}

function createParagraphTokens(text, listItemLevel, TokenClass, template, forceTight = false, mapFallback = null) {
  if (!text) {
    return []
  }
  const tokens = []
  const level = listItemLevel + 1
  const open = template ? cloneToken(template.open) : new TokenClass('paragraph_open', 'p', 1)
  open.level = level
  open.block = true
  if (Array.isArray(mapFallback) && !open.map) {
    open.map = mapFallback.slice()
  }
  const baseHidden = template && typeof template.open?.hidden === 'boolean' ? template.open.hidden : false
  const shouldHide = baseHidden
  open.hidden = shouldHide
  if (forceTight) {
    open._literalTight = true
  }
  tokens.push(open)

  const inline = new TokenClass('inline', '', 0)
  inline.level = level + 1
  inline.content = text
  inline.children = []
  if (template?.inline?.meta) {
    inline.meta = { ...template.inline.meta }
  }
  if (template?.inline?.attrs) {
    inline.attrs = template.inline.attrs.map(([name, value]) => [name, value])
  }
  inline.block = template?.inline?.block ?? false
  inline.hidden = template?.inline?.hidden ?? false
  tokens.push(inline)

  const close = template ? cloneToken(template.close) : new TokenClass('paragraph_close', 'p', -1)
  close.level = level
  close.block = true
  close.hidden = shouldHide
  if (Array.isArray(mapFallback) && !close.map) {
    close.map = mapFallback.slice()
  }
  if (forceTight) {
    close._literalTight = true
  }
  tokens.push(close)
  return tokens
}

function buildListTokens(listNode, listLevel, TokenClass) {
  const tokens = []
  const listOpen = new TokenClass('ordered_list_open', 'ol', 1)
  listOpen.level = listLevel
  listOpen.block = true
  listOpen.markup = listNode.suffix || '.'
  listOpen.attrs = null
  listOpen._literalList = true
  const listMap = buildLineMap(listNode.startLine, listNode.lastLine)
  if (listMap) {
    listOpen.map = listMap.slice()
  }
  if (Array.isArray(listNode.items) && listNode.items.length > 0) {
    const markers = listNode.items
      .map(item => {
        if (!item.markerInfo) {
          return null
        }
        const marker = { ...item.markerInfo }
        if (typeof marker.originalNumber !== 'number' && typeof marker.number === 'number') {
          marker.originalNumber = marker.number
        }
        return marker
      })
      .filter(Boolean)
    if (markers.length === listNode.items.length) {
      const firstType = markers[0].type
      const isConsistent = markers.every(marker => marker.type === firstType)
      const literalNumbers = markers.map(marker =>
        typeof marker.originalNumber === 'number' ? marker.originalNumber : marker.number
      )
      const hasLiteralNumbers = literalNumbers.length === markers.length &&
        literalNumbers.every(value => typeof value === 'number')
      let allNumbersIdentical = false
      if (hasLiteralNumbers) {
        const firstLiteral = literalNumbers[0]
        if (literalNumbers.every(value => value === firstLiteral) && firstLiteral === 1) {
          allNumbersIdentical = true
        }
      }
      listOpen._literalMarkerInfo = {
        markers,
        type: firstType,
        isConsistent,
        count: markers.length,
        allNumbersIdentical
      }
    }
  }
  if (typeof listNode.startLine === 'number') {
    listOpen._literalStartLine = listNode.startLine
  }
  if (typeof listNode.lastLine === 'number') {
    listOpen._literalLastLine = listNode.lastLine
  }
  if (typeof listNode.startNumber === 'number' && listNode.startNumber !== 1) {
    listOpen.attrs = [['start', String(listNode.startNumber)]]
  }
  tokens.push(listOpen)

  const listIsLoose = !!listNode.isLoose
  for (const item of listNode.items) {
    tokens.push(...buildListItemTokens(item, listLevel, TokenClass, listIsLoose))
  }

  const listClose = new TokenClass('ordered_list_close', 'ol', -1)
  listClose.level = listLevel
  listClose.block = true
  listClose.markup = listNode.suffix || '.'
  if (listMap) {
    listClose.map = listMap.slice()
  }
  tokens.push(listClose)
  return tokens
}

function buildListItemTokens(item, listLevel, TokenClass, parentListIsLoose = false) {
  const tokens = []
  const itemLevel = listLevel + 1
  const liOpen = new TokenClass('list_item_open', 'li', 1)
  liOpen.level = itemLevel
  liOpen.block = true
  liOpen.markup = item.markerInfo?.suffix || '.'
  liOpen.info = item.markerInfo?.number !== undefined ? String(item.markerInfo.number) : ''
  const itemMap = buildLineMap(item.line, item.line)
  if (itemMap) {
    liOpen.map = itemMap.slice()
  }
  tokens.push(liOpen)

  const paragraphLevel = itemLevel + 1
  const pOpen = new TokenClass('paragraph_open', 'p', 1)
  pOpen.level = paragraphLevel
  pOpen.block = true
  pOpen.hidden = !parentListIsLoose
  if (!parentListIsLoose) {
    pOpen._literalTight = true
  }
  if (itemMap) {
    pOpen.map = itemMap.slice()
  }
  tokens.push(pOpen)

  const inline = new TokenClass('inline', '', 0)
  inline.level = paragraphLevel + 1
  inline.content = item.content || ''
  inline.children = []
  tokens.push(inline)

  const pClose = new TokenClass('paragraph_close', 'p', -1)
  pClose.level = paragraphLevel
  pClose.block = true
  pClose.hidden = !parentListIsLoose
  if (!parentListIsLoose) {
    pClose._literalTight = true
  }
  if (itemMap) {
    pClose.map = itemMap.slice()
  }
  tokens.push(pClose)

  if (item.children && item.children.length > 0) {
    for (const childList of item.children) {
      tokens.push(...buildListTokens(childList, itemLevel + 1, TokenClass))
    }
  }

  const liClose = new TokenClass('list_item_close', 'li', -1)
  liClose.level = itemLevel
  liClose.block = true
  if (itemMap) {
    liClose.map = itemMap.slice()
  }
  tokens.push(liClose)
  return tokens
}

function cloneToken(token) {
  if (!token) {
    return token
  }
  const TokenClass = token.constructor
  const cloned = new TokenClass(token.type, token.tag, token.nesting)
  cloned.attrs = token.attrs ? token.attrs.map(([name, value]) => [name, value]) : null
  cloned.map = token.map ? [...token.map] : null
  cloned.level = token.level
  cloned.content = token.content
  cloned.markup = token.markup
  cloned.info = token.info
  cloned.meta = token.meta ? { ...token.meta } : null
  cloned.block = token.block
  cloned.hidden = token.hidden
  cloned.children = token.children ? token.children.map(child => cloneToken(child)) : null
  return cloned
}

function mergeFollowingLists(tokens, listOpenIndex) {
  if (listOpenIndex < 0 || listOpenIndex >= tokens.length) {
    return 0
  }
  const listOpen = tokens[listOpenIndex]
  if (!listOpen || listOpen.type !== 'ordered_list_open') {
    return 0
  }

  let totalDelta = 0
  let listCloseIndex = findMatchingClose(tokens, listOpenIndex, 'ordered_list_open', 'ordered_list_close')
  if (listCloseIndex === -1) {
    return 0
  }

  let forceLoose = false
  while (listCloseIndex + 1 < tokens.length) {
    const nextToken = tokens[listCloseIndex + 1]
    if (!nextToken ||
        nextToken.type !== 'ordered_list_open' ||
        nextToken.level !== listOpen.level) {
      break
    }
    const nextClose = findMatchingClose(tokens, listCloseIndex + 1, 'ordered_list_open', 'ordered_list_close')
    if (nextClose === -1) {
      break
    }
    const nextIsLiteral = !!nextToken._literalList
    const innerTokens = tokens.slice(listCloseIndex + 2, nextClose)
    const removeCount = nextClose - (listCloseIndex + 1) + 1
    tokens.splice(listCloseIndex + 1, removeCount)
    tokens.splice(listCloseIndex, 0, ...innerTokens)

    listCloseIndex = listCloseIndex + innerTokens.length
    totalDelta -= 2
    if (!nextIsLiteral) {
      const startLine = Array.isArray(nextToken.map) ? nextToken.map[0] : null
      if (typeof startLine === 'number' && typeof listOpen._literalLastLine === 'number') {
        if (startLine - listOpen._literalLastLine > 1) {
          forceLoose = true
        }
      }
    }
    if (typeof nextToken._literalLastLine === 'number') {
      listOpen._literalLastLine = nextToken._literalLastLine
    } else if (Array.isArray(nextToken.map) && typeof nextToken.map[1] === 'number') {
      listOpen._literalLastLine = nextToken.map[1]
    }
  }

  if (forceLoose) {
    markLiteralListLoose(tokens, listOpenIndex, listCloseIndex)
  }
  return totalDelta
}

function markLiteralListLoose(tokens, listOpenIndex, listCloseIndex = null) {
  const listOpen = tokens[listOpenIndex]
  if (!listOpen || listOpen.type !== 'ordered_list_open') {
    return
  }
  if (typeof listCloseIndex !== 'number') {
    listCloseIndex = findMatchingClose(tokens, listOpenIndex, 'ordered_list_open', 'ordered_list_close')
  }
  if (listCloseIndex === -1) {
    return
  }
  const paragraphLevel = (listOpen.level ?? 0) + 2
  for (let i = listOpenIndex + 1; i < listCloseIndex; i++) {
    const token = tokens[i]
    if ((token.type === 'paragraph_open' || token.type === 'paragraph_close') &&
        token.level === paragraphLevel) {
      token.hidden = false
      if (token._literalTight) {
        delete token._literalTight
      }
    }
  }
}
