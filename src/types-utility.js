// ListTypes.json related utilities and marker processing

import types from '../listTypes.json' with { type: 'json' }

/**
 * Check if a marker type is convertible in default mode
 * Exotic markers that aren't commonly used are excluded from conversion
 * @param {string} markerType - The marker type name (e.g., 'decimal', 'lower-greek')
 * @returns {boolean} True if the marker type should be converted in default mode
 */
export const isConvertibleMarkerType = (markerType) => {
  if (!markerType) return false
  
  // Exclude exotic markers that should remain as <ul> in default mode
  // These are rarely used and may not be well-supported
  const excludedTypes = [
    'fullwidth-lower-roman',
    'fullwidth-upper-roman',
    'squared-upper-latin',
    'filled-squared-upper-latin'
  ]
  
  return !excludedTypes.includes(markerType)
}

const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Normalize fullwidth digits to ASCII digits
const normalizeFullwidthDigits = (str) => {
  if (!str || typeof str !== 'string') return str
  return str.replace(/[０-９]/g, ch => {
    const code = ch.codePointAt(0)
    return String.fromCharCode(code - 0xFF10 + 48)
  })
}

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
 * Check if symbols match a specific sequence pattern
 * @param {Array<string>} pureSymbols - Array of pure symbols (without prefix/suffix)
 * @param {Array<string>} sequence - Expected sequence array
 * @param {string} typeName - Name of the type to return
 * @param {boolean} allSame - Whether all symbols are the same
 * @returns {Object|null} Type object or null
 */
