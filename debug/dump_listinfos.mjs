#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import MarkdownIt from 'markdown-it'
import { processDescriptionList } from '../src/phase0-description-list.js'
import { normalizeLiteralOrderedLists } from '../src/preprocess-literal-lists.js'
import { analyzeListStructure } from '../src/phase1-analyze.js'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node debug/dump_listinfos.mjs <markdown-or-test-file> [testIndex]')
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
const tokens = MarkdownIt({ html: true }).parse(markdown, {})

const opt = createDefaultOptions()
processDescriptionList(tokens, opt)
normalizeLiteralOrderedLists(tokens)
const listInfos = analyzeListStructure(tokens, opt)

console.log(JSON.stringify(listInfos, null, 2))

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

function createDefaultOptions() {
  return {
    descriptionList: false,
    descriptionListWithDiv: false,
    descriptionListDivClass: '',
    unremoveUlNest: false,
    alwaysMarkerSpan: false,
    markerSpanClass: 'li-num',
    hasListStyleNone: false,
    omitMarkerMetadata: false,
    useCounterStyle: false,
    addMarkerStyleToClass: false
  }
}
