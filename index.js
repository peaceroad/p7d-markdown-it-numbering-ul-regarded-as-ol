import types from './listTypes.json' with { type: 'json' }

const compiledTypes = types.map(type => ({
    contReg: new RegExp('(' + type.joint + ')'),
    symbolsRegex: type.symbols.map(sym =>
        new RegExp('^' + '((' + type.prefix + ')' + sym.replace(/^\\\\/,'\\') + '(' + type.suffix + ')(' + type.joint + '))([ 　])+', 'u')
    )
}))

const olTypes = [
  ['1', 'decimal'],
  ['a', 'lower-latin'], ['A', 'upper-latin'],
  ['i', 'lower-roman'], ['I', 'upper-roman'],
]
const prefixs = [
  ['(', 'round'], //parenthesis(parentheses), round bracket
  ['[', 'square'], //square bracket
  ['{', 'curly'], //curly bracket
  ['<', 'angle'], //angle bracket
]
const suffixs = [
  [')', 'round'],
  [']', 'square'],
  ['}', 'curly'],
  ['>', 'angle'],
]

const getSymbols = (state, cn) => {
  const tokens = state.tokens
  const inlineToken = tokens[cn+2]
  const inlineContent = inlineToken.content
  const symbols = []
  const typesLength = types.length
  for (let ltn = 0; ltn < typesLength; ltn++) {
    const currCompiled = compiledTypes[ltn]
    const symArr = types[ltn].symbols
    const symArrLength = symArr.length
    for (let sn = 0; sn < symArrLength; sn++) {
      const regex = currCompiled.symbolsRegex[sn]
      const match = inlineContent.match(regex)
      if (!match) continue
      symbols.push({
        typesNum: ltn,
        typePos: sn,
        contAll: match[0],
        cont: match[1].replace(currCompiled.contReg, ''),
        prefix: match[2],
        suffix: match[3].replace(currCompiled.contReg, ''),
        joint: match[4].replace(/^[ 　]+$/, ''),
        num: sn + types[ltn].start,
      })
      break
    }
  }
  return symbols
}

