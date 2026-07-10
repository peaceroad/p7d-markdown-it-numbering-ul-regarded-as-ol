// Phase 5: Span Generation
// Convert markers to span for custom markers and alwaysMarkerSpan mode

import { getTypeAttributes, getSymbolForNumber } from './types-utility.js'

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
  const contexts = []

  // Track only lists that actually need marker spans. This replaces one full
  // subtree scan per ordered list with a single token-stream traversal.
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (token.type === 'ordered_list_open' && token._markerInfo) {
      const markerInfo = token._markerInfo
      const firstMarker = markerInfo.markers[0]
      if (opt.alwaysMarkerSpan || !getTypeAttributes(markerInfo.type, firstMarker, opt).type) {
        contexts.push({
          level: token.level || 0,
          markers: markerInfo.markers,
          markerInfo,
          markerIndex: 0,
          inListItem: false,
          inlineFound: false
        })
      }
      continue
    }

    if (token.type === 'ordered_list_close') {
      const context = contexts[contexts.length - 1]
      if (context && context.level === (token.level || 0)) {
        contexts.pop()
      }
      continue
    }

    if (contexts.length === 0) {
      continue
    }

    if (token.type === 'list_item_open') {
      const context = findContextForListItem(contexts, token.level)
      if (context && context.markerIndex < context.markers.length) {
        context.inListItem = true
        context.inlineFound = false
      }
      continue
    }

    if (token.type === 'inline') {
      // Process outer contexts first. If an outer item has no own inline token,
      // the legacy traversal attaches its marker to the same nested inline; a
      // later inner insertion then appears before it because both use unshift.
      for (const context of contexts) {
        if (!context.inListItem || context.inlineFound || context.markerIndex >= context.markers.length) {
          continue
        }
        addMarkerSpanToInline(
          token,
          context.markers[context.markerIndex],
          context.markerInfo,
          opt,
          spanClass
        )
        context.inlineFound = true
      }
      continue
    }

    if (token.type === 'list_item_close') {
      const context = findContextForListItem(contexts, token.level)
      if (context && context.inListItem) {
        context.inListItem = false
        context.markerIndex++
      }
    }
  }
}

function findContextForListItem(contexts, itemLevel) {
  for (let i = contexts.length - 1; i >= 0; i--) {
    if (contexts[i].level + 1 === itemLevel) {
      return contexts[i]
    }
  }
  return null
}

function addMarkerSpanToInline(token, marker, markerInfo, opt, spanClass) {
  if (!marker) {
    return
  }
  const TokenClass = token.constructor
  const spanOpen = new TokenClass('span_open', 'span', 1)
  spanOpen.attrSet('class', spanClass)
  spanOpen.attrSet('aria-hidden', 'true')

  const text = new TokenClass('text', '', 0)
  let markerContent = marker.marker || ''

  if (marker.number !== undefined && markerInfo.type) {
    const correctSymbol = getSymbolForNumber(markerInfo.type, marker.number)
    if (correctSymbol) {
      markerContent = (marker.prefix || '') + correctSymbol + (marker.suffix || '')
    }
  }

  if (!markerContent) {
    return
  }

  if (!opt.alwaysMarkerSpan && marker.suffix && markerContent.endsWith(marker.suffix)) {
    markerContent = markerContent.slice(0, -marker.suffix.length)
  }
  text.content = markerContent

  const spanClose = new TokenClass('span_close', 'span', -1)
  if (!token.children) {
    token.children = []
  }
  token.children.unshift(spanOpen, text, spanClose)

  if (token.content) {
    const spaceToken = new TokenClass('text', '', 0)
    spaceToken.content = ' '
    token.children.push(spaceToken)
  }
}
