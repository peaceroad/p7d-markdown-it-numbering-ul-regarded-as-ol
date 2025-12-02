// Phase 1: List Structure Analysis and Marker Detection
// Analyze only, no token conversion
import { detectMarkerType } from './types-utility.js'
import { findMatchingClose } from './list-helpers.js'

/**
 * Pre-compute DL scope (identify all DL ranges in O(n))
 * @param {Array} tokens - Token array
 * @returns {Array<[number, number]>} DL range pairs [[start, end], ...]
 */
function buildDLStateMap(tokens) {
  const state = new Array(tokens.length).fill(false)
  let dlDepth = 0
  let htmlDdDepth = 0
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    
    if (dlDepth > 0 || htmlDdDepth > 0) {
      state[i] = true
    }
    
    if (token.type === 'dl_open') {
      state[i] = true
      dlDepth++
      continue
    }
    
    if (token.type === 'dl_close') {
      state[i] = true
      if (dlDepth > 0) {
        dlDepth--
      }
      continue
    }
    
    if (token.type === 'html_block') {
      if (token.content === '<dd>\n') {
        state[i] = true
        htmlDdDepth++
        continue
      }
      if (token.content === '</dd>\n') {
        state[i] = true
        if (htmlDdDepth > 0) {
          htmlDdDepth--
        }
        continue
      }
    }
  }
  
  return state
}

/**
 * Check if token at specified index is inside DL
 * @param {number} index - Index to check
 * @param {Array<[number, number]>} dlRanges - DL range pairs
 * @returns {boolean} True if inside DL
 */
function isInsideDL(index, dlState) {
  if (!dlState || index < 0 || index >= dlState.length) {
    return false
  }
  return dlState[index] === true
}

/**
 * Collect list information from token array
 * @param {Array} tokens - markdown-it token array
 * @param {Object} opt - Plugin options
 * @returns {Array} Flat array of list information (including nested lists)
 */
export function analyzeListStructure(tokens, opt) {
  const listInfos = []
  const processed = new Set()
  
  // Check DL existence (O(n) but optimized with early return)
  let hasDL = false
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'dl_open' || 
        (tokens[i].type === 'html_block' && tokens[i].content === '<dd>\n')) {
      hasDL = true
      break
    }
  }
  
  // Pre-compute DL scope flags (only when DL exists)
  const dlScope = hasDL ? buildDLStateMap(tokens) : null
  
  // Process only top-level lists (nested lists collected recursively)
  // Also process lists inside DL
  for (let i = 0; i < tokens.length; i++) {
    if (processed.has(i)) {
      continue
    }
    
    const token = tokens[i]
    
    // Process level-0 lists or lists at any level inside DD
    const isTopLevelList = (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') && 
                           (token.level === 0 || token.level === undefined)
    const isListInDD = (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') && 
                       token.level > 0 && 
                       isInsideDL(i, dlScope)
    
    if (isTopLevelList || isListInDD) {
      const listInfo = analyzeList(tokens, i, opt)
      if (listInfo) {
        listInfos.push(listInfo)
        // Mark this list range as processed
        for (let j = listInfo.startIndex; j <= listInfo.endIndex; j++) {
          processed.add(j)
        }
        
        // Recursively collect nested lists
        collectNestedLists(listInfo, listInfos)
      }
    }
  }
  
  return listInfos
}

/**
 * Recursively collect nested lists from listInfo
 * @param {Object} listInfo - List information
 * @param {Array} listInfos - Destination array
 */
function collectNestedLists(listInfo, listInfos) {
  for (const item of listInfo.items) {
    if (item.nestedLists && item.nestedLists.length > 0) {
      for (const nestedList of item.nestedLists) {
        listInfos.push(nestedList)
        // Recursively collect further nested lists
        collectNestedLists(nestedList, listInfos)
      }
    }
  }
}

/**
 * Analyze detailed information of a single list
 */
function analyzeList(tokens, startIndex, opt) {
  const listToken = tokens[startIndex]
  const endIndex = findListEnd(tokens, startIndex)
  
  if (endIndex === -1) {
    return null
  }
  
  const level = listToken.level || 0
  const originalType = listToken.type
  const items = analyzeListItems(tokens, startIndex, endIndex, opt)
  const isLoose = detectLooseList(tokens, startIndex, endIndex, items)
  if (!isLoose) {
    hideFirstParagraphsForTightList(tokens, items, level)
  }
  
  // Extract marker info (for both bullet_list and ordered_list)
  const markerInfo = extractMarkerInfo(tokens, startIndex, endIndex, opt)
  
  // Recheck marker consistency against item count
  if (markerInfo && markerInfo.count < items.length) {
    // Consider inconsistent if only some items have markers
    markerInfo.isConsistent = false
  }
  
  // Conversion decision (only consider for bullet_list)
  // Convert even loose lists if markers are consistent
  const shouldConvert = originalType === 'bullet_list_open' && 
                        shouldConvertToOrdered(originalType, markerInfo, opt)
  
  return {
    startIndex,
    endIndex,
    level,
    originalType,
    items,
    isLoose,
    markerInfo,
    shouldConvert
  }
}

/**
 * Analyze list items
 */
function analyzeListItems(tokens, startIndex, endIndex, opt) {
  const items = []
  let i = startIndex + 1
  
  while (i < endIndex) {
    const token = tokens[i]
    
    if (token.type === 'list_item_open') {
      const itemEndIndex = findListItemEnd(tokens, i)
      const item = analyzeListItem(tokens, i, itemEndIndex, opt)
      items.push(item)
      i = itemEndIndex + 1
    } else {
      i++
    }
  }
  
  return items
}

/**
 * Analyze a single list item
 */
function analyzeListItem(tokens, startIndex, endIndex, opt) {
  let content = ''
  let markerInfo = null
  let hasNestedList = false
  let nestedLists = []
  let firstParagraphIsLoose = false
  
  // Check if blank line exists right after first paragraph (only before child lists)
  // paragraph.hidden alone is insufficient: when parent list is loose, all paragraphs have hidden=false
  // Need to use map info to verify actual blank line after paragraph
  let nestedDepth = 0
  let foundParagraph = false
  let firstParagraphIndex = -1
  
  for (let i = startIndex + 1; i < endIndex; i++) {
    const token = tokens[i]
    
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      // When child list starts, check if blank line exists right after first paragraph
      if (foundParagraph && firstParagraphIndex !== -1) {
        const paragraphToken = tokens[firstParagraphIndex]
        const paragraphEndLine = paragraphToken.map ? paragraphToken.map[1] : undefined
        const nestedListStartLine = token.map
          ? token.map[0]
          : (typeof token._literalStartLine === 'number' ? token._literalStartLine : undefined)
        if (typeof paragraphEndLine === 'number' && typeof nestedListStartLine === 'number') {
          // Check if blank line exists between paragraph end and child list start
          if (nestedListStartLine > paragraphEndLine) {
            firstParagraphIsLoose = true
          }
        }
        break
      }
      nestedDepth++
    } else if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
      nestedDepth--
    } else if (nestedDepth === 0 && token.type === 'paragraph_open') {
      // First paragraph outside nested lists
      foundParagraph = true
      firstParagraphIndex = i
    }
  }
  
  for (let i = startIndex + 1; i < endIndex; i++) {
    const token = tokens[i]
    
    if (token.type === 'inline' && token.content) {
      content = token.content
      // Detect marker
      markerInfo = detectMarkerType(content, opt)
    }
    
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      hasNestedList = true
      const nestedListInfo = analyzeList(tokens, i, opt)
      nestedLists.push(nestedListInfo)
      i = nestedListInfo.endIndex
    }
  }
  
  return {
    startIndex,
    endIndex,
    content,
    markerInfo,
    hasNestedList,
    nestedLists,
    firstParagraphIsLoose
  }
}

