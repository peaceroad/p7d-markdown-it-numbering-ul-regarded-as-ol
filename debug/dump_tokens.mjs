#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import MarkdownIt from 'markdown-it'
import numberingPlugin from '../index.js'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node debug/dump_tokens.mjs <markdown-or-test-file> [testIndex]')
  process.exit(1)
}

const [inputFile, indexArg] = args
const filePath = path.resolve(process.cwd(), inputFile)
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}

const testIndex = indexArg ? parseInt(indexArg, 10) : 1
if (indexArg && Number.isNaN(testIndex)) {
  console.error('testIndex must be a number')
  process.exit(1)
}

const { markdown } = extractMarkdownBlock(filePath, testIndex)

const md = MarkdownIt({ html: true }).use(numberingPlugin)
const rendered = md.render(markdown)

console.log('--- Markdown ---')
console.log(markdown)
console.log('--- Rendered HTML ---')
console.log(rendered)

console.log('--- Tokens ---')
const tokens = md.parse(markdown, {})
for (let i = 0; i < tokens.length; i++) {
  const tk = tokens[i]
  const entry = {
    i,
    type: tk.type,
    tag: tk.tag,
    nesting: tk.nesting,
    level: tk.level,
    content: tk.content || '',
    map: tk.map,
    markup: tk.markup,
    info: tk.info,
    attrs: tk.attrs,
    hidden: tk.hidden || false,
    _markerInfo: tk._markerInfo || undefined,
    _convertedFromBullet: tk._convertedFromBullet || undefined,
    _parentIsLoose: tk._parentIsLoose || undefined,
    _startOverride: tk._startOverride
  }
  console.log(JSON.stringify(entry, null, 2))
}

function extractMarkdownBlock(file, blockIndex) {
  const content = fs.readFileSync(file, 'utf8')
  if (!/\[Markdown\]/.test(content)) {
    return { markdown: content }
  }
  const blocks = content.trim().split(/\r?\n*\[Markdown\]\r?\n/)
  if (blockIndex < 1 || blockIndex >= blocks.length) {
    console.error(`Test index ${blockIndex} is out of range (1-${blocks.length - 1})`)
    process.exit(1)
  }
  const parts = blocks[blockIndex].split(/\r?\n+\[HTML[^\]]*?\]\r?\n/)
  return { markdown: parts[0] }
}
