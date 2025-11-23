// Phase 6: Attribute Migration
// Runs after markdown-it-attrs processing to handle nested list attributes
// This phase moves custom attributes from child lists to parent lists
// in flattened `- 1. Parent\n    - a. Child\n{.class}` patterns

/**
 * Move custom attributes from nested child ordered_list to parent ordered_list
 * 
 * Background:
 * - Plugin flattens `ul > li > ol` structure to `ol > li` (simplifyNestedBulletLists)
 * - markdown-it-attrs runs on original structure, applies {.class} to child list
 * - Users expect {.class} after nested list to apply to parent list
 * 
 * Algorithm:
 * 1. Find top-level ordered_list_open tokens (level 0 or 2)
 * 2. Locate child ordered_list_open within first list_item
 * 3. Extract custom attributes (exclude plugin-generated: type, data-marker-*, role, ol-* classes)
 * 4. Move custom classes to parent's class list
 * 5. Move other custom attrs to parent
 * 6. Remove moved attrs from child
 * 
 * @param {Array} tokens - Token array to process
 */
export function moveNestedListAttributes(tokens) {
  const tokensLength = tokens.length
  
  // Single pass: find top-level ordered_lists and process immediately
  for (let i = 0; i < tokensLength; i++) {
    const token = tokens[i]
    
    // Skip non-top-level ordered lists
    if (token.type !== 'ordered_list_open' || (token.level !== 0 && token.level !== 2)) {
      continue
    }
    
    const parentToken = token
    const parentLevel = token.level
    
    // Find list end
    let listEndIndex = tokensLength
    let depth = 1
    for (let j = i + 1; j < tokensLength; j++) {
      if (tokens[j].type === 'ordered_list_open') depth++
      else if (tokens[j].type === 'ordered_list_close') {
        depth--
        if (depth === 0) {
          listEndIndex = j
          break
        }
      }
    }
    
    // Find first list_item
    let firstItemOpen = -1
    let firstItemClose = -1
    
    for (let j = i + 1; j < listEndIndex; j++) {
      const t = tokens[j]
      
      if (t.type === 'list_item_open' && t.level === parentLevel + 1) {
        firstItemOpen = j
        // Find matching close
        let itemDepth = 1
        for (let k = j + 1; k < tokensLength; k++) {
          if (tokens[k].type === 'list_item_open') itemDepth++
          else if (tokens[k].type === 'list_item_close') {
            itemDepth--
            if (itemDepth === 0) {
              firstItemClose = k
              break
            }
          }
        }
        break
      }
    }
    
    if (firstItemOpen === -1 || firstItemClose === -1) continue
    
    // Find child ordered_list within first list_item
    let childListOpen = -1
    for (let j = firstItemOpen + 1; j < firstItemClose && j < tokensLength; j++) {
      if (tokens[j].type === 'ordered_list_open' && tokens[j].level > parentLevel) {
        childListOpen = j
        break
      }
    }
    
    if (childListOpen === -1) continue
    
    const childToken = tokens[childListOpen]
    if (!childToken.attrs || childToken.attrs.length === 0) continue
    
    // Extract custom attributes (exclude plugin-generated)
    const customAttrs = []
    const remainingAttrs = []
    
    for (let j = 0; j < childToken.attrs.length; j++) {
      const [key, value] = childToken.attrs[j]
      
      // Exclude plugin-generated attributes
      if (key === 'type' || key === 'role' || key === 'style' || key.startsWith('data-marker-')) {
        remainingAttrs.push([key, value])
        continue
      }
      
      // Handle class attribute specially
      if (key === 'class') {
        const classes = value.split(/\s+/)
        const pluginClasses = []
        const customClasses = []
        
        for (let k = 0; k < classes.length; k++) {
          // Treat ol-* as plugin-generated (should remain on child)
          if (classes[k].startsWith('ol-')) {
            pluginClasses.push(classes[k])
          } else {
            customClasses.push(classes[k])
          }
        }
        
        if (pluginClasses.length > 0) {
          remainingAttrs.push(['class', pluginClasses.join(' ')])
        }
        if (customClasses.length > 0) {
          customAttrs.push(['class', customClasses.join(' ')])
        }
        continue
      }
      
      // All other attributes are custom
      customAttrs.push([key, value])
    }
    
    if (customAttrs.length === 0) continue
    
    // Move custom attributes to parent
    if (!parentToken.attrs) {
      parentToken.attrs = []
    }
    
    // Merge attributes
    for (let j = 0; j < customAttrs.length; j++) {
      const [key, value] = customAttrs[j]
      
      if (key === 'class') {
        // Find existing class attribute
        let existingClassIdx = -1
        for (let k = 0; k < parentToken.attrs.length; k++) {
          if (parentToken.attrs[k][0] === 'class') {
            existingClassIdx = k
            break
          }
        }
        
        if (existingClassIdx !== -1) {
          const existingClasses = parentToken.attrs[existingClassIdx][1].split(/\s+/)
          const newClasses = value.split(/\s+/)
          // Use Set for deduplication
          const mergedClasses = [...new Set([...existingClasses, ...newClasses])]
          parentToken.attrs[existingClassIdx][1] = mergedClasses.join(' ')
        } else {
          parentToken.attrs.push(['class', value])
        }
      } else {
        parentToken.attrs.push([key, value])
      }
    }
    
    // Update child token attrs
    childToken.attrs = remainingAttrs.length > 0 ? remainingAttrs : null
  }
}
