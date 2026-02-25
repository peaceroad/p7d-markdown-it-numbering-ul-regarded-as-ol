// Phase 0: Description List Processing
// Converts bullet_list with **Term** pattern to description_list (dl/dt/dd)
// This must run before Phase 1

import { findMatchingClose, findListEnd as coreFindListEnd } from './list-helpers.js'

/**
 * Parse attribute string like ".class1 .class2 #id data-foo="bar""
 * Returns array of [key, value] pairs
 */
const ATTR_TOKEN_REGEX = /\s*(\.[\w-]+|#[\w-]+|[\w:-]+=(?:"[^"]*"|'[^']*'|[^\s"'{}]+)|[\w:-]+)/y
const ATTR_KEY_VALUE_REGEX = /^([\w:-]+)=(?:"([^"]*)"|'([^']*)'|([^\s"'{}]+))$/
const LEADING_ATTR_BLOCK_REGEX = /^[ \t]*\{([^}]+)\}/
const STANDALONE_ATTR_BLOCK_REGEX = /^\{([^}]+)\}$/
const TRAILING_TWO_SPACES_REGEX = / {2,}$/
const TRAILING_BACKSLASH_BREAK_REGEX = /\\\s*$/
const DL_TERM_INLINE_REGEX = /^\*\*(.*?)\*\*(.*)/s
const TRAILING_LIST_ATTR_LINE_REGEX = /\n\s*\{([^}]+)\}\s*$/

const parseAttrString = (attrStr) => {
  if (!attrStr || typeof attrStr !== 'string') {
    return []
  }

  const attrs = []
  const customAttrs = []
  const classes = []
  let id = null
  let cursor = 0

  while (cursor < attrStr.length) {
    ATTR_TOKEN_REGEX.lastIndex = cursor
    const match = ATTR_TOKEN_REGEX.exec(attrStr)
    if (!match) {
      // Allow only trailing whitespace; otherwise reject as invalid attr syntax.
      if (/^\s*$/.test(attrStr.slice(cursor))) {
        break
      }
      return []
    }
    const token = match[1]
    cursor = ATTR_TOKEN_REGEX.lastIndex
    if (token[0] === '.') {
      const cls = token.slice(1)
      if (cls) {
        classes.push(cls)
      }
      continue
    }
    if (token[0] === '#') {
      if (!id) {
        id = token.slice(1)
      }
      continue
    }

    const kv = token.match(ATTR_KEY_VALUE_REGEX)
    if (!kv) {
      // markdown-it-attrs boolean attribute (e.g. {foo})
      customAttrs.push([token, ''])
      continue
    }
    const key = kv[1]
    const value = kv[2] ?? kv[3] ?? kv[4] ?? ''
    customAttrs.push([key, value])
  }

  if (classes.length > 0) {
    attrs.push(['class', classes.join(' ')])
  }
  if (id) {
    attrs.push(['id', id])
  }
  if (customAttrs.length > 0) {
    attrs.push(...customAttrs)
  }

  return attrs
}

const consumeLeadingValidAttrBlocks = (text) => {
  if (typeof text !== 'string' || text.length === 0) {
    return { rest: text || '', attrs: [] }
  }

  let rest = text
  const attrs = []
  while (true) {
    const match = rest.match(LEADING_ATTR_BLOCK_REGEX)
    if (!match) {
      break
    }
    const parsed = parseAttrString(match[1])
    if (parsed.length === 0) {
      break
    }
    attrs.push(...parsed)
    rest = rest.slice(match[0].length)
  }

  return { rest, attrs }
}

const hasExplicitLineBreakMarker = (afterStrong) => {
  if (typeof afterStrong !== 'string') {
    return false
  }
  const lineBreakIndex = afterStrong.indexOf('\n')
  if (lineBreakIndex === -1) {
    return false
  }
  const firstLine = afterStrong.slice(0, lineBreakIndex)
  return TRAILING_TWO_SPACES_REGEX.test(firstLine) || TRAILING_BACKSLASH_BREAK_REGEX.test(firstLine)
}

