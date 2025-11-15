import markdownit from 'markdown-it'
import mditNumberingUlRegardedAsOl from '../../index.js'

// Generate description lists with nested content
const generateDescriptionLists = (size) => {
  let content = ''
  
  for (let i = 1; i <= size; i++) {
    content += `- **Term ${i}**  \nDescription for term ${i}\n\n`
    content += `    This is additional content for term ${i}.\n\n`
    
    // Add nested lists occasionally
    if (i % 5 === 0) {
      content += `    Nested content:\n\n`
      content += `    - 1. First nested item\n`
      content += `    - 2. Second nested item\n`
      content += `    - a. Letter nested item\n\n`
    }
    
    // Add complex content occasionally
    if (i % 10 === 0) {
      content += `    Complex content with **bold** and *italic*.\n\n`
      content += `    > Blockquote in description\n\n`
      content += `    \`\`\`\n    code block\n    \`\`\`\n\n`
    }
  }
  return content
}

const testDescriptionListsPerformance = (size) => {
  const md = markdownit()
  md.use(mditNumberingUlRegardedAsOl, {
    descriptionList: true,
    descriptionListWithDiv: false,
    unremoveUlNest: false,
    alwaysMarkerSpan: false
  })

  const content = generateDescriptionLists(size)
  
  console.log(`📋 Description Lists Test: ${size} items`)
  const startTime = performance.now()
  
  const result = md.render(content)
  
  const endTime = performance.now()
  const duration = endTime - startTime
  
  // Count generated dl elements
  const dlCount = (result.match(/<dl/g) || []).length
  const dtCount = (result.match(/<dt/g) || []).length
  const ddCount = (result.match(/<dd/g) || []).length
  const nestedOlCount = (result.match(/<ol/g) || []).length
  
  console.log(`   Execution time: ${duration.toFixed(2)}ms`)
  console.log(`   Generated: ${dlCount} <dl>, ${dtCount} <dt>, ${ddCount} <dd>, ${nestedOlCount} nested <ol>`)
  console.log(`   Output size: ${result.length} chars`)
  console.log(`   Items/ms: ${(size / duration).toFixed(2)}`)
  console.log('---')
  
  return duration
}

// Test with different sizes
console.log('📊 Performance Test: Description Lists Only\n')

const sizes = [50, 100, 250, 500, 1000]
const results = []

for (const size of sizes) {
  const duration = testDescriptionListsPerformance(size)
  results.push({ size, duration })
}

console.log('\n🏆 Description Lists Performance Summary:')
results.forEach(({ size, duration }) => {
  const itemsPerMs = (size / duration).toFixed(2)
  const performance = duration < 200 ? '🟢 Fast' : duration < 1000 ? '🟡 Moderate' : '🔴 Slow'
  console.log(`   ${size.toString().padStart(4)} items: ${duration.toFixed(2).padStart(7)}ms (${itemsPerMs.padStart(6)} items/ms) ${performance}`)
})

console.log('\n🔍 Performance Analysis:')
if (results.length >= 2) {
  const firstResult = results[0]
  const lastResult = results[results.length - 1]
  const scalingFactor = (lastResult.duration / firstResult.duration) / (lastResult.size / firstResult.size)
  console.log(`   Scaling factor: ${scalingFactor.toFixed(2)} (1.0 = linear, >1.0 = worse than linear)`)
  
  if (scalingFactor > 2.0) {
    console.log('   ⚠️  Warning: Performance degrades significantly with size')
    console.log('   💡 Consider optimizing description list processing')
  } else if (scalingFactor < 1.5) {
    console.log('   ✅ Good: Performance scales well with size')
  } else {
    console.log('   ℹ️  Acceptable: Performance scaling is reasonable')
  }
}
