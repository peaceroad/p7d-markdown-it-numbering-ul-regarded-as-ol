// Normalize literal ordered-list lines that markdown-it failed to parse
// e.g. nested "2. Child" without preceding "- ".
import { detectMarkerType } from './types-utility.js'
import { findMatchingClose, findListItemEnd } from './list-helpers.js'

const INLINE_LITERAL_HINT = /\n[ \t]+\S/
const CODE_LITERAL_HINT = /^[ \t]+\S/m

/**
 * Normalize literal nested ordered lists inside list items.
 * Converts indented numeric lines into proper ordered_list tokens before Phase 1.
 * @param {Array} tokens
 */
export function normalizeLiteralOrderedLists(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return
  }
  const TokenClass = tokens[0]?.constructor
  if (!TokenClass) {
    return
  }

  let hasInlineLiteralHint = false
  let hasCodeLiteralHint = false
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!hasInlineLiteralHint &&
        token.type === 'inline' &&
        token.content &&
        token.content.includes('\n') &&
        INLINE_LITERAL_HINT.test(token.content)) {
      hasInlineLiteralHint = true
    } else if (!hasCodeLiteralHint &&
        token.type === 'code_block' &&
        token.content &&
        CODE_LITERAL_HINT.test(token.content)) {
      hasCodeLiteralHint = true
    }
    if (hasInlineLiteralHint && hasCodeLiteralHint) {
      break
    }
  }

  if (!hasInlineLiteralHint && !hasCodeLiteralHint) {
    return
  }

  if (hasInlineLiteralHint) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (token.type !== 'list_item_open') {
        continue
      }
      let listItemClose = findListItemEnd(tokens, i)
      if (listItemClose === -1) {
        listItemClose = tokens.length - 1
      }

      let j = i + 1
      while (j < listItemClose) {
        const current = tokens[j]
        if (current.type !== 'paragraph_open') {
          j++
          continue
        }

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
          if (!INLINE_LITERAL_HINT.test(inlineToken.content)) {
            j = paragraphCloseIdx + 1
            continue
          }
          const baseLine = tokens[j].map ? tokens[j].map[0] : null
          const segments = parseSegments(inlineToken.content, baseLine)
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

        if (current.type === 'ordered_list_open' &&
            current.level === (tokens[i].level ?? 0) + 1) {
          const delta = splitOrderedListForLiteralChildren(tokens, j, TokenClass)
          listItemClose += delta
          j++
          continue
        }

        j++
      }
      i = listItemClose
    }
  }
  if (hasCodeLiteralHint) {
    convertLiteralCodeBlocks(tokens, TokenClass)
  }
}

function convertLiteralCodeBlocks(tokens, TokenClass) {
  if (!TokenClass) {
    return
  }
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || token.type !== 'code_block') {
      continue
    }
    if (token.level === undefined || token.level < 1) {
      continue
    }
    if (!CODE_LITERAL_HINT.test(token.content)) {
      continue
    }
    const rawLines = token.content.split(/\r?\n/)
    const literalCache = []
    const baseLine = Array.isArray(token.map) ? token.map[0] : null
    const { lists, nextIndex } = parseLiteralBlock(rawLines, 0, literalCache, baseLine)
    const hasRemainingContent = rawLines.slice(nextIndex).some(line => line.trim().length > 0)
    if (!Array.isArray(lists) || lists.length === 0 || hasRemainingContent) {
      if (tryConvertCodeBlockContinuation(tokens, i, TokenClass)) {
        i--
      }
      continue
    }

    const targetItemLevel = token.level + 1
    let listItemIdx = -1
    for (let k = i - 1; k >= 0; k--) {
      const tk = tokens[k]
      if (tk.type === 'list_item_open' && tk.level === targetItemLevel) {
        listItemIdx = k
        break
      }
    }
    if (listItemIdx === -1) {
      continue
    }
    let listItemCloseIdx = findMatchingClose(tokens, listItemIdx, 'list_item_open', 'list_item_close')
    if (listItemCloseIdx === -1) {
      continue
    }

    tokens.splice(i, 1)
    if (listItemCloseIdx > i) {
      listItemCloseIdx--
    }
    revealFirstParagraph(tokens, listItemIdx, listItemCloseIdx)

    const insertionStart = listItemCloseIdx
    const replacementTokens = []
    const newListLevel = targetItemLevel + 1
    for (const listNode of lists) {
      replacementTokens.push(...buildListTokens(listNode, newListLevel, TokenClass))
    }
    tokens.splice(insertionStart, 0, ...replacementTokens)

    for (let offset = 0; offset < replacementTokens.length; offset++) {
      if (replacementTokens[offset]?._literalList) {
        mergeFollowingLists(tokens, insertionStart + offset)
      }
    }
    i = insertionStart + replacementTokens.length - 1
  }
}

