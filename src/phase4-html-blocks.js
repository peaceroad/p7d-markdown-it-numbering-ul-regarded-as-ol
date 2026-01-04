/**
 * Phase 4: HTML block processing
 * Remove list indentation from HTML blocks and normalize newlines.
 */

/**
 * Remove list indentation from HTML blocks and normalize newlines.
 * @param {Object} state - markdown-it state
 */
export function processHtmlBlocks(state) {
  const tokens = state.tokens
  const listItemStack = []
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    
    if (token.type === 'list_item_open') {
      listItemStack.push(token)
      continue
    }
    if (token.type === 'list_item_close') {
      if (listItemStack.length > 0) {
        listItemStack.pop()
      }
      continue
    }
    
    // Process only html_block tokens in lists (level > 0)
    if (token.type === 'html_block' && token.level > 0) {
      const listItemToken = listItemStack[listItemStack.length - 1]
      if (!listItemToken || !token.content) {
        continue
      }

      // Calculate list indent level (1 list level = 2 spaces)
      const listIndentLevel = token.level - listItemToken.level
      if (listIndentLevel <= 0) {
        continue
      }
      
      // Remove indent from HTML block
      const lines = token.content.split('\n')
      const spacesToRemove = listIndentLevel * 2  // 1 level = 2 spaces
      
      const adjustedLines = lines.map(line => {
        // Check leading whitespace
        const match = line.match(/^(\s*)(.*)$/)
        if (match) {
          const leadingSpaces = match[1]
          const content = match[2]
          
          // Remove list indent amount
          if (leadingSpaces.length >= spacesToRemove) {
            return leadingSpaces.substring(spacesToRemove) + content
          }
        }
        return line
      })
      
      token.content = adjustedLines.join('\n')
      
      // Add newline if next token is list_item_close
      if (i + 1 < tokens.length && tokens[i + 1].type === 'list_item_close') {
        if (!token.content.endsWith('\n')) {
          token.content += '\n'
        }
      }
    }
  }
}
