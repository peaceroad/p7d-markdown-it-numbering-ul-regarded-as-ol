import markdownit from 'markdown-it'
import mditNumberingUl from '../../index.js'

const generateIndependentFlatteningCandidates = (size) => {
  let content = ''
  for (let i = 0; i < size; i++) {
    content += `- 1. Item ${i}\n\nseparator ${i}\n\n`
  }
  return content
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

console.log('📊 Performance Test: Independent List Flattening')

for (const size of [250, 1000, 2000]) {
  const md = markdownit().use(mditNumberingUl)
  const content = generateIndependentFlatteningCandidates(size)

  md.render(content)
  md.render(content)

  const times = []
  let output = ''
  for (let i = 0; i < 7; i++) {
    const start = performance.now()
    output = md.render(content)
    times.push(performance.now() - start)
  }

  const medianTime = median(times)
  const orderedListCount = (output.match(/<ol/g) || []).length
  console.log(`   ${size} lists: ${medianTime.toFixed(2)}ms median, ${orderedListCount} <ol> elements`)
}
