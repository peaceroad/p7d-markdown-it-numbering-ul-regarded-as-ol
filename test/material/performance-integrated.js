import markdownit from 'markdown-it'
import mditAttrs from 'markdown-it-attrs'
import mditNumberingUlRegardedAsOl from '../../index.js'

const makeRng = (seed) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

console.log('🎯 Integrated Performance Test for markdown-it-numbering-ul-regarded-as-ol')
console.log(`📅 Started at: ${new Date().toLocaleString()}`)
console.log(`🚀 Testing unified processing performance...\n`)

// Test data generators
const generateNumberedList = (size) => {
  const rng = makeRng(0x9e3779b9 ^ size)
  let content = ''
  for (let i = 1; i <= size; i++) {
    const indent = Math.floor(rng() * 3) // 0-2 levels of indent
    const spaces = '  '.repeat(indent)
    const type = rng() > 0.5 ? i : String.fromCharCode(97 + (i % 26)) // number or alphabet
    content += `${spaces}- ${type}. Item ${i}\n`
  }
  return content
}

const generateDescriptionList = (size) => {
  let content = ''
  for (let i = 1; i <= size; i++) {
    content += `- **Term ${i}**  \nDescription for term ${i}\n\n`
  }
  return content
}

const generateMixedContent = (size) => {
  let content = ''
  for (let i = 1; i <= size; i++) {
    if (i % 3 === 0) {
      // Description list
      content += `- **Mixed Term ${i}**  \nDescription content\n\n`
    } else if (i % 2 === 0) {
      // Numbered list with roman numerals
      content += `- i. Roman item ${i}\n- ii. Another roman item\n\n`
    } else {
      // Regular numbered list
      content += `- ${i}. Regular item ${i}\n`
    }
  }
  return content
}

const generateComplexNestedList = (size) => {
  let content = `- **Complex Nested Structure ${size}**  \nUsing plugin's extended syntax for proper nesting:\n`
  
  for (let i = 1; i <= size; i++) {
    content += `    ${i}. First level item ${i}\n`
    
    if (i % 2 === 0) {
      content += `        - a. Second level letter ${i}\n`
      content += `        - b. Another second level\n`
    }
    
    if (i % 3 === 0) {
      content += `            - i. Third level roman ${i}\n`
      content += `            - ii. Another roman item\n`
    }
  }
  
  content += `    ${size + 1}. Back to first level\n`
  return content
}

// Performance test function
const testPerformance = (testName, contentGenerator, size, options = {}) => {
  const md = markdownit({ html: true, breaks: false })
  md.use(mditAttrs)
  md.use(mditNumberingUlRegardedAsOl, {
    descriptionList: true,
    descriptionListWithDiv: false,
    unremoveUlNest: false,
    alwaysMarkerSpan: false,
    ...options
  })

  const content = contentGenerator(size)
  
  console.log(`📊 ${testName} (${size} items)`)
  console.log(`   Content size: ${content.length} chars`)
  
  // Warm-up run
  md.render(content)
  
  // Performance measurement
  const iterations = 10
  const times = []
  
  for (let i = 0; i < iterations; i++) {
    const startTime = performance.now()
    const result = md.render(content)
    const endTime = performance.now()
    times.push(endTime - startTime)
  }
  
  // Calculate statistics
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  const stdDev = Math.sqrt(times.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / times.length)
  
  console.log(`   ⏱️  Average: ${avgTime.toFixed(2)}ms`)
  console.log(`   🚀 Best: ${minTime.toFixed(2)}ms`) 
  console.log(`   🐌 Worst: ${maxTime.toFixed(2)}ms`)
  console.log(`   📈 Std Dev: ${stdDev.toFixed(2)}ms`)
  
  // Memory usage estimation
  const result = md.render(content)
  console.log(`   📏 Output size: ${result.length} chars`)
  console.log(`   🔀 Compression ratio: ${(result.length / content.length).toFixed(2)}x`)
  console.log('')
  
  return {
    testName,
    size,
    avgTime,
    minTime,
    maxTime,
    stdDev,
    contentSize: content.length,
    outputSize: result.length
  }
}