function tryConvertCodeBlockContinuation(tokens, codeBlockIndex, TokenClass) {
  const codeToken = tokens[codeBlockIndex]
  const targetLevel = (codeToken.level ?? 0) + 1
  let listItemCloseIdx = -1
  for (let k = codeBlockIndex - 1; k >= 0; k--) {
    const tk = tokens[k]
    if (tk.type === 'list_item_close' && tk.level === targetLevel) {
      listItemCloseIdx = k
      break
    }
    if (tk.type === 'list_item_open' && tk.level <= codeToken.level) {
      break
    }
  }
  if (listItemCloseIdx === -1) {
    return false
  }
  let listItemOpenIdx = -1
  let depth = 0
  for (let k = listItemCloseIdx; k >= 0; k--) {
    const tk = tokens[k]
    if (tk.type === 'list_item_close' && tk.level === targetLevel) {
      depth++
      continue
    }
    if (tk.type === 'list_item_open' && tk.level === targetLevel) {
      depth--
      if (depth === 0) {
        listItemOpenIdx = k
        break
      }
      continue
    }
    if (tk.type === 'list_item_open' && tk.level <= codeToken.level) {
      break
    }
  }
  if (listItemOpenIdx === -1) {
    return false
  }
  revealFirstParagraph(tokens, listItemOpenIdx, listItemCloseIdx)
  const paragraphLevel = (tokens[listItemOpenIdx].level ?? 0) + 1
  const paragraphs = buildParagraphTokensFromCodeBlock(codeToken.content, paragraphLevel, TokenClass)
  if (paragraphs.length === 0) {
    return false
  }
  tokens.splice(listItemCloseIdx, 0, ...paragraphs)
  const newIndex = codeBlockIndex + paragraphs.length
  tokens.splice(newIndex, 1)
  return true
}

function buildParagraphTokensFromCodeBlock(content, paragraphLevel, TokenClass) {
  if (!content) {
    return []
  }
  const normalized = content.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  const nonEmpty = lines.filter(line => line.trim().length > 0)
  if (nonEmpty.length === 0) {
    return []
  }
  const indent = Math.min(...nonEmpty.map(line => line.match(/^\s*/)[0].length))
  const dedented = lines
    .map(line => (indent > 0 ? line.slice(Math.min(indent, line.length)) : line))
    .join('\n')
  const blocks = dedented.split(/\n{2,}/).map(block => block.trim()).filter(Boolean)
  if (blocks.length === 0) {
    return []
  }
  const paragraphs = []
  for (const block of blocks) {
    const pOpen = new TokenClass('paragraph_open', 'p', 1)
    pOpen.level = paragraphLevel
    pOpen.block = true
    pOpen.hidden = false
    paragraphs.push(pOpen)

    const inline = new TokenClass('inline', '', 0)
    inline.level = paragraphLevel + 1
    inline.content = block
    inline.children = []
    paragraphs.push(inline)

    const pClose = new TokenClass('paragraph_close', 'p', -1)
    pClose.level = paragraphLevel
    pClose.block = true
    pClose.hidden = false
    paragraphs.push(pClose)
  }
  return paragraphs
}

function parseSegments(content, baseLine = null) {
  if (!content) {
    return { hasLiteral: false, list: [{ type: 'text', text: '', tight: false }] }
  }

  const lines = content.split('\n')
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
    const hasBlankLine = hadBlankLine
    segments.push({ type: 'text', text: textValue, tight: !hasBlankLine })
    buffer = []
    blankLinesInBuffer = 0
  }

  while (idx < lines.length) {
    const literalInfo = getLiteralInfo(lines, idx, literalCache)
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
    const { lists, nextIndex } = parseLiteralBlock(lines, idx, literalCache, baseLine)
    if (lists.length > 0) {
      segments.push({ type: 'literal', lists })
    }
    idx = nextIndex
  }

  flushBuffer()
  return { hasLiteral, list: segments }
}

function detectLiteralLine(line) {
  if (!line) return null
  if (/^\s*$/.test(line)) {
    return null
  }
  const match = line.match(/^([ \t]+)(.*)$/)
  if (!match) {
    return null
  }
  const indentWidth = match[1].replace(/\t/g, '    ').length
  if (indentWidth < 1) {
    return null
  }
  const trimmed = match[2].trimStart()
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
  const remainder = trimmed.slice(markerInfo.marker.length).replace(/^\s+/, '')
  return {
    indent: indentWidth,
    markerInfo,
    content: remainder
  }
}

function parseLiteralBlock(lines, startIndex, literalCache = null, baseLine = null) {
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

    const literalInfo = getLiteralInfo(lines, idx, literalCache)
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

    currentList.items.push({
      markerInfo: literalInfo.markerInfo,
      content: literalInfo.content,
      children: []
    })
    if (baseLine !== null) {
      currentList.lastLine = baseLine + idx
    }
    idx++
  }

  return { lists: rootLists, nextIndex: idx }
}

