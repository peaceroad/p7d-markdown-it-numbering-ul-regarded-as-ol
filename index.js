'use strict';

module.exports = function numbering_ul_regarded_as_ol_plugin(md, option) {

  let opt = {
    //noChangeBulletOneOrderedList: true,
    unsetListRole: true,
    describeListNumber: true,
    omitTypeNumber: true,
    desdribelistNumterTitle: false,
    listNumberTitleLang: 'en',

  };
  if (option !== undefined) {
    for (let o in option) {
        opt[o] = option[o];
    }
  }

  const types = require('./listTypes.json');
  const olTypes = [
    ['1', 'decimal'],
    ['a', 'lower-latin'], ['A', 'upper-latin'],
    ['i', 'lower-roman'], ['I', 'upper-roman'],
  ];
  const prefixs = [
    ['(', 'round'], //parenthesis(parentheses), round bracket
    ['[', 'square'], //square bracket
    ['{', 'curly'], //curly bracket
    ['<', 'angle'], //angle bracket
  ];
  const suffixs = [
    [')', 'round'],
    [']', 'square'],
    ['}', 'curly'],
    ['>', 'angle'],
  ];

  function getSymbols(state, cn) {
    let symbols = [];
    const inlineToken = state.tokens[cn+2];
    let ltn = 0;
    while (ltn < types.length) {
      let sn = 0;
      const symbol = {
        typesNum: -1,
        typePos: -1,
        contAll: '',
        cont: '',
        prefix: '',
        suffix: '',
        joint: '',
        num: null,
      }
      let hasSymbol = null;
      while (sn < types[ltn].symbols.length) {
        hasSymbol = inlineToken.content.match(new RegExp('^'+ '((' + types[ltn].prefix + ')' + types[ltn].symbols[sn] + '(' + types[ltn].suffix + ')(' + types[ltn].joint + '))([ 　])+'));
        if (!hasSymbol) { sn++; continue; }

        symbol.typesNum = ltn;
        symbol.contAll = hasSymbol[0];
        symbol.cont = hasSymbol[1].replace(new RegExp('(' + types[ltn].joint + ')'), '');
        symbol.prefix = hasSymbol[2];
        symbol.suffix = hasSymbol[3].replace(new RegExp('(' + types[ltn].joint + ')'), '');
        symbol.joint = hasSymbol[4].replace(/^[ 　]+$/, '');
        symbol.typePos = sn;
        symbol.num = sn + types[ltn].start;
        symbols.push(symbol);
        break;
      }
      ltn++;
    }
    //console.log('symbols: ' + JSON.stringify(symbols));
    return symbols;
  }

  function processListToken (state, n, list) {
    list.level++;
    const flow = {
      level: -1,
      type: '',
      pos: -1,
      attrs: [],
      psTypes: [], //psymbol symbol types.
      symbols: [],
    };
    const startFlow = Object.create(flow);
    startFlow.type = state.tokens[n].type;
    startFlow.pos = n;
    startFlow.level = list.level;
    list.flows.push(startFlow);

    let cn = list.nextPos;
    while (cn < state.tokens.length) {
      const cnToken = state.tokens[cn];
      //console.log('cn: ' + cn + ', list.level: ' + list.level + ', cnToken.type: ', cnToken.type, ', cnToken.content: ' + cnToken.content);

      const isCnListOpen = cnToken.type.match(/(bullet|ordered)_list_open/);
      const isCnListClose = cnToken.type.match(/(bullet|ordered)_list_close/);

      if (isCnListClose) {
        let stcn = list.flows.length - 1;
        while (stcn > -1) {
          //console.log('stcn: ' + stcn + ', list.flows[stcn].type: ' + list.flows[stcn].type);
          list.nextPos = cn + 1;
          if(list.flows[stcn].type.match(/(bullet|ordered)_list_open/) && list.level === list.flows[stcn].level) {
            break;
          }
          stcn--;
        }

        if (/numbering_(?:bullet|ordered)_list_open/.test(list.flows[stcn].type)) {
          isCnListClose[0] = 'numbering_' + isCnListClose[0];
          cnToken.tag = 'ol';
        }
        list.nextPos = cn + 1;
        const closeFlow = Object.create(flow);
        closeFlow.type = isCnListClose[0];
        closeFlow.pos = cn;
        closeFlow.level = list.level;
        list.level--;
        list.flows.push(closeFlow);
        if (list.level === 0) {
          break;
        } else {
          cn++; continue;
        }
      }

      if (isCnListOpen) {
        const nestStartFlow = Object.create(flow);
        nestStartFlow.type = cnToken.type;
        nestStartFlow.pos = cn;
        nestStartFlow.level = list.level + 1;
        list.level++;
        nestStartFlow.psTypes = [];
        list.flows.push(nestStartFlow);
        cn++;
        continue;
      }

      if (cnToken.type !== 'list_item_open') {
        cn++; continue;
      }

      const listFlow = Object.create(flow);
      listFlow.type = 'list_item_open';
      listFlow.pos = cn;
      listFlow.level = list.level;
      listFlow.symbols = getSymbols(state, cn);
      list.flows.push(listFlow);
      //console.log('listFlow:' + JSON.stringify(listFlow));

      //Check parent list flow number.
      let plfn = list.flows.length - 2;
      while (plfn > -1) {
        if (list.flows[plfn].type.match(/(bullet|ordered)_list_open/) && listFlow.level === list.flows[plfn].level) {
          break;
        }
        plfn--; continue;
      }
      //console.log('list.flows[plfn]: ' + JSON.stringify(list.flows[plfn]));

      //Set value attruibute of ordered list in listFlow.
      const parentToken = state.tokens[list.flows[plfn].pos];
      if (parentToken.type === 'ordered_list_open' && listFlow.symbols.length === 0) {
        const liVal = cnToken.info;
        let decimalSymbol = {
          typesNum: 0,
          typePos: liVal, 
          contAll: liVal + '. ',
          cont: liVal,
          prefix: '',
          suffix: '',
          joint: '. ',
          num: liVal,
        };
        list.flows[list.flows.length-1].symbols.push(decimalSymbol);
      }

      list.nextPos = cn + 1;
      if (listFlow.symbols.length === 0) {
        cn++; continue;
      }

      //Set numbering type for parent list.
      if (!/^numbering_/.test(list.flows[plfn].type)) {
        list.flows[plfn].type = 'numbering_' + list.flows[plfn].type;
      }

      //Set possible symbol types.
      let sn = 0;
      while (sn < listFlow.symbols.length) {
        let plt = 0
        let haslistType = false;
        while (plt < list.flows[plfn].psTypes.length) {
          if (list.flows[plfn].psTypes[plt].num === listFlow.symbols[sn].typesNum) {
            list.flows[plfn].psTypes[plt].frequency++;
            haslistType = true;
            break;
          }
          plt++;
        }
        if (list.flows[plfn].psTypes.length === 0 || !haslistType) {
          list.flows[plfn].psTypes.push({
            num: listFlow.symbols[sn].typesNum,
            frequency: 1
          });
        }
        sn++;
      }
      cn++;
    }
    return;
  }

  function getParentTypeNum (list, lfn) {
    let i = 0;
    let ptn = -1;
    while (i < list.flows[lfn].psTypes.length) {
      if (ptn < list.flows[lfn].psTypes[i].frequency) {
        ptn = list.flows[lfn].psTypes[i].num;
      }
      i++;
    }
    return ptn;
  }

  function getParentNum (list, lfn) {
    let plfn = lfn;
    while (plfn > -1) {
      if (/list_open$/.test(list.flows[plfn].type) && list.flows[lfn].level === list.flows[plfn].level) {
        break;
      }
      plfn--;
    }
    return plfn;
  }

  function getSymbolsNum(list, lfn, plfn) {
    let sn = 0;
    //console.log('list.flows[plfn].typesNum: ' + list.flows[plfn].typesNum);
    while (sn < list.flows[lfn].symbols.length) {
      if (+list.flows[lfn].symbols[sn].typesNum === +list.flows[plfn].typesNum) {
        //console.log(sn, list.flows[plfn].typesNum);
        break;
      }
      sn++;
    }
    return sn;
  }

  function setOlTypes1All1(list, lfn, sn) {
    let olTypes1All1 = true;
    if (list.flows[lfn].typesNum !== 0) {
      return olTypes1All1 = false;
    }
    let n = 0;
    //console.log(list.flows)
    while (n < list.flows.length) {
      if (list.flows[n].type === 'list_item_open') {
        //console.log(list.flows[n].symbols)
        if (list.flows[lfn].level !== list.flows[n].level) {
          n++; continue;
        }
        if (+list.flows[n].symbols[sn].cont !== 1) {
          olTypes1All1 = false;
          break;
        }
      }
      n++
    }
    return olTypes1All1
  }


  function setNumbers(state, list) {
    let lfn = 0;
    while (lfn < list.flows.length) {
      //console.log('list.flows[' + lfn + ']: '+ JSON.stringify(list.flows[lfn]));
      const cn = list.flows[lfn].pos;
      const isParent = list.flows[lfn].type.match(/(numbering_bullet|ordered)_list_open/);
      if (isParent) {
        if (isParent[1] === 'numbering_bullet') {
          state.tokens[cn].type = 'ordered_list_open';
          state.tokens[cn].tag = 'ol';
        }

        const ptn = getParentTypeNum(list, lfn);
        list.flows[lfn].typesNum = ptn;
        const sn = getSymbolsNum(list, lfn+1, lfn);
        const olTypes1All1 = setOlTypes1All1(list, lfn, sn);
        list.flows[lfn].olTypes1All1 = olTypes1All1
        //console.log(olTypes1All1)
        //Set type and role attribute.
        let isOlTypes = false;
        let isOlTypes1 = false;
        let otn = 0;
        while (otn < olTypes.length) {
          //console.log(types[ptn].name, olTypes[otn][1], olTypes[otn][0]);
          isOlTypes = types[ptn].name === olTypes[otn][1] && !list.flows[lfn+1].symbols[sn].prefix && !list.flows[lfn+1].symbols[sn].suffix;
          isOlTypes1 = isOlTypes && +olTypes[otn][0] === 1;
          if (isOlTypes) {
            if (!isOlTypes1) {
              state.tokens[cn].attrSet('type', olTypes[otn][0]);
            }
            break;
          }
          otn++;
        }

        //Set start attribute.
        if (+list.flows[lfn+1].symbols[sn].num !== 1) {
          state.tokens[cn].attrSet('start', list.flows[lfn+1].symbols[sn].num);
        }

        //Set role attribute.
        if(!opt.unsetListRole && !isOlTypes && isParent[1] === 'numbering_bullet') {
          state.tokens[cn].attrSet('role', 'list');
        }

        //Set class attribute.
        if (ptn === -1) {
          let hasOlClass= false;
          let j = 0;
          while (j < olTypes.length) {
            if (new RegExp(olTypes[j][0]).test(state.tokens[cn].attrGet('type'))) {
              state.tokens[cn].attrSet('class', 'ol-' + olTypes[j][1]);
              hasOlClass = true;
              break;
            }
            j++;
          }
          if (!hasOlClass) {
            state.tokens[cn].attrSet('class', 'ol-decimal');
          }
        }

        if (list.flows[lfn+1].symbols[sn] !== undefined) {
          let prefixName = '';
          let suffixName = '';
          if (list.flows[lfn+1].symbols[sn].prefix) {
            let j = 0;
              while (j < prefixs.length) {
              if (new RegExp('\\' + prefixs[j][0]).test(list.flows[lfn+1].symbols[sn].prefix)) {
                prefixName = '-' + prefixs[j][1];
                break;
              }
              j++;
            }
          }
          if (list.flows[lfn+1].symbols[sn].suffix) {
            let j = 0;
            while (j < prefixs.length) {
              if (new RegExp('\\' + suffixs[j][0]).test(list.flows[lfn+1].symbols[sn].suffix)) {
              suffixName = '-' + suffixs[j][1];
                break;
              }
              j++;
            }
          }
          if(prefixName !== '' || suffixName !== '') {
            if (prefixName === '') { prefixName = '-none'; }
            if (suffixName === '') { suffixName = '-none'; }
            state.tokens[cn].attrSet('class', 'ol-' + types[list.flows[lfn+1].symbols[sn].typesNum].name + '-with' + prefixName + suffixName);
          } else {
            state.tokens[cn].attrSet('class', 'ol-' + types[list.flows[lfn+1].symbols[sn].typesNum].name);
          }
        }
      }

      // list.flows[lfn].symbols.length > 0 for bullet list.
      if (list.flows[lfn].type === 'list_item_open' && list.flows[lfn].symbols.length) {
        const plfn = getParentNum(list, lfn);
        //console.log('plfn: ' + plfn + ', list.flows[pn]: ' + JSON.stringify(list.flows[plfn]));
        const sn = getSymbolsNum(list, lfn, plfn);
        //console.log('sn: ' + sn);
        //console.log('symbols.num: ' + +list.flows[lfn].symbols[sn].num);

        //Set value attribute.
        if (list.flows[lfn -1].type === 'list_item_open') {
          const psn = getSymbolsNum(list, lfn - 1, plfn);
          if (+list.flows[lfn -1].symbols[psn].num + 1 !== +list.flows[lfn].symbols[sn].num && !list.flows[plfn].olTypes1All1) {
            state.tokens[cn].attrSet('value', list.flows[lfn].symbols[sn].num);
          }
        }

        //Set list num span element.
        if (opt.describeListNumber) {
          const listNumBeforeToken = new state.Token('text', '', 0);
          const listNumOpenToken = new state.Token('span_open', 'span', 1);
          listNumOpenToken.attrSet('class', 'li-num');
          if (opt.desdribelistNumterTitle) {
            let listNumTitle = 'List number';
            if (opt.listNumberTitleLang === 'ja') {
              listNumTitle = '項目番号';
            }
            listNumOpenToken.attrSet('title', listNumTitle);
          }
          const listNumContToken = new state.Token('text', '', 0);
          listNumContToken.content = list.flows[lfn].symbols[sn].cont;
          const listNumCloseToken = new state.Token('span_close', 'span', -1);

          const listNumJointOpenToken = new state.Token('span_open', 'span', 1);
          listNumJointOpenToken.attrSet('class', 'li-num-joint');
          const listNumJointContToken = new state.Token('text', '', 0);
          listNumJointContToken.content = list.flows[lfn].symbols[sn].joint.replace(/ *$/, '');
          const listNumJointCloseToken = new state.Token('span_close', 'span', -1);


          let otn = 0;
          let isOlTypes = false;
          while (otn < olTypes.length) {
            isOlTypes = types[list.flows[lfn].symbols[sn].typesNum].name === olTypes[otn][1] && !list.flows[lfn].symbols[sn].prefix && !list.flows[lfn].symbols[sn].suffix;
            if (isOlTypes) break;
            otn++;
          }
          if (opt.omitTypeNumber && isOlTypes) {
            state.tokens[cn+2].content = state.tokens[cn+2].content.replace(list.flows[lfn].symbols[sn].contAll, '');
            state.tokens[cn+2].children[0].content = state.tokens[cn+2].children[0].content.replace(list.flows[lfn].symbols[sn].contAll, '');
          } else {

            //console.log(state.tokens[cn+2]);
            if (list.flows[lfn].symbols[sn].typesNum !== 0 || list.flows[lfn].symbols[sn].prefix || list.flows[lfn].symbols[sn].suffix) {
            //console.log(state.tokens[cn+2]);

              state.tokens[cn+2].content = state.tokens[cn+2].content.replace(list.flows[lfn].symbols[sn].contAll, ' ');
              state.tokens[cn+2].children[0].content = state.tokens[cn+2].children[0].content.replace(list.flows[lfn].symbols[sn].contAll, ' ');

              //console.log(list.flows[lfn].symbols[sn])
              if (/\. */.test(list.flows[lfn].symbols[sn].joint)) {
                if (/\)/.test(list.flows[lfn].symbols[sn].suffix)) {
                  state.tokens[cn+2].children.splice(0, 0, listNumOpenToken, listNumContToken, listNumCloseToken);
                } else {
                state.tokens[cn+2].children.splice(0, 0, listNumOpenToken, listNumContToken, listNumJointOpenToken, listNumJointContToken,listNumJointCloseToken, listNumCloseToken);
               }
              } else {
                state.tokens[cn+2].children.splice(0, 0, listNumOpenToken, listNumContToken, listNumCloseToken);
              }
            }
          }

//          console.log('state.tokens[cn+2].content: ' + state.tokens[cn+2].content);
          //state.tokens[cn+2].content = state.tokens[cn+2].content.replace(list.flows[lfn].symbols[sn].contAll, '');
          //console.log(list.flows[lfn].symbols[sn]);
//          console.log('state.tokens[cn+2].content: ' + state.tokens[cn+2].content);
  //        state.tokens[cn+2].children[0].content = '';//;

          //const listContToken = new state.Token('text', '', 0);
          //listContToken.content = state.tokens[cn+2].children[0].content.replace(list.flows[lfn].symbols[sn].contAll, '');
          //console.log('check: ' + state.tokens[cn+2].children[0].content.replace(list.flows[lfn].symbols[sn].contAll, ''));
          //state.tokens[cn+2].children.splice(0, 0, listContToken);

        } else {
          //set aria-label attribute and modify content.
          if (list.flows[lfn].symbols[sn].typesNum !== 0 || list.flows[lfn].symbols[sn].prefix || list.flows[lfn].symbols[sn].suffix) {
            state.tokens[cn].attrSet('aria-label', list.flows[lfn].symbols[sn].cont);
          }
          state.tokens[cn+2].content = state.tokens[cn+2].content.replace(list.flows[lfn].symbols[sn].contAll, '');
          state.tokens[cn+2].children[0].content = state.tokens[cn+2].children[0].content.replace(list.flows[lfn].symbols[sn].contAll, '');
  
        }
      }
      lfn++;
    }
    return;
  }

  function numUl (state) {
    let n = 0;
    //console.log(state.tokens);
    while (n < state.tokens.length) {
      const token = state.tokens[n];
      const isListOpen = token.type.match(/(bullet|ordered)_list_open/);
      if (!isListOpen) { n++; continue; }

      let list = {
        level: 0,
        flows: [],
        nextPos: n + 1,
      };
      processListToken(state, n, list);
      //console.log('list: ' + JSON.stringify(list));

      /*
      if(!opt.noChangeBulletOneOrderedList) {
        modifyBulletOneOrderedList(state, n, list);
      }
      */
      setNumbers(state, list);
      n = list.nextPos;
    }
    return;
  }
  
  md.core.ruler.after('linkify', 'numbering_ul', numUl);
};
