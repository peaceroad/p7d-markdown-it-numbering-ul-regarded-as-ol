import markdownit from 'markdown-it'
import mditNumberingUlRegardedAsOl from '../../index.js'

// Generate mixed content with all features
const generateMixedContent = (size) => {
  let content = ''
  const contentTypes = ['numbered', 'description', 'complex', 'nested']
  
  for (let i = 1; i <= size; i++) {
    const type = contentTypes[i % contentTypes.length]
    
    switch (type) {
      case 'numbered':
        const markers = ['1.', 'i.', 'a.', 'I.', 'A.', '(1)', '1)', 'ⅰ.', 'α.', '①']
        const marker = markers[i % markers.length]
        content += `- ${marker} Numbered item ${i}\n\n`
        break
        
      case 'description':
        content += `- **Term ${i}**  \nDescription for term ${i}\n\n`
        content += `    Additional description content.\n\n`
        break
        
      case 'complex':
        content += `- ${i}. Complex item with **bold** and *italic*\n\n`
        content += `    > Blockquote in list item\n\n`
        content += `    \`\`\`javascript\n    // Code block\n    console.log("item ${i}");\n    \`\`\`\n\n`
        break
        
      case 'nested':
        content += `- ${i}. Parent item ${i}\n`
        content += `    - a. Nested letter item\n`
        content += `    - b. Another nested item\n`
        content += `        - i. Deep nested roman\n`
        content += `        - ii. Another deep nested\n\n`
        break
    }
    
    // Add random spacing
    if (Math.random() > 0.7) {
      content += '\n'
    }
  }
  return content
}

const testMixedContentPerformance = (size, config) => {
  const md = markdownit()
  md.use(mditNumberingUlRegardedAsOl, config)

  const content = generateMixedContent(size)
  
  console.log(`🎭 Mixed Content Test: ${size} items (${config.name})`)
  const startTime = performance.now()
  
  const result = md.render(content)
  
  const endTime = performance.now()
  const duration = endTime - startTime
  
  // Count all generated elements
  const olCount = (result.match(/<ol/g) || []).length
  const ulCount = (result.match(/<ul/g) || []).length
  const dlCount = (result.match(/<dl/g) || []).length
  const liCount = (result.match(/<li/g) || []).length
  const spanCount = (result.match(/<span class="li-num"/g) || []).length
  
  console.log(`   Execution time: ${duration.toFixed(2)}ms`)
  console.log(`   Generated: ${olCount} <ol>, ${ulCount} <ul>, ${dlCount} <dl>, ${liCount} <li>, ${spanCount} spans`)
  console.log(`   Output size: ${result.length} chars`)
  console.log(`   Items/ms: ${(size / duration).toFixed(2)}`)
  console.log('---')
  
  return { duration, olCount, ulCount, dlCount, liCount, spanCount }
}

// Test configurations
const configs = [
  {
    name: 'Standard',
    descriptionList: false,
    descriptionListWithDiv: false,
    unremoveUlNest: false,
    alwaysMarkerSpan: false
  },
  {
    name: 'Description Lists',
    descriptionList: true,
    descriptionListWithDiv: false,
    unremoveUlNest: false,
    alwaysMarkerSpan: false
  },
  {
    name: 'Preserve Nesting',
    descriptionList: false,
    descriptionListWithDiv: false,
    unremoveUlNest: true,
    alwaysMarkerSpan: false
  },
  {
    name: 'All Features',
    descriptionList: true,
    descriptionListWithDiv: true,
    unremoveUlNest: false,
    alwaysMarkerSpan: true
  }
]

console.log('📊 Performance Test: Mixed Content (All Features)\n')

const sizes = [100, 250, 500, 1000]
const results = {}

// Test each configuration
for (const config of configs) {
  console.log(`\n🔧 Testing Configuration: ${config.name}`)
  results[config.name] = []
  
  for (const size of sizes) {
    const result = testMixedContentPerformance(size, config)
    results[config.name].push({ size, ...result })
  }
}

// Summary comparison
console.log('\n🏆 Mixed Content Performance Summary:')
console.log('Configuration comparison (1000 items):')

for (const config of configs) {
  const result1000 = results[config.name].find(r => r.size === 1000)
  if (result1000) {
    const performance = result1000.duration < 500 ? '🟢' : result1000.duration < 1000 ? '🟡' : '🔴'
    console.log(`   ${config.name.padEnd(20)}: ${result1000.duration.toFixed(2).padStart(7)}ms ${performance}`)
  }
}

// Scaling analysis
console.log('\n🔍 Scaling Analysis:')
for (const configName in results) {
  const configResults = results[configName]
  if (configResults.length >= 2) {
    const firstResult = configResults[0]
    const lastResult = configResults[configResults.length - 1]
    const scalingFactor = (lastResult.duration / firstResult.duration) / (lastResult.size / firstResult.size)
    const status = scalingFactor < 1.5 ? '✅' : scalingFactor < 2.0 ? 'ℹ️' : '⚠️'
    console.log(`   ${configName.padEnd(20)}: ${scalingFactor.toFixed(2)} ${status}`)
  }
}

// Feature usage analysis
console.log('\n📈 Feature Usage Analysis (1000 items):')
const standardResult = results['Standard'].find(r => r.size === 1000)
const allFeaturesResult = results['All Features'].find(r => r.size === 1000)

if (standardResult && allFeaturesResult) {
  const overhead = allFeaturesResult.duration - standardResult.duration
  const overheadPercent = (overhead / standardResult.duration * 100).toFixed(1)
  console.log(`   Feature overhead: +${overhead.toFixed(2)}ms (+${overheadPercent}%)`)
  console.log(`   Additional spans: +${allFeaturesResult.spanCount - standardResult.spanCount}`)
}
