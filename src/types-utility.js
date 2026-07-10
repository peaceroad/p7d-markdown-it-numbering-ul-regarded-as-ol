// ListTypes.json related utilities and marker processing

import types from '../listTypes.json' with { type: 'json' }

const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const VALID_HTML_TYPES = new Set(['1', 'a', 'A', 'i', 'I'])
const VALID_SPACE_MODES = new Set(['half', 'both', 'none_or_both'])

const validateListTypes = (config) => {
  if (!config || config.schemaVersion !== 1) {
    throw new Error('listTypes.json must declare schemaVersion: 1')
  }
  if (!Array.isArray(config.types) || !Array.isArray(config.patternGroups)) {
    throw new Error('listTypes.json must contain types and patternGroups arrays')
  }

  const patternNames = new Set()
  for (const group of config.patternGroups) {
    if (!group || typeof group.name !== 'string' || !group.name || patternNames.has(group.name)) {
      throw new Error(`Invalid or duplicate pattern group: ${group?.name ?? ''}`)
    }
    if (!Array.isArray(group.patterns) || group.patterns.length === 0) {
      throw new Error(`Pattern group ${group.name} must contain patterns`)
    }
    patternNames.add(group.name)
    for (const pattern of group.patterns) {
      if (typeof pattern?.prefix !== 'string' || typeof pattern?.suffix !== 'string') {
        throw new Error(`Pattern group ${group.name} must use string prefix/suffix values`)
      }
      if (pattern.space !== undefined && !VALID_SPACE_MODES.has(pattern.space)) {
        throw new Error(`Pattern group ${group.name} has invalid space mode: ${pattern.space}`)
      }
    }
  }

  const typeNames = new Set()
  for (const type of config.types) {
    if (!type || typeof type.name !== 'string' || !type.name || typeNames.has(type.name)) {
      throw new Error(`Invalid or duplicate list type: ${type?.name ?? ''}`)
    }
    typeNames.add(type.name)

    const hasSymbols = Array.isArray(type.symbols)
    const hasRange = Array.isArray(type.range)
    const isNumeric = type.numeric === true
    if (Number(hasSymbols) + Number(hasRange) + Number(isNumeric) !== 1) {
      throw new Error(`List type ${type.name} must define exactly one of symbols, range, or numeric: true`)
    }
    if (type.numeric !== undefined && type.numeric !== true) {
      throw new Error(`List type ${type.name} numeric must be true when present`)
    }
    if (!Number.isInteger(type.start)) {
      throw new Error(`List type ${type.name} must define an integer start value`)
    }
    if (typeof type.pattern !== 'string' || !patternNames.has(type.pattern)) {
      throw new Error(`List type ${type.name} references an unknown pattern group`)
    }
    if (type.htmlType !== undefined && !VALID_HTML_TYPES.has(type.htmlType)) {
      throw new Error(`List type ${type.name} has invalid htmlType: ${type.htmlType}`)
    }
    if (type.contextSequence !== undefined && type.contextSequence !== true) {
      throw new Error(`List type ${type.name} contextSequence must be true when present`)
    }
    if (type.contextSequence && !hasSymbols) {
      throw new Error(`List type ${type.name} contextSequence requires symbols`)
    }
    if (hasSymbols) {
      if (type.symbols.length === 0 || type.symbols.some(symbol => typeof symbol !== 'string' || !symbol)) {
        throw new Error(`List type ${type.name} must contain non-empty string symbols`)
      }
      if (new Set(type.symbols).size !== type.symbols.length) {
        throw new Error(`List type ${type.name} contains duplicate symbols`)
      }
    }
    if (hasRange) {
      if (type.range.length !== 2 ||
          type.range.some(value => typeof value !== 'string' || Array.from(value).length !== 1)) {
        throw new Error(`List type ${type.name} range must contain two single Unicode characters`)
      }
      if (type.range[0].codePointAt(0) > type.range[1].codePointAt(0)) {
        throw new Error(`List type ${type.name} range must be ascending`)
      }
    }
  }
}

validateListTypes(types)

