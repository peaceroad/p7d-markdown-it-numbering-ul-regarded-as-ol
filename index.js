// Main plugin entry point - simplified workflow
import { processDescriptionList, moveParagraphAttributesToDL } from './src/phase0-description-list.js'
import { analyzeListStructure } from './src/phase1-analyze.js'
import { convertLists } from './src/phase2-convert.js'
import { addAttributes } from './src/phase3-attributes.js'
import { processHtmlBlocks } from './src/phase4-html-blocks.js'
import { generateSpans } from './src/phase5-spans.js'
import { moveNestedListAttributes } from './src/phase6-attrs-migration.js'
import { normalizeLiteralOrderedLists } from './src/preprocess-literal-lists.js'

const mditNumberingUl = (md, option) => {
  const opt = {
    // Core options
    descriptionList: false,       // Convert **Term** patterns to <dl>/<dt>/<dd>
    descriptionListWithDiv: false,// Wrap description list items in <div> blocks
    descriptionListDivClass: '',  // Class name applied to generated <div>. For example, `di` (Description Item).
    unremoveUlNest: false,        // true=preserve ul>li>ol nesting, false=flatten to ol>li
    alwaysMarkerSpan: false,      // true=use <span class="li-num">, false=normal numbering
    markerSpanClass: 'li-num',    // class name to use for marker spans (customizable)
    hasListStyleNone: false,      // true=add style="list-style: none;" when role="list" is used
    omitMarkerMetadata: false,    // true=omit data-marker-prefix/suffix attributes
    useCounterStyle: false,       // true=users will use @counter-style; suppress marker spans and role attr
    addMarkerStyleToClass: false, // true=append -with-* marker style suffix to class names
    
    // Override with user options
    ...option
  }

  const addRuleAfter = (ruler, afterName, ruleName, fn) => {
    try {
      ruler.after(afterName, ruleName, fn)
    } catch {
      ruler.push(ruleName, fn)
    }
  }

  const dlProcessor = (state) => {
    if (!state.env) {
      state.env = {}
    }
    if (!opt.descriptionList && !opt.descriptionListWithDiv) {
      return true
    }
    processDescriptionList(state.tokens, opt)
    return true
  }

  const listProcessor = (state) => {
    // Initialize state.env
    if (!state.env) {
      state.env = {}
    }

    const tokens = state.tokens

    // Normalize literal nested ordered lists (markdown-it only creates nested lists when they start at 1)
    normalizeLiteralOrderedLists(tokens)
    
    // ===== PHASE 1: List Structure Analysis =====
    // Analyze marker detection and structure without token conversion
    const listInfos = analyzeListStructure(tokens, opt)
    
    // ===== PHASE 2: Token Conversion =====
    // Convert bullet_list to ordered_list based on Phase1 analysis
    // Note: simplifyNestedBulletLists removes tokens, changing indices
    convertLists(tokens, listInfos, opt)
    
    // ===== PHASE 3: Add Attributes =====
    // Add type, class, data-* attributes to converted lists
    // Use markerInfo stored on list tokens (safe after Phase2 mutations)
    addAttributes(tokens, opt)
    
    // ===== PHASE 4: HTML Block Processing =====
    // Remove indents from HTML blocks in lists and normalize line breaks
    processHtmlBlocks(state)
    
    // ===== PHASE 5: Span Generation =====
    // Generate marker spans in alwaysMarkerSpan mode
    generateSpans(tokens, opt)
    
    return true
  }

  md.core.ruler.before('inline', 'numbering_dl_parser', dlProcessor)
  md.core.ruler.after('numbering_dl_parser', 'numbering_ul_phases', listProcessor)
  
  if (!opt.unremoveUlNest) {
    // Move nested list attributes only when flattening is enabled
    const nestedListAttrProcessor = (state) => {
      moveNestedListAttributes(state.tokens)
      return true
    }
    
    addRuleAfter(md.core.ruler, 'curly_attributes', 'numbering_ul_nested_attrs', nestedListAttrProcessor)
  }
  
  // Description list: Move paragraph attributes to dl and add custom renderers
  if (opt.descriptionList || opt.descriptionListWithDiv) {
    // Move paragraph attributes to dl (after inline and any attribute plugins)
    const dlAttrProcessor = (state) => {
      moveParagraphAttributesToDL(state.tokens)
      return true
    }
    
    addRuleAfter(md.core.ruler, 'curly_attributes', 'numbering_dl_attrs', dlAttrProcessor)
  }
}

export default mditNumberingUl
