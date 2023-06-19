const assert = require('assert');
const fs = require('fs');
const md = require('markdown-it')();
const mdNumUl = require('../index.js');

md.use(mdNumUl, {
  describeListNumber: false,
  unsetListRole: false,
});

const md2 = require('markdown-it')();
md2.use(mdNumUl, {
  omitTypeNumber: false,
});

const md3 = require('markdown-it')();
md3.use(mdNumUl);

let example = __dirname + '/examples.txt';
let mdPath = __dirname + '/examples.md';

let ms = [];
const setMs = (example, ms) => {
  let exampleCont = fs.readFileSync(example, 'utf-8').trim();
  let ms0 = exampleCont.split(/\n*\[Markdown\]\n/);
  let n = 1;
  while (n < ms0.length) {
    let mhs = ms0[n].split(/\n+\[HTML[^\]]*?\]\n/);
    let i = 1;
    while (i < 2) {
      if (mhs[i] === undefined) {
        mhs[i] = '';
      } else {
        mhs[i] = mhs[i].replace(/$/,'\n');
      }
      i++;
    }
    ms[n] = {
      "markdown": mhs[0],
      "html": mhs[1],
    };
    n++;
  }
  return;
};

setMs(example, ms);
let n = 1;
while(n < ms.length) {
//  if (n !== 17) { n++; continue };
  console.log('Test: ' + n + ' >>>');
  //console.log(ms[n].markdown);

  const m = ms[n].markdown;
  const h = md.render(m);
  try {
    assert.strictEqual(h, ms[n].html);
  } catch(e) {
    console.log('incorrect: ');
    console.log('H: ' + h +'C: ' + ms[n].html);
  };
  n++;
}

example = __dirname + '/examples-spantitle.txt';
ms = [];
setMs(example, ms);

n = 1;
while(n < ms.length) {
  //if (n !== ms.length -1) { n++; continue };
  //if (n !== 11) { n++; continue };
  console.log('Test: ' + n + ' >>>');
  //console.log(ms[n].markdown);

  const m = ms[n].markdown;
  const h = md2.render(m);
  try {
    assert.strictEqual(h, ms[n].html);
  } catch(e) {
    console.log('incorrect: ');
    console.log('H: ' + h +'C: ' + ms[n].html);
  };
  n++;
}

example = __dirname + '/examples-spantitle-omit-typeNumber.txt';
ms = [];
setMs(example, ms);

n = 1;
while(n < ms.length) {
  //if (n >= 5) { n++; continue };
  console.log('Test: ' + n + ' >>>');
  //console.log(ms[n].markdown);

  const m = ms[n].markdown;
  const h = md3.render(m);
  try {
    assert.strictEqual(h, ms[n].html);
  } catch(e) {
    console.log('incorrect: ');
    console.log('H: ' + h +'C: ' + ms[n].html);
  };
  n++;
}