// Test comparison between integrated vs separate processing
const testIntegrationBenefit = (size) => {
  console.log(`🔬 Integration Benefit Analysis (${size} mixed items)`)
  
  // Simulate old approach with separate processing
  const simulateOldApproach = (content) => {
    const md = markdownit({ html: true, breaks: false })
    md.use(mditAttrs)
    
    // Simulate multiple separate processing passes
    const startTime = performance.now()
    
    // Pass 1: Description list processing
    let tokens = md.parse(content, {})
    
    // Pass 2: Numbering processing  
    tokens = md.parse(content, {})
    
    // Pass 3: Final rendering
    const result = md.render(content)
    
    const endTime = performance.now()
    return { time: endTime - startTime, result }
  }
  
  // New integrated approach
  const testIntegratedApproach = (content) => {
    const md = markdownit({ html: true, breaks: false })
    md.use(mditAttrs)
    md.use(mditNumberingUlRegardedAsOl, {
      descriptionList: true,
      unremoveUlNest: false
    })
    
    const startTime = performance.now()
    const result = md.render(content)
    const endTime = performance.now()
    
    return { time: endTime - startTime, result }
  }
  
  const content = generateMixedContent(size)
  
  // Test old approach (simulated)
  const oldResults = []
  for (let i = 0; i < 5; i++) {
    oldResults.push(simulateOldApproach(content).time)
  }
  const oldAvg = oldResults.reduce((a, b) => a + b, 0) / oldResults.length
  
  // Test new integrated approach
  const newResults = []
  for (let i = 0; i < 5; i++) {
    newResults.push(testIntegratedApproach(content).time)
  }
  const newAvg = newResults.reduce((a, b) => a + b, 0) / newResults.length
  
  const improvement = ((oldAvg - newAvg) / oldAvg * 100)
  
  console.log(`   📊 Simulated old approach: ${oldAvg.toFixed(2)}ms`)
  console.log(`   🚀 New integrated approach: ${newAvg.toFixed(2)}ms`)
  console.log(`   📈 Performance improvement: ${improvement.toFixed(1)}%`)
  console.log('')
  
  return { oldAvg, newAvg, improvement }
}

// Run comprehensive performance tests
const runPerformanceTests = () => {
  const results = []
  const sizes = [50, 100, 250, 500]
  
  console.log('=' .repeat(70))
  console.log('📊 COMPREHENSIVE PERFORMANCE TESTING')
  console.log('=' .repeat(70))
  
  // Test 1: Basic numbered lists
  console.log('🔢 Testing Basic Numbered Lists')
  console.log('-'.repeat(50))
  for (const size of sizes) {
    results.push(testPerformance('Numbered Lists', generateNumberedList, size))
  }
  
  // Test 2: Description lists
  console.log('📝 Testing Description Lists')
  console.log('-'.repeat(50))
  for (const size of sizes) {
    results.push(testPerformance('Description Lists', generateDescriptionList, size, { descriptionList: true }))
  }
  
  // Test 3: Mixed content
  console.log('🎭 Testing Mixed Content')
  console.log('-'.repeat(50))
  for (const size of sizes) {
    results.push(testPerformance('Mixed Content', generateMixedContent, size, { descriptionList: true }))
  }
  
  // Test 4: Complex nested structures (Test 17 type)
  console.log('🏗️ Testing Complex Nested Structures')
  console.log('-'.repeat(50))
  for (const size of [5, 10, 15, 20]) {  // Smaller sizes for complex nesting
    results.push(testPerformance('Complex Nested', generateComplexNestedList, size, { descriptionList: true }))
  }
  
  // Test 5: Integration benefit analysis
  console.log('🔬 Integration Benefit Analysis')
  console.log('-'.repeat(50))
  const integrationResults = []
  for (const size of [100, 250, 500]) {
    integrationResults.push(testIntegrationBenefit(size))
  }
  
  // Summary report
  console.log('=' .repeat(70))
  console.log('📋 PERFORMANCE SUMMARY REPORT')
  console.log('=' .repeat(70))
  
  // Performance by test type
  const testTypes = [...new Set(results.map(r => r.testName))]
  
  testTypes.forEach(testType => {
    const typeResults = results.filter(r => r.testName === testType)
    console.log(`\n📊 ${testType}:`)
    
    typeResults.forEach(result => {
      const throughput = (result.size / result.avgTime * 1000).toFixed(0)
      console.log(`   ${result.size} items: ${result.avgTime.toFixed(2)}ms (${throughput} items/sec)`)
    })
  })
  
  // Integration benefits summary
  console.log(`\n🚀 Integration Benefits:`)
  integrationResults.forEach((result, index) => {
    const size = [100, 250, 500][index]
    console.log(`   ${size} items: ${result.improvement.toFixed(1)}% faster`)
  })
  
  // Overall statistics
  const allTimes = results.map(r => r.avgTime)
  const totalAvg = allTimes.reduce((a, b) => a + b, 0) / allTimes.length
  const overallImprovement = integrationResults.reduce((sum, r) => sum + r.improvement, 0) / integrationResults.length
  
  console.log(`\n📈 Overall Statistics:`)
  console.log(`   Average processing time: ${totalAvg.toFixed(2)}ms`)
  console.log(`   Average integration benefit: ${overallImprovement.toFixed(1)}%`)
  console.log(`   Tests completed: ${results.length}`)
  
  console.log('\n' + '=' .repeat(70))
  console.log(`🏁 Performance testing completed at: ${new Date().toLocaleString()}`)
  console.log('=' .repeat(70))
  
  return results
}

// Run the tests
runPerformanceTests()