// Resolve top-level pattern groups once at module initialization.
// Use `patternGroups` top-level key from `listTypes.json`.
const PATTERN_GROUPS = Array.isArray(types.patternGroups) ? types.patternGroups : []

// Map for O(1) name -> group lookup
const PATTERN_GROUP_MAP = new Map((PATTERN_GROUPS || []).map(g => [g.name, g]))

/**
 * Get pattern list by name.
 * Accepts a single name (string), an array of names, or a pattern-group-like object.
 */
const getPatternsByName = (patternName) => {
  if (!patternName) return []
  // If caller passed the actual group object
  if (typeof patternName === 'object' && Array.isArray(patternName.patterns)) {
    return patternName.patterns
  }

  // If caller passed an array of group names, merge their patterns in order
  if (Array.isArray(patternName)) {
    const out = []
    for (const name of patternName) {
      if (typeof name !== 'string') continue
      const g = PATTERN_GROUP_MAP.get(name)
      if (g && Array.isArray(g.patterns)) out.push(...g.patterns)
    }
    return out
  }

  // Single name lookup (O(1) via map)
  if (typeof patternName === 'string') {
    const patternGroup = PATTERN_GROUP_MAP.get(patternName)
    return Array.isArray(patternGroup?.patterns) ? patternGroup.patterns : []
  }

  return []
}

// Precompiled common regexes to avoid recreating them repeatedly
const ROMAN_LIKE_REGEX = /^[IVX]+\.?$/i
const LATIN_LETTER_REGEX = /^[a-z]$/i
const MARKER_FALLBACK_REGEX = /^(\S+)/
const PURE_PREFIX_REMOVAL_REGEX = /^[\(（]+/

// Build dynamic suffix character classes from `listTypes.json` patterns so
// edits to that file don't require touching this code.
const _buildSuffixCharSets = () => {
  const all = new Set()
  const fullwidth = new Set()
  const groups = PATTERN_GROUPS
  if (groups.length > 0) {
    for (const group of groups) {
      if (!group || !Array.isArray(group.patterns)) continue
      for (const p of group.patterns) {
        if (!p || !p.suffix) continue
        for (const ch of Array.from(p.suffix)) {
          all.add(ch)
          const cp = ch.codePointAt(0)
          if (cp !== undefined && cp > 0xFF) fullwidth.add(ch)
        }
      }
    }
  }
  return { all, fullwidth }
}

const { all: _ALL_SUFFIX_CHARS, fullwidth: _FULLWIDTH_SUFFIX_CHARS } = _buildSuffixCharSets()

// Reuse existing `escapeRegExp` for char-class escaping to avoid duplication
const SUFFIX_CHAR_CLASS = [..._ALL_SUFFIX_CHARS].map(ch => escapeRegExp(ch)).join('')

const SUFFIX_CLASS_FOR_REGEX = SUFFIX_CHAR_CLASS.length > 0 ? `[${SUFFIX_CHAR_CLASS}]` : "\\."

const MARKER_SUFFIX_SPACE_REGEX = new RegExp(`^([^\\s]+?${SUFFIX_CLASS_FOR_REGEX})\\s`)
const MARKER_SUFFIX_NO_SPACE_REGEX = new RegExp(`^([^\\s]+?${SUFFIX_CLASS_FOR_REGEX})(?=[^\\s])`)
const PURE_SUFFIXES_REMOVAL_REGEX = new RegExp(`${SUFFIX_CLASS_FOR_REGEX}+$`)

// Cached type separation
let _symbolBasedTypes = null
let _rangeBasedTypes = null
let _sortedSymbolTypes = null
let _typeInfoByName = null

const getTypeSeparation = () => {
  if (_symbolBasedTypes === null) {
    const allTypes = compiledTypes()
    _symbolBasedTypes = []
    _rangeBasedTypes = []
    _typeInfoByName = new Map()
    
    // Create typeInfo lookup map
    for (const type of types.types) {
      _typeInfoByName.set(type.name, type)
    }
    
    for (const compiledType of allTypes) {
      const typeInfo = _typeInfoByName.get(compiledType.name)
      if (typeInfo?.symbols) {
        _symbolBasedTypes.push(compiledType)
      } else {
        _rangeBasedTypes.push(compiledType)
      }
    }
    
    // Sort symbol-based types to prioritize Roman numerals over Latin letters
    _sortedSymbolTypes = [..._symbolBasedTypes].sort((a, b) => {
      if (a.name.includes('roman') && b.name.includes('latin')) return -1
      if (a.name.includes('latin') && b.name.includes('roman')) return 1
      return 0
    })
  }
  return { 
    symbolBasedTypes: _symbolBasedTypes, 
    rangeBasedTypes: _rangeBasedTypes,
    sortedSymbolTypes: _sortedSymbolTypes,
    typeInfoByName: _typeInfoByName
  }
}

/**
 * Get start value from type info
 * @param {Object} typeInfo - Type information
 * @returns {number} Start value (default 1)
 */
const getStartValue = (typeInfo) => typeInfo?.start !== undefined ? typeInfo.start : 1

/**
 * Find where a marker sequence begins in a candidate symbol sequence.
 * @param {Array<string>} pureSymbols - Array of pure symbols (without prefix/suffix)
 * @param {Array<string>} sequence - Expected sequence array
 * @param {boolean} allSame - Whether all symbols are the same
 * @returns {number} Zero-based start index, or -1 when it does not match
 */
const findSequenceStart = (pureSymbols, sequence, allSame) => {
  if (pureSymbols.length === 0) return -1
  const startIndex = sequence.indexOf(pureSymbols[0])
  if (startIndex === -1) return -1
  if (allSame) return startIndex
  if (pureSymbols.length < 2) return -1

  for (let i = 0; i < pureSymbols.length; i++) {
    const expectedIndex = startIndex + i
    if (expectedIndex >= sequence.length || pureSymbols[i] !== sequence[expectedIndex]) {
      return -1
    }
  }
  return startIndex
}

/**
 * Check if array matches expected sequence from start
 * @param {Array<string>} actual - Actual symbols
 * @param {Array<string>} expected - Expected sequence
 * @returns {boolean} True if matches
 */
const matchesSequence = (actual, expected) => {
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      return false
    }
  }
  return true
}

