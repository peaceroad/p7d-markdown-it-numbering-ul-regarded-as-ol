import assert from 'assert'
import fs from 'fs'
import path from 'path'
import mdit from 'markdown-it'
import mdNumUl from '../index.js'
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
  md: mdit({ html: true }).use(mdNumUl, options),
  testFiles
})

// Test configurations
const testConfigs = [
  createTestConfig('default configuration', {}, [
    'examples-default-1.txt',
    'examples-default-2-samesymbol.txt',
    'examples-default-3.txt',
    'examples-default-4.txt',
    'examples-default-5minimal-nested-tests.txt',
    'examples-default-6parentheses.txt'
  ]),
  createTestConfig('description list with div', { descriptionList: true, descriptionListWithDiv: true }, [
    'examples-option-descriptionlist-with-di.txt'
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
  // Test with markdown-it-attrs loaded BEFORE this plugin
  {
    name: 'description list with attrs (attrs loaded first)',
    md: mdit({ html: true }).use(mditAttrs).use(mdNumUl, { descriptionList: true }),
    testFiles: ['examples-default-8with-attrs.txt']
  },
  // Test with markdown-it-attrs loaded AFTER this plugin
  {
    name: 'description list with attrs (attrs loaded last)',
    md: mdit({ html: true }).use(mdNumUl, { descriptionList: true }).use(mditAttrs),
    testFiles: ['examples-default-8with-attrs.txt']
  },
  // Test numbered lists with markdown-it-attrs (attrs loaded first)
  {
    name: 'numbered lists with attrs (attrs loaded first)',
    md: mdit({ html: true }).use(mditAttrs).use(mdNumUl),
    testFiles: ['examples-default-9with-attrs.txt']
  },
  // Test numbered lists with markdown-it-attrs (attrs loaded last)
  {
    name: 'numbered lists with attrs (attrs loaded last)',
    md: mdit({ html: true }).use(mdNumUl).use(mditAttrs),
    testFiles: ['examples-default-9with-attrs.txt']
  },
  // Test with other plugins: markdown-it-deflist and @peaceroad/markdown-it-strong-ja
  {
    name: 'with other plugins (deflist and strong-ja)',
    md: mdit({ html: true }).use(mditDeflist).use(mditStrongJa).use(mdNumUl, { descriptionList: true }),
    testFiles: ['examples-default-10-with-other-plugin.txt']
  }
]

// Parse test file
const parseTestFile = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf-8').trim()
  const blocks = content.split(/\n*\[Markdown\]\n/)
  const tests = []
  
  for (let i = 1; i < blocks.length; i++) {
    const parts = blocks[i].split(/\n+\[HTML[^\]]*?\]\n/)
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
