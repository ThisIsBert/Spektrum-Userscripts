// Run: npm install --no-save jsdom && node tests/autorenansicht-dom.cjs
// Offline DOM integration test. Does not claim visual or browser compatibility coverage.
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../spektrum-autorenansicht.user.js'),'utf8');
let errors=[],captured;
function open(html) {
 const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
 return new JSDOM(html,{url:'file:///test/article.html',runScripts:'dangerously',virtualConsole:console,beforeParse(w){
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLAnchorElement.prototype.click=function(){};
  w.URL.createObjectURL=b=>{captured=b;return 'blob:test'};w.URL.revokeObjectURL=()=>{};
  w.print=()=>{w.printCalled=true};
  w.confirm=()=>true;
 }});
}
(async()=>{
 let env=open('<html><body></body></html>');
 env.window.eval(source.replace("    if (!document.querySelector('#main article.content'))", "    window.api={buildExportHtml,preparePortableContent,portableCss,convertGalleries};\n    if (!document.querySelector('#main article.content'))"));
 const w=env.window,d=w.document;
 w.GM_xmlhttpRequest=opts=>opts.onload({status:200,response:new w.Blob(['image'],{type:'image/png'})});
 const article=d.createElement('article');article.className='content';
 article.innerHTML='<h1>Ein Testartikel</h1><p id="first">Alpha <strong>Beta Gamma</strong> Delta. Gleiches Wort.</p><p id="second">Gleiches Wort. Ende.</p><figure><img src="https://static.spektrum.de/test.png"><figcaption>Eine Bildunterschrift.</figcaption></figure><section class="sdw-author-gallery"><div class="sdw-author-gallery__viewport"><div class="sdw-author-gallery__slide"><p>Erstes Galeriebild</p></div><div class="sdw-author-gallery__slide" hidden><p>Zweites Galeriebild</p></div></div><div class="sdw-author-gallery__controls"><button data-gallery-prev>Zurück</button><span class="sdw-author-gallery__counter">1 / 2</span><button data-gallery-next>Weiter</button></div></section><iframe src="https://example.com/chart"></iframe><a href="javascript:alert(1)" onclick="alert(1)">Unsicher</a>';
 await w.api.preparePortableContent(article,true,new Map(),()=>{});
 assert.match(article.querySelector('img').src,/^data:image\/png/);
 assert.equal(article.querySelector('iframe,[onclick],[href^="javascript:"]'),null);
 const remote=d.createElement('div');remote.innerHTML='<img src="https://static.spektrum.de/test.png">';
 await w.api.preparePortableContent(remote,false,new Map(),()=>{});assert.match(remote.querySelector('img').src,/^https:/);
 const css=await w.api.portableCss('@import "https://example.com/a.css"; @font-face{src:url("https://example.com/font.woff2")} p{background:url("https://static.spektrum.de/test.png")}',true,new Map());
 assert(!css.includes('https:'));assert(css.includes('data:image/png'));
 w.GM_xmlhttpRequest=opts=>opts.onerror();
 const failed=d.createElement('div');failed.innerHTML='<img src="https://static.spektrum.de/fail.png">';
 await assert.rejects(w.api.preparePortableContent(failed,true,new Map(),()=>{}),/nicht geladen/);
 const html=w.api.buildExportHtml({article,title:'Testartikel',logo:'Spektrum',originalCss:'',embeddedFontCss:'',embedImages:true});
 env.window.close();env=open(html);
 let doc=()=>env.window.document;
 const click=s=>doc().querySelector(s).click();
 function select(selector,start,end){const root=doc().querySelector(selector),walk=doc().createTreeWalker(root,4);let n,pos=0,a,b;while(n=walk.nextNode()){if(!a&&start<=pos+n.length)a=[n,start-pos];if(end<=pos+n.length){b=[n,end-pos];break;}pos+=n.length;}const r=doc().createRange();r.setStart(...a);r.setEnd(...b);const sel=env.window.getSelection();sel.removeAllRanges();sel.addRange(r);}
 function comment(selector,start,end,text){select(selector,start,end);click('#sdw-review-add');doc().querySelector('#sdw-review-name').value='Jan';doc().querySelector('#sdw-review-message').value=text;click('#sdw-review-submit');}
 comment('#first',0,16,'Mehrere Textknoten. </script><script>window.evil=true</script>');
 comment('#first',6,21,'Überlappende Markierung');comment('#second',0,13,'Zweites Vorkommen');
 assert.equal(doc().querySelectorAll('.sdw-review-card').length,3);
 assert(doc().querySelector('mark[data-sdw-comments*=" "]'));
 click('.sdw-review-card .sdw-review-actions button:last-child');doc().querySelector('#sdw-review-message').value='Eine Antwort';click('#sdw-review-submit');
 click('[data-gallery-next]');comment('.sdw-author-gallery__slide:nth-child(2) p',0,7,'Galeriekommentar');click('[data-gallery-next]');click('.sdw-review-card:last-child .sdw-review-actions button');
 assert.equal(doc().querySelector('.sdw-author-gallery__slide:nth-child(2)').hidden,false);
 click('[data-gallery-next]');assert.equal(doc().querySelector('.sdw-author-gallery__slide').hidden,false);
 select('#first',0,5);click('#sdw-review-add');doc().querySelector('#sdw-review-message').value='Entwurf';captured=null;click('#sdw-review-save');assert.equal(captured,null);assert.match(doc().querySelector('#sdw-review-status').textContent,/Entwurf/);click('#sdw-review-cancel');
 for(let cycle=0;cycle<2;cycle++){
  click('#sdw-review-save');assert(captured);
  const saved=await new Promise(resolve=>{const reader=new env.window.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(captured)});
  env.window.close();env=open(saved);
  assert.equal(doc().querySelectorAll('.sdw-review-card').length,4);
  assert.equal(doc().querySelectorAll('.sdw-review-reply').length,1);
  assert.equal(env.window.evil,undefined);
  assert.equal(doc().querySelector('#second mark').textContent,'Gleiches Wort');
  assert.equal(doc().querySelector('[src^="http"],link[rel="stylesheet"]'),null);
 }
 click('#sdw-review-pdf');assert.equal(env.window.printCalled,true);
 assert.match(doc().querySelector('meta[http-equiv="Content-Security-Policy"]').content,/default-src 'none'/);
 assert.match(doc().querySelector('style').textContent,/\.sdw-author-gallery__slide\[hidden\] \{display:block!important;\}/);
 // Shift all positions and reconstruct from quoted text/context.
 const state=JSON.parse(doc().querySelector('#sdw-review-data').textContent);
 const second=state.comments[2];second.anchor.start+=100;second.anchor.end+=100;
 doc().querySelector('#sdw-review-data').textContent=JSON.stringify(state).replace(/</g,'\\u003c');
 const shifted=doc().documentElement.outerHTML;env.window.close();env=open(shifted);
 assert.equal(doc().querySelector('#second mark').textContent,'Gleiches Wort');
 assert.deepEqual(errors,[]);
 env.window.close();
 console.log('PASS: optional image embedding and failure handling, CSS resources, sanitization, overlapping/cross-node/repeated anchors, quote-context fallback, replies, gallery navigation, draft protection, two save/reopen cycles, safe serialization and PDF button.');
})().catch(e=>{console.error(e);process.exit(1)});
