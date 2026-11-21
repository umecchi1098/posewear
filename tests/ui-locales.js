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

// 操作中の検索条件とお気に入りのファイル形式を、表示言語切替の前後で比較する。
async function browse(page) {
  await gallery(page, 'costume');
  await locale(page, 'ja');
  await page.fill('#q', 'no-matches-97c8b');
  await visible(page, '#empty #sugg button:first-child');
  const emptyJapanese = await text(page, '#emptyT');
  await locale(page, 'en');
  assert.notEqual(await text(page, '#emptyT'), emptyJapanese);
  assert.equal(await page.inputValue('#q'), 'no-matches-97c8b');
  const suggestion = page.locator('#sugg button').first();
  const suggestionEnglish = await suggestion.innerText();
  await suggestion.click();
  assert.equal(await page.inputValue('#q'), suggestionEnglish);
  await wait(page, () => APP.st.list.length > 0);
  const initial = await page.locator('#grid .card').first().getAttribute('data-k');
  await locale(page, 'ja');
  assert.notEqual(await page.inputValue('#q'), suggestionEnglish);
  assert.equal(await page.locator('#grid .card').first().getAttribute('data-k'), initial);
  await page.click('#qx');
  await wait(page, () => APP.st.q === '' && APP.st.list.length > 0);

  await page.click('#fBtn');
  const filter = page.locator('#filters button[data-k=cat][data-v]:not([data-v=""])').first();
  const filterValue = await filter.getAttribute('data-v');
  await filter.click();
  await wait(page, value => APP.st.f.cat === value, filterValue);
  const active = await text(page, '#active button');
  const filteredCount = await text(page, '#count b');
  await locale(page, 'en');
  assert.notEqual(await text(page, '#active button'), active);
  assert.equal(await page.evaluate(() => APP.st.f.cat), filterValue);
  assert.equal(await text(page, '#count b'), filteredCount);
  await page.click('#fBtn');
  await page.click('#clearAll');
  await locale(page, 'ja');

  const card = page.locator('#grid .card').first();
  const key = await card.getAttribute('data-k');
  await card.locator('[data-a=fav]').click();
  await card.locator('.phk').click();
  await visible(page, '#lb');
  const prompt = await page.locator('#lb .pbox.en p').innerText();
  await page.click('#lb [data-c=en]');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), prompt);
  await page.keyboard.press('Escape');
  await page.locator('#lb').waitFor({ state: 'hidden' });
  await page.click('[data-lang=en]');
  assert.equal(await card.locator('.sub').textContent(), prompt);
  await locale(page, 'zh');
  assert.equal(await card.locator('.sub').textContent(), prompt);
  await page.reload();
  await wait(page, () => window.APP?.st.tab === 'costume' && document.querySelector('#grid .card[data-k]'));
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  assert.equal(await page.locator('html').getAttribute('data-lang'), 'en');
  assert.equal(await card.locator('.sub').textContent(), prompt);
  const chineseDescription = await page.evaluate(key => APP.ITEMS[key].zh, key);
  await page.click('[data-lang=zh]');
  await locale(page, 'en');
  assert.equal(await card.locator('.sub').textContent(), chineseDescription);

  await gallery(page, 'fav');
  assert.equal(await page.locator('#grid .card').first().getAttribute('data-k'), key);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exp')]);
  const exportPath = await download.path();
  const payload = JSON.parse(await fs.readFile(exportPath, 'utf8'));
  assert.equal(payload.收藏[0].key, key);
  assert.equal(payload.收藏[0].英文, prompt);
  await page.click('#clrFav');
  await visible(page, '#empty');
  await locale(page, 'ja');
  await page.setInputFiles('#impF', { name: 'favorites.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await visible(page, '#grid .card');
  assert.equal(await page.locator('#grid .card').first().getAttribute('data-k'), key);
  await page.setInputFiles('#impF', { name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await wait(page, () => document.querySelector('#toast').textContent === UI.t('导入失败：文件格式不正确'));
  assert.equal(await page.locator('#grid .card').first().getAttribute('data-k'), key);

  await gallery(page, 'pose');
  const pose = page.locator('#grid .card').first();
  await pose.locator('[data-a=sel]').click();
  await page.click('[data-tl=en]');
  const combination = await text(page, '#trayText');
  assert.match(combination, /^masterpiece, best quality/);
  await locale(page, 'zh');
  assert.equal(await text(page, '#trayText'), combination);
  await page.reload();
  await visible(page, '#trayText');
  assert.equal(await text(page, '#trayText'), combination);
  assert.match(await page.locator('[data-tl=en]').getAttribute('class'), /\bon\b/);
  await page.click('#trayClear');
  await locale(page, 'ja');
  const poseKey = await pose.getAttribute('data-k');
  await pose.locator('[data-a=ang][data-i="1"]').click();
  await page.click('#batchBtn');
  await pose.locator('.phk').click();
  const batchLabel = await text(page, '#bbN');
  await locale(page, 'en');
  assert.notEqual(await text(page, '#bbN'), batchLabel);
  assert.equal(await page.locator('#grid .card.picked').count(), 1);
  assert.equal(await page.evaluate(key => APP.ITEMS[key].ai, poseKey), 1);
  assert.match(await pose.locator('[data-a=ang][data-i="1"]').getAttribute('class'), /\bon\b/);
  await page.click('#bbar [data-b=x]');

  const englishIndex = page.locator('a[href="/en/"]').first();
  assert.equal(await englishIndex.getAttribute('hreflang'), 'en');
  await englishIndex.click();
  assert.match(page.url(), /\/en\/$/);
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  const englishCategory = page.locator('a[href^="/en/pose/"]').first();
  const categoryUrl = new URL(await englishCategory.getAttribute('href'), origin).href;
  assert.equal((await page.request.get(categoryUrl)).status(), 200);
  const galleryLink = page.getByRole('link', { name: 'Open the gallery' });
  const studioLink = page.getByRole('link', { name: 'Try on online' });
  assert.equal(await galleryLink.getAttribute('href'), '/#costume');
  assert.equal(await studioLink.getAttribute('href'), '/#studio');
  await galleryLink.click();
  await wait(page, () => window.APP?.st.tab === 'costume');
  await page.goBack();
  await studioLink.click();
  await visible(page, '#wbStage');
}

async function failedCatalog(browser) {
  const context = await browser.newContext({ serviceWorkers: 'block', locale: 'en' });
  try {
    const page = await context.newPage();
    const data = /\/assets\/costumes\.[a-z0-9]+\.json$/;
    await page.route(data, route => route.abort());
    await page.goto(origin);
    await page.click('[data-tab=costume]');
    await visible(page, '#retry');
    const english = await text(page, '#emptyT');
    await locale(page, 'ja');
    assert.notEqual(await text(page, '#emptyT'), english);
    await visible(page, '#retry');
    await page.unroute(data);
    await page.click('#retry');
    await visible(page, '#grid .card');
  } finally {
    await context.close();
  }
}

// 提供元に送る本文と画像は実際の HTTP リクエストから読み取る。画像 API の応答だけを差し替える。
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
      await browse(page);
      console.log('PASS gallery, clipboard, favorites and English SEO');
    } finally {
      await context.close();
    }
    await failedCatalog(browser);
    console.log('PASS localized catalog failure and retry');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
