// Common helper functions for list processing

/**
 * Find matching close token
 * @param {Array} tokens - Token array
 * @param {number} startIdx - Start index
 * @param {string} openType - Open token type
 * @param {string} closeType - Close token type
 * @returns {number} Close token index, or -1 if not found
 */
export function findMatchingClose(tokens, startIdx, openType, closeType) {
  let depth = 1
  for (let i = startIdx + 1; i < tokens.length; i++) {
    if (tokens[i].type === openType) {
      depth++
    } else if (tokens[i].type === closeType) {
      depth--
      if (depth === 0) {
        return i
      }
    }
  }
  return -1
}

/**
 * Find list end position
 * @param {Array} tokens - Token array
 * @param {number} startIndex - Start index
 * @returns {number} List close index
 */
export function findListEnd(tokens, startIndex) {
  const startToken = tokens[startIndex]
  const openType = startToken.type
  const closeType = openType.replace('_open', '_close')
  return findMatchingClose(tokens, startIndex, openType, closeType)
}

/**
 * Find list item end position
 * @param {Array} tokens - Token array
 * @param {number} startIndex - Start index
 * @returns {number} List item close index
 */
export function findListItemEnd(tokens, startIndex) {
  return findMatchingClose(tokens, startIndex, 'list_item_open', 'list_item_close')
}

/**
 * Build close-index maps for list and list_item tokens.
 * @param {Array} tokens - Token array
 * @returns {{ listCloseByOpen: number[], listItemCloseByOpen: number[] }}
 */
export function buildListCloseIndexMap(tokens) {
  const listCloseByOpen = new Array(tokens.length).fill(-1)
  const listItemCloseByOpen = new Array(tokens.length).fill(-1)
  const bulletStack = []
  const orderedStack = []
  const listItemStack = []

  for (let i = 0; i < tokens.length; i++) {
    const type = tokens[i]?.type
    if (type === 'bullet_list_open') {
      bulletStack.push(i)
      continue
    }
    if (type === 'bullet_list_close') {
      if (bulletStack.length > 0) {
        listCloseByOpen[bulletStack.pop()] = i
      }
      continue
    }
    if (type === 'ordered_list_open') {
      orderedStack.push(i)
      continue
    }
    if (type === 'ordered_list_close') {
      if (orderedStack.length > 0) {
        listCloseByOpen[orderedStack.pop()] = i
      }
      continue
    }
    if (type === 'list_item_open') {
      listItemStack.push(i)
      continue
    }
    if (type === 'list_item_close') {
      if (listItemStack.length > 0) {
        listItemCloseByOpen[listItemStack.pop()] = i
      }
    }
  }

  return { listCloseByOpen, listItemCloseByOpen }
}
