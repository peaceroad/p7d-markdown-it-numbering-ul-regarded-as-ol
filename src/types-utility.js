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

const getPatternsByName = (patternName) => {
  const patternGroup = types.patterns.find(p => p.name === patternName)
  return patternGroup?.patterns || []
}

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
const calculateNumber = (typeInfo, pureSymbol) => {
  if (!typeInfo || !pureSymbol) return undefined
  
  if (typeInfo.symbols) {
    // Symbol-based types (katakana, roman numerals, etc.)
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
      const numValue = parseInt(pureSymbol, 10)
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
    // Extract marker part: match common marker patterns
    // Try to detect marker + suffix pattern (like "i.", "イ、", "①", etc.)
    // First try: symbol(s) followed by suffix and optional space
    let match = trimmed.match(/^([^\s]+?[.\)、．）])\s/)
    if (match) return match[1]
    
    // Second try: symbol(s) followed by suffix at end (no space after)
    match = trimmed.match(/^([^\s]+?[.\)、．）])(?=[^\s])/)
    if (match) return match[1]
    
    // Fallback: everything before first space
    match = trimmed.match(/^(\S+)/)
    return match ? match[1] : trimmed
  })
  
  // Extract pure symbols (remove prefixes/suffixes)
  const pureSymbols = markers.map(marker => {
    // Remove common suffixes like . and )
    return marker.replace(/[.\)、．）]+$/, '').replace(/^[\(（]+/, '')
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
    const romanPattern = /^[IVX]+\.?$/i
    const allRomanLike = markers.every(marker => romanPattern.test(marker))
    
    if (allRomanLike) {
      const romanSymbols = markers.map(marker => marker.replace(/\.$/, '').toUpperCase())
      if (matchesSequence(romanSymbols, upperRomanType.symbols)) {
        return { type: 'upper-roman' }
      }
    }
  }
  
  // Check Latin letters (range-based types)
  const latinPattern = /^[a-z]$/i
  const allLatinLike = pureSymbols.every(symbol => latinPattern.test(symbol))
  
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
    const result = trimmed.match(pattern.regex)
    if (result) {
      const detectedMarker = result[1]
      const pureSymbol = extractPureSymbol(detectedMarker, pattern.prefix, pattern.suffix)
      const number = calculateNumber(typeInfo, pureSymbol)
      
      return createMarkerResult(
        compiledType.name,
        detectedMarker,
        number,
        pattern.prefix,
        pattern.suffix
      )
    }
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
  // Check symbol-based types first
  for (const compiledType of sortedSymbolTypes) {
    const typeInfo = typeInfoByName.get(compiledType.name)
    const matchResult = tryMatchPattern(trimmed, compiledType, typeInfo)
    if (matchResult) return matchResult
  }
  
  // Check range-based types
  for (const compiledType of rangeBasedTypes) {
    const typeInfo = typeInfoByName.get(compiledType.name)
    const matchResult = tryMatchPattern(trimmed, compiledType, typeInfo)
    if (matchResult) return matchResult
  }
  
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
  
  // Get patterns for this type
  const patterns = getPatternsByName(typeInfo.patterns)
  if (!patterns || patterns.length === 0) {
    return { prefix: '', suffix: '.' }
  }
  
  // Return the first pattern as the default
  return {
    prefix: patterns[0].prefix || '',
    suffix: patterns[0].suffix || '.'
  }
}

/**
 * Generate class name with prefix/suffix variants
 * @param {string} baseClass - Base class name (e.g., 'ol-decimal')
 * @param {string|null} prefix - Prefix character
 * @param {string|null} suffix - Suffix character
 * @returns {string} Full class name
 */
const generateClassName = (baseClass, prefix, suffix) => {
  if (prefix === '(' && suffix === ')') {
    return `${baseClass}-with-round-round`
  } else if (!prefix && suffix === ')') {
    return `${baseClass}-with-none-round`
  }
  return baseClass
}

