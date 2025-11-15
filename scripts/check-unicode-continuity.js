#!/usr/bin/env node

/**
 * Check Unicode continuity for symbols to determine if they can be converted to range format
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..')

// Read listTypes.json
const listTypesPath = path.join(rootDir, 'listTypes.json')
const listTypes = JSON.parse(fs.readFileSync(listTypesPath, 'utf8'))

//console.og('🔍 Unicode Continuity Check for symbols that could use range format\n')

// Check each type that uses symbols
listTypes.types.forEach(type => {
  if (type.symbols && Array.isArray(type.symbols)) {
    //console.og(`\n📋 Checking: ${type.name}`)
    //console.og(`Symbols: ${type.symbols.join(', ')}`)
    
    // Get Unicode code points
    const codePoints = type.symbols.map(symbol => {
      const codePoint = symbol.codePointAt(0)
      return {
        symbol,
        codePoint,
        hex: codePoint.toString(16).toUpperCase().padStart(4, '0')
      }
    })
    
    //console.og('Unicode analysis:')
    codePoints.forEach((cp, index) => {
      //console.og(`  ${cp.symbol} → U+${cp.hex} (${cp.codePoint})`)
    })
    
    // Check for continuity
    let isContinuous = true
    let gaps = []
    
    for (let i = 1; i < codePoints.length; i++) {
      const current = codePoints[i].codePoint
      const previous = codePoints[i - 1].codePoint
      const expectedGap = 1
      const actualGap = current - previous
      
      if (actualGap !== expectedGap) {
        isContinuous = false
        gaps.push({
          from: codePoints[i - 1],
          to: codePoints[i],
          gap: actualGap,
          missing: actualGap > 1 ? Array.from({length: actualGap - 1}, (_, idx) => 
            String.fromCodePoint(previous + idx + 1)
          ) : []
        })
      }
    }
    
    // Results
    if (isContinuous) {
      const firstSymbol = type.symbols[0]
      const lastSymbol = type.symbols[type.symbols.length - 1]
      //console.og(`✅ CONTINUOUS: Can use range ["${firstSymbol}", "${lastSymbol}"]`)
      
      // Show the range conversion
      //console.og(`📝 Suggested conversion:`)
      //console.og(`   "range": ["${firstSymbol}", "${lastSymbol}"],`)
      //console.og(`   // Remove: "symbols": [...]`)
      
    } else {
      //console.og(`❌ NOT CONTINUOUS: Must use symbols array`)
      //console.og(`Gaps found:`)
      gaps.forEach(gap => {
        //console.og(`  Gap between ${gap.from.symbol} (U+${gap.from.hex}) and ${gap.to.symbol} (U+${gap.to.hex}): ${gap.gap} positions`)
        if (gap.missing.length > 0) {
          //console.og(`    Missing characters: ${gap.missing.join(', ')}`)
        }
      })
    }
  }
})

// Special focus on the newly added fullwidth roman numerals
//console.og('\n🎯 Special Analysis for Fullwidth Roman Numerals:')

const fullwidthLower = listTypes.types.find(t => t.name === 'fullwidth-lower-roman')
const fullwidthUpper = listTypes.types.find(t => t.name === 'fullwidth-upper-roman')

if (fullwidthLower) {
  //console.og('\n📊 Fullwidth Lower Roman (ⅰⅱⅲ...):")')
  const symbols = fullwidthLower.symbols
  //console.og(`First: ${symbols[0]} (U+${symbols[0].codePointAt(0).toString(16).toUpperCase()})`)
  //console.og(`Last:  ${symbols[symbols.length-1]} (U+${symbols[symbols.length-1].codePointAt(0).toString(16).toUpperCase()})`)
  
  // Check Unicode block
  const firstCode = symbols[0].codePointAt(0)
  const lastCode = symbols[symbols.length-1].codePointAt(0)
  //console.og(`Range: U+${firstCode.toString(16).toUpperCase()} to U+${lastCode.toString(16).toUpperCase()}`)
  //console.og(`Block: Number Forms (U+2150–U+218F)`)
}

if (fullwidthUpper) {
  //console.og('\n📊 Fullwidth Upper Roman (ⅠⅡⅢ...):")')
  const symbols = fullwidthUpper.symbols
  //console.og(`First: ${symbols[0]} (U+${symbols[0].codePointAt(0).toString(16).toUpperCase()})`)
  //console.og(`Last:  ${symbols[symbols.length-1]} (U+${symbols[symbols.length-1].codePointAt(0).toString(16).toUpperCase()})`)
  
  // Check Unicode block
  const firstCode = symbols[0].codePointAt(0)
  const lastCode = symbols[symbols.length-1].codePointAt(0)
  //console.og(`Range: U+${firstCode.toString(16).toUpperCase()} to U+${lastCode.toString(16).toUpperCase()}`)
  //console.og(`Block: Number Forms (U+2150–U+218F)`)
}

//console.og('\n✨ Analysis complete!')
