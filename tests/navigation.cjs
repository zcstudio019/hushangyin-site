// Standalone fallback: node tests/navigation.cjs. No project dependencies added.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const base = process.env.TEST_URL || 'http://127.0.0.1:8080';
const routes = Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, 'protected-content.json'), 'utf8')))
  .map(file => '/' + file.replaceAll('\\', '/').replace(/index.html$/, ''));
const labels = ['首页','关于沪上银','企业融资','个人融资','产品方案','资料预审','成功案例','融资知识','风险提示','联系我们'];
(async () => {
  const browser = await chromium.launch({executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true});
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  const errors = [], results = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if(message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if(response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  try {
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({width, height:900});
      for (const route of routes) {
        const response = await page.goto(base + route, {waitUntil:'domcontentloaded'});
        assert.equal(response.status(), 200);
        await page.evaluate(() => document.fonts.ready);
        const nav = page.locator('#main-nav');
        assert.deepEqual(await nav.locator('a').allTextContents(), labels);
        const state = await page.evaluate(() => {
          const h = document.querySelector('.site-header');
          const nav = h.querySelector('nav');
          return {overflow:document.documentElement.scrollWidth > innerWidth,
            active:nav.querySelector('.current')?.getAttribute('href') || null,
            footer:document.querySelector('footer').outerHTML,
            collapsed:getComputedStyle(h.querySelector('.menu-toggle')).display !== 'none'};
        });
        assert.equal(state.overflow, false, `horizontal overflow: ${width} ${route}`);
        assert.equal(state.collapsed, width < 1440, `${width} ${route} responsive mode`);
        const expected = route === '/privacy/' ? null : route.startsWith('/insights/') ? '/insights/' : route;
        assert.equal(state.active, expected, `${route} active`);
        assert.equal(await page.locator('header .logo').getAttribute('href'), '/');
        assert.equal(await page.locator('.nav-cta').getAttribute('href'), '/contact/');
        if (results.length) assert.equal(state.footer, results[0].footer);
        if (state.collapsed) {
          const toggle = page.locator('.menu-toggle');
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
          assert.equal(await nav.locator('a:visible').count(), 10);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          await page.keyboard.press('Escape');
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          assert.equal(await toggle.getAttribute('aria-label'), '打开导航菜单');
          assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
          await toggle.click(); await toggle.click();
          assert.equal(await nav.isVisible(), false);
          await toggle.click();
          await nav.locator('a[href="/contact/"]').click();
          await page.waitForURL(base + '/contact/');
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        } else {
          assert.equal(await nav.isVisible(), true);
          assert.equal(await nav.evaluate(el => el.scrollWidth > el.clientWidth), false);
        }
        results.push({width,route,collapsed:state.collapsed,footer:state.footer});
      }
      await page.goto(base + '/');
      await page.screenshot({path:path.join(__dirname,`navigation-${width}.png`)});
      console.log(`PASS: 15 routes at ${width}px`);
    }
    // Real desktop link navigation, logo and CTA.
    for (const [index, label] of labels.entries()) {
      const target = await page.locator('#main-nav a').nth(index).getAttribute('href');
      await Promise.all([
        page.waitForURL(base + target, {waitUntil:'domcontentloaded'}),
        page.locator('#main-nav a').nth(index).click({noWaitAfter:true})
      ]);
      assert.equal(await page.locator('#main-nav .current').textContent(), label);
    }
    await page.locator('header .logo').click(); await page.waitForURL(base + '/');
    await page.locator('.nav-cta').click(); await page.waitForURL(base + '/contact/');
    for (const width of [1239,1240,1241,1280,1366]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await page.setViewportSize({width:375,height:667});
    await page.locator('.menu-toggle').click();
    await page.screenshot({path:path.join(__dirname,'navigation-open-375.png')});
    await page.setViewportSize({width:1440,height:900});
    await page.waitForFunction(() => document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false');
    await page.evaluate(() => {
      const nav = document.querySelector('nav');
      for(let i=0;i<6;i++) {
        const a = document.createElement('a'); a.href='/insights/'; a.textContent='未来知识栏目'+i; nav.append(a);
      }
    });
    await page.setViewportSize({width:1441,height:900});
    await page.waitForFunction(() => document.querySelector('header').classList.contains('nav-collapsed'));
    // Existing interactions must remain functional.
    await page.goto(base + '/products/');
    await page.locator('[data-filter]').nth(1).click();
    assert.ok(await page.locator('.detail-card:visible').count() < await page.locator('.detail-card').count());
    await page.goto(base + '/precheck/');
    await page.locator('#document-files').setInputFiles({name:'demo.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 test')});
    assert.match(await page.locator('#file-feedback').textContent(), /已检查 1 个文件/);
    await page.goto(base + '/contact/');
    await page.locator('[name="name"]').fill('测试');
    await page.locator('[name="phone"]').fill('13800000000');
    await page.locator('[name="type"]').selectOption({index:1});
    await page.locator('[name="amount"]').selectOption({index:1});
    await page.locator('[name="consent"]').check();
    await page.locator('button[type="submit"]').click();
    assert.match(await page.locator('.form-feedback').textContent(), /没有发送或保存/);
    assert.deepEqual(errors, []);
    const summary = {passed:results.length, viewports:[375,768,1024,1440], consoleErrors:errors, checks:'15 routes × 4 widths; overflow, active links, menu toggle/Esc/focus/navigation, common footer, logo, CTA, boundary widths, resize reset, extended menu auto-collapse, product filter, file checks, form demo'};
    fs.writeFileSync(path.join(__dirname,'browser-results.json'), JSON.stringify(summary,null,2));
    console.log(JSON.stringify(summary,null,2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
