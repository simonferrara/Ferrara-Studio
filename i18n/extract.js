// Lists every translatable string in index.html (text nodes + attributes) → i18n/strings.json
const path=require('path'),fs=require('fs');
const {chromium}=require(process.env.PW);
(async()=>{const b=await chromium.launch();const p=await b.newPage();
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const out=await p.evaluate(html=>{const d=new DOMParser().parseFromString(html,'text/html');const s=new Set();
 const w=d.createTreeWalker(d.documentElement,NodeFilter.SHOW_TEXT);let n;
 while(n=w.nextNode()){const pe=n.parentElement;if(!pe||/^(SCRIPT|STYLE)$/.test(pe.tagName))continue;const t=n.nodeValue.replace(/\s+/g,' ').trim();if(t&&/[A-Za-z]{2}/.test(t))s.add(t);}
 d.querySelectorAll('[aria-label],[placeholder],[data-package],meta[name=description],meta[property^="og:"],title').forEach(e=>{for(const a of ['aria-label','placeholder','data-package'])if(e.getAttribute(a))s.add(e.getAttribute(a));if(e.tagName==='META'&&/description|og:title|og:description/.test(e.getAttribute('name')||e.getAttribute('property')))s.add(e.content);});
 return [...s];},html);
fs.writeFileSync(path.join(__dirname,'strings.json'),JSON.stringify(out,null,1));console.log(out.length,'strings');await b.close();})();