/**
 * Extract marker information
 */
function extractMarkerInfo(tokens, startIndex, endIndex, opt) {
  const listToken = tokens[startIndex]
  const markers = []
  let level = 0
  
  // For ordered_list, get numbers from list_item_open's info
  if (listToken.type === 'ordered_list_open') {
    for (let i = startIndex + 1; i < endIndex; i++) {
      const token = tokens[i]
      
      if (token.type === 'list_item_open' && token.level === (listToken.level || 0) + 1) {
        // Get number from info
        const itemNumber = token.info ? parseInt(token.info, 10) : markers.length + 1
        const markup = token.markup || listToken.markup || '.'
        
        markers.push({
          number: itemNumber,
          originalNumber: itemNumber,
          prefix: '',
          suffix: markup,
          type: 'decimal'  // Default (can be extended to detect from markup)
        })
      }
    }
  } else {
    // For bullet_list, detect markers from inline content
    // Target only direct children list_items of this list
    const targetLevel = (listToken.level || 0) + 3  // list_open(0) -> list_item(1) -> paragraph(2) -> inline(3)
    
    // First, collect all contents (for detecting iroha sequence etc.)
    const allContents = []
    for (let i = startIndex + 1; i < endIndex; i++) {
      const token = tokens[i]
      if (token.type === 'inline' && token.content && token.level === targetLevel) {
        allContents.push(token.content)
      }
    }
    
    // Detect markers using full context
    let sequentialNumber = 1  // Sequential number counter
    for (let i = startIndex + 1; i < endIndex; i++) {
      const token = tokens[i]
      
      // Process only inline tokens of direct child items of this list
      if (token.type === 'inline' && token.content && token.level === targetLevel) {
        const markerInfo = detectMarkerType(token.content, allContents)
        if (markerInfo && markerInfo.type) {
          // Use sequential numbers when same marker continues
          // (e.g., "イ. イ. イ." → interpreted as "イ、ロ、ハ")
          const adjustedMarkerInfo = { ...markerInfo }
          adjustedMarkerInfo.originalNumber = markerInfo.number
          
          // Assign sequential numbers based on first marker's number
          if (markers.length === 0) {
            // Use first marker as-is
            sequentialNumber = markerInfo.number || 1
          } else {
            // For 2nd and later, use sequential number if same as previous marker
            const prevMarker = markers[markers.length - 1]
            if (markerInfo.marker === prevMarker.marker && 
                markerInfo.type === prevMarker.type) {
              // Assign sequential number when same marker continues
              sequentialNumber++
              adjustedMarkerInfo.number = sequentialNumber
            } else {
              // For different marker, use detected number
              sequentialNumber = markerInfo.number || sequentialNumber + 1
            }
          }
          
          markers.push(adjustedMarkerInfo)
        }
      }
    }
  }
  
  // Check if markers are consistent
  if (markers.length === 0) {
    return null
  }
  
  const firstType = markers[0].type
  const allSameType = markers.every(m => m.type === firstType)
  const literalNumbers = markers.map(m => (typeof m.originalNumber === 'number' ? m.originalNumber : undefined))
  const hasLiteralNumbers = literalNumbers.length === markers.length && literalNumbers.every(n => typeof n === 'number')
  let allNumbersIdentical = false
  if (hasLiteralNumbers) {
    const firstLiteral = literalNumbers[0]
    if (literalNumbers.every(n => n === firstLiteral) && firstLiteral === 1) {
      allNumbersIdentical = true
    }
  }
  
  return {
    markers,
    type: firstType,
    isConsistent: allSameType,
    count: markers.length,
    allNumbersIdentical
  }
}

