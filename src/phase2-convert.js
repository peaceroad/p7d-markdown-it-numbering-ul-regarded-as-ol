// Phase 2: Token Conversion
// Convert bullet_list to ordered_list based on Phase1 analysis, simplify nesting in default mode

import { findMatchingClose } from './list-helpers.js'

/**
 * Convert tokens based on list information
 * @param {Array} tokens - Token array
 * @param {Array} listInfos - List information analyzed in Phase1
 * @param {Object} opt - Options
 */
export function convertLists(tokens, listInfos, opt) {
  const listInfoMap = buildListInfoMap(listInfos)
  // Convert bullet_list to ordered_list
  // listInfos already collected in depth-first order in Phase 1, no sorting needed
  for (const listInfo of listInfos) {
    if (listInfo.shouldConvert) {
      convertBulletToOrdered(tokens, listInfo)
    }
  }
  
  // In default mode (unremoveUlNest=false), simplify ul>li>ol structure
  // Runs after conversion, so already-converted ordered_lists are also processed
  if (!opt.unremoveUlNest) {
    const bulletListInfos = listInfos.filter(info => info.originalType === 'bullet_list_open')
    if (bulletListInfos.length > 0) {
      simplifyNestedBulletLists(tokens, bulletListInfos, opt, listInfoMap)
    }
  }
}

/**
 * Convert bullet_list to ordered_list
 */
function convertBulletToOrdered(tokens, listInfo) {
  const { startIndex, endIndex, markerInfo, items } = listInfo
  
  // Tokens may have been deleted by simplifyNestedBulletLists,
  // check index validity
  if (startIndex >= tokens.length || endIndex >= tokens.length) {
    // This listInfo points to already deleted list
    return
  }
  
  // Convert start token
  if (tokens[startIndex].type === 'bullet_list_open') {
    tokens[startIndex].type = 'ordered_list_open'
    tokens[startIndex].tag = 'ol'
    tokens[startIndex]._convertedFromBullet = true
    // Save marker info (used in Phase3)
    tokens[startIndex]._markerInfo = markerInfo
  }
  
  // Convert end token
  if (tokens[endIndex] && tokens[endIndex].type === 'bullet_list_close') {
    tokens[endIndex].type = 'ordered_list_close'
    tokens[endIndex].tag = 'ol'
  }
  
  // If item's first paragraph is loose, set _parentIsLoose flag to child lists
  // Only when all following conditions are met:
  // 1. Item has only single paragraph (exclude if multiple paragraphs)
  // 2. Parent item's marker type matches child list's marker type
  //    (if different, not propagated as it will be flattened with `-1.` pattern)
  if (items && items.length > 0) {
    for (const item of items) {
      if (item.firstParagraphIsLoose && item.hasNestedList && item.nestedLists && item.markerInfo) {
        // Check paragraph count in item
        // Don't propagate if multiple paragraphs before first nested list
        let paragraphCount = 0
        let reachedNestedList = false
        
        for (let i = item.startIndex + 1; i < item.endIndex && !reachedNestedList; i++) {
          const token = tokens[i]
          if (token.type === 'paragraph_open') {
            paragraphCount++
          } else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
            reachedNestedList = true
          }
        }
        
        // Propagate to child lists only if single paragraph
        if (paragraphCount === 1) {
          for (const nestedList of item.nestedLists) {
            if (nestedList && nestedList.startIndex < tokens.length) {
              // Compare parent item's marker type with child list's marker type
              // Don't propagate if different (will be flattened)
              const childMarkerInfo = nestedList.items && nestedList.items[0] && nestedList.items[0].markerInfo
              if (!childMarkerInfo || item.markerInfo.markerType !== childMarkerInfo.markerType) {
                continue  // Skip if marker types differ
              }
              
              const nestedListToken = tokens[nestedList.startIndex]
              if (nestedListToken && (nestedListToken.type === 'bullet_list_open' || nestedListToken.type === 'ordered_list_open')) {
                // Set flag directly
                nestedListToken._parentIsLoose = true
              }
            }
          }
        }
      }
    }
  }
  
  // Remove marker text from inline tokens
  if (markerInfo && markerInfo.markers) {
    removeMarkersFromContent(tokens, startIndex, endIndex, markerInfo, listInfo)
  }
}

/**
 * Remove markers from inline token content
 */
