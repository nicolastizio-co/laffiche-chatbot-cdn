const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(require('node:os').homedir(),
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const scripts = ['script.js', 'script.min.js'];
const fixture = `<!doctype html><style>a { color: rgb(220, 10, 64); }</style><div data-ai-search data-ai-search-catalog-url="/chatbot-cartes">
 <button data-ai-search-close>Fermer</button><div data-ai-search-thread>
 <div data-ai-search-template="question"><div data-ai-search-text></div></div>
 <div data-ai-search-template="answer"><div data-ai-search-text></div></div></div>
 <div data-ai-search-suggestions></div><form data-ai-search-form>
 <input data-ai-search-question><button data-ai-search-submit>Envoyer</button></form></div>`;
function catalog(slug, next = '') {
 return `<!doctype html><div data-ai-search-swiper-source hidden><div data-swiper-group>
 <div data-swiper-wrap><div class="swiper-wrapper w-dyn-items">
 <div class="swiper-slide" data-ai-search-webflow-id="id-${slug}" data-ai-search-show-slug="${slug}">
 <a href="/spectacles/${slug}"><img alt="Affiche ${slug}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='250'%3E%3Crect width='180' height='250' fill='%23dc4030'/%3E%3C/svg%3E"><span class="show_title_small">Spectacle ${slug}</span></a></div>
 </div></div><button data-swiper-prev></button><button data-swiper-next></button>
 <div class="swiper-pagination"></div></div>${next ? `<a class="w-pagination-next" href="${next}">Suite</a>` : ''}</div>`;
}
async function setup(browser, script, options = {}) {
 const page = await browser.newPage({ viewport: {width:390,height:844} });
 await page.emulateMedia({ reducedMotion: 'reduce' });
 const gets = []; let failures = options.failures || 0;
 let activeGets = 0, maxActiveGets = 0, releaseCards;
 let responseMode = 'normal', resultSlug = 'a', release;
 await page.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (request.method() === 'OPTIONS') return route.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, GET, OPTIONS','access-control-allow-headers':'content-type'},body:''});
  if (request.isNavigationRequest()) return route.fulfill({contentType:'text/html', body:fixture});
  if (request.resourceType() === 'image') return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="250"><rect width="180" height="250" fill="red"/></svg>'});
  if (request.method() === 'POST') {
   const payload = request.postDataJSON();
   if (responseMode === 'pending') await new Promise(resolve => { release = resolve; });
   return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({response:{
    status:'ok', alternatives:[], conversation_id:payload.conversation_id, answer:options.answer || 'Voici la réponse.',
    results: responseMode === 'empty' ? [] : options.results || [{webflow_id:`id-${resultSlug}`,slug:resultSlug,title:`Spectacle ${resultSlug}`,reason:'Une proposition.'}],
    detail_target: options.target ? {webflow_id:options.target} : undefined,
    criteria:{conversation_mode:responseMode === 'detail' ? 'detail' : 'search'},
   }})});
  }
  gets.push(url.href);
  activeGets++;maxActiveGets=Math.max(maxActiveGets,activeGets);
  if(options.holdCards) await new Promise(resolve=>{releaseCards=resolve});
  if(options.delay) await new Promise(resolve=>setTimeout(resolve,options.outOfOrder && url.searchParams.get('cards_page') === '2' ? options.delay * 4 : options.delay));
  activeGets--;
  if (failures-- > 0) return route.fulfill({status:503,body:'Unavailable'});
  const number = Number(url.searchParams.get('cards_page') || 1);
  const next = options.next ?? (number < (options.pages || 3) ? `?cards_page=${number+1}` : '');
  return route.fulfill({contentType:'text/html',body:catalog(['a','b','c'][number-1] || 'c',next)});
 });
 await page.goto('https://example.test/les-spectacles?search=comedie');
 if (options.defaultUrl) await page.locator('[data-ai-search]').evaluate(el=>el.removeAttribute('data-ai-search-catalog-url'));
 await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..',script),'utf8')});
 async function submit(slug='a', mode='normal', wait=true) {
  resultSlug=slug;responseMode=mode;
  await page.locator('[data-ai-search-question]').fill('Une idée de spectacle');
  await page.locator('form').evaluate(form=>form.requestSubmit());
  if(wait) await page.waitForFunction(()=>document.querySelector('[data-ai-search]').getAttribute('data-ai-search-status')==='success',null,{timeout:10000});
 }
 return {page,gets,submit,release:()=>release?.(),releaseCards:()=>releaseCards?.(),maxActive:()=>maxActiveGets};
}
for(const script of scripts) test(`cartes à la demande : ${script}`,async t=>{
 const browser = await chromium.launch({channel:'chrome',headless:true});
 try {
  await t.test('détail avec affiche directe malgré un catalogue en erreur et lien uniquement sur la première mention',async()=>{
   const h=await setup(browser,script,{failures:20,answer:'The Loop est une comédie. The Loop dure 1 h 20.',target:'id-loop',results:[{
    webflow_id:'id-loop',slug:'the-loop',title:'The Loop',image_url:'https://example.test/poster.webp',
    venue:{name:'Théâtre Saint-Georges'},category:'Comédie',reason:'Les informations du spectacle demandé.',price_from_eur:5,
   }]});
   try {
    await h.submit('loop','detail');
    const response=h.page.locator('[data-ai-search-message="assistant"]').last();
    assert.equal(await response.locator('.swiper-slide').count(),1);
    const poster=response.locator('.swiper-slide img');
    assert.equal(await poster.getAttribute('alt'),'The Loop');
    await poster.evaluate(img=>img.decode());
    const intro=response.locator('[data-ai-search-text]');
    assert.equal(await intro.locator('a').count(),1);
    assert.equal(await intro.locator('a').textContent(),'The Loop');
    assert.equal(await intro.locator('a').evaluate(a=>getComputedStyle(a).color),'rgb(220, 10, 64)');
    assert.deepEqual(await response.locator('.show_detail_icon').evaluateAll(icons=>icons.map(icon=>icon.getAttribute('viewBox'))),['0 0 19 19','0 0 20 20']);
    assert.ok(await response.evaluate(el=>Boolean(el.querySelector('[data-ai-search-card-slot]').compareDocumentPosition(el.querySelector('[data-ai-search-text]')) & Node.DOCUMENT_POSITION_FOLLOWING)));
    assert.equal(await intro.locator('a').getAttribute('href'),'/spectacles/the-loop?utm_source=chatbot');
    assert.equal(await intro.textContent(),'The Loop est une comédie. The Loop dure 1 h 20.');
    assert.equal(await response.locator('[data-ai-search-missing-cards], [data-ai-search-reasons]').count(),0);
    assert.ok(!(await response.textContent()).includes('Les informations du spectacle demandé'));
   } finally {await h.page.close();}
  });
  await t.test('liens de titres : apostrophes, accents Unicode et espaces, sans modifier le texte',async()=>{
   const title="J'ai toujours rêvé d'être Meryl Streep ";
   for(const mention of ["J’ai toujours rêvé d’être Meryl Streep", "J’ai toujours rêvé d’être Meryl\u00a0Streep", "Jʼai toujours rêvé dʼêtre Meryl  Streep"]){
    const answer=`« ${mention} » est une comédie musicale. ${mention} vous surprendra.`;
    const h=await setup(browser,script,{answer,results:[{webflow_id:'id-meryl',slug:'meryl-streep',title,image_url:'https://example.test/poster.webp'}]});
    try{
     await h.submit('meryl','detail');
     const intro=h.page.locator('[data-ai-search-message="assistant"] [data-ai-search-text]').last();
     assert.equal(await intro.textContent(),answer);
     assert.equal(await intro.locator('a').count(),1);
     assert.equal(await intro.locator('a').textContent(),mention);
     assert.equal(await intro.locator('a').getAttribute('href'),'/spectacles/meryl-streep?utm_source=chatbot');
    }finally{await h.page.close();}
   }
  });
  await t.test('un titre partiel est ignoré avant la première mention complète',async()=>{
   const h=await setup(browser,script,{answer:'Looping puis Loop : une histoire.',results:[{webflow_id:'id-loop',slug:'loop',title:'Loop',image_url:'https://example.test/poster.webp'}]});
   try{
    await h.submit('loop','detail');
    assert.equal(await h.page.locator('[data-ai-search-message="assistant"] [data-ai-search-text]').innerHTML(),'Looping puis <a href="/spectacles/loop?utm_source=chatbot" target="_blank" rel="noopener">Loop</a> : une histoire.');
   }finally{await h.page.close();}
  });
  await t.test('un visuel invalide ne masque pas le texte ni son lien et ne devient pas du HTML',async()=>{
   const h=await setup(browser,script,{failures:20,answer:'The Loop reste accessible.',results:[{
    webflow_id:'id-loop',slug:'the-loop',title:'The Loop',image_url:'javascript:alert(1)',
   }]});
   try {
    await h.submit('loop','detail');
    const response=h.page.locator('[data-ai-search-message="assistant"]').last();
    assert.equal(await response.locator('img,script,[data-ai-search-missing-cards],[data-ai-search-reasons]').count(),0);
    assert.equal(await response.locator('[data-ai-search-text] a').textContent(),'The Loop');
   } finally {await h.page.close();}
  });
  await t.test('fiche détail : une affiche, sans pagination ni raisons, et texte complet',async()=>{
   const answer='Le spectacle et son histoire. '.repeat(90)+'\n\nDurée : 1 h 35.';
   const h=await setup(browser,script,{answer});
   try {
    await h.submit('a','detail');
    const response=h.page.locator('[data-ai-search-message="assistant"]').last();
    assert.equal(await response.locator('.swiper-slide').count(),1);
    assert.equal(await response.locator('.swiper-slide img').getAttribute('alt'),'Affiche a');
    assert.equal(await response.locator('[data-ai-search-reasons]').count(),0);
    assert.equal(await response.locator('[data-swiper-next]').isVisible(),false);
    assert.equal(await response.locator('.swiper-pagination').isVisible(),false);
    assert.ok((await response.textContent()).includes('Durée : 1 h 35.'));
    await h.submit('b');
    assert.equal(await h.page.locator('[data-ai-search-reasons]').count(),1);
    assert.ok(await h.page.locator('[data-ai-search-message="assistant"]').last().evaluate(el=>Boolean(el.querySelector('[data-ai-search-text]').compareDocumentPosition(el.querySelector('[data-ai-search-card-slot]')) & Node.DOCUMENT_POSITION_FOLLOWING)));
   } finally {await h.page.close();}
  });
  await t.test('une réponse détail contenant des résultats en trop ne montre que la cible',async()=>{
   const h=await setup(browser,script,{target:'id-b',results:['a','b','c'].map(slug=>({webflow_id:`id-${slug}`,slug,title:`Spectacle ${slug}`}))});
   try {
    await h.submit('a','detail');
    assert.deepEqual(await h.page.locator('[data-ai-search-result-swiper] .show_title_small').allTextContents(),['Spectacle b']);
    assert.equal(await h.page.locator('[data-ai-search-reasons]').count(),0);
   } finally {await h.page.close();}
  });
  await t.test('plusieurs résultats détail sans cible ne provoquent pas de sélection arbitraire',async()=>{
   const h=await setup(browser,script,{results:['a','b'].map(slug=>({webflow_id:`id-${slug}`,slug,title:slug}))});
   try {
    await h.submit('a','detail');
    assert.equal(await h.page.locator('[data-ai-search-result-swiper]').count(),0);
    assert.ok((await h.page.locator('[data-ai-search-message="assistant"]').last().textContent()).includes('Voici la réponse.'));
   } finally {await h.page.close();}
  });
  await t.test('repos sans requête ; préparation pendant le webhook, deux chargements maximum et cache',async()=>{
   const h=await setup(browser,script,{delay:40});
   try {
    await h.page.locator('input').focus();await h.page.evaluate(()=>{scrollTo(0,300);dispatchEvent(new Event('resize'));});
    assert.deepEqual(h.gets,[]);
    await h.submit('a','pending',false);
    for(let i=0;i<100&&h.gets.length<3;i++)await h.page.waitForTimeout(10);
    assert.equal(h.gets.length,3);assert.equal(h.maxActive(),2);
    await h.page.waitForTimeout(100);h.release();
    await h.page.waitForFunction(()=>document.querySelector('[data-ai-search]').getAttribute('data-ai-search-status')==='success');
    await h.submit('a');await h.submit('b');assert.equal(h.gets.length,3);
    assert.equal(h.gets[1],'https://example.test/chatbot-cartes?cards_page=2');
    assert.deepEqual(await h.page.locator('[data-ai-search-result-swiper] .show_title_small').allTextContents(),['Spectacle a','Spectacle a','Spectacle b']);
    assert.equal(await h.page.locator('[data-ai-search-result-swiper] a').first().getAttribute('href'),'/spectacles/a?utm_source=chatbot');
    await h.submit('missing');assert.equal(h.gets.length,3);
    assert.equal(await h.page.locator('[data-ai-search-missing-cards]').count(),1);
    await h.submit('c');assert.equal(h.gets.length,3);
    await h.submit('a','detail');await h.submit('a','empty');assert.equal(h.gets.length,3);
   } finally {await h.page.close();}
  });
  await t.test('pagination préservée quand la page 3 arrive avant la page 2',async()=>{
   const h=await setup(browser,script,{pages:5,delay:20,outOfOrder:true});
   try {
    await h.submit('missing','pending',false);
    for(let i=0;i<200&&h.gets.length<5;i++)await h.page.waitForTimeout(10);
    await h.page.waitForTimeout(120);assert.equal(h.gets.length,5);
    h.release();await h.page.waitForFunction(()=>document.querySelector('[data-ai-search]').getAttribute('data-ai-search-status')==='success');
    assert.equal(h.gets.length,5);assert.ok(h.maxActive()<=2);
   } finally {await h.page.close();}
  });
  await t.test('le texte continue pendant une attente de cartes ; ordre final conservé',async()=>{
   const h=await setup(browser,script,{holdCards:true});
   try {
    await h.submit('a','normal',false);
    await h.page.waitForFunction(()=>document.querySelector('[data-ai-search-reasons]')?.textContent.includes('Une proposition.'));
    assert.equal(await h.page.locator('[data-ai-search-result-swiper]').count(),0);
    assert.equal(h.gets.length,1);h.releaseCards();
    await h.page.waitForFunction(()=>document.querySelector('[data-ai-search]').getAttribute('data-ai-search-status')==='success');
    assert.equal(await h.page.locator('[data-ai-search-result-swiper]').count(),1);
    assert.equal(await h.page.evaluate(()=>!!(document.querySelector('[data-ai-search-card-slot]').compareDocumentPosition(document.querySelector('[data-ai-search-reasons]'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
    assert.equal(h.gets.length,1);
   } finally {await h.page.close();}
  });
  await t.test('préparation plafonnée à 20 pages',async()=>{
   const h=await setup(browser,script,{pages:40,delay:5});
   try {
    await h.submit('missing','pending',false);
    for(let i=0;i<200&&h.gets.length<20;i++)await h.page.waitForTimeout(10);
    await h.page.waitForTimeout(100);assert.equal(h.gets.length,20);assert.ok(h.maxActive()<=2);
    h.release();await h.page.waitForFunction(()=>document.querySelector('[data-ai-search]').getAttribute('data-ai-search-status')==='success');
    assert.equal(h.gets.length,20);
   } finally {await h.page.close();}
  });
  await t.test('source par défaut indisponible : réponse conservée et nouvel essai possible',async()=>{
   const h=await setup(browser,script,{failures:1,defaultUrl:true,delay:40});
   try {
    await h.submit();assert.equal(await h.page.locator('[data-ai-search-missing-cards]').count(),1);
    assert.equal(await h.page.locator('[data-ai-search-reasons] a').getAttribute('href'),'/spectacles/a?utm_source=chatbot');
    await h.submit();assert.equal(h.gets.length,2);assert.equal(await h.page.locator('[data-ai-search-result-swiper]').count(),1);
   } finally {await h.page.close();}
  });
  for(const next of ['https://other.test/chatbot-cartes?cards_page=2','/les-spectacles?cards_page=2','/chatbot-cartes']) {
   await t.test(`pagination interdite ou cyclique : ${next}`,async()=>{
    const h=await setup(browser,script,{next});
    try {await h.submit('missing');assert.equal(h.gets.length,1);} finally {await h.page.close();}
   });
  }
 } finally {await browser.close();}
});
