// Phase 1: List Structure Analysis and Marker Detection
// Analyze only, no token conversion
import { detectMarkerType, detectMarkerTypeWithContext, detectSequencePattern } from './types-utility.js'
import { buildListCloseIndexMap, findMatchingClose } from './list-helpers.js'

/**
 * Collect list information from token array
 * @param {Array} tokens - markdown-it token array
 * @returns {Array} Flat array of list information (including nested lists)
 */
export function analyzeListStructure(tokens) {
  const listInfos = []
  const closeMap = buildListCloseIndexMap(tokens)

  // Process every list root in the token stream, including lists nested in
  // containers such as blockquotes or description-list descriptions. Nested
  // lists inside an already-analyzed list are collected recursively, then the
  // scan jumps to that list's close token to avoid duplicate processing.
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) {
      continue
    }

    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const listInfo = analyzeList(tokens, i, closeMap)
      if (listInfo) {
        listInfos.push(listInfo)
        
        // Recursively collect nested lists
        collectNestedLists(listInfo, listInfos)
        i = listInfo.endIndex
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
function analyzeList(tokens, startIndex, closeMap) {
  const listToken = tokens[startIndex]
  const endIndex = findListEnd(tokens, startIndex, closeMap)
  
  if (endIndex === -1) {
    return null
  }
  
  const level = listToken.level || 0
  const originalType = listToken.type
  const items = analyzeListItems(tokens, startIndex, endIndex, closeMap)
  const isLoose = detectLooseList(tokens, startIndex, endIndex, items)
  if (!isLoose) {
    hideFirstParagraphsForTightList(tokens, items, level)
  }

  // Cache loose/tight state for later phases (mapless flattening fallback).
  listToken._isLoose = isLoose
  
  // Extract marker info (for both bullet_list and ordered_list)
  const markerInfo = extractMarkerInfo(tokens, startIndex, endIndex)
  
  // Recheck marker consistency against item count
  if (markerInfo && markerInfo.count < items.length) {
    // Consider inconsistent if only some items have markers
    markerInfo.isConsistent = false
  }
  
  // Conversion decision (only consider for bullet_list)
  // Convert even loose lists if markers are consistent
  const shouldConvert = originalType === 'bullet_list_open' && 
                        shouldConvertToOrdered(originalType, markerInfo)

  if (markerInfo) {
    listToken._markerInfo = markerInfo
  }
  if (originalType === 'bullet_list_open') {
    listToken._shouldConvert = shouldConvert
  }
  
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
function analyzeListItems(tokens, startIndex, endIndex, closeMap) {
  const items = []
  let i = startIndex + 1
  
  while (i < endIndex) {
    const token = tokens[i]
    
    if (token.type === 'list_item_open') {
      const itemEndIndex = findListItemEnd(tokens, i, closeMap)
      const item = analyzeListItem(tokens, i, itemEndIndex, closeMap)
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
function analyzeListItem(tokens, startIndex, endIndex, closeMap) {
  let markerInfo = null
  let hasNestedList = false
  const nestedLists = []
  let firstParagraphIsLoose = false
  let lastInlineContent = ''
  
  // Check if blank line exists right after first paragraph (only before child lists)
  // paragraph.hidden alone is insufficient: when parent list is loose, all paragraphs have hidden=false
  // Need to use map info to verify actual blank line after paragraph
  let foundParagraph = false
  let firstParagraphIndex = -1
  let checkedFirstParagraphLoose = false
  
  for (let i = startIndex + 1; i < endIndex; i++) {
    const token = tokens[i]
    
    if (token.type === 'inline' && token.content) {
      lastInlineContent = token.content
    }
    
    if (!checkedFirstParagraphLoose && token.type === 'paragraph_open' && !foundParagraph) {
      foundParagraph = true
      firstParagraphIndex = i
    }

    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      if (!checkedFirstParagraphLoose && foundParagraph && firstParagraphIndex !== -1) {
        const paragraphToken = tokens[firstParagraphIndex]
        const paragraphEndLine = paragraphToken.map ? paragraphToken.map[1] : undefined
        const nestedListStartLine = token.map
          ? token.map[0]
          : (typeof token._literalStartLine === 'number' ? token._literalStartLine : undefined)
        if (typeof paragraphEndLine === 'number' && typeof nestedListStartLine === 'number') {
          if (nestedListStartLine > paragraphEndLine) {
            firstParagraphIsLoose = true
          }
        }
      }
      checkedFirstParagraphLoose = true
      hasNestedList = true
      const nestedListInfo = analyzeList(tokens, i, closeMap)
      nestedLists.push(nestedListInfo)
      i = nestedListInfo.endIndex
    }
  }
  
  if (firstParagraphIsLoose && hasNestedList && lastInlineContent) {
    markerInfo = detectMarkerType(lastInlineContent)
  }

  if (tokens[startIndex]) {
    tokens[startIndex]._firstParagraphIsLoose = firstParagraphIsLoose
  }
  
  return {
    startIndex,
    endIndex,
    content: lastInlineContent,
    markerInfo,
    hasNestedList,
    nestedLists,
    firstParagraphIsLoose
  }
}

/**
 * Extract marker information
 */
function extractMarkerInfo(tokens, startIndex, endIndex) {
  const listToken = tokens[startIndex]
  const markers = []
  const literalMarkerInfo = listToken._literalMarkerInfo || null
  
  // For ordered_list, get numbers from list_item_open's info
  if (listToken.type === 'ordered_list_open') {
    const literalMarkers = Array.isArray(literalMarkerInfo?.markers) ? literalMarkerInfo.markers : null
    const literalType = literalMarkerInfo?.type || 'decimal'
    const literalPrefix = literalMarkers?.[0]?.prefix ?? ''
    const literalSuffix = literalMarkers?.[0]?.suffix ?? (listToken.markup || '.')
    let listItemIndex = 0
    for (let i = startIndex + 1; i < endIndex; i++) {
      const token = tokens[i]
      
      if (token.type === 'list_item_open' && token.level === (listToken.level || 0) + 1) {
        // Get number from info
        const itemNumber = token.info ? parseInt(token.info, 10) : markers.length + 1
        const markup = token.markup || listToken.markup || '.'
        if (literalMarkers && literalMarkers[listItemIndex]) {
          const marker = { ...literalMarkers[listItemIndex] }
          if (typeof marker.originalNumber !== 'number') {
            marker.originalNumber = itemNumber
          }
          if (typeof marker.number !== 'number') {
            marker.number = itemNumber
          }
          markers.push(marker)
        } else {
          markers.push({
            number: itemNumber,
            originalNumber: itemNumber,
            prefix: literalPrefix,
            suffix: literalSuffix || markup,
            type: literalType
          })
        }
        listItemIndex++
      }
    }
  } else {
    // For bullet_list, detect markers from inline content
    // Target only direct children list_items of this list
    const targetLevel = (listToken.level || 0) + 3  // list_open(0) -> list_item(1) -> paragraph(2) -> inline(3)
    
    // Collect inline tokens and contents once (for detecting iroha sequence etc.)
    const inlineTokens = []
    const allContents = []
    for (let i = startIndex + 1; i < endIndex; i++) {
      const token = tokens[i]
      if (token.type === 'inline' && token.content && token.level === targetLevel) {
        inlineTokens.push(token)
        allContents.push(token.content)
      }
    }
    
    const contextResult = allContents.length > 0 ? detectSequencePattern(allContents) : null

    // Detect markers using full context
    let sequentialNumber = 1  // Sequential number counter
    for (const token of inlineTokens) {
      const markerInfo = detectMarkerTypeWithContext(token.content, contextResult)
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
function shouldConvertToOrdered(originalType, markerInfo) {
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
function findListEnd(tokens, startIndex, closeMap) {
  const mapped = closeMap?.listCloseByOpen?.[startIndex]
  if (typeof mapped === 'number' && mapped !== -1) {
    return mapped
  }
  const startToken = tokens[startIndex]
  const openType = startToken.type
  const closeType = openType.replace('_open', '_close')
  const result = findMatchingClose(tokens, startIndex, openType, closeType)
  return result === -1 ? tokens.length - 1 : result
}

/**
 * Find list item end position
 */
function findListItemEnd(tokens, startIndex, closeMap) {
  const mapped = closeMap?.listItemCloseByOpen?.[startIndex]
  if (typeof mapped === 'number' && mapped !== -1) {
    return mapped
  }
  const result = findMatchingClose(tokens, startIndex, 'list_item_open', 'list_item_close')
  return result === -1 ? tokens.length - 1 : result
}
