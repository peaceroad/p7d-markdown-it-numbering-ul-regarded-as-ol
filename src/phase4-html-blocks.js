/**
 * Phase 4: HTMLブロック処理
 * リスト内のHTMLブロックのインデントを除去し、改行を正規化する
 */

/**
 * HTMLブロックのインデントを除去し、改行を正規化
 * @param {Object} state - markdown-itのstate
 */
export function processHtmlBlocks(state) {
  const tokens = state.tokens;
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    // Process only html_block tokens in lists (level > 0)
    if (token.type === 'html_block' && token.level > 0) {
      // Check if in list item
      let isInList = false;
      let listIndentLevel = 0;
      
      // Check previous token to determine if in list
      for (let j = i - 1; j >= 0; j--) {
        const prevToken = tokens[j];
        if (prevToken.type === 'list_item_open' && prevToken.level < token.level) {
          isInList = true;
          // Calculate list indent level (1 list level = 2 spaces)
          listIndentLevel = (token.level - prevToken.level);
          break;
        }
        if (prevToken.type === 'ordered_list_close' || prevToken.type === 'bullet_list_close') {
          break;
        }
      }
      
      if (isInList && token.content) {
        // Remove indent from HTML block
        const lines = token.content.split('\n');
        const spacesToRemove = listIndentLevel * 2; // 1 level = 2 spaces
        
        const adjustedLines = lines.map(line => {
          // Check leading whitespace
          const match = line.match(/^(\s*)(.*)$/);
          if (match) {
            const leadingSpaces = match[1];
            const content = match[2];
            
            // Remove list indent amount
            if (leadingSpaces.length >= spacesToRemove) {
              return leadingSpaces.substring(spacesToRemove) + content;
            }
          }
          return line;
        });
        
        token.content = adjustedLines.join('\n');
        
        // Add newline if next token is list_item_close
        if (i + 1 < tokens.length && tokens[i + 1].type === 'list_item_close') {
          if (!token.content.endsWith('\n')) {
            token.content += '\n';
          }
        }
      }
    }
  }
}
