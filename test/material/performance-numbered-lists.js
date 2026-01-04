import markdownit from 'markdown-it'
import mditNumberingUlRegardedAsOl from '../../index.js'

const makeRng = (seed) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

// Generate numbered lists with various markers
const generateNumberedLists = (size) => {
  const rng = makeRng(0x9e3779b9 ^ size)
  let content = ''
  const markers = ['1.', 'i.', 'a.', 'I.', 'A.', '(1)', '1)', 'ⅰ.', 'α.', '①']
  
  for (let i = 1; i <= size; i++) {
    const indent = Math.floor(rng() * 3) // 0-2 levels of indent
    const spaces = '  '.repeat(indent)
    const marker = markers[i % markers.length]
    const number = Math.floor(i / markers.length) + 1
    const actualMarker = marker.replace(/[1ⅰα①]/g, number.toString())
    
    content += `${spaces}- ${actualMarker} Numbered item ${i}\n`
    
    // Add some content variation
    if (i % 10 === 0) {
      content += `${spaces}  Additional paragraph content for item ${i}\n\n`
    }
  }
  return content
}

const testNumberedListsPerformance = (size) => {
  const md = markdownit()
  md.use(mditNumberingUlRegardedAsOl, {
    descriptionList: false,
    descriptionListWithDiv: false,
    unremoveUlNest: false,
    alwaysMarkerSpan: false
  })

  const content = generateNumberedLists(size)
  
  console.log(`🔢 Numbered Lists Test: ${size} items`)
  const startTime = performance.now()
  
  const result = md.render(content)
  
  const endTime = performance.now()
  const duration = endTime - startTime
  
  // Count generated ol elements
  const olCount = (result.match(/<ol/g) || []).length
  const liCount = (result.match(/<li/g) || []).length
  
  console.log(`   Execution time: ${duration.toFixed(2)}ms`)
  console.log(`   Generated: ${olCount} <ol> elements, ${liCount} <li> elements`)
  console.log(`   Output size: ${result.length} chars`)
  console.log(`   Items/ms: ${(size / duration).toFixed(2)}`)
  console.log('---')
  
  return duration
}

// Test with different sizes
console.log('📊 Performance Test: Numbered Lists Only\n')

const sizes = [100, 500, 1000, 2000, 5000]
const results = []

for (const size of sizes) {
  const duration = testNumberedListsPerformance(size)
  results.push({ size, duration })
}

console.log('\n🏆 Numbered Lists Performance Summary:')
results.forEach(({ size, duration }) => {
  const itemsPerMs = (size / duration).toFixed(2)
  const performance = duration < 100 ? '🟢 Fast' : duration < 500 ? '🟡 Moderate' : '🔴 Slow'
  console.log(`   ${size.toString().padStart(4)} items: ${duration.toFixed(2).padStart(7)}ms (${itemsPerMs.padStart(6)} items/ms) ${performance}`)
})

console.log('\n🔍 Performance Analysis:')
if (results.length >= 2) {
  const firstResult = results[0]
  const lastResult = results[results.length - 1]
  const scalingFactor = (lastResult.duration / firstResult.duration) / (lastResult.size / firstResult.size)
  console.log(`   Scaling factor: ${scalingFactor.toFixed(2)} (1.0 = linear, >1.0 = worse than linear)`)
  
  if (scalingFactor > 1.5) {
    console.log('   ⚠️  Warning: Performance degrades significantly with size')
  } else if (scalingFactor < 1.2) {
    console.log('   ✅ Good: Performance scales well with size')
  } else {
    console.log('   ℹ️  Acceptable: Performance scaling is reasonable')
  }
}
