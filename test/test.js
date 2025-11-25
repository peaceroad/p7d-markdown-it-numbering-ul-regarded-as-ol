import assert from 'assert'
import fs from 'fs'
import path from 'path'
import mdit from 'markdown-it'
import mditNumberingUl from '../index.js'
import mditAttrs from 'markdown-it-attrs'
import mditDeflist from 'markdown-it-deflist'
import mditStrongJa from '@peaceroad/markdown-it-strong-ja'

let __dirname = path.dirname(new URL(import.meta.url).pathname)
const isWindows = (process.platform === 'win32')
if (isWindows) {
  __dirname = __dirname.replace(/^\/+/, '').replace(/\//g, '\\')
}

// Test configuration helper
const createTestConfig = (name, options, testFiles) => ({
  name,
  md: mdit({ html: true }).use(mditNumberingUl, options),
  testFiles
})

// Test configurations (explicit order: default -> options -> attrs variants -> other plugins)
const testConfigs = [
  // Default configuration: plugin alone (no attrs/other plugins)
  createTestConfig('default configuration', {}, [
    'examples-default-1.txt',
    'examples-default-2-samesymbol.txt',
    'examples-default-3.txt',
    'examples-default-4.txt',
    'examples-default-5minimal-nested-tests.txt',
    'examples-default-6parentheses.txt',
    'examples-default-7nested-level-loose-tight-edge-cases.txt',
    'examples-default-11fullwidth-joint.txt',
    'examples-default-12space-handling.txt',
    'examples-default-13-class-attributes.txt',
    'examples-default-14-repeated-numbers.txt'
  ]),
  // Integration: numbered lists with attrs (attrs loaded first)
  {
    name: 'numbered lists with attrs (attrs loaded first)',
    md: mdit({ html: true }).use(mditAttrs).use(mditNumberingUl),
    testFiles: ['examples-default-9with-attrs.txt']
  },
  // Run specific integration / attrs-last checks immediately after default
  {
    name: 'numbered lists with attrs (attrs loaded last)',
    md: mdit({ html: true }).use(mditNumberingUl).use(mditAttrs),
    testFiles: ['examples-default-9with-attrs.txt']
  },
  {
    name: 'with other plugins (deflist and strong-ja)',
    md: mdit({ html: true }).use(mditDeflist).use(mditStrongJa).use(mditNumberingUl, { descriptionList: true }),
    testFiles: ['examples-default-10-with-other-plugin.txt']
  },

  // Integration: description list with attrs (attrs loaded first/last)
  {
    name: 'description list with attrs (attrs loaded first)',
    md: mdit({ html: true }).use(mditAttrs).use(mditNumberingUl, { descriptionList: true }),
    testFiles: ['examples-option-descriptionlist-default.txt']
  },
  {
    name: 'description list with attrs (attrs loaded last)',
    md: mdit({ html: true }).use(mditNumberingUl, { descriptionList: true }).use(mditAttrs),
    testFiles: ['examples-option-descriptionlist-default.txt']
  },
  // Option-specific tests (each uses the plugin with particular options)
  createTestConfig('description list with div', { descriptionList: true, descriptionListWithDiv: true }, [
    'examples-option-descriptionlist-with-di.txt'
  ]),
  createTestConfig('description list with div class', { descriptionList: true, descriptionListWithDiv: true, descriptionListDivClass: 'di' }, [
    'examples-option-descriptionlist-with-di-class.txt'
  ]),
  createTestConfig('unremoveUlNest option', { unremoveUlNest: true }, [
    'examples-option-unremoveulnest.txt'
  ]),
  createTestConfig('alwaysMarkerSpan option', { alwaysMarkerSpan: true }, [
    'examples-option-alwaysmarkerspan.txt'
  ]),
  createTestConfig('hasListStyleNone option', { hasListStyleNone: true }, [
    'examples-option-hasliststylenone.txt'
  ]),
  createTestConfig('useCounterStyle option', { useCounterStyle: true }, [
    'examples-option-usecounterstyle.txt'
  ]),
  createTestConfig('omit marker metadata option', { omitMarkerMetadata: true }, [
    'examples-option-omit-marker-metadata.txt'
  ]),
  createTestConfig('markerSpanClass option', { alwaysMarkerSpan: true, markerSpanClass: 'custom-marker' }, [
    'examples-option-markerspanclass.txt'
  ]),

  // (attrs tests moved earlier)
]

// Parse test file
const parseTestFile = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf-8').trim()
  const blocks = content.split(/\r?\n*\[Markdown\]\r?\n/)
  const tests = []
  
  for (let i = 1; i < blocks.length; i++) {
    const parts = blocks[i].split(/\r?\n+\[HTML[^\]]*?\]\r?\n/)
    tests.push({
      markdown: parts[0],
      html: (parts[1] || '') + '\n'
    })
  }
  
  return tests
}

// Run tests
let allTestsPassed = true
let totalTests = 0
let failedTests = 0

for (const config of testConfigs) {
  console.log(`\nRunning ${config.name} tests...`)
  
  for (const testFile of config.testFiles) {
    console.log(`\n  File: ${testFile}`)
    const filePath = path.join(__dirname, testFile)
    const tests = parseTestFile(filePath)
    
    for (let i = 0; i < tests.length; i++) {
      totalTests++
      const testNum = i + 1
      console.log(`    Test ${testNum} >>>`)
      
      const result = config.md.render(tests[i].markdown)
      
      try {
        assert.strictEqual(result, tests[i].html)
      } catch(e) {
        allTestsPassed = false
        failedTests++
        console.log('    incorrect: ')
        console.log('    H: ' + result + '    C: ' + tests[i].html)
      }
    }
  }
}

if (allTestsPassed) {
  console.log('\n✓ All tests passed')
  process.exit(0)
} else {
  console.log(`\n✗ ${failedTests} of ${totalTests} tests failed`)
  process.exit(1)
}