function removeMarkersFromContent(tokens, startIndex, endIndex, markerInfo, listInfo) {
  const listToken = tokens[startIndex]
  const targetLevel = (listToken.level || 0) + 3  // list_open(0) -> list_item(1) -> paragraph(2) -> inline(3)
  
  // Pre-generate all marker regexes (avoid repeated regex creation in loop)
  const markerPatterns = markerInfo.markers.map(marker => 
    marker && marker.marker ? new RegExp(`^${escapeRegExp(marker.marker)}\\s*`) : null
  )
  
  let markerIndex = 0
  for (let i = startIndex + 1; i < endIndex && markerIndex < markerPatterns.length; i++) {
    const token = tokens[i]
    
    if (token.type === 'inline' && token.content && token.level === targetLevel) {
      const markerPattern = markerPatterns[markerIndex]
      if (markerPattern) {
        // Remove marker and trailing spaces
        const newContent = token.content.replace(markerPattern, '')
        
        // Only advance to next marker if actually removed
        if (newContent !== token.content) {
          token.content = newContent
          markerIndex++
        }
      }
    }
  }
}

/**
 * 正規表現の特殊文字をエスケープ
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Simplify nested ul>li>ul and ul>li>ol structures.
 *
 * Pattern 1: bullet_list_open → list_item_open → bullet_list_open → ...
 * Pattern 2: bullet_list_open → list_item_open → ordered_list_open → ... (repeated)
 *
 * When the middle list_item is empty (contains only the inner list),
 * remove the outer ul and the intermediate li.
 * @param {Array} tokens - Token array
 * @param {Array} listInfos - List information analyzed in Phase 1
 * @param {Object} opt - Options
 * @param {Map} listInfoMap - Map of listInfo keyed by startIndex
 */