const getDescriptionAfterExplicitLineBreak = (afterStrong) => {
  if (!hasExplicitLineBreakMarker(afterStrong)) {
    return null
  }
  const lineBreakIndex = afterStrong.indexOf('\n')
  return afterStrong.slice(lineBreakIndex + 1)
}

const hasMeaningfulDescriptionContent = (text) => {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return false
  }
  if (!text.includes('{')) {
    return true
  }

  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    const attrMatch = trimmed.match(STANDALONE_ATTR_BLOCK_REGEX)
    if (attrMatch) {
      const parsed = parseAttrString(attrMatch[1])
      if (parsed.length > 0) {
        continue
      }
    }
    return true
  }
  return false
}

const copyMap = (target, source) => {
  if (!target || !source || !Array.isArray(source.map)) {
    return
  }
  target.map = source.map.slice()
}

/**
 * Process description list patterns in tokens
 * @param {Array} tokens - Token array
 * @param {Object} opt - Options object
 */
export const processDescriptionList = (tokens, opt) => {
  if (!opt.descriptionList && !opt.descriptionListWithDiv) {
    return
  }
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return
  }

  let firstBulletIndex = -1
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'bullet_list_open') {
      firstBulletIndex = i
      break
    }
  }
  if (firstBulletIndex === -1) {
    return
  }

  // Find bullet_lists and check if they match DL pattern
  // Process in single pass: check and convert together to avoid duplicate scanning
  let i = firstBulletIndex
  while (i < tokens.length) {
    if (tokens[i].type === 'bullet_list_open') {
      const listEnd = findListEnd(tokens, i)
      const dlCheck = checkAndConvertToDL(tokens, i, listEnd, opt)
      i = typeof dlCheck?.nextIndex === 'number' ? dlCheck.nextIndex : listEnd + 1
    } else {
      i++
    }
  }
  
  // Note: moveParagraphAttributesToDL is called separately after inline parsing
  // via 'numbering_dl_attrs' rule (runs after any attribute plugins like markdown-it-attrs)
}

/**
 * Find matching list close token
 */
const findListEnd = (tokens, startIndex) => {
  const result = coreFindListEnd(tokens, startIndex)
  return result === -1 ? tokens.length - 1 : result
}

/**
 * Collect direct list_item ranges within a list in a single pass.
 */
const collectListItemRanges = (tokens, listStart, listEnd) => {
  const listToken = tokens[listStart]
  if (!listToken) {
    return []
  }
  const childLevel = (listToken.level ?? 0) + 1
  const ranges = []
  let currentOpen = -1

  for (let i = listStart + 1; i < listEnd; i++) {
    const token = tokens[i]
    if (token.type === 'list_item_open' && token.level === childLevel) {
      currentOpen = i
      continue
    }
    if (token.type === 'list_item_close' && token.level === childLevel) {
      if (currentOpen !== -1) {
        ranges.push({ open: currentOpen, close: i })
        currentOpen = -1
      }
    }
  }

  return ranges
}

/**
 * Return the first direct child token index of a list_item.
 * Direct child means token.level === list_item.level + 1.
 */
const findFirstDirectChildInListItem = (tokens, itemStart, itemEnd) => {
  const itemLevel = tokens[itemStart]?.level ?? 0
  const childLevel = itemLevel + 1
  for (let i = itemStart + 1; i < itemEnd; i++) {
    if (tokens[i].level === childLevel) {
      return i
    }
  }
  return -1
}

/**
 * Find matching dl_close token
 */
const findDLEnd = (tokens, startIndex) => {
  const result = findMatchingClose(tokens, startIndex, 'dl_open', 'dl_close')
  return result === -1 ? tokens.length - 1 : result
}

/**
 * Find matching dd_close token
 */
const findDDEnd = (tokens, startIndex) => {
  const result = findMatchingClose(tokens, startIndex, 'dd_open', 'dd_close')
  return result === -1 ? tokens.length - 1 : result
}

