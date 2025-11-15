// Phase 0: Description List Processing
// Converts bullet_list with **Term** pattern to description_list (dl/dt/dd)
// This must run before Phase 1

import { findMatchingClose } from './list-helpers.js'

/**
 * Escape HTML special characters
 */
const escapeHtml = (text) => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Parse attribute string like ".class1 .class2 #id data-foo="bar""
 * Returns array of [key, value] pairs
 */
const parseAttrString = (attrStr) => {
  const attrs = []
  const classMatches = attrStr.match(/\.[\w-]+/g)
  const idMatch = attrStr.match(/#([\w-]+)/)
  const dataMatches = attrStr.match(/([\w-]+)="([^"]+)"/g)
  
  // Collect all classes
  if (classMatches) {
    const classes = classMatches.map(c => c.substring(1)).join(' ')
    attrs.push(['class', classes])
  }
  
  // Add id
  if (idMatch) {
    attrs.push(['id', idMatch[1]])
  }
  
  // Add data attributes
  if (dataMatches) {
    dataMatches.forEach(match => {
      const [, key, value] = match.match(/([\w-]+)="([^"]+)"/)
      attrs.push([key, value])
    })
  }
  
  return attrs
}

/**
 * Process description list patterns in tokens
 * @param {Array} tokens - Token array
 * @param {Object} opt - Options object
```
 */
