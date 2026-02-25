// Phase 5: Span Generation
// Convert markers to span for custom markers and alwaysMarkerSpan mode

import { getTypeAttributes, getSymbolForNumber } from './types-utility.js'
import { buildListCloseIndexMap, findMatchingClose } from './list-helpers.js'

/**
 * Generate marker spans
 * @param {Array} tokens - Token array
 * @param {Object} opt - Options
 */
export function generateSpans(tokens, opt) {
  if (opt.useCounterStyle) {
    return
  }
  const spanClass = opt.markerSpanClass || 'li-num'
  let listCloseByOpen = null
  const getListCloseByOpen = () => {
    if (!listCloseByOpen) {
      listCloseByOpen = buildListCloseIndexMap(tokens).listCloseByOpen
    }
    return listCloseByOpen
  }

  // Traverse token array and add spans to ordered_list_open tokens
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    
    if (token.type === 'ordered_list_open' && token._markerInfo) {
      const markerInfo = token._markerInfo
      if (opt.alwaysMarkerSpan) {
        addMarkerSpans(tokens, token, i, markerInfo, opt, spanClass, getListCloseByOpen())
        continue
      }
      const firstMarker = markerInfo.markers[0]
      const typeAttrs = getTypeAttributes(markerInfo.type, firstMarker, opt)
      
      // Generate span for custom marker lists.
      if (!typeAttrs.type) {
        addMarkerSpans(tokens, token, i, markerInfo, opt, spanClass, getListCloseByOpen())
      }
    }
  }
}

/**
 * Add marker <span> to the first inline token of each list item.
 */
function addMarkerSpans(tokens, listToken, listIndex, markerInfo, opt, spanClass, listCloseByOpen = null) {
  // Find end position of this ordered_list
  let listCloseIndex = listCloseByOpen ? listCloseByOpen[listIndex] : -1
  if (typeof listCloseIndex !== 'number' || listCloseIndex === -1) {
    listCloseIndex = findMatchingClose(tokens, listIndex, 'ordered_list_open', 'ordered_list_close')
  }
  if (listCloseIndex === -1) return
  
  const markerCount = markerInfo.markers.length
  const listItemLevel = (listToken.level || 0) + 1
  let markerIndex = 0
  let inListItem = false
  let listItemInlineFound = false
  
  for (let i = listIndex + 1; i < listCloseIndex && markerIndex < markerCount; i++) {
    const token = tokens[i]
    
    // When list_item_open is found, prepare to add marker to next inline
    if (token.type === 'list_item_open' && token.level === listItemLevel) {
      inListItem = true
      listItemInlineFound = false
    }
    // Add span only to first inline token in list_item
    else if (token.type === 'inline' && inListItem && !listItemInlineFound) {
      const marker = markerInfo.markers[markerIndex]
      if (!marker) {
        listItemInlineFound = true
        continue
      }
      const TokenClass = token.constructor
      // Insert span_open, text, span_close before inline token
      const spanOpen = new TokenClass('span_open', 'span', 1)
      spanOpen.attrSet('class', spanClass)
      spanOpen.attrSet('aria-hidden', 'true')
      
      const text = new TokenClass('text', '', 0)
      
      // Determine marker content
      // If marker.number exists, get correct symbol based on it
      let markerContent = marker.marker || ''
      
      if (marker.number !== undefined && markerInfo.type) {
        // Get correct symbol if number is specified
        const correctSymbol = getSymbolForNumber(markerInfo.type, marker.number)
        if (correctSymbol) {
          // Build in prefix + correctSymbol + suffix format
          markerContent = (marker.prefix || '') + correctSymbol + (marker.suffix || '')
        }
      }

      if (!markerContent) {
        listItemInlineFound = true
        continue
      }
      
      // Include entire marker (prefix+number+suffix) for alwaysMarkerSpan mode
      if (!opt.alwaysMarkerSpan) {
        // Normal mode: remove suffix for custom markers
        if (marker.suffix && markerContent.endsWith(marker.suffix)) {
          markerContent = markerContent.slice(0, -marker.suffix.length)
        }
      }
      // Use markerContent as-is (prefix+symbol+suffix) for alwaysMarkerSpan
      text.content = markerContent
      
      const spanClose = new TokenClass('span_close', 'span', -1)
      
      // Initialize children if not exist
      if (!token.children) {
        token.children = []
      }
      
      // Add span element at beginning of children
      token.children.unshift(spanOpen, text, spanClose)
      
      // Add space before content if exists
      if (token.content) {
        const spaceToken = new TokenClass('text', '', 0)
        spaceToken.content = ' '
        token.children.push(spaceToken)
      }
      listItemInlineFound = true  // First inline of this list_item is processed
    }
    // When list_item_close is found, go to next list_item
    else if (token.type === 'list_item_close' && token.level === listItemLevel) {
      inListItem = false
      markerIndex++  // Move to next marker
    }
  }
}