const checkSequenceMatch = (pureSymbols, sequence, typeName, allSame) => {
  if (allSame && pureSymbols.length >= 1) {
    if (sequence.indexOf(pureSymbols[0]) !== -1) {
      return { type: typeName }
    }
  } else if (pureSymbols.length >= 2) {
    // Find where the first symbol appears in the sequence
    const startIndex = sequence.indexOf(pureSymbols[0])
    if (startIndex === -1) return null
    
    // Check if all symbols match a consecutive part of the sequence
    let isValidSequence = true
    for (let i = 0; i < pureSymbols.length; i++) {
      const expectedIndex = startIndex + i
      if (expectedIndex >= sequence.length || pureSymbols[i] !== sequence[expectedIndex]) {
        isValidSequence = false
        break
      }
    }
    if (isValidSequence) {
      return { type: typeName }
    }
  }
  return null
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
  } else if (typeInfo.range) {
    // Range-based types (lower-latin, upper-latin, decimal)
    const startValue = getStartValue(typeInfo)
    if (Array.isArray(typeInfo.range) && typeof typeInfo.range[0] === 'string') {
      // Latin range: ["a", "z"] or ["A", "Z"]
      const startChar = typeInfo.range[0]
      if (pureSymbol.length > 0) {
        // Use codePointAt for proper Unicode handling (including surrogate pairs)
        const charCode = pureSymbol.codePointAt(0)
        const startCharCode = startChar.codePointAt(0)
        return charCode - startCharCode + startValue
      }
    } else {
      // Numeric range: [start, end]
      const norm = normalizeFullwidthDigits(pureSymbol)
      const numValue = parseInt(norm, 10)
      if (!isNaN(numValue)) {
        return numValue
      }
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
  
  // Cache type lookups
  const { typeInfoByName } = getTypeSeparation()
  const irohaType = typeInfoByName.get('katakana-iroha')
  const katakanaType = typeInfoByName.get('katakana')
  const upperRomanType = typeInfoByName.get('upper-roman')
  
  // Get symbol sequences from listTypes.json
  if (irohaType?.symbols) {
    const irohaResult = checkSequenceMatch(pureSymbols, irohaType.symbols, 'katakana-iroha', allSame)
    if (irohaResult) return irohaResult
  }
  
  if (katakanaType?.symbols) {
    const katakanaResult = checkSequenceMatch(pureSymbols, katakanaType.symbols, 'katakana', allSame)
    if (katakanaResult) return katakanaResult
  }
  
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

/**
 * Try to match content against compiled type patterns
 * @param {string} trimmed - Trimmed content
 * @param {Object} compiledType - Compiled type info
 * @param {Object} typeInfo - Type info from listTypes.json
 * @returns {Object|null} Match result or null
 */
const tryMatchPattern = (trimmed, compiledType, typeInfo) => {
  for (const pattern of compiledType.patterns) {
    const m = matchRegexEntry(trimmed, compiledType.name, pattern)
    if (m) return m
  }
  return null
}

// Enhanced marker type detection with context awareness
export const detectMarkerType = (content, allContents = null) => {
  if (!content || typeof content !== 'string') {
    return { type: null, marker: null }
  }

  const trimmed = content.trim()
  if (!trimmed) return { type: null, marker: null }

  const { sortedSymbolTypes, rangeBasedTypes, typeInfoByName } = getTypeSeparation()
  
  // If we have context (even single element), try to detect the overall pattern first
  if (allContents && Array.isArray(allContents) && allContents.length >= 1) {
    const contextResult = detectSequencePattern(allContents)
    if (contextResult) {
      // If context suggests a specific type, verify current content matches
      const typeInfo = typeInfoByName.get(contextResult.type)
      if (typeInfo) {
        // Check both symbol-based and range-based types
        const allCompiledTypes = [...sortedSymbolTypes, ...rangeBasedTypes]
        for (const compiledType of allCompiledTypes) {
          if (compiledType.name === contextResult.type) {
            const matchResult = tryMatchPattern(trimmed, compiledType, typeInfo)
            if (matchResult) return matchResult
          }
        }
      }
    }
  }
  
  // Fallback to original logic
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
  const { typeInfoByName } = getTypeSeparation()
  const typeInfo = typeInfoByName.get(markerType)
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
  
  // For range-based types (latin, decimal)
  if (typeInfo.range) {
    const startValue = getStartValue(typeInfo)
    if (Array.isArray(typeInfo.range) && typeInfo.range.length === 2) {
      // Latin range: ["a", "z"] or ["A", "Z"]
      const startChar = typeInfo.range[0]
      // Ensure startChar is a string
      if (typeof startChar === 'string' && startChar.length > 0) {
        // Use codePointAt and fromCodePoint for proper Unicode handling
        const startCharCode = startChar.codePointAt(0)
        const offset = number - startValue
        const targetCharCode = startCharCode + offset
        return String.fromCodePoint(targetCharCode)
      }
    }
    // Numeric range or fallback
    return String(number)
  }
  
  return null
}

/**
 * Get the default prefix/suffix pattern for a marker type
 * @param {string} markerType - The marker type name (e.g., 'lower-roman', 'decimal')
 * @returns {Object} Object with prefix and suffix properties
 */
export const getDefaultPatternForType = (markerType) => {
  const { typeInfoByName } = getTypeSeparation()
  const typeInfo = typeInfoByName.get(markerType)
  if (!typeInfo) {
    return { prefix: '', suffix: '.' }
  }
  
  // Get patterns for this type (prefer `pattern` property)
  const patternRef = typeInfo.pattern || null
  const patterns = getPatternsByName(patternRef)
  if (!patterns || patterns.length === 0) {
    return { prefix: '', suffix: '.' }
  }
  
  // Return the first pattern as the default
  return {
    prefix: patterns[0].prefix || '',
    suffix: patterns[0].suffix || '.'
  }
}

const prefixs = [
  ['(', 'round'],
  //['[', 'square'],
  //['{', 'curly'],
  //['<', 'angle'],
  ['（', 'fullround'],
]

const suffixs = [
  [')', 'round'],
  //[']', 'square'],
  //['}', 'curly'],
  //['>', 'angle'],
  ['）', 'fullround'],
]

// Build Maps for O(1) lookups (faster than .find on every call)
const prefixMap = new Map(prefixs)
const suffixMap = new Map(suffixs)

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
  const { typeInfoByName } = getTypeSeparation()
  const type = typeInfoByName.get(markerType)
  if (!type) {
    return { type: '1', class: 'ol-decimal', suffix: '.' }
  }
  
  // Get prefix/suffix from markerInfo if provided
  const detectedPrefix = markerInfo?.prefix || null
  const detectedSuffix = markerInfo?.suffix || '.'
  
  // Standard marker types mapping
  const standardTypes = {
    'decimal': { type: '1', baseClass: 'ol-decimal' },
    'lower-latin': { type: 'a', baseClass: 'ol-lower-latin' },
    'upper-latin': { type: 'A', baseClass: 'ol-upper-latin' },
    'lower-roman': { type: 'i', baseClass: 'ol-lower-roman' },
    'upper-roman': { type: 'I', baseClass: 'ol-upper-roman' }
  }
  
  // Custom marker types with no suffix
  const customTypesNoSuffix = [
    'filled-circled-decimal', 'circled-decimal', 
    'circled-upper-latin', 'filled-circled-upper-latin', 
    'circled-lower-latin', 'katakana', 'katakana-iroha'
  ]
  
  let mappedType
  let suffix = detectedSuffix
  let prefix = detectedPrefix
  let customMarker = false
  
  if (standardTypes[type.name]) {
    const std = standardTypes[type.name]
    const baseClass = std.baseClass
    const decoratedClass = opt.addMarkerStyleToClass
      ? generateClassName(baseClass, prefix, suffix)
      : baseClass
    mappedType = { 
      type: std.type, 
      class: decoratedClass
    }
  } else {
    // Custom marker types
    mappedType = { type: '1', class: `ol-${type.name}` }
    customMarker = true
    if (customTypesNoSuffix.includes(type.name)) {
      suffix = null
    }
  }
  
  const result = {
    type: customMarker ? null : mappedType.type,  // No type attribute for custom markers
    class: mappedType.class,
    suffix: suffix,
    customMarker: customMarker,
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
  const patternCache = new Map()
  typePatterns.forEach((pattern, index) => {
    const escapedPrefix = pattern.prefix ? escapeRegExp(pattern.prefix) : ''
    const escapedSuffix = pattern.suffix ? escapeRegExp(pattern.suffix) : ''
    const tail = createPatternTail(pattern)
    patternCache.set(index, {
      prefix: pattern.prefix,
      suffix: pattern.suffix,
      space: pattern.space,
      escapedPrefix,
      escapedSuffix,
      tail
    })
  })
  
  // Use pre-computed cache for faster pattern generation
  const symbolsLength = symbols.length
  const patternsLength = typePatterns.length
  
  for (let symbolIndex = 0; symbolIndex < symbolsLength; symbolIndex++) {
    const sym = symbols[symbolIndex]
    const processedSym = sym.replace(/^\\\\/,'\\')
    
    for (let patternIndex = 0; patternIndex < patternsLength; patternIndex++) {
      const cached = patternCache.get(patternIndex)
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
  if (typeof type.range[0] === 'number') {
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
      rangeType: typeof type.range[0] === 'number' ? 'numeric' : 'alphabetic'
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
        } else if (type.range) {
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

// Map of compiled types by name for O(1) lookup
// Build a map of compiled types by name once for fast lookups
const _COMPILED_BY_NAME = (() => {
  const m = new Map()
  for (const t of compiledTypes()) m.set(t.name, t)
  return m
})()

export const compiledTypesByName = () => _COMPILED_BY_NAME

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
        num: p.num,
        isRange: p.isRange,
        compiled: compiled || null
      })
    }
  }
  return arr
})()