export const processDescriptionList = (tokens, opt) => {
  if (!opt.descriptionList && !opt.descriptionListWithDiv) {
    return
  }

  // Find bullet_lists and check if they match DL pattern
  // Process in single pass: check and convert together to avoid duplicate scanning
  let i = 0
  while (i < tokens.length) {
    if (tokens[i].type === 'bullet_list_open') {
      const listEnd = findListEnd(tokens, i)
      const dlCheck = checkAndConvertToDL(tokens, i, listEnd, opt)
      i = dlCheck.nextIndex
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
  const openType = tokens[startIndex].type
  const closeType = openType.replace('_open', '_close')
  const result = findMatchingClose(tokens, startIndex, openType, closeType)
  return result === -1 ? tokens.length - 1 : result
}

/**
 * Find matching list_item close token
 */
const findListItemEnd = (tokens, startIndex) => {
  const result = findMatchingClose(tokens, startIndex, 'list_item_open', 'list_item_close')
  return result === -1 ? tokens.length - 1 : result
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
  let i = listStart + 1
  
  while (i < listEnd) {
    if (tokens[i].type === 'list_item_open') {
      const itemEnd = findListItemEnd(tokens, i)
      
      // Find first paragraph
      let firstPara = -1
      for (let j = i + 1; j < itemEnd; j++) {
        if (tokens[j].type === 'paragraph_open') {
          firstPara = j
          break
        }
      }
      
      if (firstPara !== -1) {
        const inlineToken = tokens[firstPara + 1]
        if (inlineToken && inlineToken.type === 'inline') {
          const dlCheck = isDLPattern(inlineToken.content)
          if (dlCheck.isMatch) {
            // Check if there's a description
            let hasDescription = false
            
            const afterStrong = dlCheck.afterStrong
            
            // Pattern 1: **Term**  description (2+ spaces, including newlines)
            // Pattern 2: **Term**: description (colon)
            // Pattern 3: **Term**\ description (backslash escape)
            if (/^\s{2,}/.test(afterStrong) || /^\s*:/.test(afterStrong) || /^\\/.test(afterStrong)) {
              // Remove leading space/colon/backslash and check remaining text
              const cleaned = afterStrong.replace(/^[\s:]+/, '').replace(/^\\/, '').trim()
              if (cleaned) {
                hasDescription = true
              }
            }
            
            // Pattern 4: Description in next paragraph (only **Term** in first para)
            if (!hasDescription) {
              // Check for additional paragraphs/lists
              for (let k = firstPara + 3; k < itemEnd; k++) {
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
              return false
            }
            
            hasAnyDLItem = true
          } else {
            // Not all items are DL pattern - not a description list
            return { nextIndex: listEnd + 1 }
          }
        }
      }
      
      i = itemEnd + 1
    } else {
      i++
    }
  }
  
  // If valid DL, convert immediately (avoid re-scanning)
  if (hasAnyDLItem) {
    convertBulletListToDL(tokens, listStart, listEnd, opt)
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
  
  // Match **Term** pattern (allow spaces inside for markdown-it-strong-ja compatibility)
  const match = content.match(/^\*\*(.*?)\*\*(.*)/s)  // s flag for including newlines
  if (!match) return { isMatch: false, afterStrong: null }
  
  const afterStrong = match[2]  // Text after closing **
  
  // Pattern 1: **Term**  description (2+ spaces, including newlines)
  // Pattern 2: **Term**: description (colon)
  // Pattern 3: **Term**\ description (backslash escape)
  // Pattern 4: **Term** only (no content after)
  // Pattern 5: **Term** {.attrs} (markdown-it-attrs syntax, optionally with content after)
  const isMatch = /^\s{2,}/.test(afterStrong) || 
                  /^\s*:/.test(afterStrong) ||
                  /^\\/.test(afterStrong) ||
                  /^\s*$/.test(afterStrong) ||
                  /^\s*\{[^}]+\}/.test(afterStrong)  // {.class} or {#id} etc
  
  return { isMatch, afterStrong }
}

/**
 * Convert bullet_list to dl/dt/dd structure using dl_open/dl_close tokens
 */
const convertBulletListToDL = (tokens, listStart, listEnd, opt) => {
  const newTokens = []
  const listLevel = tokens[listStart].level
  
  // Create dl_open token
  const dlOpen = new tokens[listStart].constructor('dl_open', 'dl', 1)
  dlOpen.level = listLevel
  dlOpen.block = true
  
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
  let i = listStart + 1
  while (i < listEnd) {
    if (tokens[i].type === 'list_item_open') {
      const itemEnd = findListItemEnd(tokens, i)
      const result = convertListItemToDtDd(tokens, i, itemEnd, listLevel, opt)
      
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
      
      i = itemEnd + 1
    } else {
      i++
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
  
  // Find first paragraph
  let firstPara = -1
  for (let i = itemStart + 1; i < itemEnd; i++) {
    if (tokens[i].type === 'paragraph_open') {
      firstPara = i
      break
    }
  }
  
  if (firstPara === -1) return { tokens: result, listAttrs }
  
  const inlineToken = tokens[firstPara + 1]
  if (!inlineToken || inlineToken.type !== 'inline') return { tokens: result, listAttrs }
  
  // Extract term and description from inline token's content
  let term = ''
  let descStart = ''
  
  const content = inlineToken.content
  const match = content.match(/^\*\*(.*?)\*\*(.*)/s)  // s flag for including newlines
  
  if (match) {
    term = match[1]  // Keep spaces for now (will be processed by inline parser)
    let afterStrong = match[2]
    
    // Extract {.attrs} from afterStrong if present (markdown-it-attrs hasn't processed yet)
    // Pattern A: Inline {.attrs} immediately after **Term** like **Term** {.class}
    const inlineAttrsMatch = afterStrong.match(/^\s*\{([^}]+)\}/)
    if (inlineAttrsMatch) {
      // Parse attributes manually
      const attrString = inlineAttrsMatch[1]
      const parsedAttrs = parseAttrString(attrString)
      if (parsedAttrs.length > 0) {
        if (!dtAttrs) {
          dtAttrs = []
        }
        dtAttrs.push(...parsedAttrs)
      }
      // Remove {.attrs} from afterStrong (including trailing newline if attrs-only line)
      afterStrong = afterStrong.replace(/^\s*\{[^}]+\}\s*/, '')
    }
    
    // Pattern B: {.attrs} on last line (e.g., "Description\n{.attrs}")
    // This will be processed by markdown-it-attrs and applied to list, not paragraph
    // We need to remove it from description content and save for list-level attrs
    const lastLineAttrsMatch = afterStrong.match(/\n\s*\{([^}]+)\}\s*$/)
    if (lastLineAttrsMatch) {
      // Parse attributes
      const attrString = lastLineAttrsMatch[1]
      const parsedAttrs = parseAttrString(attrString)
      if (parsedAttrs.length > 0) {
        listAttrs.push(...parsedAttrs)
      }
      // Remove {.attrs} line from afterStrong
      afterStrong = afterStrong.replace(/\n\s*\{[^}]+\}\s*$/, '')
    }
    
    // Clean up afterStrong: remove leading spaces/colon/backslash, then trim each line
    let cleaned = afterStrong.replace(/^[\s:]+/, '').replace(/^\\/, '')
    
    // Remove leading whitespace from each line (remove list indent)
    cleaned = cleaned.split('\n').map(line => line.replace(/^\s+/, '')).join('\n').trim()
    
    descStart = cleaned
  }
  
  if (!term) return { tokens: result, listAttrs }
  
  // Create div_open if descriptionListWithDiv is enabled
  if (opt && opt.descriptionListWithDiv) {
    const divOpen = new tokens[firstPara].constructor('div_open', 'div', 1)
    divOpen.level = parentLevel + 1
    divOpen.block = true
    result.push(divOpen)
  }
  
  // Create dt_open token
  const dtOpen = new tokens[firstPara].constructor('dt_open', 'dt', 1)
  dtOpen.level = parentLevel + 1
  dtOpen.block = true
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
  result.push(dtClose)
  
  // Create dd_open token
  const ddOpen = new tokens[firstPara].constructor('dd_open', 'dd', 1)
  ddOpen.level = parentLevel + 1
  ddOpen.block = true
  result.push(ddOpen)
  
  // First paragraph in dd (if description exists)
  let hasFirstParagraph = false
  if (descStart.trim()) {
    const pOpen = new tokens[firstPara].constructor('paragraph_open', 'p', 1)
    pOpen.level = parentLevel + 2
    pOpen.block = true  // IMPORTANT: Enable block mode for proper newline rendering
    result.push(pOpen)
    
    const pInline = new tokens[firstPara].constructor('inline', '', 0)
    pInline.content = ''  // Leave empty, text token has the content
    pInline.level = parentLevel + 3
    pInline.block = true  // IMPORTANT: Enable block mode
    const pText = new tokens[firstPara].constructor('text', '', 0)
    pText.content = descStart.trim()
    pInline.children = [pText]
    result.push(pInline)
    
    const pClose = new tokens[firstPara].constructor('paragraph_close', 'p', -1)
    pClose.level = parentLevel + 2
    pClose.block = true  // IMPORTANT: Enable block mode for proper newline rendering
    result.push(pClose)
    
    hasFirstParagraph = true
  }
  
  // Add remaining content in dd (paragraphs, lists, etc.)
  let i = firstPara + 3
  while (i < itemEnd) {
    const token = tokens[i]
    
    // Handle paragraph
    if (token.type === 'paragraph_open') {
      hasFirstParagraph = true
      
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
  result.push(ddClose)
  
  // Create div_close if descriptionListWithDiv is enabled
  if (opt && opt.descriptionListWithDiv) {
    const divClose = new tokens[firstPara].constructor('div_close', 'div', -1)
    divClose.level = parentLevel + 1
    divClose.block = true
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