/**
 * Extract pure symbol by removing prefix and suffix
 * @param {string} marker - The marker with prefix/suffix
 * @param {string|null} prefix - The prefix to remove
 * @param {string|null} suffix - The suffix to remove
 * @returns {string} Pure symbol without prefix/suffix
 */
const extractPureSymbol = (marker, prefix, suffix) => {
  let start = prefix ? prefix.length : 0
  let end = suffix ? marker.length - suffix.length : marker.length
  return marker.substring(start, end)
}

/**
 * Calculate number for a marker based on type info
 * @param {Object} typeInfo - Type information from listTypes.json
 * @param {string} pureSymbol - Pure symbol without prefix/suffix
 * @returns {number|undefined} The calculated number
 */
const calculateNumber = (typeInfo, pureSymbol, compiled = null) => {
  if (!typeInfo || !pureSymbol) return undefined

  if (typeInfo.symbols) {
    // Symbol-based types (katakana, roman numerals, etc.)
    // Prefer a provided compiled object (with symbolIndexMap) to avoid map lookups.
    if (compiled && compiled.symbolIndexMap) {
      const idx = compiled.symbolIndexMap.get(pureSymbol)
      return idx !== undefined ? idx + getStartValue(typeInfo) : undefined
    }

    // Fall back to looking up compiled map once (lazy) if compiled not provided
    const compiledFallback = _COMPILED_BY_NAME.get(typeInfo.name)
    if (compiledFallback && compiledFallback.symbolIndexMap) {
      const idx = compiledFallback.symbolIndexMap.get(pureSymbol)
      return idx !== undefined ? idx + getStartValue(typeInfo) : undefined
    }

    const symbolIndex = typeInfo.symbols.indexOf(pureSymbol)
    return symbolIndex !== -1 ? symbolIndex + getStartValue(typeInfo) : undefined
  } else if (typeInfo.numeric) {
    const numValue = parseInt(pureSymbol, 10)
    return Number.isNaN(numValue) ? undefined : numValue
  } else if (typeInfo.range) {
    // Code-point range types (Latin and enclosed Latin variants)
    const startValue = getStartValue(typeInfo)
    const charCode = pureSymbol.codePointAt(0)
    if (charCode !== undefined) {
      return charCode - typeInfo.range[0].codePointAt(0) + startValue
    }
  }
  
  return undefined
}

