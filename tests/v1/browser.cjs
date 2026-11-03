const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pages=JSON.parse(fs.readFileSync(path.resolve('src/features/content/legacy-pages.json'),'utf8'));
const base=process.env.TEST_URL||'http://127.0.0.1:3000';
(async()=>{const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const failures=[];const page=await browser.newPage();page.on('pageerror',e=>failures.push(e.message));page.on('console',msg=>{if(msg.type()==='error')failures.push(msg.text())});fs.mkdirSync('test-results',{recursive:true});let count=0;try{
for(const width of [375,768,1024,1440]){await page.setViewportSize({width,height:900});for(const [route,content] of Object.entries(pages)){
const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200,route);await page.evaluate(()=>document.fonts.ready);
assert.equal(await page.title(),content.title);assert.equal(await page.locator('meta[name="description"]').getAttribute('content'),content.description);assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),base+route);
assert.equal(await page.locator('header #main-nav a').count(),10);assert.equal(await page.locator('footer').count(),1);assert.equal(await page.locator('main h1').count(),1);assert.equal(await page.locator('header').innerText().then(s=>/\{name\}|undefined|\bnull\b/.test(s)),false);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} ${width} overflow`);
const expected=route==='/privacy/'?null:route.startsWith('/insights/')?'/insights/':route;assert.equal(await page.locator('#main-nav .current').count(),expected?1:0);if(expected)assert.equal(await page.locator('#main-nav .current').getAttribute('href'),expected);
const toggle=page.locator('.menu-toggle');assert.equal(await toggle.isVisible(),width<1440);
if(width<1440){await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#main-nav a:visible').count(),10);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await toggle.evaluate(el=>el===document.activeElement),true);await toggle.click();await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false')}
if(route==='/precheck/')assert.equal(await page.locator('input[type="file"]').isDisabled(),true);
if(route==='/contact/'&&!process.env.TEST_DATABASE_URL){assert.equal(await page.locator('button[type="submit"]').isDisabled(),true);assert.match(await page.locator('.form-feedback').textContent(),/不可提交/)}
count++;
}await page.goto(base+'/');await page.screenshot({path:`test-results/v1-home-${width}.png`});console.log(`PASS 15 routes at ${width}px`)}
await page.goto(base+'/products/');await page.locator('[data-filter="企业"]').click();assert.ok(await page.locator('.detail-card:visible').count()<await page.locator('.detail-card').count());
await page.goto(base+'/contact/');await page.locator('header .logo').click();await page.waitForURL(base+'/');await page.locator('.nav-cta').click();await page.waitForURL(base+'/contact/');
await page.goto(base+'/admin/login/');assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/);assert.ok((await page.request.get(base+'/admin/login/')).headers()['x-robots-tag'].includes('noindex'));
const sitemap=await (await page.request.get(base+'/sitemap.xml')).text();assert.equal((sitemap.match(/<loc>/g)||[]).length,16);assert.equal(sitemap.includes('/admin/'),false);assert.equal(sitemap.includes('example.com'),false);
const robots=await (await page.request.get(base+'/robots.txt')).text();assert.match(robots,/Disallow: \/admin\//);assert.match(robots,/Disallow: \/api\//);
const nojs=await browser.newContext({javaScriptEnabled:false});const document=await nojs.newPage();await document.goto(base+'/insights/enterprise-loan-guide/');assert.match(await document.locator('main').innerText(),/企业经营贷/);assert.equal(await document.locator('header nav a').count(),10);await nojs.close();
assert.deepEqual(failures,[]);const result={pages:15,viewports:[375,768,1024,1440],routeViewportChecks:count,consoleErrors:failures,passed:true,databaseEndToEnd:process.env.TEST_DATABASE_URL?'See database integration results':'NOT RUN: no PostgreSQL configured'};fs.writeFileSync('test-results/v1-browser.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
