// Phase 5: Span Generation
// Convert markers to span for custom markers and alwaysMarkerSpan mode

import { getTypeAttributes, getSymbolForNumber } from './types-utility.js'
import { findMatchingClose } from './list-helpers.js'

/**
 * Generate marker spans
 * @param {Array} tokens - Token array
 * @param {Array} listInfos - List information
 * @param {Object} opt - Options
 */
export function generateSpans(tokens, listInfos, opt) {
  // Traverse token array and add spans to ordered_list_open tokens
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    
    if (token.type === 'ordered_list_open' && token._markerInfo) {
      const markerInfo = token._markerInfo
      const firstMarker = markerInfo.markers[0]
      const typeAttrs = getTypeAttributes(markerInfo.type, firstMarker)
      
      // Generate span if no type attribute (custom marker) or alwaysMarkerSpan mode
      // If user opts to use @counter-style, do not generate inline marker spans
      if (opt.useCounterStyle) continue

      if (!typeAttrs.type || opt.alwaysMarkerSpan) {
        addMarkerSpans(tokens, token, i, markerInfo, opt)
      }
    }
  }
}

/**
 * Add marker <span> to the first inline token of each list item.
 */
function addMarkerSpans(tokens, listToken, listIndex, markerInfo, opt) {
  // Find end position of this ordered_list
  const listCloseIndex = findMatchingClose(tokens, listIndex, 'ordered_list_open', 'ordered_list_close')
  if (listCloseIndex === -1) return
  
  let markerIndex = 0
  let inListItem = false
  let listItemInlineFound = false
  
  for (let i = listIndex + 1; i < listCloseIndex && markerIndex < markerInfo.markers.length; i++) {
    const token = tokens[i]
    
    // When list_item_open is found, prepare to add marker to next inline
    if (token.type === 'list_item_open' && token.level === (listToken.level || 0) + 1) {
      inListItem = true
      listItemInlineFound = false
    }
    // Add span only to first inline token in list_item
    else if (token.type === 'inline' && inListItem && !listItemInlineFound) {
      const marker = markerInfo.markers[markerIndex]
      if (marker && marker.marker) {
        // Insert span_open, text, span_close before inline token
        const spanOpen = new tokens[i].constructor('span_open', 'span', 1)
        const spanClass = (opt && opt.markerSpanClass) ? String(opt.markerSpanClass) : 'li-num'
        spanOpen.attrSet('class', spanClass)
        
        const text = new tokens[i].constructor('text', '', 0)
        
        // Determine marker content
        // If marker.number exists, get correct symbol based on it
        let markerContent = marker.marker
        
        if (marker.number !== undefined && markerInfo.type) {
          // Get correct symbol if number is specified
          const correctSymbol = getSymbolForNumber(markerInfo.type, marker.number)
          if (correctSymbol) {
            // Build in prefix + correctSymbol + suffix format
            markerContent = (marker.prefix || '') + correctSymbol + (marker.suffix || '')
          }
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
        
        const spanClose = new tokens[i].constructor('span_close', 'span', -1)
        
        // Initialize children if not exist
        if (!token.children) {
          token.children = []
        }
        
        // Add span element at beginning of children
        token.children.unshift(spanOpen, text, spanClose)
        
        // Add space before content if exists
        if (token.content) {
          const spaceToken = new tokens[i].constructor('text', '', 0)
          spaceToken.content = ' '
          token.children.push(spaceToken)
        }
      }
      listItemInlineFound = true  // First inline of this list_item is processed
    }
    // When list_item_close is found, go to next list_item
    else if (token.type === 'list_item_close' && token.level === (listToken.level || 0) + 1) {
      inListItem = false
      markerIndex++  // Move to next marker
    }
  }
}