// Detect sequence pattern from multiple contents
export const detectSequencePattern = (allContents) => {
  if (!allContents || allContents.length < 1) return null
  
  // Extract pure markers from all contents
  const markers = allContents.map(content => {
    const trimmed = content.trim()
    // First try: symbol(s) followed by suffix and optional space
    let match = trimmed.match(MARKER_SUFFIX_SPACE_REGEX)
    if (match) return match[1]

    // Second try: symbol(s) followed by suffix at end (no space after)
    match = trimmed.match(MARKER_SUFFIX_NO_SPACE_REGEX)
    if (match) return match[1]

    // Fallback: everything before first space
    match = trimmed.match(MARKER_FALLBACK_REGEX)
    return match ? match[1] : trimmed
  })
  
  // Extract pure symbols (remove prefixes/suffixes)
  const pureSymbols = markers.map(marker => {
    return marker.replace(PURE_SUFFIXES_REMOVAL_REGEX, '').replace(PURE_PREFIX_REMOVAL_REGEX, '')
  })
  
  // Check if all symbols are the same (repeated marker case)
  const allSame = pureSymbols.every(s => s === pureSymbols[0])
  
  // For repeated ambiguous symbols, prefer the sequence where that symbol
  // appears earliest. This makes repeated ア use gojuon order while repeated
  // イ still naturally selects iroha order.
  let repeatedSequenceMatch = null
  for (const sequenceType of _CONTEXT_SEQUENCE_TYPES) {
    const startIndex = findSequenceStart(pureSymbols, sequenceType.symbols, allSame)
    if (startIndex === -1) continue
    if (!allSame) return { type: sequenceType.name }
    if (!repeatedSequenceMatch || startIndex < repeatedSequenceMatch.startIndex) {
      repeatedSequenceMatch = { type: sequenceType.name, startIndex }
    }
  }
  if (repeatedSequenceMatch) {
    return { type: repeatedSequenceMatch.type }
  }

  // Cache type lookup
  const upperRomanType = _TYPE_INFO_BY_NAME.get('upper-roman')
  
  // Check Roman numerals from listTypes.json
  if (upperRomanType?.symbols) {
    const allRomanLike = markers.every(marker => ROMAN_LIKE_REGEX.test(marker))
    
    if (allRomanLike) {
      const romanSymbols = markers.map(marker => marker.replace(/\.$/, '').toUpperCase())
      if (matchesSequence(romanSymbols, upperRomanType.symbols)) {
        return { type: 'upper-roman' }
      }
    }
  }
  
  // Check Latin letters (range-based types)
  const allLatinLike = pureSymbols.every(symbol => LATIN_LETTER_REGEX.test(symbol))
  
  if (allLatinLike && pureSymbols.length >= 2) {
    const firstSymbol = pureSymbols[0]
    const isLowerCase = firstSymbol === firstSymbol.toLowerCase()
    const baseCharCode = isLowerCase ? firstSymbol.charCodeAt(0) : firstSymbol.toUpperCase().charCodeAt(0)
    
    const expectedSequence = pureSymbols.map((_, i) => {
      const char = String.fromCharCode(baseCharCode + i)
      return isLowerCase ? char : char.toUpperCase()
    })
    const actualSequence = pureSymbols.map(s => isLowerCase ? s : s.toUpperCase())
    
    if (matchesSequence(actualSequence, expectedSequence)) {
      return { type: isLowerCase ? 'lower-latin' : 'upper-latin' }
    }
  }
  
  return null
}

