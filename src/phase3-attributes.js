// Phase 3: Attribute Addition
// Add type, class, and data-* attributes to ordered lists

import { getTypeAttributes } from './types-utility.js'

const WHITESPACE_SUFFIX_REGEX = /^[ \u3000]+$/

/**
 * Add attributes to lists
 * @param {Array} tokens - Token array
 * @param {Object} opt - Options
 */
export function addAttributes(tokens, opt) {
  const orderedListStack = []

  // Add list attributes and normalize direct list-item values in one pass.
  // Keeping a small stack avoids rescanning every ordered-list subtree for its
  // direct items, which otherwise becomes O(tokens * nesting depth).
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (token.type === 'ordered_list_open') {
      addListAttributesForToken(token, opt)
      orderedListStack.push(createListValueContext(token))
      continue
    }
    if (token.type === 'ordered_list_close') {
      orderedListStack.pop()
      continue
    }
    if (token.type !== 'list_item_open' || orderedListStack.length === 0) {
      continue
    }

    const context = orderedListStack[orderedListStack.length - 1]
    if (token.level === context.level + 1) {
      updateListItemValue(token, context)
    }
  }
}

function createListValueContext(token) {
  const startValue = parseInt(getAttrValue(token, 'start') ?? '', 10)
  const normalizedStart = Number.isNaN(startValue) ? 1 : startValue
  const markerInfo = token._markerInfo
  const markers = !markerInfo?.allNumbersIdentical && Array.isArray(markerInfo?.markers)
    ? markerInfo.markers
    : null

  return {
    level: token.level || 0,
    markers,
    markerIndex: 0,
    markerExpectedValue: Number.isNaN(startValue)
      ? (markers?.[0]?.number || 1)
      : startValue,
    normalizedExpectedValue: normalizedStart
  }
}

function updateListItemValue(token, context) {
  const marker = context.markers?.[context.markerIndex]
  if (context.markers) {
    if (marker?.number !== undefined) {
      if (marker.number !== context.markerExpectedValue) {
        if (!token.attrs) {
          token.attrs = []
        }
        addAttr(token, 'value', String(marker.number))
      }
      context.markerExpectedValue = marker.number + 1
    } else {
      context.markerExpectedValue++
    }
    context.markerIndex++
  }

  const valueIndex = findAttrIndex(token, 'value')
  if (valueIndex === -1) {
    context.normalizedExpectedValue++
    return
  }

  const itemValue = parseInt(token.attrs[valueIndex][1], 10)
  if (itemValue === context.normalizedExpectedValue) {
    token.attrs.splice(valueIndex, 1)
    if (token.attrs.length === 0) {
      token.attrs = null
    }
  } else {
    context.normalizedExpectedValue = itemValue
  }
  context.normalizedExpectedValue++
}

function getAttrValue(token, name) {
  const index = findAttrIndex(token, name)
  return index === -1 ? undefined : token.attrs[index][1]
}

function findAttrIndex(token, name) {
  if (!Array.isArray(token.attrs)) {
    return -1
  }
  for (let i = 0; i < token.attrs.length; i++) {
    if (token.attrs[i][0] === name) {
      return i
    }
  }
  return -1
}

/**
 * Add attributes to a single list token
 */
function addListAttributesForToken(token, opt) {
  // Get marker info
  const markerInfo = token._markerInfo
  
  if (!markerInfo) {
    if (!token.attrs) {
      token.attrs = []
    }

    // Default attributes for lists without markerInfo
    if (opt.useCounterStyle) {
      // Do not add type attribute; add class so user CSS/@counter-style can target
      addAttr(token, 'class', 'ol-decimal')
      if (!opt.omitMarkerMetadata) {
        addAttr(token, 'data-marker-suffix', '.')
      }
      return
    }

    // Fallback default (legacy behavior)
    addAttr(token, 'type', '1')
    addAttr(token, 'class', 'ol-decimal')
    if (!opt.omitMarkerMetadata) {
      addAttr(token, 'data-marker-suffix', '.')
    }
    return
  }
  
  // Attributes according to marker type
  // Pass first marker's prefix/suffix info to determine class name
  const firstMarker = markerInfo.markers?.[0]
  const typeAttrs = getTypeAttributes(markerInfo.type, firstMarker, opt)
  
  // Reset attribute array
  token.attrs = []
  // Add attributes in expected order
  // Standard marker: type -> start -> class -> data-marker-*
  // Custom marker or alwaysMarkerSpan: role -> start -> class -> data-marker-* (no type attribute)
  
  // 1. type attribute or role attribute (add first)
  // Always use role="list" for alwaysMarkerSpan
  if (!opt.useCounterStyle && typeAttrs.type && !opt.alwaysMarkerSpan) {
    addAttr(token, 'type', typeAttrs.type)
  } else if (!opt.useCounterStyle) {
    // In non-counter-style mode, custom markers (or alwaysMarkerSpan) use role=list.
    addAttr(token, 'role', 'list')
    if (opt.hasListStyleNone) {
      addAttr(token, 'style', 'list-style: none;')
    }
  }
  
  // 2. Add start attribute when numbering doesn't begin at 1
  let startOverride = token._startOverride
  if (startOverride !== undefined && startOverride !== null) {
    const parsed = typeof startOverride === 'number' ? startOverride : parseInt(startOverride, 10)
    startOverride = Number.isNaN(parsed) ? undefined : parsed
  } else {
    startOverride = undefined
  }
  const firstNumber = startOverride ?? (firstMarker?.originalNumber ?? firstMarker?.number)
  if (firstNumber !== undefined && firstNumber !== 1) {
    addAttr(token, 'start', String(firstNumber))
  }
  
  // 3. Add class attribute
  if (typeAttrs.class) {
    addAttr(token, 'class', typeAttrs.class)
  }
  // 4. data-marker-prefix/suffix
  if (!opt.omitMarkerMetadata) {
    if (firstMarker?.prefix) {
      addAttr(token, 'data-marker-prefix', firstMarker.prefix)
    }
    // Do not emit data-marker-suffix when suffix is only whitespace (halfwidth or fullwidth)
    const suffix = firstMarker?.suffix
    if (suffix && !WHITESPACE_SUFFIX_REGEX.test(suffix)) {
      addAttr(token, 'data-marker-suffix', suffix)
    }
  }
}

/**
 * Add or replace an attribute on a token (with duplicate check).
 */
function addAttr(token, name, value) {
  for (let i = 0; i < token.attrs.length; i++) {
    if (token.attrs[i][0] === name) {
      token.attrs[i] = [name, value]
      return
    }
  }
  token.attrs.push([name, value])
}
