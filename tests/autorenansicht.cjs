// Run: NODE_PATH=".../node_modules" node tests/autorenansicht.cjs
// Requires Playwright and its Chromium browser. No CMS access or network needed.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../spektrum-autorenansicht.user.js'), 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdw-review-'));
(async () => {
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true});
 const errors=[]; page.on('pageerror', e=>errors.push(e.message));
 await page.setContent('<html><body></body></html>');
 await page.addScriptTag({content:source.replace("    if (!document.querySelector('#main article.content'))", "    window.testAPI = {buildExportHtml, preparePortableContent, portableCss, convertGalleries};\n    if (!document.querySelector('#main article.content'))")});
 const html = await page.evaluate(async ()=>{
   const article=document.createElement('article'); article.className='content';
   article.innerHTML='<h1>Ein Testartikel</h1><p id="first">Alpha <strong>Beta Gamma</strong> Delta. Gleiches Wort.</p><p id="second">Gleiches Wort. Ende.</p><figure><img src="https://static.spektrum.de/test.png"><figcaption>Eine Bildunterschrift.</figcaption></figure><section class="sdw-author-gallery"><div class="sdw-author-gallery__viewport"><div class="sdw-author-gallery__slide"><p>Erstes Galeriebild</p></div><div class="sdw-author-gallery__slide" hidden><p>Zweites Galeriebild</p></div></div><div class="sdw-author-gallery__controls"><button data-gallery-prev>Zurück</button><span class="sdw-author-gallery__counter">1 / 2</span><button data-gallery-next>Weiter</button></div></section><iframe src="https://example.com/chart"></iframe><a href="javascript:alert(1)" onclick="alert(1)">Unsicher</a>';
   window.GM_xmlhttpRequest=opts=>opts.onload({status:200,response:new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII='),c=>c.charCodeAt(0))],{type:'image/png'})});
   await testAPI.preparePortableContent(article,true,new Map(),()=>{});
   if(!article.querySelector('img').src.startsWith('data:image/png')) throw new Error('Image not embedded');
   if(article.querySelector('iframe,[onclick],[href^="javascript:"]')) throw new Error('Unsafe content survived');
   const remote = document.createElement('div');remote.innerHTML='<img src="https://static.spektrum.de/test.png">';
   await testAPI.preparePortableContent(remote,false,new Map(),()=>{});
   if(!remote.querySelector('img').src.startsWith('https:')) throw new Error('Unchecked image option ignored');
   return testAPI.buildExportHtml({article,title:'Ein Testartikel',logo:'Spektrum',originalCss:'article{max-width:850px;margin:40px auto;font:20px/1.5 Arial}img{width:100px;height:80px}',embeddedFontCss:'',embedImages:true});
 });
 fs.writeFileSync(path.join(dir,'original.html'),html);
 let requests=[];
 await page.route(/^https?:/,route=>{requests.push(route.request().url());route.abort();});
 await page.goto('file://'+path.join(dir,'original.html'));
 async function select(selector, start, end) {
  await page.evaluate(({selector,start,end})=>{const root=document.querySelector(selector),walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n,pos=0,a,b;while(n=walk.nextNode()){if(!a&&start<=pos+n.length)a=[n,start-pos];if(end<=pos+n.length){b=[n,end-pos];break;}pos+=n.length;}const r=document.createRange();r.setStart(...a);r.setEnd(...b);const s=getSelection();s.removeAllRanges();s.addRange(r);},{selector,start,end});
 }
 async function comment(selector,start,end,text) {
   await select(selector,start,end);await page.click('#sdw-review-add');await page.fill('#sdw-review-name','Jan');await page.fill('#sdw-review-message',text);await page.click('#sdw-review-submit');
 }
 await comment('#first',0,16,'Über mehrere Textknoten. <script>window.evil=true</script>');
 await comment('#first',6,21,'Überlappende Markierung');
 await comment('#second',0,13,'Das zweite Vorkommen');
 assert.equal(await page.locator('.sdw-review-card').count(),3);
 assert.ok(await page.locator('mark[data-sdw-comments*=" "]').count()>0);
 await page.locator('.sdw-review-card').first().getByText('Antworten',{exact:true}).click();
 await page.fill('#sdw-review-name','Gegenleser');await page.fill('#sdw-review-message','Eine Antwort');await page.click('#sdw-review-submit');
 await page.click('[data-gallery-next]');
 await comment('.sdw-author-gallery__slide:nth-child(2) p',0,7,'Kommentar in der Galerie');
 await page.click('[data-gallery-next]');
 await page.locator('.sdw-review-card').last().getByText('Textstelle zeigen',{exact:true}).click();
 assert.equal(await page.locator('.sdw-author-gallery__slide:nth-child(2)').isVisible(),true);
 await page.click('[data-gallery-next]');
 assert.equal(await page.locator('.sdw-author-gallery__slide:nth-child(1)').isVisible(),true);
 // Unsubmitted text must not disappear silently on download.
 await select('#first',0,5);await page.click('#sdw-review-add');await page.fill('#sdw-review-message','Entwurf');
 await page.click('#sdw-review-save');assert.match(await page.locator('#sdw-review-status').textContent(),/Entwurf/);
 page.once('dialog',dialog=>dialog.accept());await page.click('#sdw-review-cancel');
 for(let cycle=0;cycle<2;cycle++){
   const downloaded=page.waitForEvent('download');await page.click('#sdw-review-save');const download=await downloaded;
   const filename=path.join(dir,'saved-'+cycle+'.html');await download.saveAs(filename);
   await page.goto('file://'+filename);
   assert.equal(await page.locator('.sdw-review-card').count(),4);
   assert.equal(await page.locator('.sdw-review-reply').count(),1);
   assert.equal(await page.evaluate(()=>window.evil),undefined);
   assert.equal(await page.locator('#second mark').textContent(),'Gleiches Wort');
   assert.ok(await page.locator('mark').count()>0);
 }
 await page.screenshot({path:path.join(dir,'desktop.png'),fullPage:true});
 await page.emulateMedia({media:'print'});
 assert.equal(await page.locator('#sdw-review-toolbar').isVisible(),false);
 assert.equal(await page.locator('.sdw-author-gallery__slide:nth-child(2)').isVisible(),true);
 assert.equal(await page.locator('.sdw-review-card').last().isVisible(),true);
 await page.pdf({path:path.join(dir,'review.pdf'),format:'A4',printBackground:true});
 await page.emulateMedia({media:'screen'});await page.setViewportSize({width:1100,height:900});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 console.log('PASS: offline images, optional remote images, sanitization, cross-node/overlapping/repeated anchors, replies, gallery navigation, draft protection, two save/reopen cycles, print galleries/comments, no network requests or JS errors.');
 console.log('Artifacts: '+dir);
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