/**
 * Create marker detection result object
 * @param {string} type - Marker type name
 * @param {string} marker - Detected marker
 * @param {number|undefined} number - Calculated number
 * @param {string|null} prefix - Prefix character
 * @param {string|null} suffix - Suffix character
 * @returns {Object} Detection result
 */
const createMarkerResult = (type, marker, number, prefix, suffix) => ({
  type,
  marker,
  number,
  prefix,
  suffix
})

// Enhanced marker type detection with context awareness
export const detectMarkerType = (content, allContents = null) => {
  let contextResult = null
  if (Array.isArray(allContents) && allContents.length > 0) {
    contextResult = detectSequencePattern(allContents)
  }
  return detectMarkerTypeWithContext(content, contextResult)
}

export const detectMarkerTypeWithContext = (content, contextResult = null) => {
  if (!content || typeof content !== 'string') {
    return { type: null, marker: null }
  }

  const trimmed = content.trim()
  if (!trimmed) return { type: null, marker: null }

  if (contextResult && contextResult.type) {
    const contextMatch = tryMatchAgainstType(trimmed, contextResult.type)
    if (contextMatch) return contextMatch
  }

  // Fast fallback: try a flattened precompiled pattern list to avoid nested loops
  const flatMatch = tryMatchAgainstFlattened(trimmed)
  if (flatMatch) return flatMatch

  return { type: null, marker: null }
}

/**
 * Get the symbol for a specific number in a marker type
 * @param {string} markerType - The marker type name (e.g., 'katakana-iroha', 'lower-roman')
 * @param {number} number - The 1-based number (e.g., 1 for first item, 2 for second)
 * @returns {string|null} The symbol for that number, or null if not found
 */
export const getSymbolForNumber = (markerType, number) => {
  const typeInfo = _TYPE_INFO_BY_NAME.get(markerType)
  if (!typeInfo) {
    return null
  }
  
  // For symbol-based types
  if (typeInfo.symbols && Array.isArray(typeInfo.symbols)) {
    const startValue = getStartValue(typeInfo)
    const index = number - startValue
    if (index >= 0 && index < typeInfo.symbols.length) {
      return typeInfo.symbols[index]
    }
  }
  
  if (typeInfo.numeric) {
    return String(number)
  }

  // Native Latin list types continue as z, aa, ab, matching HTML ordered-list
  // numbering rather than walking into unrelated Unicode code points.
  if (typeInfo.htmlType === 'a' || typeInfo.htmlType === 'A') {
    const startValue = getStartValue(typeInfo)
    let value = number - startValue + 1
    if (!Number.isInteger(value) || value <= 0) return null
    let symbol = ''
    while (value > 0) {
      value--
      symbol = String.fromCharCode(97 + (value % 26)) + symbol
      value = Math.floor(value / 26)
    }
    return typeInfo.htmlType === 'A' ? symbol.toUpperCase() : symbol
  }

  // Finite code-point ranges must stop at their declared endpoint.
  if (typeInfo.range) {
    const startValue = getStartValue(typeInfo)
    const targetCodePoint = typeInfo.range[0].codePointAt(0) + number - startValue
    if (targetCodePoint < typeInfo.range[0].codePointAt(0) ||
        targetCodePoint > typeInfo.range[1].codePointAt(0)) {
      return null
    }
    return String.fromCodePoint(targetCodePoint)
  }
  
  return null
}

const prefixLabels = [
  ['(', 'round'],
  ['（', 'fullround']
]

const suffixLabels = [
  [')', 'round'],
  ['）', 'fullround']
]

// Build Maps for O(1) lookups (faster than .find on every call)
const prefixMap = new Map(prefixLabels)
const suffixMap = new Map(suffixLabels)

const generateClassName = (baseClass, prefix, suffix) => {
  // fast path: no prefix and no suffix
  if (!prefix && !suffix) return baseClass

  // O(1) map lookups
  const prefixName = prefixMap.get(prefix) || null
  const suffixName = suffixMap.get(suffix) || null

  // If neither side matches known labels, return baseClass
  if (!prefixName && !suffixName) return baseClass

  const p = prefixName ? prefixName : 'none'
  const s = suffixName ? suffixName : 'none'
  return `${baseClass}-with-${p}-${s}`
}

