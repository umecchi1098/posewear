const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');

const origin = process.env.U || 'http://localhost:8787';
const fixtures = path.join(__dirname, 'fixtures');
const screenshots = path.join(__dirname, 'screenshots', 'ui-locales');
const languages = { zh: 'zh-CN', en: 'en', ja: 'ja' };
const wait = (page, check, value) => page.waitForFunction(check, value, { timeout: 15000 });
const visible = (page, selector) => page.locator(selector).first().waitFor({ state: 'visible' });
const text = (page, selector) => page.locator(selector).innerText();

// 各辞書の翻訳が二言語揃い、原文の差し込み項目が欠落しないことを確認する。
async function dictionaries() {
  const names = ['common', 'gallery', 'studio'];
  const parameters = message => [...new Set(message.match(/\{\w+\}/g))].sort();
  for (const name of names) {
    const source = await fs.readFile(path.join(__dirname, '..', 'src', `messages-${name}.js`), 'utf8');
    let count = 0;
    const UI = { register(entries) {
      for (const [key, values] of Object.entries(entries)) {
        count++;
        assert.ok(Array.isArray(values), key);
        assert.equal(values.length, 2, key);
        for (const value of values) {
          assert.ok(typeof value === 'string' && value.trim().length > 0, key);
          assert.deepEqual(parameters(value), parameters(key), key);
        }
      }
    } };
    vm.runInNewContext(source, { UI, window: { UI } }, { filename: `messages-${name}.js` });
    assert.ok(count > 0, name);
  }
}

async function locale(page, code) {
  await page.selectOption('#uiLocale', code);
  await wait(page, lang => document.documentElement.lang === lang, languages[code]);
  assert.equal(await page.inputValue('#uiLocale'), code);
  assert.equal(await page.evaluate(() => UI.locale), code);
}

async function gallery(page, tab) {
  await page.click(`[data-tab=${tab}]`);
  await wait(page, expected => APP.st.tab === expected && document.querySelector('#grid .card'), tab);
}

// 対応言語と既定値、保存した選択、インストール済み Service Worker でのオフライン再読込を確認する。
async function startup(browser) {
  for (const [language, code] of [['zh-TW', 'zh'], ['en-GB', 'en'], ['ja-JP', 'ja'], ['fr-FR', 'zh']]) {
    const context = await browser.newContext({ locale: language });
    try {
      const page = await context.newPage();
      await page.goto(origin);
      await wait(page, lang => document.documentElement.lang === lang && Boolean(window.UI), languages[code]);
      assert.equal(await page.inputValue('#uiLocale'), code, language);
      if (language === 'fr-FR') {
        await locale(page, 'ja');
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.reload();
        await wait(page, () => navigator.serviceWorker.controller && window.APP);
        assert.equal(await page.locator('html').getAttribute('lang'), 'ja');
        await context.setOffline(true);
        await page.reload();
        await visible(page, '#grid .card');
        assert.equal(await page.locator('html').getAttribute('lang'), 'ja');
        await locale(page, 'en');
        assert.equal(await page.evaluate(() => localStorage.getItem('uiLocale')), 'en');
        await page.click('[data-tab=studio]');
        await visible(page, '#wbStage');
      }
    } finally {
      await context.close();
    }
  }
}

// 本文だけでなく、検索欄とダイアログのアクセシブル名も表示言語と揃える。
async function common(page) {
  const copy = {
    zh: ['搜索', '搜姿势、颜色、单品', '快捷键', '隐私说明'],
    en: ['Search', 'Search poses, colors, or garments', 'Keyboard shortcuts', 'Privacy notice'],
    ja: ['検索', 'ポーズ・色・衣装を検索', 'キーボードショートカット', 'プライバシーについて'],
  };
  for (const [code, [search, placeholder, help, privacy]] of Object.entries(copy)) {
    await locale(page, code);
    assert.equal(await page.locator('#q').getAttribute('aria-label'), search);
    assert.equal(await page.locator('#q').getAttribute('placeholder'), placeholder);
    await page.click('#help');
    await visible(page, '#helpBox');
    assert.equal(await text(page, '#helpBox h3'), help);
    assert.equal(await page.locator('#helpBox').getAttribute('aria-label'), help);
    await page.click('#helpBox [data-close]');
    await page.click('#privO');
    await visible(page, '#privBox');
    assert.equal(await text(page, '#privT'), privacy);
    assert.equal(await page.locator('#privBox').getAttribute('aria-labelledby'), 'privT');
    await page.click('#privBox [data-close]');
  }
}

(async () => {
  await dictionaries();
  console.log('PASS translation pairs and interpolation parameters');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  try {
    await startup(browser);
    console.log('PASS browser locale, persistence and offline');
    const context = await browser.newContext({ locale: 'en', permissions: ['clipboard-read', 'clipboard-write'], serviceWorkers: 'block', reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await page.goto(origin);
      await wait(page, () => window.APP && window.UI);
      await common(page);
      console.log('PASS help, privacy and accessibility text across three locales');
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