function getLiteralInfo(lines, index, cache = null) {
  if (!cache) {
    return detectLiteralLine(lines[index])
  }
  if (cache[index] === undefined) {
    cache[index] = detectLiteralLine(lines[index]) || null
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

  for (const segment of segments) {
    if (segment.type === 'text') {
      if (!segment.text) {
        templateUsed = true
        continue
      }
      const template = !templateUsed ? { open: paragraphOpen, inline: inlineToken, close: paragraphClose } : null
      tokens.push(...createParagraphTokens(segment.text, listItemLevel, TokenClass, template, segment.tight))
      templateUsed = true
    } else if (segment.type === 'literal') {
      for (const listNode of segment.lists) {
        const relativeIndex = tokens.length
        tokens.push(...buildListTokens(listNode, listItemLevel + 1, TokenClass))
        literalListPositions.push({ relativeIndex, level: listItemLevel + 1 })
      }
      templateUsed = true
    }
  }

  return { tokens, literalListPositions }
}

function createParagraphTokens(text, listItemLevel, TokenClass, template, forceTight = false) {
  if (!text) {
    return []
  }
  const tokens = []
  const level = listItemLevel + 1
  const open = template ? cloneToken(template.open) : new TokenClass('paragraph_open', 'p', 1)
  open.level = level
  open.block = true
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
  tokens.push(liOpen)

  const paragraphLevel = itemLevel + 1
  const pOpen = new TokenClass('paragraph_open', 'p', 1)
  pOpen.level = paragraphLevel
  pOpen.block = true
  pOpen.hidden = !parentListIsLoose
  if (!parentListIsLoose) {
    pOpen._literalTight = true
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
  tokens.push(pClose)

  if (item.children && item.children.length > 0) {
    for (const childList of item.children) {
      tokens.push(...buildListTokens(childList, itemLevel + 1, TokenClass))
    }
  }

  const liClose = new TokenClass('list_item_close', 'li', -1)
  liClose.level = itemLevel
  liClose.block = true
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

function revealFirstParagraph(tokens, listItemOpenIdx, listItemCloseIdx) {
  const paragraphLevel = (tokens[listItemOpenIdx].level ?? 0) + 1
  for (let k = listItemOpenIdx + 1; k < listItemCloseIdx; k++) {
    if (tokens[k].type === 'paragraph_open' && tokens[k].level === paragraphLevel) {
      tokens[k].hidden = false
      for (let m = k + 1; m < listItemCloseIdx; m++) {
        if (tokens[m].type === 'paragraph_close' && tokens[m].level === paragraphLevel) {
          tokens[m].hidden = false
          break
        }
      }
      break
    }
  }
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

function splitOrderedListForLiteralChildren(tokens, listOpenIndex, TokenClass) {
  const listToken = tokens[listOpenIndex]
  const listCloseIndex = findMatchingClose(tokens, listOpenIndex, 'ordered_list_open', 'ordered_list_close')
  if (listCloseIndex === -1) {
    return 0
  }
  const childLevel = (listToken.level ?? 0) + 1
  const ranges = []
  let currentOpen = -1
  for (let idx = listOpenIndex + 1; idx < listCloseIndex; idx++) {
    const token = tokens[idx]
    if (token.type === 'list_item_open' && token.level === childLevel) {
      currentOpen = idx
      continue
    }
    if (token.type === 'list_item_close' && token.level === childLevel) {
      if (currentOpen !== -1) {
        ranges.push({ open: currentOpen, close: idx })
        currentOpen = -1
      }
    }
  }

  if (ranges.length <= 1) {
    return 0
  }

  const extraRanges = ranges.slice(1)
  const childTokens = []
  let removedCount = 0

  for (const range of extraRanges) {
    childTokens.push(...tokens.slice(range.open, range.close + 1))
  }

  for (let k = extraRanges.length - 1; k >= 0; k--) {
    const range = extraRanges[k]
    const len = range.close - range.open + 1
    tokens.splice(range.open, len)
    removedCount += len
  }

  if (listToken._markerInfo) {
    delete listToken._markerInfo
  }

  const levelShift = 2
  for (const token of childTokens) {
    if (typeof token.level === 'number') {
      token.level += levelShift
    }
  }

  const nestedListOpen = new TokenClass('ordered_list_open', 'ol', 1)
  nestedListOpen.level = (listToken.level ?? 0) + 2
  nestedListOpen.block = true
  nestedListOpen.markup = listToken.markup
  nestedListOpen.attrs = null
  nestedListOpen._literalList = true

  const firstChild = childTokens.find(t => t.type === 'list_item_open')
  if (firstChild?.info) {
    const num = parseInt(firstChild.info, 10)
    if (!Number.isNaN(num) && num !== 1) {
      nestedListOpen.attrs = [['start', String(num)]]
    }
  }

  const nestedListClose = new TokenClass('ordered_list_close', 'ol', -1)
  nestedListClose.level = nestedListOpen.level
  nestedListClose.block = true
  nestedListClose.markup = listToken.markup

  const insertionIndex = ranges[0].close
  tokens.splice(insertionIndex, 0, nestedListOpen, ...childTokens, nestedListClose)

  const addedCount = childTokens.length + 2
  return addedCount - removedCount
}
