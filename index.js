// Main plugin entry point - simplified workflow
import { processDescriptionList, moveParagraphAttributesToDL } from './src/phase0-description-list.js'
import { analyzeListStructure } from './src/phase1-analyze.js'
import { convertLists } from './src/phase2-convert.js'
import { addAttributes } from './src/phase3-attributes.js'
import { processHtmlBlocks } from './src/phase4-html-blocks.js'
import { generateSpans } from './src/phase5-spans.js'
import { moveNestedListAttributes } from './src/phase6-attrs-migration.js'

const mditNumberingUlRegardedAsOl = (md, option) => {
  const opt = {
    // Core options
    descriptionList: false,
    descriptionListWithDiv: false,
    unremoveUlNest: false,        // true=preserve ul>li>ol nesting, false=flatten to ol>li
    alwaysMarkerSpan: false,      // true=use <span class="li-num">, false=normal numbering
    hasListStyleNone: false,      // true=add style="list-style: none;" when role="list" is used
    useCounterStyle: false,       // true=users will use @counter-style; suppress marker spans and role attr
    
    // Override with user options
    ...option
  }
  
  // Check if markdown-it-attrs is loaded (detect once at plugin initialization)
  const hasAttrsPlugin = md.core.ruler.__rules__.some(rule => rule.name === 'curly_attributes')

  const listProcessor = (state) => {
    // Initialize state.env
    if (!state.env) {
      state.env = {}
    }

    const tokens = state.tokens
    
    // Add source text to options for marker detection
    const optWithSrc = { ...opt, src: state.src }
    
    // ===== PHASE 0: Description List =====
    // Convert **Term**: pattern from paragraph to bullet_list, then to dl/dt/dd
    // Must run before Phase 1 (parsed as bullet_list)
    processDescriptionList(tokens, optWithSrc)
    
    // ===== PHASE 1: List Structure Analysis =====
    // Analyze marker detection and structure without token conversion
    const listInfos = analyzeListStructure(tokens, optWithSrc)
    
    // ===== PHASE 2: Token Conversion =====
    // Convert bullet_list to ordered_list based on Phase1 analysis
    // Note: simplifyNestedBulletLists removes tokens, changing indices
    convertLists(tokens, listInfos, optWithSrc)
    
    // ===== PHASE 3: Add Attributes =====
    // Add type, class, data-* attributes to converted lists
    // Use original listInfos as tokens may have been removed in Phase2
    // (Uses markerInfo stored in tokens)
    addAttributes(tokens, listInfos, optWithSrc)
    
    // ===== PHASE 4: HTML Block Processing =====
    // Remove indents from HTML blocks in lists and normalize line breaks
    processHtmlBlocks(state)
    
    // ===== PHASE 5: Span Generation =====
    // Generate marker spans in alwaysMarkerSpan mode
    generateSpans(tokens, listInfos, optWithSrc)
    
    return true
  }

  md.core.ruler.before('inline', 'numbering_ul_phases', listProcessor)
  
  // Move nested list attributes after markdown-it-attrs processing
  // This handles flattened `- 1. Parent\n    - a. Child\n{.class}` patterns
  const nestedListAttrProcessor = (state) => {
    moveNestedListAttributes(state.tokens)
    return true
  }
  
  if (hasAttrsPlugin) {
    md.core.ruler.after('curly_attributes', 'numbering_ul_nested_attrs', nestedListAttrProcessor)
  } else {
    md.core.ruler.push('numbering_ul_nested_attrs', nestedListAttrProcessor)
  }
  
  // Description list: Move paragraph attributes to dl and add custom renderers
  if (opt.descriptionList || opt.descriptionListWithDiv) {
    // Move paragraph attributes to dl (after inline and any attribute plugins)
    const dlAttrProcessor = (state) => {
      moveParagraphAttributesToDL(state.tokens)
      return true
    }
    
    if (hasAttrsPlugin) {
      md.core.ruler.after('curly_attributes', 'numbering_dl_attrs', dlAttrProcessor)
    } else {
      md.core.ruler.push('numbering_dl_attrs', dlAttrProcessor)
    }
    
    // Add custom renderers for description list tokens
    // Helper function to render attributes
    const renderAttrs = (token) => {
      if (!token.attrs || token.attrs.length === 0) return ''
      return ' ' + token.attrs.map(([key, value]) => `${key}="${value}"`).join(' ')
    }
    
    md.renderer.rules.dl_open = (tokens, idx) => `<dl${renderAttrs(tokens[idx])}>\n`
    md.renderer.rules.dl_close = () => '</dl>\n'
    md.renderer.rules.dt_open = (tokens, idx) => `<dt${renderAttrs(tokens[idx])}>`
    md.renderer.rules.dt_close = () => '</dt>\n'
    md.renderer.rules.dd_open = (tokens, idx) => `<dd${renderAttrs(tokens[idx])}>\n`
    md.renderer.rules.dd_close = () => '</dd>\n'
    
    if (opt.descriptionListWithDiv) {
      md.renderer.rules.div_open = () => '<div>\n'
      md.renderer.rules.div_close = () => '</div>\n'
    }
  }
}

export default mditNumberingUlRegardedAsOl