/**
 * Check if bullet_list matches DL pattern and convert if true (single pass)
 * Returns: { nextIndex: number } - index to continue processing from
 */
const checkAndConvertToDL = (tokens, listStart, listEnd, opt) => {
  // First pass: validate all items match DL pattern
  let hasAnyDLItem = false
  const itemRanges = collectListItemRanges(tokens, listStart, listEnd)
  if (itemRanges.length === 0) {
    return { nextIndex: listEnd + 1 }
  }

  for (const range of itemRanges) {
    const itemStart = range.open
    const itemEnd = range.close
    
    const firstChild = findFirstDirectChildInListItem(tokens, itemStart, itemEnd)
    if (firstChild !== -1 && tokens[firstChild].type === 'paragraph_open') {
      const firstPara = firstChild
      const inlineToken = tokens[firstPara + 1]
      if (!inlineToken || inlineToken.type !== 'inline') {
        return { nextIndex: listEnd + 1 }
      }

      const dlCheck = isDLPattern(inlineToken.content)
      if (!dlCheck.isMatch) {
        // Not all items are DL pattern - not a description list
        return { nextIndex: listEnd + 1 }
      }

      // Check if there's a description
      let hasDescription = false
      const afterStrong = dlCheck.afterStrong

      // Pattern 1: Explicit line-break marker after term line (`  ` or `\`) and
      // description text in the remaining first paragraph content.
      const explicitBreakDescription = getDescriptionAfterExplicitLineBreak(afterStrong)
      if (explicitBreakDescription !== null && hasMeaningfulDescriptionContent(explicitBreakDescription)) {
        hasDescription = true
      }

      // Pattern 2: Description in next paragraph/list (term-only first paragraph).
      if (!hasDescription) {
        // Check for additional paragraphs/lists
        const itemChildLevel = (tokens[itemStart]?.level ?? 0) + 1
        for (let k = firstPara + 3; k < itemEnd; k++) {
          if (tokens[k].level !== itemChildLevel) {
            continue
          }
          if (tokens[k].type === 'paragraph_open' ||
              tokens[k].type === 'bullet_list_open' ||
              tokens[k].type === 'ordered_list_open') {
            hasDescription = true
            break
          }
        }
      }

      // If no description, not a DL item
      if (!hasDescription) {
        return { nextIndex: listEnd + 1 }
      }

      hasAnyDLItem = true
    } else {
      // Any list_item that doesn't start with a paragraph cannot be a DL item.
      return { nextIndex: listEnd + 1 }
    }
  }
  
  // If valid DL, convert immediately (avoid re-scanning)
  if (hasAnyDLItem) {
    convertBulletListToDL(tokens, listStart, listEnd, opt, itemRanges)
    // After conversion, tokens are replaced - continue from original listEnd position
    // Note: convertBulletListToDL may change token count, but we use original listEnd
    return { nextIndex: listStart + 1 }  // Re-check from start since tokens changed
  }
  
  return { nextIndex: listEnd + 1 }
}

/**
 * Check if content matches DL pattern and return match details
 * Returns: { isMatch: boolean, afterStrong: string|null }
 */
const isDLPattern = (content) => {
  if (!content) return { isMatch: false, afterStrong: null }
  if (content.length < 4 || content[0] !== '*' || content[1] !== '*') {
    return { isMatch: false, afterStrong: null }
  }
  
  // Match **Term** pattern (allow spaces inside for markdown-it-strong-ja compatibility)
  const match = content.match(DL_TERM_INLINE_REGEX)
  if (!match) return { isMatch: false, afterStrong: null }
  
  const afterStrong = match[2]  // Text after closing **
  
  // Match only strict description-list starts:
  // 1) explicit line-break marker after term line (`  ` or `\`) + newline
  // 2) term-only first line (optionally with valid attrs only), expecting next block as description
  const { rest: afterAttrs } = consumeLeadingValidAttrBlocks(afterStrong)
  const isMatch = hasExplicitLineBreakMarker(afterStrong) || /^\s*$/.test(afterAttrs)
  
  return { isMatch, afterStrong }
}