export const getTypeAttributes = (markerType, markerInfo = null, opt = {}) => {
  const type = _TYPE_INFO_BY_NAME.get(markerType)
  if (!type) {
    return { type: '1', class: 'ol-decimal', suffix: '.' }
  }
  
  // Get prefix/suffix from markerInfo if provided
  const prefix = markerInfo?.prefix ?? null
  const suffix = markerInfo?.suffix ?? '.'
  const baseClass = `ol-${type.name}`
  const customMarker = !type.htmlType
  const className = type.htmlType && opt.addMarkerStyleToClass
    ? generateClassName(baseClass, prefix, suffix)
    : baseClass
  
  const result = {
    type: type.htmlType || null,
    class: className,
    suffix,
    customMarker,
    start: getStartValue(type)
  }
  
  // Set role="list" for custom markers
  if (customMarker) {
    result.role = 'list'
  }
  
  if (prefix) {
    result.prefix = prefix
  }
  
  if (type.symbols) {
    result.symbols = type.symbols
  }
  
  return result
}
// Precompute regex tail (endCheck + spacePattern) for a pattern to avoid recomputing
const createPatternTail = (pattern) => {
  // Determine if the pattern's suffix (if any) contains any fullwidth suffix
  // characters declared in `listTypes.json`.
  let isFullWidthSuffix = false
  if (pattern.suffix) {
    for (const ch of Array.from(pattern.suffix)) {
      if (_FULLWIDTH_SUFFIX_CHARS.has(ch)) {
        isFullWidthSuffix = true
        break
      }
    }
  }

  // Compute default space handling based on whether suffix exists and
  // whether suffix contains a fullwidth character. This is the fallback
  // behavior when `pattern.space` is not provided.
  const defaultSpaceIfSuffix = isFullWidthSuffix ? '([ 　])?' : '([ 　])+'
  const defaultSpaceNoSuffix = '(?=[ 　]|$)([ 　])*'

  let spacePattern

  if (pattern.space) {
    // Explicit directive from listTypes.json wins
    switch (pattern.space) {
      case 'half':
        spacePattern = '([ ])+'
        break
      case 'both':
        spacePattern = '([ 　])+'
        break
      case 'none_or_both':
        spacePattern = pattern.suffix ? '([ 　]+)?' : defaultSpaceNoSuffix
        break
      default:
        // Unknown explicit value: fall back to defaults
        spacePattern = pattern.suffix ? defaultSpaceIfSuffix : defaultSpaceNoSuffix
    }
  } else {
    // No explicit `pattern.space`: use defaults
    spacePattern = pattern.suffix ? defaultSpaceIfSuffix : defaultSpaceNoSuffix
  }

  let endCheck = ''
  if (!pattern.suffix && pattern.prefix) {
    endCheck = '(?=[ 　]|$)'
  }

  return `${endCheck}${spacePattern}`
}

// Process patterns for symbols
const processSymbolPatterns = (patterns, symbols, typePatterns, type) => {
  // Pre-compute escaped prefixes, suffixes and regex tail once
  const patternCache = typePatterns.map(pattern => ({
    prefix: pattern.prefix,
    suffix: pattern.suffix,
    escapedPrefix: pattern.prefix ? escapeRegExp(pattern.prefix) : '',
    escapedSuffix: pattern.suffix ? escapeRegExp(pattern.suffix) : '',
    tail: createPatternTail(pattern)
  }))
  
  // Use pre-computed cache for faster pattern generation
  const symbolsLength = symbols.length
  const patternsLength = typePatterns.length
  
  for (let symbolIndex = 0; symbolIndex < symbolsLength; symbolIndex++) {
    const sym = symbols[symbolIndex]
    const processedSym = sym.replace(/^\\\\/,'\\')
    
    for (let patternIndex = 0; patternIndex < patternsLength; patternIndex++) {
      const cached = patternCache[patternIndex]
      // Original suffix variant
      const symbolPartOrig = cached.escapedPrefix + processedSym + cached.escapedSuffix
      const regexStrOrig = `^(${symbolPartOrig})${cached.tail}`
      patterns.push({
        regex: new RegExp(regexStrOrig, 'u'),
        prefix: cached.prefix,
        suffix: cached.suffix,
        symbolIndex,
        num: symbolIndex + type.start
      })

      // Do not generate additional suffix variants — respect patterns from listTypes.json only.
    }
    
    // Only generate patterns that directly correspond to `typePatterns` entries.
  }
}