export const getTypeAttributes = (markerType, markerInfo = null) => {
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
    mappedType = { 
      type: std.type, 
      class: generateClassName(std.baseClass, prefix, suffix)
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

// Create regex pattern
const createRegexPattern = (pattern, symbolPart) => {
  const escapedSuffix = pattern.suffix ? escapeRegExp(pattern.suffix) : ''
  const isFullWidthSuffix = pattern.suffix && /[、．]/.test(pattern.suffix)
  
  // When there's no suffix, we MUST have at least one space OR end of string
  // When there's a suffix, space is required (except for full-width suffixes which are optional)
  let spacePattern
  if (pattern.suffix) {
    spacePattern = isFullWidthSuffix ? '([ 　])?' : '([ 　])+'
  } else {
    // No suffix: require at least one space OR end of string
    spacePattern = '(?=[ 　]|$)([ 　])*'
  }
  
  let endCheck = ''
  if (!pattern.suffix && pattern.prefix) {
    // Prefix without suffix: must be followed by space or end
    endCheck = '(?=[ 　]|$)'
  }
  
  // The symbolPart already includes prefix+symbol+suffix
  const finalPattern = `^(${symbolPart})${endCheck}${spacePattern}`
  return finalPattern
}

// Process patterns for symbols
const processSymbolPatterns = (patterns, symbols, typePatterns, type) => {
  // Pre-compute escaped prefixes, suffixes and regex patterns once
  const patternCache = new Map()
  typePatterns.forEach((pattern, index) => {
    const escapedPrefix = pattern.prefix ? escapeRegExp(pattern.prefix) : ''
    const escapedSuffix = pattern.suffix ? escapeRegExp(pattern.suffix) : ''
    const regexTemplate = createRegexPattern(pattern, 'SYMBOL_PLACEHOLDER')
    
    patternCache.set(index, {
      prefix: pattern.prefix,
      suffix: pattern.suffix,
      escapedPrefix,
      escapedSuffix,
      regexTemplate
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
      const symbolPart = cached.escapedPrefix + processedSym + cached.escapedSuffix
      const regexStr = cached.regexTemplate.replace('SYMBOL_PLACEHOLDER', symbolPart)
      
      patterns.push({
        regex: new RegExp(regexStr, 'u'),
        prefix: cached.prefix,
        suffix: cached.suffix,
        symbolIndex,
        num: symbolIndex + type.start
      })
    }
  }
}

// Process range patterns
const processRangePatterns = (patterns, typePatterns, type) => {
  // Pre-calculate symbol pattern once
  let symbolPattern
  if (typeof type.range[0] === 'number') {
    symbolPattern = '\\d+'
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
    
    const symbolPart = escapedPrefix + symbolPattern + escapedSuffix
    
    patterns.push({
      regex: new RegExp(createRegexPattern(pattern, symbolPart), 'u'),
      prefix: pattern.prefix,
      suffix: pattern.suffix,
      symbolIndex: 0,
      num: type.start,
      isRange: true,
      rangeType: typeof type.range[0] === 'number' ? 'numeric' : 'alphabetic'
    })
  }
}

// Compiled types with caching
export const compiledTypes = (() => {
  let _cache = null
  return () => {
    if (_cache === null) {
      _cache = types.types.map(type => {
        const patterns = []
        const typePatterns = getPatternsByName(type.patterns)
        
        if (type.symbols) {
          processSymbolPatterns(patterns, type.symbols, typePatterns, type)
        } else if (type.range) {
          processRangePatterns(patterns, typePatterns, type)
        }
        
        return {
          name: type.name,
          patterns
        }
      })
    }
    return _cache
  }
})()

export const prefixs = [
  ['(', 'round'],
  ['[', 'square'],
  ['{', 'curly'],
  ['<', 'angle'],
  ['（', 'fullround'],
]

export const suffixs = [
  [')', 'round'],
  [']', 'square'],
  ['}', 'curly'],
  ['>', 'angle'],
  ['）', 'fullround'],
]

// Generate regex arrays from prefix/suffix data
export const prefixRegexes = prefixs.map(([char]) => new RegExp(escapeRegExp(char)))
export const suffixRegexes = suffixs.map(([char]) => new RegExp(escapeRegExp(char)))

// End of types-utility.js - listTypes.json related utilities only

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
      const symbolIndex = typeInfo.symbols.indexOf(actualSymbol)
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
        
        const symbolIndex = typeInfo.symbols.indexOf(actualSymbol)
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