/**
 * Convert bullet_list to dl/dt/dd structure using dl_open/dl_close tokens
 */
const convertBulletListToDL = (tokens, listStart, listEnd, opt, itemRanges = null) => {
  const newTokens = []
  const listLevel = tokens[listStart].level
  
  // Create dl_open token
  const dlOpen = new tokens[listStart].constructor('dl_open', 'dl', 1)
  dlOpen.level = listLevel
  dlOpen.block = true
  copyMap(dlOpen, tokens[listStart])
  
  // Copy attributes from bullet_list_open (e.g., {.class} from markdown-it-attrs)
  if (tokens[listStart].attrs && tokens[listStart].attrs.length > 0) {
    dlOpen.attrs = tokens[listStart].attrs.slice()
  }
  
  // Store pending attrs from list items (Pattern B: {.attrs} on last line of description)
  // These will be applied by moveParagraphAttributesToDL after markdown-it-attrs runs
  dlOpen._pendingListAttrs = []
  
  // Store DL metadata for later optimization in moveParagraphAttributesToDL
  dlOpen._dlMetadata = {
    itemCount: 0,  // Will be updated during processing
    lastDdTokenIndex: -1  // Will be updated to point to last dd_open in newTokens
  }
  
  newTokens.push(dlOpen)
  
  // Collect attrs from list items
  const listAttrsFromItems = []
  
  // Process each list_item
  const ranges = Array.isArray(itemRanges) && itemRanges.length > 0
    ? itemRanges
    : collectListItemRanges(tokens, listStart, listEnd)

  for (const range of ranges) {
    const itemStart = range.open
    const itemEnd = range.close
    const result = convertListItemToDtDd(tokens, itemStart, itemEnd, listLevel, opt)
    
    // Update metadata
    dlOpen._dlMetadata.itemCount++
    
    // Check for list-level attrs returned from item
    if (result.listAttrs && result.listAttrs.length > 0) {
      listAttrsFromItems.push(...result.listAttrs)
    }
    
    if (result.tokens) {
      // Track last dd_open position (relative to newTokens)
      for (let j = 0; j < result.tokens.length; j++) {
        if (result.tokens[j].type === 'dd_open') {
          dlOpen._dlMetadata.lastDdTokenIndex = newTokens.length + j
        }
      }
      newTokens.push(...result.tokens)
    }
  }
  
  // Store pending list attrs for later processing
  if (listAttrsFromItems.length > 0) {
    dlOpen._pendingListAttrs = listAttrsFromItems
  }
  
  // Create dl_close token
  const dlClose = new tokens[listStart].constructor('dl_close', 'dl', -1)
  dlClose.level = listLevel
  dlClose.block = true
  copyMap(dlClose, tokens[listEnd])
  newTokens.push(dlClose)
  
  // Replace tokens
  tokens.splice(listStart, listEnd - listStart + 1, ...newTokens)
}

/**
 * Convert list_item to dt/dd structure
 * Returns: { tokens: [...], listAttrs: [...] }
 */