// Process range patterns
const processRangePatterns = (patterns, typePatterns, type) => {
  // Pre-calculate symbol pattern once
  let symbolPattern
  if (type.numeric) {
    // Allow only ASCII digits here — do not synthesize fullwidth digit variants.
    symbolPattern = '(?:\\d+)'
  } else {
    const start = type.range[0].codePointAt(0)
    const end = type.range[1].codePointAt(0)
    
    // Handle Unicode characters properly
    if (start > 0xFFFF || end > 0xFFFF) {
      // Unicode characters beyond BMP - enumerate all characters
      const chars = []
      for (let code = start; code <= end; code++) {
        chars.push(String.fromCodePoint(code))
      }
      symbolPattern = `[${chars.join('').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`
    } else {
      // Standard ASCII/BMP characters
      symbolPattern = `[${String.fromCharCode(start)}-${String.fromCharCode(end)}]`
    }
  }
  
  // Manual loop instead of forEach for better performance
  const patternsLength = typePatterns.length
  for (let i = 0; i < patternsLength; i++) {
    const pattern = typePatterns[i]
    const escapedPrefix = pattern.prefix ? escapeRegExp(pattern.prefix) : ''
    const escapedSuffix = pattern.suffix ? escapeRegExp(pattern.suffix) : ''
    const tail = createPatternTail(pattern)

    const symbolPart = escapedPrefix + symbolPattern + escapedSuffix
    const regexStr = `^(${symbolPart})${tail}`
    patterns.push({
      regex: new RegExp(regexStr, 'u'),
      prefix: pattern.prefix,
      suffix: pattern.suffix,
      symbolIndex: 0,
      num: type.start,
      isRange: true,
      rangeType: type.numeric ? 'numeric' : 'alphabetic'
    })

    // Note: Do not synthesize additional suffix variants here.
    // Matching must be driven solely by patterns defined in `listTypes.json`.
  }
}

// Compiled types with caching
export const compiledTypes = (() => {
  let _cache = null
  return () => {
    if (_cache === null) {
      _cache = types.types.map(type => {
        const patterns = []
        // Per-type `pattern` references a `patternGroups` entry
        const typePatternRef = type.pattern || null
        const typePatterns = getPatternsByName(typePatternRef)

        // Build symbol->index map for symbol-based types to avoid indexOf scans
        let symbolIndexMap = null
        if (type.symbols && Array.isArray(type.symbols)) {
          symbolIndexMap = new Map()
          for (let i = 0; i < type.symbols.length; i++) {
            symbolIndexMap.set(type.symbols[i], i)
          }
        }

        if (type.symbols) {
          processSymbolPatterns(patterns, type.symbols, typePatterns, type)
        } else if (type.range || type.numeric) {
          processRangePatterns(patterns, typePatterns, type)
        }

        return {
          name: type.name,
          patterns,
          symbolIndexMap
        }
      })
    }
    return _cache
  }
})()

// Build a map of compiled types by name once for fast lookups.
const _COMPILED_BY_NAME = (() => {
  const m = new Map()
  for (const t of compiledTypes()) m.set(t.name, t)
  return m
})()

// Build a flattened pattern list (preserve previous priority: sortedSymbolTypes then rangeBasedTypes)
const _FLATTENED_PATTERNS = (() => {
  const arr = []
  const { sortedSymbolTypes, rangeBasedTypes } = getTypeSeparation()
  const source = [...sortedSymbolTypes, ...rangeBasedTypes]
  for (const compiledType of source) {
    const compiled = _COMPILED_BY_NAME.get(compiledType.name)
    for (const p of compiledType.patterns) {
      arr.push({
        regex: p.regex,
        prefix: p.prefix,
        suffix: p.suffix,
        typeName: compiledType.name,
        symbolIndex: p.symbolIndex,
        compiled: compiled || null
      })
    }
  }
  return arr
})()

