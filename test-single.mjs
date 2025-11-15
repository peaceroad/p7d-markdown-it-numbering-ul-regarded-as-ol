import mdit from 'markdown-it'
import mdNumUl from './index.js'
import mditDeflist from 'markdown-it-deflist'
import mditStrongJa from '@peaceroad/markdown-it-strong-ja'

const md = mdit({ html: true }).use(mditDeflist).use(mditStrongJa).use(mdNumUl, { descriptionList: true })

const input = '- ** *term1* and *term2* combined**\n    Definition for combined terms'

console.log('Input:')
console.log(input)
console.log('\nOutput:')
console.log(md.render(input))

// Check tokens
const tokens = md.parse(input, {})
console.log('\nFirst paragraph inline content:')
for (let i = 0; i < tokens.length; i++) {
  if (tokens[i].type === 'inline') {
    console.log('Content:', JSON.stringify(tokens[i].content))
    console.log('Children:', tokens[i].children.map(t => ({ type: t.type, content: t.content })))
    break
  }
}