const createListToken = (state, n, list) => {
  const flow = {
    level: -1,
    type: '',
    pos: -1,
    attrs: [],
    psTypes: [], //parent symbol types.
    symbols: [],
  }
  const startFlow = Object.assign({}, flow, {
    type: state.tokens[n].type,
    pos: n,
    level: list.level,
    hasSymbol: true,
  })
  list.flows.push(startFlow)

  const tokens = state.tokens
  let cn = list.nextPos
  const stl = tokens.length
  while (cn < stl) {
    const cnToken = tokens[cn]
    const isCnListOpen = cnToken.type.match(/(bullet|ordered)_list_open/)
    const isCnListClose = cnToken.type.match(/(bullet|ordered)_list_close/)

    if (isCnListClose) {
      let stcn = list.flows.length - 1
      let st = {}
      while (stcn > -1) {
        list.nextPos = cn + 1
        st = list.flows[stcn].type.match(/(numbering_)?(?:bullet|ordered)_list_open/)
        if(st && list.level === list.flows[stcn].level) {
          break
        }
        stcn--
      }
      if (st[1]) {
        isCnListClose[0] = 'numbering_' + isCnListClose[0]
        cnToken.tag = 'ol'
      }
      list.nextPos = cn + 1
      const closeFlow = Object.assign({}, flow, {
        type: isCnListClose[0],
        pos: cn,
        level: list.level,
      })
      list.level--
      list.flows.push(closeFlow)
      if (list.level === 0) {
        break
      } else {
        cn++; continue
      }
    }

    if (isCnListOpen) {
      const nestStartFlow = Object.assign({}, flow, {
        type: cnToken.type,
        pos: cn,
        level: list.level + 1,
        hasSymbol: true,
        psTypes: [],
      })
      list.level++
      list.flows.push(nestStartFlow)
      cn++; continue
    }

    if (cnToken.type !== 'list_item_open') {
      cn++; continue
    }

    const listFlow = Object.assign({}, flow, {
      type: 'list_item_open',
      pos: cn,
      level: list.level,
      symbols: getSymbols(state, cn),
    })
    list.flows.push(listFlow)

    let plfn = -1
    for (let i = list.flows.length - 2; i >= 0; i--) {
      if (/(?:bullet|ordered)_list_open/.test(list.flows[i].type) && listFlow.level === list.flows[i].level) {
         plfn = i
         break
      }
    }

    const parentToken = state.tokens[list.flows[plfn].pos]
    if (parentToken.type === 'ordered_list_open' && listFlow.symbols.length === 0) {
      const liVal = cnToken.info
      let decimalSymbol = {
        typesNum: 0,
        typePos: liVal,
        contAll: liVal + '. ',
        cont: liVal,
        prefix: '',
        suffix: '',
        joint: '. ',
        num: liVal,
      }
      list.flows[list.flows.length-1].symbols.push(decimalSymbol)
    }

    //Set numbering type for parent list.
    list.nextPos = cn + 1
    if (listFlow.symbols.length === 0) {
      list.flows[plfn].hasSymbol = false
      if (/^numbering_/.test(list.flows[plfn].type)) {
        list.flows[plfn].type = list.flows[plfn].type.replace(/^numbering_/, '')
      }
      cn++; continue
    } else {
      if (list.flows[plfn].hasSymbol) {
          if (!/^numbering_/.test(list.flows[plfn].type)) {
          list.flows[plfn].type = 'numbering_' + list.flows[plfn].type
        }
      }
    }

    //Set possible symbol types.
    let sn = 0
    while (sn < listFlow.symbols.length) {
      let plt = 0
      let hasListType = false
      while (plt < list.flows[plfn].psTypes.length) {
        if (list.flows[plfn].psTypes[plt].num === listFlow.symbols[sn].typesNum) {
          list.flows[plfn].psTypes[plt].frequency++
          hasListType = true
          break
        }
        plt++
      }
      if (list.flows[plfn].psTypes.length === 0 || !hasListType) {
          list.flows[plfn].psTypes.push({
          num: listFlow.symbols[sn].typesNum,
          frequency: 1
        })
      }
      sn++
    }
    cn++
  }
}

const getParentTypeNum = (list, lfn) => {
  let i = 0
  let ptn = -1
  while (i < list.flows[lfn].psTypes.length) {
    if (ptn < list.flows[lfn].psTypes[i].frequency) {
      ptn = list.flows[lfn].psTypes[i].num
    }
    i++
  }
  return ptn
}

const getParentNum = (list, lfn) => {
  for (let i = lfn; i >= 0; i--) {
    if (/list_open$/.test(list.flows[i].type) && list.flows[lfn].level === list.flows[i].level) return i
  }
  return -1
}

const getSymbolsNum = (list, lfn, plfn) => {
  let sn = 0
  while (sn < list.flows[lfn].symbols.length) {
    if (+list.flows[lfn].symbols[sn].typesNum === +list.flows[plfn].typesNum) {
      break
    }
    sn++
  }
  return sn
}

const setOlTypes1All1 = (list, lfn, sn) => {
  let olTypes1All1 = true
  if (list.flows[lfn].typesNum !== 0) {
    return olTypes1All1 = false
  }
  let n = 0
  while (n < list.flows.length) {
    if (list.flows[n].type === 'list_item_open') {
      if (list.flows[lfn].level !== list.flows[n].level) {
        n++; continue
      }
      if (+list.flows[n].symbols[sn].cont !== 1) {
        olTypes1All1 = false
        break
      }
    }
    n++
  }
  return olTypes1All1
}