const _TYPE_INFO_BY_NAME = getTypeSeparation().typeInfoByName
const _CONTEXT_SEQUENCE_TYPES = types.types.filter(type => type.contextSequence === true)
const ASCII_DIGIT_LEADS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

const getFirstCodePointChar = (text) => {
  if (typeof text !== 'string' || text.length === 0) {
    return null
  }
  const firstCodePoint = text.codePointAt(0)
  if (firstCodePoint === undefined) {
    return null
  }
  return firstCodePoint > 0xFFFF ? text.slice(0, 2) : text[0]
}

const buildEntryLeadingChars = (entry) => {
  const prefixedLead = getFirstCodePointChar(entry.prefix)
  if (prefixedLead) {
    return [prefixedLead]
  }

  const typeInfo = _TYPE_INFO_BY_NAME.get(entry.typeName)
  if (!typeInfo) {
    return []
  }

  if (Array.isArray(typeInfo.symbols)) {
    const symbol = typeInfo.symbols[entry.symbolIndex]
    const symbolLead = getFirstCodePointChar(symbol)
    return symbolLead ? [symbolLead] : []
  }

  if (typeInfo.numeric) {
    return ASCII_DIGIT_LEADS
  }

  if (!Array.isArray(typeInfo.range) || typeInfo.range.length !== 2) {
    return []
  }

  const start = typeInfo.range[0]?.codePointAt(0)
  const end = typeInfo.range[1]?.codePointAt(0)
  if (typeof start !== 'number' || typeof end !== 'number' || end < start) {
    return []
  }

  const leadingChars = []
  for (let codePoint = start; codePoint <= end; codePoint++) {
    leadingChars.push(String.fromCodePoint(codePoint))
  }
  return leadingChars
}

const _FLATTENED_PATTERNS_BY_LEAD = (() => {
  const buckets = new Map()
  for (const entry of _FLATTENED_PATTERNS) {
    const leadingChars = buildEntryLeadingChars(entry)
    for (const leadingChar of leadingChars) {
      let bucket = buckets.get(leadingChar)
      if (!bucket) {
        bucket = []
        buckets.set(leadingChar, bucket)
      }
      bucket.push(entry)
    }
  }
  return buckets
})()

const tryMatchAgainstType = (trimmed, typeName) => {
  if (!typeName) return null
  const compiled = _COMPILED_BY_NAME.get(typeName)
  if (!compiled || !Array.isArray(compiled.patterns)) return null
  for (const entry of compiled.patterns) {
    const m = matchRegexEntry(trimmed, typeName, entry)
    if (m) return m
  }
  return null
}

// Fast matcher over flattened list
const tryMatchAgainstFlattened = (trimmed) => {
  const leadingChar = getFirstCodePointChar(trimmed)
  const candidates = leadingChar ? _FLATTENED_PATTERNS_BY_LEAD.get(leadingChar) : null
  if (!candidates) {
    return null
  }
  for (const entry of candidates) {
    const m = matchRegexEntry(trimmed, entry.typeName, entry)
    if (m) return m
  }
  return null
}

// Helper to match a trimmed string against a pattern entry and produce a result.
// `entry` is expected to have `regex`, `prefix`, `suffix` and optionally `compiled`.
const matchRegexEntry = (trimmed, typeName, entry) => {
  const result = trimmed.match(entry.regex)
  if (!result) return null

  const detectedMarker = result[1]
  const pureSymbol = extractPureSymbol(detectedMarker, entry.prefix, entry.suffix)
  const typeInfo = _TYPE_INFO_BY_NAME.get(typeName)
  const compiledForCalc = entry.compiled || _COMPILED_BY_NAME.get(typeName)
  const number = calculateNumber(typeInfo, pureSymbol, compiledForCalc)

  return createMarkerResult(typeName, detectedMarker, number, entry.prefix, entry.suffix)
}