function simplifyNestedBulletLists(tokens, listInfos, opt, listInfoMap = null) {
  let modified = true
  
  // ===== Phase 1: Simplify ul>li>ol structure (multiple passes needed) =====
  while (modified) {
    modified = false
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      
      // Only detect bullet_list_open (ordered_list processing will be done later)
      if (token.type !== 'bullet_list_open') {
        continue
      }
          
      // Check if this bullet_list is all ul>li>ol/ul pattern
      const listCloseIdx = findMatchingClose(tokens, i, 'bullet_list_open', 'bullet_list_close')
      if (listCloseIdx === -1) continue
      
      // Check all list_items in bullet_list
      const itemIndices = []
      let totalItems = 0
      let idx = i + 1
      
      while (idx < listCloseIdx) {
        if (tokens[idx].type === 'list_item_open') {
          totalItems++
          const itemCloseIdx = findMatchingClose(tokens, idx, 'list_item_open', 'list_item_close')
          
                  
          // Find inner list within list_item
          let innerListOpen = -1
          let innerListType = null
          for (let j = idx + 1; j < itemCloseIdx; j++) {
                      if (tokens[j].type === 'bullet_list_open' || tokens[j].type === 'ordered_list_open') {
              innerListOpen = j
              innerListType = tokens[j].type
                          break
            }
          }
          
          if (innerListOpen !== -1) {
            const innerListCloseType = innerListType === 'bullet_list_open' ? 'bullet_list_close' : 'ordered_list_close'
            const innerListCloseIdx = findMatchingClose(tokens, innerListOpen, innerListType, innerListCloseType)
            
            // Check if there's extra content before/after ol (whether it's only ol)
            const beforeContent = innerListOpen - (idx + 1)  // Token count from after list_item_open to ol
            const afterContent = itemCloseIdx - (innerListCloseIdx + 1)  // Token count from after ol to list_item_close
            const hasExtraContent = beforeContent > 0 || afterContent > 0
            
            const innerListInfo = listInfoMap?.get(innerListOpen)
            itemIndices.push({
              outerItemOpen: idx,
              outerItemClose: itemCloseIdx,
              innerListOpen: innerListOpen,
              innerListClose: innerListCloseIdx,
              innerListType: innerListType,
              hasExtraContent: hasExtraContent,
              extraContentStart: innerListCloseIdx + 1,
              extraContentEnd: itemCloseIdx,
              innerListInfo
            })
          }
          
          idx = itemCloseIdx + 1
        } else {
          idx++
        }
      }
      
      // Check if outer ul is convertible (has markers)
      const outerListInfo = listInfos?.find(info => info.startIndex === i && info.shouldConvert)
      const outerListHasMarkers = outerListInfo?.shouldConvert && outerListInfo.markerInfo
      
      // Simplification conditions:
      // 1. All list_items have inner lists of the same type (traditional logic)
      // 2. Outer list has markers and at least one item has inner list (new logic)
      const allItemsHaveInnerList = itemIndices.length > 0 && itemIndices.length === totalItems
      const shouldSimplify = allItemsHaveInnerList || outerListHasMarkers
      
      if (shouldSimplify && itemIndices.length > 0) {
        const allSameType = itemIndices.every(item => item.innerListType === itemIndices[0].innerListType)
        const firstInnerType = itemIndices[0].innerListType
        const hasExtraContent = itemIndices.some(item => item.hasExtraContent)
        
        // Don't simplify if inner lists are mixed types
        if (!allSameType) {
          continue
        }
        
        // Merge marker info from each inner list
        const allMarkers = []
        
        // Use outer listInfo marker info if available
        if (outerListInfo && outerListInfo.markerInfo && outerListInfo.markerInfo.markers) {
          allMarkers.push(...outerListInfo.markerInfo.markers)
        }
        
        for (const item of itemIndices) {
          const innerListToken = tokens[item.innerListOpen]
          
          // If went through Phase2 convertBulletToOrdered
          if (innerListToken._markerInfo && innerListToken._markerInfo.markers) {
            allMarkers.push(...innerListToken._markerInfo.markers)
          } 
          // If originally ordered_list, get marker info from start attribute and markup
          else if (!outerListInfo || !outerListInfo.markerInfo) {
            // Only get from inner if outer has no marker info
            // Get start attribute and markup
            const startAttr = innerListToken.attrs?.find(attr => attr[0] === 'start')
            let startNumber = startAttr ? parseInt(startAttr[1], 10) : 1
            const suffix = innerListToken.markup || '.'  // markup is suffix
            let itemCount = 0
            
            // Get info from list_item_open (number set by markdown-it)
            for (let j = item.innerListOpen + 1; j < item.innerListClose; j++) {
              if (tokens[j].type === 'list_item_open' && tokens[j].level === innerListToken.level + 1) {
                // Get number from info
                const number = tokens[j].info ? parseInt(tokens[j].info, 10) : startNumber + itemCount
                allMarkers.push({
                  type: 'decimal',
                  marker: number + suffix,
                  number: number,
                  originalNumber: number,
                  prefix: '',
                  suffix: suffix
                })
                itemCount++
              }
            }
          }
        }
        
        // Build new token array
        const newTokens = []
        
        // Tokens before bullet_list_open
        for (let j = 0; j < i; j++) {
          newTokens.push(tokens[j])
        }
        
        // Add first inner list open token and save merged marker info
        const firstListToken = tokens[itemIndices[0].innerListOpen]
        if (firstListToken.attrs) {
          const startAttr = firstListToken.attrs.find(attr => attr[0] === 'start')
          if (startAttr) {
            firstListToken._startOverride = startAttr[1]
          }
        }
        
        // If outer ul is convertible, convert inner list to ordered_list
        // (Don't limit to bullet_list as inner list might already be ordered_list)
        if (outerListInfo && outerListInfo.shouldConvert) {
          if (firstListToken.type === 'bullet_list_open') {
            firstListToken.type = 'ordered_list_open'
            firstListToken.tag = 'ol'
            firstListToken._convertedFromBullet = true
          }
          // If already ordered_list, use as is (already converted)
        }
        
        newTokens.push(firstListToken)
        
        // Merge and save marker info
        if (allMarkers.length > 0) {
          const firstMarkerType = allMarkers[0]?.type
          const literalNumbers = allMarkers.map(m => (typeof m.originalNumber === 'number' ? m.originalNumber : undefined))
          const hasLiteralNumbers = literalNumbers.length === allMarkers.length &&
            literalNumbers.every(n => typeof n === 'number')
          let allNumbersIdentical = false
          if (hasLiteralNumbers) {
            const firstLiteral = literalNumbers[0]
            if (literalNumbers.every(n => n === firstLiteral) && firstLiteral === 1) {
              allNumbersIdentical = true
            }
          }
          firstListToken._markerInfo = {
            markers: allMarkers,
            type: firstMarkerType,
            isConsistent: allMarkers.every(m => m.type === firstMarkerType),
            count: allMarkers.length,
            allNumbersIdentical
          }
          const firstNumber = allMarkers[0]?.originalNumber ?? allMarkers[0]?.number
          if (typeof firstNumber === 'number' && firstNumber !== 1) {
            if (!firstListToken.attrs) firstListToken.attrs = []
            const startIndex = firstListToken.attrs.findIndex(attr => attr[0] === 'start')
            if (startIndex >= 0) {
              firstListToken.attrs[startIndex][1] = String(firstNumber)
            } else {
              firstListToken.attrs.push(['start', String(firstNumber)])
            }
          } else if (firstListToken.attrs) {
            const idx = firstListToken.attrs.findIndex(attr => attr[0] === 'start')
            if (idx >= 0) {
              firstListToken.attrs.splice(idx, 1)
              if (firstListToken.attrs.length === 0) firstListToken.attrs = null
            }
          }
        }
        
        // ===== Outer UL (Level 0 after conversion) loose/tight determination =====
        // In flattened pattern (`- 1.` etc), no direct paragraph in outer list_item,
        // so cannot detect with markdown-it's paragraph.hidden
        // Instead, use map info of outer list_item to detect blank lines between items
        let outerUlIsLoose = false
        
        // Single item is always tight
        if (itemIndices.length === 1) {
          outerUlIsLoose = false
        } else {
          // For multiple items, check blank lines with map info
          for (let itemIdx = 0; itemIdx < itemIndices.length - 1; itemIdx++) {
            const currentItem = itemIndices[itemIdx]
            const nextItem = itemIndices[itemIdx + 1]
            
            // Get currentItem end line: list_item_close map or last token map
            let currentEndLine = null
            // Find list_item_close map (usually null, so use last token instead)
            for (let k = currentItem.outerItemClose - 1; k > currentItem.outerItemOpen; k--) {
              if (tokens[k].map && tokens[k].map[1]) {
                currentEndLine = tokens[k].map[1]
                break
              }
            }
            
            const nextMap = tokens[nextItem.outerItemOpen].map
            
            if (currentEndLine !== null && nextMap) {
              // Compare currentItem end line and nextItem start line
              // If line numbers differ, there's blank line
              const lineGap = nextMap[0] - currentEndLine
              if (lineGap > 0) {
                outerUlIsLoose = true
                break
              }
            }
          }
        }
        
        // ===== Nested list overall loose/tight determination =====
        // Inner list (converted ol) loose/tight determination
        // If parent item is loose (_parentIsLoose flag), or
        // if outer ul is loose, this inner list is also loose
        
        // First, check if there are blank lines between converted ol list_items (independent of outerUlIsLoose)
        // This is used for propagation to child lists
        let innerListIsLooseDueToBlankLines = false
        
        // In flattened pattern (`- 1.` etc), each outer list_item has one inner ol
        // Check if there are blank lines between list_items in inner ol
        // (Blank lines between outer list_items already checked by outerUlIsLoose)
        for (let itemIdx = 0; itemIdx < itemIndices.length; itemIdx++) {
          const item = itemIndices[itemIdx]
          
          // Collect list_items in inner list
          const innerListItems = []
          for (let j = item.innerListOpen + 1; j < item.innerListClose; j++) {
            if (tokens[j].type === 'list_item_open' && 
                tokens[j].level === tokens[item.innerListOpen].level + 1) {
              const itemOpen = j
              const itemClose = findMatchingClose(tokens, j, 'list_item_open', 'list_item_close')
              innerListItems.push({ open: itemOpen, close: itemClose })
            }
          }
          
          // Check blank lines between list_items in inner list
          if (innerListItems.length > 1) {
            for (let k = 0; k < innerListItems.length - 1; k++) {
              const currentItem = innerListItems[k]
              const nextItem = innerListItems[k + 1]
              
              // Get currentItem end line
              let currentEndLine = null
              for (let m = currentItem.close - 1; m > currentItem.open; m--) {
                if (tokens[m].map && tokens[m].map[1]) {
                  currentEndLine = tokens[m].map[1]
                  break
                }
              }
              
              const nextMap = tokens[nextItem.open].map
              
              if (currentEndLine !== null && nextMap) {
                const lineGap = nextMap[0] - currentEndLine
                if (lineGap > 0) {
                  innerListIsLooseDueToBlankLines = true
                  break
                }
              }
            }
            if (innerListIsLooseDueToBlankLines) break
          }
        }
        
        // Check markdown-it's paragraph.hidden
        // If inner list has paragraph with hidden=false, it's loose
        if (!innerListIsLooseDueToBlankLines) {
          for (let itemIdx = 0; itemIdx < itemIndices.length; itemIdx++) {
            const item = itemIndices[itemIdx]
            
            let innerListItemOpen = -1
            let innerListItemClose = -1
            
            for (let j = item.innerListOpen + 1; j < item.innerListClose; j++) {
              if (tokens[j].type === 'list_item_open' && 
                  tokens[j].level === tokens[item.innerListOpen].level + 1) {
                innerListItemOpen = j
                innerListItemClose = findMatchingClose(tokens, j, 'list_item_open', 'list_item_close')
                break
              }
            }
            
            if (innerListItemOpen !== -1 && innerListItemClose !== -1) {
              // Check hidden of first paragraph in inner list item
              let nestedListDepth = 0
              for (let j = innerListItemOpen + 1; j < innerListItemClose; j++) {
                const t = tokens[j]
                if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
                  nestedListDepth++
                } else if (t.type === 'bullet_list_close' || t.type === 'ordered_list_close') {
                  nestedListDepth--
                } else if (nestedListDepth === 0 && t.type === 'paragraph_open') {
                  if (t.hidden === false) {
                    innerListIsLooseDueToBlankLines = true
                  }
                  break
                }
              }
              if (innerListIsLooseDueToBlankLines) break
            }
          }
        }
        
        // If outerUlIsLoose, force first paragraph of each inner list item to loose (hidden=false)
        // markdown-it judges tight/loose by original ul structure, but after flattening to ol structure
        // should reflect parent ul's loose state
        // However, exclude case where both parent ul and each inner ol have single item
        // This must be executed AFTER innerListIsLooseDueToBlankLines determination
        if (outerUlIsLoose && !(itemIndices.length === 1)) {
          for (let itemIdx = 0; itemIdx < itemIndices.length; itemIdx++) {
            const item = itemIndices[itemIdx]
            // Find list_items in inner list
            for (let j = item.innerListOpen + 1; j < item.innerListClose; j++) {
              if (tokens[j].type === 'list_item_open' && 
                  tokens[j].level === tokens[item.innerListOpen].level + 1) {
                // Find first paragraph in list_item
                const listItemOpen = j
                const listItemClose = findMatchingClose(tokens, j, 'list_item_open', 'list_item_close')
                for (let k = listItemOpen + 1; k < listItemClose; k++) {
                  if (tokens[k].type === 'paragraph_open' && 
                      tokens[k].level === tokens[listItemOpen].level + 1) {
                    tokens[k].hidden = false
                    break // Only first paragraph
                  }
                }
                break // Only first list_item of inner list
              }
            }
          }
        }
        
        // Final innerListIsLoose: _parentIsLoose, outerUlIsLoose, or blank line determination
        let innerListIsLoose = token._parentIsLoose || outerUlIsLoose || innerListIsLooseDueToBlankLines
        
        // ===== Merge each inner list's contents and place extra content appropriately =====
        for (let itemIdx = 0; itemIdx < itemIndices.length; itemIdx++) {
          const item = itemIndices[itemIdx]
          
          // Count list_items in this inner list (ordered_list)
          let innerListItemCount = 0
          for (let j = item.innerListOpen + 1; j < item.innerListClose; j++) {
            if (tokens[j].type === 'list_item_open' && 
                tokens[j].level === tokens[item.innerListOpen].level + 1) {
              innerListItemCount++
            }
          }
          
          const listItemRanges = collectListItemRanges(tokens, item.innerListOpen, item.innerListClose)
          if (listItemRanges.length === 0) {
            continue
          }
          const parentRange = listItemRanges[0]
          const childRanges = listItemRanges.slice(1)
          const innerListItemOpen = parentRange.open
          const innerListItemClose = parentRange.close
          
          if (innerListItemOpen !== -1 && innerListItemClose !== -1) {
            // Add list_item_open (use original token to preserve info)
            // Note: value attribute is added in Phase3 (not during simplification)
            newTokens.push(tokens[innerListItemOpen])
            
            // This item's loose/tight determination
            // If entire list is loose, this item is also loose
            // Determination when extraContent has block elements:
            // - extraContent has paragraph(hidden=false) → loose
            // - Has heading(heading_open) or HTML block(html_block) → loose
            // - markdown-it sets paragraph.hidden=true → maintain tight
            let hasBlockElement = false
            if (item.hasExtraContent) {
              for (let k = item.extraContentStart; k < item.extraContentEnd; k++) {
                const tokenType = tokens[k].type
                // Detect block elements:
                // - paragraph(hidden=false): multiple paragraphs
                // - heading_open: heading
                // - html_block: HTML block
                if ((tokenType === 'paragraph_open' && !tokens[k].hidden) ||
                    tokenType === 'heading_open' ||
                    tokenType === 'html_block') {
                  hasBlockElement = true
                  break
                }
              }
            }
            
            // Whether this item's first paragraph is loose
            // is obtained from Phase1-analyzed listInfo.items[itemIdx]
            const listItem = outerListInfo?.items?.[itemIdx]
            const firstParagraphIsLoose = listItem?.firstParagraphIsLoose || false
            
            // Make loose if outer ul, entire inner list, or this item has extraContent
            // - However, consider cases with multiple paragraphs in item (innerListIsLoose) or
            //   block elements (hasBlockElement)
            // 
            // Single item determination in flattened pattern (`- 1.` etc):
            // - Parent ul single item AND each inner ol single item → exclude outerUlIsLoose
            // - If parent ul has multiple items, consider outerUlIsLoose (reflect parent's blank lines)
            let shouldBeLoose
            if (itemIndices.length === 1 && innerListItemCount === 1) {
              // Exclude outerUlIsLoose if both parent ul and each inner ol are single item
              // Consider innerListIsLoose and hasBlockElement (block elements)
              shouldBeLoose = innerListIsLoose || hasBlockElement
            } else {
              // Normal determination if multiple items or parent ul has multiple items
              // Consider outerUlIsLoose (reflect parent list's blank lines)
              shouldBeLoose = outerUlIsLoose || innerListIsLoose || hasBlockElement
            }
            
            // Determine whether to propagate _parentIsLoose flag to child lists
            // - innerListIsLooseDueToBlankLines: blank lines between converted ol list_items
            // - token._parentIsLoose: already propagated from parent
            // - firstParagraphIsLoose: blank line after parent item's first paragraph (same marker type only)
            // Note: hasExtraContent makes parent item loose but doesn't affect child lists
            // Note: outerUlIsLoose excluded (Test 25: handle case where parent is loose but child is tight)
            const shouldPropagateLooseToChildren = innerListIsLooseDueToBlankLines || token._parentIsLoose || firstParagraphIsLoose || false
            
            // Copy tokens in inner list item (exclude nested list paragraphs)
            let nestedListDepth = 0
            let firstParagraphInItem = true // Track first paragraph in each list_item
            for (let j = innerListItemOpen + 1; j < innerListItemClose; j++) {
              const tokenToPush = tokens[j]
              
              // Track nested list depth
              if (tokenToPush.type === 'bullet_list_open' || tokenToPush.type === 'ordered_list_open') {
                nestedListDepth++
                  // If parent list is loose (due to blank lines), set _parentIsLoose flag to child lists
                  // Don't set if only outerUlIsLoose
                  // Propagate to all nest levels (support level >= 2)
                  if (shouldPropagateLooseToChildren) {
                    // Set _parentIsLoose flag (optimize with direct property assignment)
                    tokenToPush._parentIsLoose = true
                    newTokens.push(tokenToPush)
                  } else {
                    newTokens.push(tokenToPush)
                  }
              } else if (tokenToPush.type === 'bullet_list_close' || tokenToPush.type === 'ordered_list_close') {
                nestedListDepth--
                newTokens.push(tokenToPush)
              } else if (nestedListDepth === 0 && (tokenToPush.type === 'paragraph_open' || tokenToPush.type === 'paragraph_close')) {
                // Update paragraph_open/close hidden state (only outside nested lists)
                
                if (tokenToPush.type === 'paragraph_open') {
                  // Process first paragraph
                  if (firstParagraphInItem) {
                    // If tight list (shouldBeLoose = false), hide first paragraph
                    tokenToPush.hidden = !shouldBeLoose
                    firstParagraphInItem = false
                  } else {
                    // Always show second and subsequent paragraphs
                    tokenToPush.hidden = false
                  }
                } else {
                  // Match paragraph_close hidden state to corresponding paragraph_open
                  // Reference preceding paragraph_open's hidden state
                  const prevToken = newTokens[newTokens.length - 2] // Skip preceding inline, get paragraph_open before it
                  if (prevToken && prevToken.type === 'paragraph_open') {
                    tokenToPush.hidden = prevToken.hidden
                  } else {
                    // Fallback: judge based on shouldBeLoose
                    tokenToPush.hidden = !shouldBeLoose && firstParagraphInItem
                  }
                }
                
                newTokens.push(tokenToPush)
              } else {
                newTokens.push(tokenToPush)
              }
            }
            
            // Add extra content (content in ul>li, outside ol) to this list_item
            if (item.hasExtraContent) {
              // Adjust level: ul list_item's level → ol list_item's level
              const levelDiff = tokens[innerListItemOpen].level - tokens[item.outerItemOpen].level
              
              // Track nested lists in extraContent
              let extraNestedListDepth = 0
              for (let k = item.extraContentStart; k < item.extraContentEnd; k++) {
                const tokenToPush = tokens[k]
                const originalLevel = tokenToPush.level
                tokenToPush.level = originalLevel + levelDiff
                
                // Track nested list depth
                if (tokenToPush.type === 'bullet_list_open' || tokenToPush.type === 'ordered_list_open') {
                  extraNestedListDepth++
                  // If parent item is loose, set _parentIsLoose flag to child lists
                  // Don't set if only outerUlIsLoose
                  if (shouldPropagateLooseToChildren && extraNestedListDepth === 1) {
                    tokenToPush._parentIsLoose = true
                  }
                } else if (tokenToPush.type === 'bullet_list_close' || tokenToPush.type === 'ordered_list_close') {
                  extraNestedListDepth--
                }
                
                // If shouldBeLoose, set paragraph hidden to false (only outside nested lists)
                if (shouldBeLoose && extraNestedListDepth === 0 && (tokenToPush.type === 'paragraph_open' || tokenToPush.type === 'paragraph_close')) {
                  tokenToPush.hidden = false
                }
                
                newTokens.push(tokenToPush)
              }
            }
            
            if (childRanges.length > 0) {
              const parentLevel = tokens[innerListItemOpen].level || 0
              const targetNestedLevel = parentLevel + 1
              const originalListLevel = tokens[item.innerListOpen].level || 0
              const levelShift = targetNestedLevel - originalListLevel
              const markerStartIndex = childRanges[0].markerIndex
              const nestedTokens = buildNestedListTokens(
                tokens,
                childRanges,
                item.innerListOpen,
                item.innerListClose,
                levelShift,
                markerStartIndex,
                item.innerListInfo
              )
              for (const nestedToken of nestedTokens) {
                newTokens.push(nestedToken)
              }
            }
            
            // Add list_item_close
            newTokens.push(tokens[innerListItemClose])
          }
        }
        
        // Add last inner list's close token
        const lastItem = itemIndices[itemIndices.length - 1]
        const lastListCloseToken = tokens[lastItem.innerListClose]
        
        // If outer ul is convertible, also convert close token
        if (outerListInfo && outerListInfo.shouldConvert) {
          if (lastListCloseToken.type === 'bullet_list_close') {
            lastListCloseToken.type = 'ordered_list_close'
            lastListCloseToken.tag = 'ol'
          }
          // If already ordered_list_close, use as is
        }
        
        newTokens.push(lastListCloseToken)
        
        // Tokens after bullet_list_close
        for (let j = listCloseIdx + 1; j < tokens.length; j++) {
          newTokens.push(tokens[j])
        }
        
        // Replace token array
        tokens.length = 0
        tokens.push(...newTokens)
        
        // Remove markers from merged list
        if (firstListToken._markerInfo && firstListToken._markerInfo.markers) {
          let listStartIdx = 0
          while (listStartIdx < tokens.length && tokens[listStartIdx] !== firstListToken) {
            listStartIdx++
          }
          if (listStartIdx < tokens.length) {
            const listEndIdx = findMatchingClose(tokens, listStartIdx, 
              firstListToken.type, 
              firstListToken.type.replace('_open', '_close'), false)
            if (listEndIdx !== -1) {
              removeMarkersFromContent(tokens, listStartIdx, listEndIdx, firstListToken._markerInfo, null)
            }
          }
        }
        
        modified = true
        break
      }
    }
  }
  
  // ===== Propagate ordered_list's _parentIsLoose flag to child lists =====
  // Check all ordered_list_open, and if _parentIsLoose flag exists,
  // propagate to child lists
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    
    if ((token.type === 'ordered_list_open' || token.type === 'bullet_list_open') && token._parentIsLoose) {
      // Find this list's close token
      const listCloseIdx = findMatchingClose(tokens, i, token.type, token.type.replace('_open', '_close'))
      if (listCloseIdx === -1) continue
      
      // Search list_items in this list and set _parentIsLoose flag to child lists in those list_items
      for (let j = i + 1; j < listCloseIdx; j++) {
        if (tokens[j].type === 'list_item_open' && tokens[j].level === token.level + 1) {
          const itemCloseIdx = findMatchingClose(tokens, j, 'list_item_open', 'list_item_close')
          
          // Search child lists in this list_item
          for (let k = j + 1; k < itemCloseIdx; k++) {
            if ((tokens[k].type === 'bullet_list_open' || tokens[k].type === 'ordered_list_open') && 
                tokens[k].level === token.level + 2) {
              // Set _parentIsLoose flag to child list
              tokens[k]._parentIsLoose = true
            }
          }
          
          j = itemCloseIdx // Jump to next list_item
        }
      }
    }
  }
}

