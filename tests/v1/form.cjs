const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { setTimeout: pause } = require('node:timers/promises');
const fs = require('node:fs');
const assert = require('node:assert/strict');
// Explicitly unreachable local database. This test never uses real customer data.
const base = 'http://127.0.0.1:3001';
(async () => {
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3001'], {
    env: { ...process.env, SITE_URL: base, DATABASE_URL: 'postgresql://127.0.0.1:1/hsy_unavailable?connect_timeout=1', RATE_LIMIT_SECRET: randomBytes(32).toString('hex'), CONSULTATIONS_ENABLED: 'true', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'ignore', windowsHide: true,
  });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(base + '/contact/')).ok) { ready = true; break; } } catch {}
      await pause(200);
    }
    assert.equal(ready, true, 'Isolated form-test server did not start');
    browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const page = await browser.newPage();
    let submissions = 0;
    page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/consultations')) submissions++; });
    await page.goto(base + '/contact/');
    const button = page.locator('button[type="submit"]');
    assert.equal(await button.isEnabled(), true);
    await button.click();
    assert.equal(submissions, 0, 'Empty form must not submit');
    await page.locator('[name="name"]').fill('合成测试（非客户）');
    await page.locator('[name="phone"]').fill('123');
    await page.locator('[name="customerType"]').selectOption('ENTERPRISE');
    await page.locator('[name="financingAmount"]').selectOption({ index: 1 });
    await button.click();
    assert.equal(submissions, 0, 'Invalid phone must not submit');
    await page.locator('[name="phone"]').fill('13800000000');
    await button.click();
    assert.equal(submissions, 0, 'Missing consent must not submit');
    await page.locator('[name="consent"]').check();
    const response = page.waitForResponse(r => r.url().includes('/api/consultations') && r.request().method() === 'POST');
    await button.click();
    assert.equal((await response).status(), 503);
    await page.locator('.form-feedback').filter({ hasText: '服务暂不可用' }).waitFor();
    assert.equal(await page.locator('.form-feedback.success').count(), 0);
    assert.equal(submissions, 1);
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/v1-form.json', JSON.stringify({ passed: true, checked: ['required fields', 'phone format', 'required consent', 'configured-but-unreachable DB returns 503', 'no false success'], databaseWriteTested: false }, null, 2));
    console.log('PASS: form required/phone/consent validation and unavailable-database failure feedback; no false success');
  } finally { if (browser) await browser.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