const setNumbers = (state, list, opt) => {
  const tokens = state.tokens
  const flows = list.flows
  let lfn = 0
  while (lfn < flows.length) {
    const curFlow = flows[lfn]
    const cn = curFlow.pos
    const currentToken = tokens[cn]
    const nt = tokens[cn+2]
    const ntChildren = nt && nt.children ? nt.children[0] : null
    const isParent = curFlow.type.match(/(numbering_bullet|ordered)_list_open/)
    if (isParent) {
      if (isParent[1] === 'numbering_bullet') {
        currentToken.type = 'ordered_list_open'
        currentToken.tag = 'ol'
      }
      const ptn = getParentTypeNum(list, lfn)
      curFlow.typesNum = ptn
      const nextFlow = flows[lfn+1]
      const symbolIndex = getSymbolsNum(list, lfn+1, lfn)
      const symbolData = nextFlow.symbols[symbolIndex]
      curFlow.olTypes1All1 = setOlTypes1All1(list, lfn, symbolIndex)

      let isOlTypes = false, isOlTypes1 = false
      for (let otn = 0, otlen = olTypes.length; otn < otlen; otn++) {
        isOlTypes = types[ptn].name === olTypes[otn][1] && !symbolData.prefix && !symbolData.suffix
        isOlTypes1 = isOlTypes && +olTypes[otn][0] === 1
        if (isOlTypes) {
          if (!isOlTypes1) {
            currentToken.attrSet('type', olTypes[otn][0])
          }
          break
        }
      }

      if (+symbolData.num !== 1) currentToken.attrSet('start', symbolData.num)
      if (!opt.unsetListRole && !isOlTypes && isParent[1] === 'numbering_bullet') currentToken.attrSet('role', 'list')

      if (ptn === -1) {
        let hasOlClass = false
        for (let j = 0, jlen = olTypes.length; j < jlen; j++) {
          if (new RegExp(olTypes[j][0]).test(currentToken.attrGet('type'))) {
            currentToken.attrSet('class', 'ol-' + olTypes[j][1])
            hasOlClass = true
            break
          }
        }
        if (!hasOlClass) currentToken.attrSet('class', 'ol-decimal')
      }

      if (symbolData !== undefined) {
        let prefixName = ''
        let suffixName = ''
        for (let j = 0, jlen = prefixs.length; j < jlen; j++) {
          if (symbolData.prefix && new RegExp('\\' + prefixs[j][0]).test(symbolData.prefix)) {
            prefixName = '-' + prefixs[j][1]
            break
          }
        }
        for (let j = 0, jlen = suffixs.length; j < jlen; j++) {
          if (symbolData.suffix && new RegExp('\\' + suffixs[j][0]).test(symbolData.suffix)) {
            suffixName = '-' + suffixs[j][1]
            break
          }
        }
        if (prefixName !== '' || suffixName !== '') {
          if (prefixName === '') prefixName = '-none'
          if (suffixName === '') suffixName = '-none'
          currentToken.attrSet('class', 'ol-' + types[symbolData.typesNum].name + '-with' + prefixName + suffixName)
        } else {
          currentToken.attrSet('class', 'ol-' + types[symbolData.typesNum].name)
        }
      }
    }

    if (curFlow.type === 'list_item_open' && curFlow.symbols.length) {
      const plfn = getParentNum(list, lfn)
      if (list.flows[plfn].type === 'bullet_list_open') {
        lfn++; continue
      }
      const symbolIndex = getSymbolsNum(list, lfn, plfn)
      const psn = getSymbolsNum(list, lfn - 1, plfn)
      for (let blfn = lfn - 1; blfn >= 0; blfn--) {
        if (flows[blfn].type === 'list_item_open' && flows[lfn].level === flows[blfn].level) {
          if (+flows[blfn].symbols[psn].num + 1 !== +flows[lfn].symbols[symbolIndex].num && !flows[plfn].olTypes1All1) {
            currentToken.attrSet('value', flows[lfn].symbols[symbolIndex].num)
          }
          break
        }
      }

      if (opt.describeListNumber) {
        //const listNumBeforeToken = new state.Token('text', '', 0)
        const listNumOpenToken = new state.Token('span_open', 'span', 1)
        listNumOpenToken.attrSet('class', 'li-num')
        if (opt.describeListNumberTitle) {
          let listNumTitle = 'List number'
          if (opt.listNumberTitleLang === 'ja') {
            listNumTitle = '項目番号'
          }
          listNumOpenToken.attrSet('title', listNumTitle)
        }
        const listNumContToken = new state.Token('text', '', 0)
        listNumContToken.content = curFlow.symbols[symbolIndex].cont
        const listNumCloseToken = new state.Token('span_close', 'span', -1)
        const listNumJointOpenToken = new state.Token('span_open', 'span', 1)
        listNumJointOpenToken.attrSet('class', 'li-num-joint')
        const listNumJointContToken = new state.Token('text', '', 0)
        listNumJointContToken.content = curFlow.symbols[symbolIndex].joint.replace(/ *$/, '')
        const listNumJointCloseToken = new state.Token('span_close', 'span', -1)
        let otn = 0
        let isOlTypes = false
        while (otn < olTypes.length) {
          isOlTypes = types[curFlow.symbols[symbolIndex].typesNum].name === olTypes[otn][1] && !curFlow.symbols[symbolIndex].prefix && !curFlow.symbols[symbolIndex].suffix
          if (isOlTypes) break
          otn++
        }
        if (opt.omitTypeNumber && isOlTypes) {
          nt.content = nt.content.replace(curFlow.symbols[symbolIndex].contAll, '')
          if(ntChildren) {
            ntChildren.content = ntChildren.content.replace(curFlow.symbols[symbolIndex].contAll, '')
          }
        } else {
          if (curFlow.symbols[symbolIndex].typesNum !== 0 || curFlow.symbols[symbolIndex].prefix || curFlow.symbols[symbolIndex].suffix) {
            nt.content = nt.content.replace(curFlow.symbols[symbolIndex].contAll, ' ')
            if(ntChildren) {
              ntChildren.content = ntChildren.content.replace(curFlow.symbols[symbolIndex].contAll, ' ')
            }
            if (/\. */.test(curFlow.symbols[symbolIndex].joint)) {
              if (/\)/.test(curFlow.symbols[symbolIndex].suffix)) {
                nt.children.splice(0, 0, listNumOpenToken, listNumContToken, listNumCloseToken)
              } else {
                nt.children.splice(0, 0, listNumOpenToken, listNumContToken, listNumJointOpenToken, listNumJointContToken,  listNumJointCloseToken, listNumCloseToken)
              }
            } else {
              nt.children.splice(0, 0, listNumOpenToken, listNumContToken, listNumCloseToken)
            }
          }
        }
      } else {
        if (curFlow.symbols[symbolIndex].typesNum !== 0 || curFlow.symbols[symbolIndex].prefix || curFlow.symbols[symbolIndex].suffix) {
          currentToken.attrSet('aria-label', curFlow.symbols[symbolIndex].cont)
        }
        nt.content = nt.content.replace(curFlow.symbols[symbolIndex].contAll, '')
        if(ntChildren) {
          ntChildren.content = ntChildren.content.replace(curFlow.symbols[symbolIndex].contAll, '')
        }
      }
    }
    lfn++
  }
  return
}

const numUl = (state, opt) => {
  const tokens = state.tokens
  for (let n = 0, tlen = tokens.length; n < tlen; n++) {
    if (!/(bullet|ordered)_list_open/.test(tokens[n].type)) continue
    let list = {
      level: 1,
      flows: [],
      nextPos: n + 1,
    }
    createListToken(state, n, list)
    setNumbers(state, list, opt)
    n = list.nextPos - 1
  }
  return true
}

const mditNumberingUlRegardedAsOl = (md, option) => {
  let opt = {
    unsetListRole: true,
    describeListNumber: true,
    omitTypeNumber: true,
    desdribelistNumterTitle: false,
    listNumberTitleLang: 'en',
  }
  if (option) Object.assign(opt, option)

  md.core.ruler.after('linkify', 'numbering_ul', (state) => {
    return numUl(state, opt)
  })
}

export default mditNumberingUlRegardedAsOl