const convertListItemToDtDd = (tokens, itemStart, itemEnd, parentLevel, opt) => {
  const result = []
  const listAttrs = []  // Attrs to be applied to dl (not dt/dd)
  
  // Get attributes from list_item_open (markdown-it-attrs may put {.class} there)
  const listItemToken = tokens[itemStart]
  let dtAttrs = listItemToken.attrs ? [...listItemToken.attrs] : null
  
  const firstChild = findFirstDirectChildInListItem(tokens, itemStart, itemEnd)
  const firstPara = firstChild !== -1 && tokens[firstChild].type === 'paragraph_open'
    ? firstChild
    : -1
  
  if (firstPara === -1) return { tokens: result, listAttrs }
  
  const inlineToken = tokens[firstPara + 1]
  if (!inlineToken || inlineToken.type !== 'inline') return { tokens: result, listAttrs }
  
  // Extract term and description from inline token's content
  let term = ''
  let descStart = ''
  
  const content = inlineToken.content
  const match = content.match(DL_TERM_INLINE_REGEX)
  
  if (match) {
    // Trim to avoid leading space when **Term** starts with whitespace (e.g. "** *term*")
    term = match[1].trim()
    let afterStrong = match[2]
    
    // Pattern A: one or more leading attr blocks right after **Term**.
    // These map to <dt> like markdown-it-attrs trailing attrs on a block line.
    const leadingAttrs = consumeLeadingValidAttrBlocks(afterStrong)
    if (leadingAttrs.attrs.length > 0) {
      if (!dtAttrs) {
        dtAttrs = []
      }
      dtAttrs.push(...leadingAttrs.attrs)
      afterStrong = leadingAttrs.rest
    }
    
    // Pattern B: {.attrs} on last line (e.g., "Description\n{.attrs}")
    // This will be processed by markdown-it-attrs and applied to list, not paragraph
    // We need to remove it from description content and save for list-level attrs
    const lastLineAttrsMatch = afterStrong.match(TRAILING_LIST_ATTR_LINE_REGEX)
    if (lastLineAttrsMatch) {
      // Parse attributes
      const attrString = lastLineAttrsMatch[1]
      const parsedAttrs = parseAttrString(attrString)
      if (parsedAttrs.length > 0) {
        listAttrs.push(...parsedAttrs)
        // Remove {.attrs} line from afterStrong
        afterStrong = afterStrong.replace(TRAILING_LIST_ATTR_LINE_REGEX, '')
      }
    }
    
    // Clean up afterStrong: remove leading spaces/backslash, then trim each line
    let cleaned = afterStrong.replace(/^\s+/, '').replace(/^\\/, '')
    
    // Remove leading whitespace from each line (remove list indent)
    cleaned = cleaned.split('\n').map(line => line.replace(/^\s+/, '')).join('\n').trim()
    
    descStart = cleaned
  }
  
  if (!term) return { tokens: result, listAttrs }
  
  // Create div_open if descriptionListWithDiv is enabled
  if (opt.descriptionListWithDiv) {
    const divOpen = new tokens[firstPara].constructor('div_open', 'div', 1)
    divOpen.level = parentLevel + 1
    divOpen.block = true
    copyMap(divOpen, tokens[firstPara])
    const divClass = opt.descriptionListDivClass
    if (divClass) {
      divOpen.attrs = [['class', divClass]]
    }
    result.push(divOpen)
  }
  
  // Create dt_open token
  const dtOpen = new tokens[firstPara].constructor('dt_open', 'dt', 1)
  dtOpen.level = parentLevel + 1
  dtOpen.block = true
  copyMap(dtOpen, tokens[firstPara])
  // Add collected attributes to dt_open
  if (dtAttrs && dtAttrs.length > 0) {
    dtOpen.attrs = dtAttrs
  }
  result.push(dtOpen)
  
  // Create inline token for dt content
  const dtInline = new tokens[firstPara].constructor('inline', '', 0)
  dtInline.content = term  // Keep original Markdown for inline parser to process
  dtInline.level = parentLevel + 2
  dtInline.children = []  // Will be populated by inline parser
  result.push(dtInline)
  
  // Create dt_close token
  const dtClose = new tokens[firstPara].constructor('dt_close', 'dt', -1)
  dtClose.level = parentLevel + 1
  dtClose.block = true
  copyMap(dtClose, tokens[firstPara])
  result.push(dtClose)
  
  // Create dd_open token
  const ddOpen = new tokens[firstPara].constructor('dd_open', 'dd', 1)
  ddOpen.level = parentLevel + 1
  ddOpen.block = true
  copyMap(ddOpen, tokens[firstPara])
  result.push(ddOpen)
  
  // First paragraph in dd (if description exists)
  if (descStart) {
    const pOpen = new tokens[firstPara].constructor('paragraph_open', 'p', 1)
    pOpen.level = parentLevel + 2
    pOpen.block = true  // IMPORTANT: Enable block mode for proper newline rendering
    copyMap(pOpen, tokens[firstPara])
    result.push(pOpen)
    
    const pInline = new tokens[firstPara].constructor('inline', '', 0)
    pInline.content = ''  // Leave empty, text token has the content
    pInline.level = parentLevel + 3
    pInline.block = true  // IMPORTANT: Enable block mode
    const pText = new tokens[firstPara].constructor('text', '', 0)
    pText.content = descStart
    pInline.children = [pText]
    result.push(pInline)
    
    const pClose = new tokens[firstPara].constructor('paragraph_close', 'p', -1)
    pClose.level = parentLevel + 2
    pClose.block = true  // IMPORTANT: Enable block mode for proper newline rendering
    copyMap(pClose, tokens[firstPara])
    result.push(pClose)
    
  }
  
  // Add remaining content in dd (paragraphs, lists, etc.)
  let i = firstPara + 3
  while (i < itemEnd) {
    const token = tokens[i]
    
    // Handle paragraph
    if (token.type === 'paragraph_open') {
      result.push(tokens[i])      // paragraph_open
      result.push(tokens[i + 1])  // inline
      result.push(tokens[i + 2])  // paragraph_close
      
      i += 3
    }
    // Handle bullet_list or ordered_list
    else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      // Find matching close
      let depth = 1
      let j = i + 1
      while (j < itemEnd && depth > 0) {
        if (tokens[j].type === token.type) {
          depth++
        } else if (tokens[j].type === token.type.replace('_open', '_close')) {
          depth--
        }
        j++
      }
      // Copy all tokens from i to j-1 (inclusive)
      for (let k = i; k < j; k++) {
        result.push(tokens[k])
      }
      i = j
    }
    // Skip other tokens (shouldn't happen)
    else {
      i++
    }
  }
  
  // Create dd_close token
  const ddClose = new tokens[firstPara].constructor('dd_close', 'dd', -1)
  ddClose.level = parentLevel + 1
  ddClose.block = true
  copyMap(ddClose, tokens[firstPara])
  result.push(ddClose)
  
  // Create div_close if descriptionListWithDiv is enabled
  if (opt.descriptionListWithDiv) {
    const divClose = new tokens[firstPara].constructor('div_close', 'div', -1)
    divClose.level = parentLevel + 1
    divClose.block = true
    copyMap(divClose, tokens[firstPara])
    result.push(divClose)
  }
  
  return { tokens: result, listAttrs }
}