// Fast matcher over flattened list
const tryMatchAgainstFlattened = (trimmed) => {
  for (const entry of _FLATTENED_PATTERNS) {
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
  const { typeInfoByName } = getTypeSeparation()
  const typeInfo = typeInfoByName.get(typeName)
  const compiledForCalc = entry.compiled || _COMPILED_BY_NAME.get(typeName)
  const number = calculateNumber(typeInfo, pureSymbol, compiledForCalc)

  return createMarkerResult(typeName, detectedMarker, number, entry.prefix, entry.suffix)
}

// Analyze list context to determine optimal marker type for ambiguous cases
export const analyzeListMarkerContext = (markerInfos) => {
  if (!markerInfos || markerInfos.length === 0) return markerInfos
  
  const { symbolBasedTypes, typeInfoByName } = getTypeSeparation()
  
  // Create typeInfo lookup cache
  const typeInfoCache = new Map()
  for (const compiledType of symbolBasedTypes) {
    const typeInfo = typeInfoByName.get(compiledType.name)
    if (typeInfo?.symbols) {
      typeInfoCache.set(compiledType.name, typeInfo)
    }
  }
  
  // Group markers by possible types
  const candidateTypes = new Map()
  
  markerInfos.forEach((markerInfo, index) => {
    if (!markerInfo.marker) return
    
    // Extract the actual symbol without prefix/suffix
    const actualSymbol = extractPureSymbol(markerInfo.marker, markerInfo.prefix, markerInfo.suffix)
    
    // Find all possible types for this marker
    const possibleTypes = []
      for (const [typeName, typeInfo] of typeInfoCache) {
        let symbolIndex = -1
        const compiled = _COMPILED_BY_NAME.get(typeName)
        if (compiled && compiled.symbolIndexMap) {
          const idx = compiled.symbolIndexMap.get(actualSymbol)
          symbolIndex = idx !== undefined ? idx : -1
        } else {
          symbolIndex = typeInfo.symbols.indexOf(actualSymbol)
        }

      if (symbolIndex !== -1) {
        const expectedNumber = symbolIndex + getStartValue(typeInfo)

        possibleTypes.push({
          typeName,
          symbolIndex,
          expectedNumber,
          actualPosition: index + 1
        })
      }
    }
    
    possibleTypes.forEach(pt => {
      if (!candidateTypes.has(pt.typeName)) {
        candidateTypes.set(pt.typeName, { 
          matches: 0, 
          totalItems: markerInfos.length,
          positions: []
        })
      }
      
      const candidate = candidateTypes.get(pt.typeName)
      candidate.matches++
      candidate.positions.push({
        index,
        expectedNumber: pt.expectedNumber,
        actualPosition: pt.actualPosition,
        marker: markerInfo.marker
      })
    })
  })
  
  // Score each candidate type
  let bestType = null
  let bestScore = -1
  
  for (const [typeName, candidate] of candidateTypes) {
    let score = 0
    
    // Check if positions form a consecutive sequence starting from 1
    candidate.positions.sort((a, b) => a.index - b.index)
    let isConsecutiveFrom1 = true
    let expectedStart = 1
    
    for (let i = 0; i < candidate.positions.length; i++) {
      const pos = candidate.positions[i]
      if (pos.expectedNumber !== expectedStart + i) {
        isConsecutiveFrom1 = false
        break
      }
    }
    
    // Higher score for consecutive sequences starting from 1
    if (isConsecutiveFrom1 && candidate.positions.length > 0 && candidate.positions[0].expectedNumber === 1) {
      score += 100
    }
    
    // Higher score for more matches
    score += candidate.matches * 10
    
    // Higher score for covering all items
    if (candidate.matches === candidate.totalItems) {
      score += 50
    }
    
    if (score > bestScore) {
      bestScore = score
      bestType = typeName
    }
  }
  
  // If we found a better type, update all marker infos
  if (bestType && candidateTypes.get(bestType).matches > 0) {
    const typeInfo = typeInfoCache.get(bestType)
    if (typeInfo) {
      const updatedMarkerInfos = markerInfos.map((markerInfo, index) => {
        if (!markerInfo.marker) return markerInfo
        
        // Extract the actual symbol without prefix/suffix
        const actualSymbol = extractPureSymbol(markerInfo.marker, markerInfo.prefix, markerInfo.suffix)
        
        // Use precomputed symbolIndexMap if available
        const compiled = _COMPILED_BY_NAME.get(bestType)
        let symbolIndex = -1
        if (compiled && compiled.symbolIndexMap) {
          const idx = compiled.symbolIndexMap.get(actualSymbol)
          symbolIndex = idx !== undefined ? idx : -1
        } else {
          symbolIndex = typeInfo.symbols.indexOf(actualSymbol)
        }
        if (symbolIndex !== -1) {
          const number = calculateNumber(typeInfo, actualSymbol)

          return {
            ...markerInfo,
            type: bestType,
            number: number
          }
        }
        return markerInfo
      })
      
      return updatedMarkerInfos
    }
  }
  
  return markerInfos
}