/**
 * Determine if should convert to ordered list
 */
function shouldConvertToOrdered(originalType, markerInfo, opt) {
  // No conversion needed if already ordered_list
  if (originalType === 'ordered_list_open') {
    return false
  }
  
  // Don't convert if no markers
  if (!markerInfo || markerInfo.count === 0) {
    return false
  }
  
  // Don't convert if markers are inconsistent
  if (!markerInfo.isConsistent) {
    return false
  }
  
  return true
}

/**
 * Detect loose list
 * In markdown-it, lists separated by blank lines have paragraphs in each list_item
 * For tight lists, paragraph_open.hidden === true
 */
function detectLooseList(tokens, startIndex, endIndex, items = null) {
  const listLevel = tokens[startIndex]?.level || 0
  const paragraphLevel = listLevel + 2
  for (let i = startIndex + 1; i < endIndex; i++) {
    const token = tokens[i]
    // Loose list if paragraph_open exists and is not hidden
    if (token.type === 'paragraph_open' && token.level === paragraphLevel && !token.hidden) {
      if (items && items.length === 1 && isTightSingleItem(tokens, items[0])) {
        continue
      }
      return true
    }
  }
  return false
}

function isTightSingleItem(tokens, item) {
  if (!item || item.firstParagraphIsLoose) {
    return false
  }
  const itemOpenToken = tokens[item.startIndex]
  const childLevel = (itemOpenToken.level || 0) + 1
  let paragraphCount = 0
  for (let i = item.startIndex + 1; i < item.endIndex; i++) {
    const token = tokens[i]
    if (token.level !== childLevel) {
      continue
    }
    if (token.type === 'paragraph_open') {
      paragraphCount++
      if (paragraphCount > 1) {
        return false
      }
    } else if (token.type === 'ordered_list_open' || token.type === 'bullet_list_open') {
      continue
    } else if (token.type.endsWith('_open') || token.type === 'html_block' || token.type === 'code_block' || token.type === 'fence') {
      return false
    }
  }
  return true
}

function hideFirstParagraphsForTightList(tokens, items, level) {
  if (!Array.isArray(items) || level !== 0) {
    return
  }
  for (const item of items) {
    if (!item || item.firstParagraphIsLoose) {
      continue
    }
    const itemToken = tokens[item.startIndex]
    if (!itemToken) {
      continue
    }
    const paragraphLevel = (itemToken.level || 0) + 1
    for (let i = item.startIndex + 1; i < item.endIndex; i++) {
      const token = tokens[i]
      if (!token) {
        continue
      }
      if (token.type === 'paragraph_open' && token.level === paragraphLevel) {
        if (!token._literalTight) {
          break
        }
        token.hidden = true
        const closeIdx = findMatchingClose(tokens, i, 'paragraph_open', 'paragraph_close')
        if (closeIdx !== -1) {
          tokens[closeIdx].hidden = true
        }
        break
      } else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        break
      }
    }
  }
}

/**
 * Find list end position
 */
function findListEnd(tokens, startIndex) {
  const startToken = tokens[startIndex]
  const openType = startToken.type
  const closeType = openType.replace('_open', '_close')
  const result = findMatchingClose(tokens, startIndex, openType, closeType)
  return result === -1 ? tokens.length - 1 : result
}

/**
 * Find list item end position
 */
function findListItemEnd(tokens, startIndex) {
  const result = findMatchingClose(tokens, startIndex, 'list_item_open', 'list_item_close')
  return result === -1 ? tokens.length - 1 : result
}