/**
 * Move attributes from paragraph immediately after dl_close to dl_open
 * This supports markdown-it-attrs syntax for lists: {.className}
 * 
 * markdown-it-attrs applies attributes when there's a paragraph immediately
 * after the list containing only {.class} syntax.
 * 
 * Note: Individual dt/dd attributes are handled during DL conversion in Phase 0
 */
export const moveParagraphAttributesToDL = (tokens) => {
  let i = 0
  while (i < tokens.length) {
    if (tokens[i].type === 'dl_open') {
      const dlOpen = tokens[i]
      
      // Use cached metadata if available, otherwise fallback to search
      const dlMetadata = dlOpen._dlMetadata
      const dlClose = dlMetadata ? findDLEndFast(tokens, i, dlMetadata) : findDLEnd(tokens, i)
      
      // Apply pending list attrs from Phase 0
      if (dlOpen._pendingListAttrs && dlOpen._pendingListAttrs.length > 0) {
        if (!dlOpen.attrs) {
          dlOpen.attrs = []
        }
        dlOpen.attrs.push(...dlOpen._pendingListAttrs)
        delete dlOpen._pendingListAttrs  // Clean up
      }
      
      // Pattern 1: Check if there's a paragraph immediately after dl_close
      // markdown-it-attrs puts list attributes on this paragraph
      if (dlClose + 1 < tokens.length && tokens[dlClose + 1].type === 'paragraph_open') {
        const paraOpen = tokens[dlClose + 1]
        
        if (paraOpen.attrs && paraOpen.attrs.length > 0) {
          // Move attributes to dl_open
          if (!dlOpen.attrs) {
            dlOpen.attrs = []
          }
          dlOpen.attrs.push(...paraOpen.attrs)
          paraOpen.attrs = []
          
          // Remove the paragraph tokens (paragraph_open, inline, paragraph_close)
          const paraClose = dlClose + 3
          if (tokens[paraClose] && tokens[paraClose].type === 'paragraph_close') {
            tokens.splice(dlClose + 1, 3)
          }
        }
      }
      
      // Pattern 2: Single-item DL with attrs on the last paragraph in dd
      // Use cached item count if available
      const isSingleItem = dlMetadata ? (dlMetadata.itemCount === 1) : (() => {
        let dtCount = 0
        for (let j = i + 1; j < dlClose; j++) {
          if (tokens[j].type === 'dt_open') {
            dtCount++
          }
        }
        return dtCount === 1
      })()
      
      // If single-item DL, check last paragraph in last dd
      if (isSingleItem) {
        // Use cached lastDdOpen if available
        let lastDdOpen = dlMetadata && dlMetadata.lastDdTokenIndex !== -1 
          ? dlMetadata.lastDdTokenIndex 
          : (() => {
              for (let j = dlClose - 1; j > i; j--) {
                if (tokens[j].type === 'dd_open') {
                  return j
                }
              }
              return -1
            })()
        
        if (lastDdOpen !== -1) {
          const ddClose = findDDEnd(tokens, lastDdOpen)
          
          // Find last paragraph in this dd
          let lastParaOpen = -1
          for (let j = ddClose - 1; j > lastDdOpen; j--) {
            if (tokens[j].type === 'paragraph_open') {
              lastParaOpen = j
              break
            }
          }
          
          if (lastParaOpen !== -1) {
            const paraOpen = tokens[lastParaOpen]
            const paraInline = tokens[lastParaOpen + 1]
            
            // Check if paragraph has attrs and content is just whitespace or {.attrs} pattern
            // This indicates the attrs belong to the list, not the paragraph content
            if (paraOpen.attrs && paraOpen.attrs.length > 0) {
              let shouldMoveAttrs = false
              
              // Check if inline content is empty or only contains whitespace
              if (paraInline && paraInline.type === 'inline') {
                const content = paraInline.content || ''
                // If content is empty or only whitespace after removing {.attrs} patterns
                const cleanedContent = content.replace(/\{[^}]+\}/g, '').trim()
                if (!cleanedContent) {
                  shouldMoveAttrs = true
                }
              }
              
              if (shouldMoveAttrs) {
                // Move attributes to dl_open
                if (!dlOpen.attrs) {
                  dlOpen.attrs = []
                }
                dlOpen.attrs.push(...paraOpen.attrs)
                paraOpen.attrs = []
                
                // Clean up trailing newline from inline content
                // (markdown-it-attrs removes {.simple} but leaves the newline)
                if (paraInline && paraInline.content) {
                  paraInline.content = paraInline.content.trimEnd()
                  // Update child text nodes as well
                  if (paraInline.children && paraInline.children.length > 0) {
                    for (const child of paraInline.children) {
                      if (child.type === 'text' && child.content) {
                        child.content = child.content.trimEnd()
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      // Clean up metadata after processing
      if (dlMetadata) {
        delete dlOpen._dlMetadata
      }
      
      i = dlClose + 1
    } else {
      i++
    }
  }
}

/**
 * Fast DL end finder using metadata hint
 */
const findDLEndFast = (tokens, startIndex, metadata) => {
  // Use hint from metadata to estimate end position
  // Start searching from lastDdTokenIndex instead of from beginning
  const searchStart = metadata.lastDdTokenIndex !== -1 ? metadata.lastDdTokenIndex : startIndex + 1
  
  for (let i = searchStart; i < tokens.length; i++) {
    if (tokens[i].type === 'dl_close' && tokens[i].level === tokens[startIndex].level) {
      return i
    }
  }
  
  // Fallback to full search if hint didn't work
  return findDLEnd(tokens, startIndex)
}