function buildListInfoMap(listInfos) {
  const map = new Map()
  if (!Array.isArray(listInfos)) {
    return map
  }
  for (const info of listInfos) {
    if (info && typeof info.startIndex === 'number') {
      map.set(info.startIndex, info)
    }
  }
  return map
}

function collectListItemRanges(tokens, listOpenIdx, listCloseIdx) {
  const ranges = []
  if (listOpenIdx === -1 || listCloseIdx === -1 || listCloseIdx <= listOpenIdx) {
    return ranges
  }
  const baseLevel = tokens[listOpenIdx]?.level ?? 0
  let markerIndex = 0
  for (let i = listOpenIdx + 1; i < listCloseIdx; i++) {
    const token = tokens[i]
    if (token.type === 'list_item_open' && token.level === baseLevel + 1) {
      const closeIdx = findMatchingClose(tokens, i, 'list_item_open', 'list_item_close')
      if (closeIdx === -1) {
        break
      }
      ranges.push({ open: i, close: closeIdx, markerIndex })
      markerIndex++
      i = closeIdx
    }
  }
  return ranges
}

function buildNestedListTokens(tokens, childRanges, innerListOpenIdx, innerListCloseIdx, levelShift, markerStartIndex, innerListInfo) {
  if (!Array.isArray(childRanges) || childRanges.length === 0) {
    return []
  }
  const nestedTokens = []
  const nestedOpen = cloneToken(tokens[innerListOpenIdx], { levelShift })
  const markerInfoSlice = createMarkerInfoSlice(innerListInfo?.markerInfo, markerStartIndex)
  if (markerInfoSlice) {
    nestedOpen._markerInfo = markerInfoSlice
    const firstMarker = markerInfoSlice.markers?.[0]
    const firstNumber = firstMarker ? (firstMarker.originalNumber ?? firstMarker.number) : undefined
    if (typeof firstNumber === 'number') {
      nestedOpen._startOverride = firstNumber
    }
  }
  nestedTokens.push(nestedOpen)
  for (const range of childRanges) {
    for (let i = range.open; i <= range.close; i++) {
      nestedTokens.push(cloneToken(tokens[i], { levelShift, deep: true }))
    }
  }
  const nestedClose = cloneToken(tokens[innerListCloseIdx], { levelShift })
  nestedTokens.push(nestedClose)
  return nestedTokens
}

