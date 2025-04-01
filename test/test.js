import assert from 'assert'
import fs from 'fs'
import path from 'path'
import mdit from 'markdown-it'
import mdNumUl from '../index.js'

const md = mdit().use(mdNumUl, {
  describeListNumber: false,
  unsetListRole: false,
});


const md2 = mdit().use(mdNumUl, {
  omitTypeNumber: false,
});

const md3 = mdit().use(mdNumUl);

let __dirname = path.dirname(new URL(import.meta.url).pathname)
const isWindows = (process.platform === 'win32')
if (isWindows) {
  __dirname = __dirname.replace(/^\/+/, '').replace(/\//g, '\\')
}

let example = __dirname + '/examples.txt';


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

let pass = true

setMs(example, ms);
let n = 1;
while(n < ms.length) {
  //if (n !== 18) { n++; continue };
  console.log('Test: ' + n + ' >>>');
  //console.log(ms[n].markdown);

  const m = ms[n].markdown;
  const h = md.render(m);
  try {
    assert.strictEqual(h, ms[n].html);
  } catch(e) {
    pass = false
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
    pass = false
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
    pass = false
    console.log('incorrect: ');
    console.log('H: ' + h +'C: ' + ms[n].html);
  };
  n++;
}

if (pass) console.log('\nAll tests passed.')
