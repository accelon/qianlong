import {nodefs, alphabetically, filesFromPattern, readTextContent, entity2unicode, writeChanged} from './nodebundle.cjs'
await nodefs
// raw/Chiarnlurng_Tripitaka
const rootdir='raw/Ylbz_Tripitaka/'
const outdir='ylbz/';
let files=filesFromPattern('**/*.htm',rootdir); //列出所有文件
const out=[];
let prevjin='';
//files.length=100;
files=files.sort(alphabetically);
const emitjin=()=>{
    writeChanged(outdir+prevjin+'.txt',out.join('\n'),'utf8');
    out.length=0;
}
const removecomment=content=>{
    return content
    .replace(/<script>[\s\S]*?<\/script>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}
const tidy=content=>{
    content=removecomment(content)
    .replace(/&&/g,'')
    .replace(/&frac14;/g,'')
    .replace(/&Aring;/g,'')

    content=entity2unicode(content)
    .replace(/&nbsp;/g,' ')
    .replace(/<br>/g,'\n')
    .replace(/<p .+>/g,'\n^pg\n')
    .replace(/<[\s\S]*?>/g,'')
    .replace(/    回目錄 \| 下一頁  /g,'')
    .replace(/\n+/g,'\n')
    return content;
}
const genbook=fn=>{  //對每個md文件
    const m=fn.match(/([\d\-_]+)\.htm/);
    if (!m) return false;

    const jin0=m[1].match(/^([\d]+)/);
    if (!jin0) {
        console.log(m[1],fn)
    }
    const jin=jin0[1];
    if (prevjin&&jin!==prevjin) {
        emitjin();
    }
    prevjin=jin;
    let content=readTextContent(rootdir+fn); //讀取內容

    out.push('^f'+m[1]);
    out.push(tidy(content));
}

files.forEach(genbook)
emitjin();