function cloneToken(token, options = {}) {
  const { levelShift = 0, deep = false } = options
  const TokenClass = token.constructor
  const cloned = new TokenClass(token.type, token.tag, token.nesting)
  cloned.attrs = token.attrs ? token.attrs.map(([name, value]) => [name, value]) : null
  cloned.map = token.map ? [...token.map] : null
  cloned.level = (token.level || 0) + levelShift
  cloned.content = token.content
  cloned.markup = token.markup
  cloned.info = token.info
  cloned.meta = token.meta ? { ...token.meta } : null
  cloned.block = token.block
  cloned.hidden = token.hidden
  if (Array.isArray(token.children)) {
    cloned.children = token.children.length > 0
      ? token.children.map(child => cloneToken(child, { levelShift, deep: true }))
      : []
  } else {
    cloned.children = token.children ?? null
  }
  if (token._markerInfo) {
    cloned._markerInfo = cloneMarkerInfo(token._markerInfo)
  }
  if (token._convertedFromBullet) {
    cloned._convertedFromBullet = token._convertedFromBullet
  }
  if (token._parentIsLoose) {
    cloned._parentIsLoose = token._parentIsLoose
  }
  if (token._startOverride !== undefined) {
    cloned._startOverride = token._startOverride
  }
  return cloned
}

