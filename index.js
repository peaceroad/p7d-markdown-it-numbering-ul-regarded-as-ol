import types from './listTypes.json' with { type: 'json' }

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
  let symbols = []
  const inlineToken = state.tokens[cn+2]
  let ltn = 0
  while (ltn < types.length) {
    let sn = 0
    let hasSymbol = null
    while (sn < types[ltn].symbols.length) {
      hasSymbol = inlineToken.content.match(new RegExp('^'+ '((' + types[ltn].prefix + ')' + types[ltn].symbols[sn].replace(/^\\\\/,'\\') + '(' + types[ltn].suffix + ')(' + types[ltn].joint + '))([ 　])+', 'u'))
      if (!hasSymbol) { sn++; continue }
      const symbol = {
        typesNum: ltn,
        typePos: sn,
        contAll: hasSymbol[0],
        cont: hasSymbol[1].replace(new RegExp('(' + types[ltn].joint + ')'), ''),
        prefix: hasSymbol[2],
        suffix: hasSymbol[3].replace(new RegExp('(' + types[ltn].joint + ')'), ''),
        joint: hasSymbol[4].replace(/^[ 　]+$/, ''),
        num: sn + types[ltn].start,
      }
      symbols.push(symbol)
      break
    }
    ltn++
  }
  //console.log('symbols: ' + JSON.stringify(symbols))
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

  let cn = list.nextPos
  while (cn < state.tokens.length) {
    const cnToken = state.tokens[cn]
    //console.log('cn: ' + cn + ', list.level: ' + list.level + ', cnToken.type: ', cnToken.type, ', cnToken.content: ' + cnToken.content)
    const isCnListOpen = cnToken.type.match(/(bullet|ordered)_list_open/)
    const isCnListClose = cnToken.type.match(/(bullet|ordered)_list_close/)

    if (isCnListClose) {
      let stcn = list.flows.length - 1
      let st = {}
      while (stcn > -1) {
        //console.log('stcn: ' + stcn + ', list.flows[stcn].type: ' + list.flows[stcn].type)
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
      cn++
      continue
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
    //console.log('listFlow:' + JSON.stringify(listFlow))

    //Check parent list flow number.
    let plfn = list.flows.length - 2
    while (plfn > -1) {
      if (/(?:bullet|ordered)_list_open/.test(list.flows[plfn].type) && listFlow.level === list.flows[plfn].level) {
        break
      }
      plfn--; continue
    }
    //console.log('list.flows[plfn]: ' + JSON.stringify(list.flows[plfn]))

    //Set value attribute of ordered list in listFlow.
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
    //console.log(list.flows[plfn].hasSymbol)
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
      let haslistType = false
      while (plt < list.flows[plfn].psTypes.length) {
        if (list.flows[plfn].psTypes[plt].num === listFlow.symbols[sn].typesNum) {
          list.flows[plfn].psTypes[plt].frequency++
          haslistType = true
          break
        }
        plt++
      }
      if (list.flows[plfn].psTypes.length === 0 || !haslistType) {
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

const getParentNum = (list, lfn) =>{
  let plfn = lfn
  while (plfn > -1) {
    if (/list_open$/.test(list.flows[plfn].type) && list.flows[lfn].level === list.flows[plfn].level) {
      break
    }
    plfn--
  }
  return plfn
}

const getSymbolsNum = (list, lfn, plfn) => {
  let sn = 0
  //console.log('list.flows[plfn].typesNum: ' + list.flows[plfn].typesNum)
  while (sn < list.flows[lfn].symbols.length) {
    if (+list.flows[lfn].symbols[sn].typesNum === +list.flows[plfn].typesNum) {
      //console.log(sn, list.flows[plfn].typesNum)
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
  //console.log(list.flows)
  while (n < list.flows.length) {
    if (list.flows[n].type === 'list_item_open') {
      //console.log(list.flows[n].symbols)
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
  let lfn = 0
  while (lfn < list.flows.length) {
    //console.log('list.flows[' + lfn + ']: '+ JSON.stringify(list.flows[lfn]))
    const cn = list.flows[lfn].pos
    const isParent = list.flows[lfn].type.match(/(numbering_bullet|ordered)_list_open/)
    if (isParent) {
      if (isParent[1] === 'numbering_bullet') {
        state.tokens[cn].type = 'ordered_list_open'
        state.tokens[cn].tag = 'ol'
      }
      const ptn = getParentTypeNum(list, lfn)
      list.flows[lfn].typesNum = ptn
      const sn = getSymbolsNum(list, lfn+1, lfn)
      const olTypes1All1 = setOlTypes1All1(list, lfn, sn)
      list.flows[lfn].olTypes1All1 = olTypes1All1
      //console.log(olTypes1All1)

      //Set type and role attribute.
      let isOlTypes = false
      let isOlTypes1 = false
      let otn = 0
      while (otn < olTypes.length) {
        //console.log(types[ptn].name, olTypes[otn][1], olTypes[otn][0])
        isOlTypes = types[ptn].name === olTypes[otn][1] && !list.flows[lfn+1].symbols[sn].prefix && !list.flows[lfn+1].symbols[sn].suffix
        isOlTypes1 = isOlTypes && +olTypes[otn][0] === 1
        if (isOlTypes) {
          if (!isOlTypes1) {
            state.tokens[cn].attrSet('type', olTypes[otn][0])
          }
          break
        }
        otn++
      }

      //Set start attribute.
      if (+list.flows[lfn+1].symbols[sn].num !== 1) {
        state.tokens[cn].attrSet('start', list.flows[lfn+1].symbols[sn].num)
      }

      //Set role attribute.
      if(!opt.unsetListRole && !isOlTypes && isParent[1] === 'numbering_bullet') {
        state.tokens[cn].attrSet('role', 'list')
      }

      //Set class attribute.
      if (ptn === -1) {
        let hasOlClass= false
        let j = 0
        while (j < olTypes.length) {
          if (new RegExp(olTypes[j][0]).test(state.tokens[cn].attrGet('type'))) {
            state.tokens[cn].attrSet('class', 'ol-' + olTypes[j][1])
            hasOlClass = true
            break
          }
          j++
        }
        if (!hasOlClass) {
          state.tokens[cn].attrSet('class', 'ol-decimal')
        }
      }

      if (list.flows[lfn+1].symbols[sn] !== undefined) {
        let prefixName = ''
        let suffixName = ''
        if (list.flows[lfn+1].symbols[sn].prefix) {
          let j = 0
          while (j < prefixs.length) {
            if (new RegExp('\\' + prefixs[j][0]).test(list.flows[lfn+1].symbols[sn].prefix)) {
              prefixName = '-' + prefixs[j][1]
              break
            }
            j++
          }
        }
        if (list.flows[lfn+1].symbols[sn].suffix) {
          let j = 0
          while (j < prefixs.length) {
            if (new RegExp('\\' + suffixs[j][0]).test(list.flows[lfn+1].symbols[sn].suffix)) {
            suffixName = '-' + suffixs[j][1]
              break
            }
            j++
          }
        }
        if(prefixName !== '' || suffixName !== '') {
          if (prefixName === '') { prefixName = '-none'; }
          if (suffixName === '') { suffixName = '-none'; }
          state.tokens[cn].attrSet('class', 'ol-' + types[list.flows[lfn+1].symbols[sn].typesNum].name + '-with' + prefixName + suffixName)
        } else {
          state.tokens[cn].attrSet('class', 'ol-' + types[list.flows[lfn+1].symbols[sn].typesNum].name)
        }
      }
    }

    // list.flows[lfn].symbols.length > 0 for bullet list.
    if (list.flows[lfn].type === 'list_item_open' && list.flows[lfn].symbols.length) {
      const plfn = getParentNum(list, lfn)
      //console.log('plfn: ' + plfn + ', list.flows[pn]: ' + JSON.stringify(list.flows[plfn]))
      if (list.flows[plfn].type === 'bullet_list_open') {
        lfn++; continue
      }
      const sn = getSymbolsNum(list, lfn, plfn)
      //console.log('sn: ' + sn)
      //console.log('symbols.num: ' + +list.flows[lfn].symbols[sn].num)

      //Set value attribute.
      const psn = getSymbolsNum(list, lfn - 1, plfn)

      let blfn = lfn - 1
      while (blfn) {
        //console.log('level[lfn]: ' + list.flows[lfn].level + ', level[blfn]: ' + list.flows[blfn].level)
        if (list.flows[blfn].type === 'list_item_open' && list.flows[lfn].level === list.flows[blfn].level) {
          //console.log(list.flows[blfn].symbols[psn].num +  list.flows[lfn].symbols[sn].num)
          if (+list.flows[blfn].symbols[psn].num + 1 !== +list.flows[lfn].symbols[sn].num && !list.flows[plfn].olTypes1All1) {
            state.tokens[cn].attrSet('value', list.flows[lfn].symbols[sn].num)
          }
          break
        }
        blfn--
      }

      //Set list num span element.
      if (opt.describeListNumber) {
        const listNumBeforeToken = new state.Token('text', '', 0)
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
        listNumContToken.content = list.flows[lfn].symbols[sn].cont
        const listNumCloseToken = new state.Token('span_close', 'span', -1)

        const listNumJointOpenToken = new state.Token('span_open', 'span', 1)
        listNumJointOpenToken.attrSet('class', 'li-num-joint')
        const listNumJointContToken = new state.Token('text', '', 0)
        listNumJointContToken.content = list.flows[lfn].symbols[sn].joint.replace(/ *$/, '')
        const listNumJointCloseToken = new state.Token('span_close', 'span', -1)

        let otn = 0
        let isOlTypes = false
        while (otn < olTypes.length) {
          isOlTypes = types[list.flows[lfn].symbols[sn].typesNum].name === olTypes[otn][1] && !list.flows[lfn].symbols[sn].prefix && !list.flows[lfn].symbols[sn].suffix
          if (isOlTypes) break
          otn++
        }
        if (opt.omitTypeNumber && isOlTypes) {
          state.tokens[cn+2].content = state.tokens[cn+2].content.replace(list.flows[lfn].symbols[sn].contAll, '')
          state.tokens[cn+2].children[0].content = state.tokens[cn+2].children[0].content.replace(list.flows[lfn].symbols[sn].contAll, '')
        } else {

          //console.log(state.tokens[cn+2])
          if (list.flows[lfn].symbols[sn].typesNum !== 0 || list.flows[lfn].symbols[sn].prefix || list.flows[lfn].symbols[sn].suffix) {
          //console.log(state.tokens[cn+2])

            state.tokens[cn+2].content = state.tokens[cn+2].content.replace(list.flows[lfn].symbols[sn].contAll, ' ')
            state.tokens[cn+2].children[0].content = state.tokens[cn+2].children[0].content.replace(list.flows[lfn].symbols[sn].contAll, ' ')

            //console.log(list.flows[lfn].symbols[sn])
            if (/\. */.test(list.flows[lfn].symbols[sn].joint)) {
              if (/\)/.test(list.flows[lfn].symbols[sn].suffix)) {
                state.tokens[cn+2].children.splice(0, 0, listNumOpenToken, listNumContToken, listNumCloseToken)
              } else {
                state.tokens[cn+2].children.splice(0, 0, listNumOpenToken, listNumContToken, listNumJointOpenToken, listNumJointContToken,listNumJointCloseToken, listNumCloseToken)
              }
            } else {
              state.tokens[cn+2].children.splice(0, 0, listNumOpenToken, listNumContToken, listNumCloseToken)
            }
          }
        }

      } else {
        //set aria-label attribute and modify content.
        if (list.flows[lfn].symbols[sn].typesNum !== 0 || list.flows[lfn].symbols[sn].prefix || list.flows[lfn].symbols[sn].suffix) {
          state.tokens[cn].attrSet('aria-label', list.flows[lfn].symbols[sn].cont)
        }
        state.tokens[cn+2].content = state.tokens[cn+2].content.replace(list.flows[lfn].symbols[sn].contAll, '')
        state.tokens[cn+2].children[0].content = state.tokens[cn+2].children[0].content.replace(list.flows[lfn].symbols[sn].contAll, '')
      }
    }
    lfn++
  }
  return
}

const numUl = (state, opt) => {
  let n = 0
  //console.log(state.tokens)
  while (n < state.tokens.length) {
    const token = state.tokens[n]
    const isListOpen = /(bullet|ordered)_list_open/.test(token.type)
    if (!isListOpen) { n++; continue; }
    let list = {
      level: 1,
      flows: [],
      nextPos: n + 1,
    }
    createListToken(state, n, list)
    //console.log(list.flows)
    setNumbers(state, list, opt)
    n = list.nextPos
  }
  return true
}

const mditNumberingUlRegardedAsOl = (md, option) => {
  let opt = {
    //noChangeBulletOneOrderedList: true,
    unsetListRole: true,
    describeListNumber: true,
    omitTypeNumber: true,
    desdribelistNumterTitle: false,
    listNumberTitleLang: 'en',
  }
  if (option !== undefined) {
    for (let o in option) {
        opt[o] = option[o]
    }
  }
  md.core.ruler.after('linkify', 'numbering_ul', state => numUl(state, opt))
}

export default mditNumberingUlRegardedAsOl