function cloneMarkerInfo(markerInfo) {
  if (!markerInfo) {
    return null
  }
  const cloned = { ...markerInfo }
  cloned.markers = Array.isArray(markerInfo.markers)
    ? markerInfo.markers.map(marker => ({ ...marker }))
    : null
  return cloned
}

function createMarkerInfoSlice(markerInfo, startIndex) {
  if (!markerInfo || !Array.isArray(markerInfo.markers)) {
    return null
  }
  const markers = markerInfo.markers.slice(startIndex)
  if (markers.length === 0) {
    return null
  }
  const clonedMarkers = markers.map(marker => ({ ...marker }))
  const literalNumbers = clonedMarkers.map(m => (typeof m.originalNumber === 'number' ? m.originalNumber : m.number))
  let allNumbersIdentical = false
  if (literalNumbers.length === clonedMarkers.length && literalNumbers.every(n => typeof n === 'number')) {
    const firstNumber = literalNumbers[0]
    if (literalNumbers.every(n => n === firstNumber) && firstNumber === 1) {
      allNumbersIdentical = true
    }
  }
  const slicedInfo = { ...markerInfo }
  slicedInfo.markers = clonedMarkers
  slicedInfo.count = clonedMarkers.length
  slicedInfo.allNumbersIdentical = allNumbersIdentical
  return slicedInfo
}
