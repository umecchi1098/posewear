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
        // 通信を切った再読み込みでも、日本語用のフォントを実際に読み込めます。
        await page.evaluate(() => document.fonts.ready);
        assert.ok(await page.evaluate(() => [...document.fonts].some(face => face.family.includes('Noto Sans JP') && face.status === 'loaded')));
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
  await page.click('button[data-lang=en]');
  assert.equal(await card.locator('.sub').textContent(), prompt);
  await locale(page, 'zh');
  assert.equal(await card.locator('.sub').textContent(), prompt);
  await page.reload();
  await wait(page, () => window.APP?.st.tab === 'costume' && document.querySelector('#grid .card[data-k]'));
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  assert.equal(await page.locator('html').getAttribute('data-lang'), 'en');
  assert.equal(await card.locator('.sub').textContent(), prompt);
  const chineseDescription = await page.evaluate(key => APP.ITEMS[key].zh, key);
  await page.click('button[data-lang=zh]');
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
  assert.match(await page.locator('body').innerText(), /Japanese/i);
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

// 全種類の配布データを調べ、実画面でも同じ衣装を言語切り替え・検索・コピーで追います。
async function localizedMaterials(page) {
  await page.goto(origin + '/#costume');
  await visible(page, '#grid .card');
  const invalid = await page.evaluate(async () => {
    const errors = [];
    const extensions = ['expr','hair','dyn','scene','light','prop','furn'];
    for (const type of ['pose','depth','portrait','costume','anime',...extensions]) {
      const items = await APP.load(type);
      if (!items.length) errors.push(type);
      for (const it of items) {
        if (![it.titleJa,it.titleEn,it.promptJa,APP.prompt(it,'ja')].every(x => typeof x === 'string' && x.trim() && !x.includes('undefined'))) errors.push(it.k);
        if (it.angles && !extensions.includes(type) && (!it.lineJa || it.angles.some(a => !a.ja))) errors.push(it.k);
        // 日本語を選んだときに元の英語や素材名だけで済ませていないか、詳細な素材で確認します。
        if (extensions.includes(type) && (!/[ぁ-んァ-ヶ一-龠]/u.test(it.promptJa) ||
            it.promptJa === it.en || (/^(expr|scene|light|dyn|prop|furn)$/.test(type) && it.titleJa === it.promptJa))) {
          errors.push(it.k);
        }
      }
    }
    return errors.slice(0,10);
  });
  assert.deepEqual(invalid, []);

  // 同じ光の参考画像を開き、画面を英語に替えても日本語で選んだ生成文が保持されることを確認します。
  await locale(page, 'ja');
  await gallery(page, 'light');
  const lighting = await page.evaluate(() => APP.DATA.light.find(it => it.id === 'L001'));
  const lightingCard = page.locator(`#grid .card[data-k="${lighting.k}"]`);
  await lightingCard.locator('.phk').click();
  await page.click('#lb [data-prompt-lang=ja]');
  const lightingPrompt = await text(page, '#lb .pbox p');
  assert.ok(lightingPrompt.includes(lighting.promptJa));
  assert.match(lightingPrompt, /9[,.]?000|９[，、]?０００/);
  await locale(page, 'en');
  assert.equal(await text(page, '#lbSide h2'), lighting.titleEn);
  assert.equal(await text(page, '#lb .pbox p'), lightingPrompt);
  await page.keyboard.press('Escape');
  await gallery(page, 'costume');
  const card=page.locator('#grid .card').first();
  const key=await card.getAttribute('data-k');
  const item=await page.evaluate(k => APP.ITEMS[k],key);
  for(const [code,name] of [['en',item.titleEn],['zh',item.ti],['ja',item.titleJa]]){
    await locale(page,code);
    assert.equal(await card.locator('h3').innerText(),name);
    assert.equal(await card.locator('img').getAttribute('alt'),name);
  }
  await page.fill('#q',item.titleJa);
  await wait(page,k=>APP.st.q===APP.ITEMS[k].titleJa && APP.st.list.some(it=>it.k===k),key);
  const match=page.locator(`#grid .card[data-k="${key}"]`);
  await match.locator('.phk').click();
  assert.equal(await text(page,'#lbSide h2'),item.titleJa);
  await page.click('#lb [data-prompt-lang=ja]');
  assert.equal(await text(page,'#lb .pbox p'),item.promptJa);
  await page.click('#lb [data-c=ja]');
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),item.promptJa);
  await page.keyboard.press('Escape');
  await match.locator('[data-a=sel]').click();
  await page.click('[data-tl=ja]');
  const combination=await text(page,'#trayText');
  assert.match(combination,/最高品質/);
  assert.ok(combination.includes(item.promptJa.replace(/。$/,'')));
  await page.click('#trayCopy');
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),combination);
  await page.click('#trayClear');
  await page.click('#batchBtn');
  await match.locator('.phk').click();
  await page.click('#bbar [data-b=cp]');
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),item.promptJa);
  await page.click('#bbar [data-b=x]');
  await page.reload();
  await visible(page,'#grid .card');
  assert.deepEqual(await page.evaluate(()=>[APP.st.lang,APP.st.tl]),['ja','ja']);
}
// 提供元に送る本文と画像は実際の HTTP リクエストから読み取る。画像 API の応答だけを差し替える。
async function studio(page) {
  const img = (await fs.readFile(path.join(fixtures, 'mk1.png'))).toString('base64');
  const requests = [];
  let status = 200;
  await page.route(/https:\/\/api\.openai\.com\//, async route => {
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    requests.push(route.request().postData());
    const message = status === 401 ? 'Incorrect API key provided: local-mock-key' : 'mock-provider-message';
    const body = status === 200 ? { data: [{ b64_json: img }] } : { error: { message } };
    await route.fulfill({ status, headers, json: body });
  });
  await page.addInitScript(() => {
    localStorage.setItem('wbCfg', JSON.stringify({ prov: 'openai', key: 'local-mock-key', proxy: false }));
  });
  await page.goto(origin + '/#studio');
  await visible(page, '#wbStage');
  await locale(page, 'ja');
  await page.click('details.adv summary');
  await page.click('[data-pl=zh]');
  // 人物参照のない初期画面には、体型を指定する操作を表示しません。
  const bodyToggle = page.locator('#wbKeepBody');
  assert.equal(await bodyToggle.isVisible(), false);
  const chinesePrompt = await page.inputValue('#wbPrompt');
  assert.match(chinesePrompt, /^根据参考图/);
  await locale(page, 'en');
  assert.equal(await page.inputValue('#wbPrompt'), chinesePrompt);
  await page.reload();
  await visible(page, '#wbStage');
  assert.match(await page.locator('[data-pl=zh]').getAttribute('class'), /\bon\b/);
  assert.equal(await page.inputValue('#wbPrompt'), chinesePrompt);
  await locale(page, 'ja');
  await page.setInputFiles('#wbFile', path.join(fixtures, 'person.png'));
  await page.setInputFiles('#wbGFile', path.join(fixtures, 'mk2.png'));
  await page.click('details.adv summary');
  await visible(page, '#wbKeepBody');
  assert.equal(await bodyToggle.isChecked(), false);
  await visible(page, '#wbG .pick');
  const originalChinese = await page.inputValue('#wbPrompt');
  await bodyToggle.check();
  const withBodyChinese = await page.inputValue('#wbPrompt');
  assert.match(withBodyChinese, /^体型：/m);
  await bodyToggle.uncheck();
  assert.equal(await page.inputValue('#wbPrompt'), originalChinese);
  const custom = 'Local test prompt, light gray cardigan';
  const additional = 'Overcast daylight';
  await page.fill('#wbExtra', additional);
  await page.fill('#wbPrompt', custom);
  await page.uncheck('#wbNeutral');
  await locale(page, 'en');
  assert.equal(await page.inputValue('#wbExtra'), additional);
  assert.equal(await page.inputValue('#wbPrompt'), custom);
  await page.click('#wbGo');
  await visible(page, '#wbOutAct');
  assert.match(await page.getAttribute('#wbAfter', 'src'), /^blob:/);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].includes(`name="prompt"\r\n\r\n${custom}\r\n`));
  assert.equal([...requests[0].matchAll(/name="image\[\]"/g)].length, 2);
  await visible(page, '#wbHist [data-t]');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#wbDl')]);
  assert.match(download.suggestedFilename(), /\.png$/);
  await locale(page, 'ja');
  await page.click('#wbGo');
  await wait(page, () => document.querySelectorAll('#wbHist [data-t]').length === 2);
  assert.match(await page.getAttribute('#wbAfter', 'src'), /^blob:/);
  assert.ok(requests[1].includes(`name="prompt"\r\n\r\n${custom}\r\n`));
  await locale(page, 'en');
  for (const code of [401, 500]) {
    status = code;
    await page.click('#wbGo');
    await visible(page, '#wbErr');
    const english = await text(page, '#wbErr');
    assert.match(english, code === 401 ? /key is invalid or expired/i : /provider error/i);
    assert.doesNotMatch(english, /local-mock-key/);
    await locale(page, 'ja');
    assert.notEqual(await text(page, '#wbErr'), english);
    await visible(page, '#wbErr');
    assert.equal(await page.inputValue('#wbExtra'), additional);
    assert.equal(await page.inputValue('#wbPrompt'), custom);
    await locale(page, 'en');
  }
  assert.equal(requests.length, 4);
  // 訳を開いても英語の送信内容は変わらず、日本語を選んだ時だけ日本語が送られます。
  status=200;
  await page.click('[data-pl=en]');
  await page.click('#wbReP');
  await bodyToggle.check();
  const english=await page.inputValue('#wbPrompt');
  assert.equal(english.split('Body proportions:').length - 1, 1);
  await page.click('#wbJaPreview summary');
  await wait(page,()=>document.querySelector('#wbJaText').value.length>0);
  const japanese=await page.inputValue('#wbJaText');
  assert.match(japanese,/参照画像/);
  assert.match(japanese,/^体型：/m);
  assert.equal(await page.inputValue('#wbPrompt'),english);
  await page.click('#wbGo');
  await wait(page,()=>!document.querySelector('#wbGo').disabled && !document.querySelector('#wbOutAct').hidden);
  const sentBody = index => requests[index].match(/name="prompt"\r\n\r\n([\s\S]*?)\r\n--/)[1].replace(/\r\n/g,'\n');
  assert.equal(sentBody(4),english);
  await page.fill('#wbPrompt','Edited prompt');
  assert.equal(await page.locator('#wbJaPreview').isVisible(),false);
  await page.click('[data-pl=ja]');
  assert.equal(await page.inputValue('#wbPrompt'),japanese);
  await page.click('#wbGo');
  await wait(page,()=>!document.querySelector('#wbGo').disabled && !document.querySelector('#wbOutAct').hidden);
  assert.equal(sentBody(5),japanese);

  // 背景維持と誤検知軽減を併用しても、実際に送信する本文に体型の指示が一度だけ残ります。
  await page.check('#wbNeutral');
  assert.equal(await page.isChecked('#wbKeepBg'), true);
  await page.click('#wbGo');
  await wait(page,()=>!document.querySelector('#wbGo').disabled && !document.querySelector('#wbOutAct').hidden);
  assert.match(sentBody(6), /カタログ/);
  assert.match(sentBody(6), /元の背景と照明を保つ/);
  assert.equal(sentBody(6).split('体型：').length - 1, 1);

  // 切り替え時は手書きの文面を保ち、体型の指示だけを着脱します。
  await bodyToggle.uncheck();
  await page.fill('#wbPrompt', custom);
  await bodyToggle.check();
  assert.ok((await page.inputValue('#wbPrompt')).includes(custom));
  assert.match(await page.inputValue('#wbPrompt'), /^体型：/m);
  await bodyToggle.uncheck();
  assert.equal(await page.inputValue('#wbPrompt'), custom);
  await bodyToggle.check();
  await page.click('#wbPersons [data-rmp]');
  assert.equal(await bodyToggle.isVisible(), false);
  assert.equal(await page.inputValue('#wbPrompt'), custom);
  await page.reload();
  await visible(page,'#wbStage');
  assert.match(await page.locator('[data-pl=ja]').getAttribute('class'),/\bon\b/);
  // 再読み込みで人物写真は解除されます。再度選ぶと保存済みの設定が有効になります。
  await page.click('#wbAdv summary');
  assert.doesNotMatch(await page.inputValue('#wbPrompt'), /^体型：/m);
  await page.setInputFiles('#wbFile', path.join(fixtures, 'person.png'));
  await visible(page, '#wbKeepBody');
  assert.equal(await bodyToggle.isChecked(), true);
  assert.match(await page.inputValue('#wbPrompt'), /^体型：/m);
}

// APIキーのない状態で、画像と本文を別ページへ実際に貼り付けます。
async function chatCopy(browser) {
  const context = await browser.newContext({
    locale: 'ja-JP', permissions: ['clipboard-read', 'clipboard-write'], serviceWorkers: 'block',
  });
  const pasteKey = process.platform === 'darwin' ? 'Meta+v' : 'Control+v';
  try {
    const page = await context.newPage();
    const receiver = await context.newPage();
    await receiver.route('**/clipboard-receiver', route => route.fulfill({
      contentType: 'text/html',
      body: `<textarea aria-label="Paste target"></textarea><script>
        document.querySelector('textarea').addEventListener('paste', async event => {
          const file = event.clipboardData.files[0];
          if (!file) return;
          const image = await createImageBitmap(file);
          document.body.dataset.image = [file.type, image.width, image.height].join(',');
          image.close();
        });
      </script>`,
    }));
    await receiver.goto(origin + '/clipboard-receiver');
    await page.bringToFront();
    const posts = [];
    page.on('request', request => {
      if (request.method() === 'POST') posts.push(request.url());
    });
    await page.goto(origin + '/#studio');
    await visible(page, '#wbOnb');
    assert.equal(await page.locator('#wbChatOpen').isDisabled(), true);
    await page.setInputFiles('#wbFile', path.join(fixtures, 'person.png'));
    await page.setInputFiles('#wbGFile', ['mk1.png', 'mk2.png'].map(name => path.join(fixtures, name)));
    await page.click('.step[data-s="3"] .lnk');
    await page.locator('#pkG button').first().click();
    await page.click('#pkDone');
    await page.selectOption('#wbPo [data-ang]', '1');
    await page.click('#wbChatOpen');
    const selectedAnglePrompt = await page.inputValue('#wbChatPrompt');
    await page.keyboard.press('Escape');
    await page.click('#wbAllAng');
    await page.click('#wbChatOpen');
    await visible(page, '#wbChat[open]');
    const references = page.locator('#wbChatImages li');
    assert.deepEqual(await references.locator('b').allTextContents(),
      ['画像1 · 人物写真', '画像2 · 衣装', '画像3 · 衣装', '画像4 · ポーズ']);
    const firstPose = await page.inputValue('#wbChatPrompt');
    assert.match(firstPose, /image 4 is pose sketch/);
    await page.selectOption('#wbChatPose', '1');
    const secondPose = await page.inputValue('#wbChatPrompt');
    assert.match(secondPose, /image 4 is pose sketch/);
    assert.notEqual(secondPose, firstPose);
    assert.equal(secondPose, selectedAnglePrompt);
    const [width, height] = await page.locator('#wbPersons img').evaluate(image => [image.naturalWidth, image.naturalHeight]);
    assert.ok(width && height);
    await references.first().locator('button').first().click();
    await wait(page, () => document.querySelector('#wbChatImages [role=status]').textContent === '画像をコピーしました');
    await receiver.bringToFront();
    await receiver.locator('textarea').focus();
    await receiver.keyboard.press(pasteKey);
    await wait(receiver, expected => document.body.dataset.image === expected, `image/png,${width},${height}`);

    await page.bringToFront();
    await page.click('#wbChatCopyPrompt');
    await wait(page, () => document.querySelector('#wbChatStatus').textContent === 'プロンプトをコピーしました');
    await receiver.bringToFront();
    await receiver.keyboard.press(pasteKey);
    assert.equal(await receiver.locator('textarea').inputValue(), secondPose);

    await page.bringToFront();
    await page.evaluate(() => {
      const write = navigator.clipboard.write;
      navigator.clipboard.write = function () {
        this.write = write;
        return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
      };
    });
    const poseCopy = references.last().locator('button').first();
    await poseCopy.click();
    await page.getByText('画像をコピーできませんでした。ダウンロードしてください。').waitFor();
    await page.route('**/p/i/**', route => route.fulfill({ status: 503 }));
    await poseCopy.click();
    await page.getByText(/HTTP 503/).waitFor();
    await page.unroute('**/p/i/**');
    const [download] = await Promise.all([
      page.waitForEvent('download'), references.last().locator('[data-save]').click(),
    ]);
    assert.equal(download.suggestedFilename(), 'posewear-reference-4.png');
    assert.equal((await fs.readFile(await download.path())).subarray(1, 4).toString(), 'PNG');

    // 前のポーズの取得が遅れても、新しくコピーした本文がクリップボードに残ります。
    let release;
    const delayed = new Promise(resolve => { release = resolve; });
    await page.route('**/p/i/**', async route => {
      await delayed;
      await route.continue();
    });
    const pendingRequest = page.waitForRequest('**/p/i/**');
    const oldButton = await poseCopy.elementHandle();
    await poseCopy.click();
    await pendingRequest;
    await page.selectOption('#wbChatPose', '0');
    await page.click('#wbChatCopyPrompt');
    await wait(page, () => document.querySelector('#wbChatStatus').textContent === 'プロンプトをコピーしました');
    release();
    await wait(page, button => !button.disabled, oldButton);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), firstPose);
    await page.unroute('**/p/i/**');

    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#wbChat').isVisible(), false);
    await page.click('[data-bm=sheet]');
    await page.click('#wbChatOpen');
    assert.ok(await references.count() > 4);
    assert.match(await page.inputValue('#wbChatPrompt'), /panels in one image/);
    await page.keyboard.press('Escape');
    await page.click('details.adv summary');
    await page.click('[data-pl=ja]');
    await page.click('#wbChatOpen');
    assert.match(await page.inputValue('#wbChatPrompt'), /画像4～/);
    await page.keyboard.press('Escape');
    const edited = '衣装を忠実に再現。\n背景はスタジオ。';
    await page.fill('#wbPrompt', edited);
    await page.click('#wbChatOpen');
    assert.equal(await page.inputValue('#wbChatPrompt'), edited);
    await page.keyboard.press('Escape');
    await page.click('[data-mode=gen]');
    await page.click('#wbPersons [data-rmp]');
    await page.click('#wbChatOpen');
    assert.match(await references.first().locator('b').textContent(), /画像1 · 衣装/);
    assert.match(await page.inputValue('#wbChatPrompt'), /^参照画像を使ってファッション写真を生成する。/);
    assert.deepEqual(posts, []);
  } finally {
    await context.close();
  }
}

async function capture(browser) {
  await fs.mkdir(screenshots, { recursive: true });
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ locale: 'en', viewport, isMobile: name === 'mobile', hasTouch: name === 'mobile', reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto(origin);
      await wait(page, () => APP.st.tab === 'pose' && document.querySelector('#grid .card img')?.naturalWidth > 0);
      for (const code of Object.keys(languages)) {
        await locale(page, code);
        await gallery(page, 'pose');
        await page.evaluate(() => scrollTo(0, 0));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${name} ${code}: page overflows`);
        const anglesFit = await page.locator('#grid .card .angs').first().evaluate(angles => {
          const frame = angles.getBoundingClientRect();
          return Array.from(angles.children).every(angle => {
            const bounds = angle.getBoundingClientRect();
            return bounds.left >= frame.left - 1 && bounds.right <= frame.right + 1;
          });
        });
        assert.ok(anglesFit, `${name} ${code}: gallery angle labels are clipped`);
        await page.screenshot({ path: path.join(screenshots, `${name}-${code}-gallery.png`) });
        await page.click('#adultSw');
        await visible(page, '#ageBox');
        await page.screenshot({ path: path.join(screenshots, `${name}-${code}-common.png`) });
        await page.click('#ageN');
        await page.click('[data-tab=studio]');
        await visible(page, '#wbStage');
        // ページ全体がオーバーフローを隠していても、列や操作が画面外にある場合は失敗にする。
        const clipped = await page.evaluate(() => {
          const controls = document.querySelectorAll('#studio .st-l, #studio .st-c, #studio .st-r, #studio .step .lnk, #studio #wbOnbGo');
          return [...controls].filter(control => {
            const bounds = control.getBoundingClientRect();
            return bounds.width > 0 && (bounds.left < -1 || bounds.right > document.documentElement.clientWidth + 1);
          }).map(control => control.id || control.textContent.trim().slice(0, 30));
        });
        assert.deepEqual(clipped, [], `${name} ${code}: studio controls are clipped`);
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(screenshots, `${name}-${code}-studio.png`) });
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
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
      assert.deepEqual(await page.evaluate(()=>[APP.st.lang,APP.st.tl]),['en','en']);
      await common(page);
      console.log('PASS help, privacy and accessibility text across three locales');
      await browse(page);
      console.log('PASS gallery, clipboard, favorites and English SEO');
      await localizedMaterials(page);
      console.log('PASS translated catalog, Japanese title search, detail, combination and batch copy');
      await studio(await context.newPage());
      console.log('PASS studio uploads, prompt, result, download, history and errors');
    } finally {
      await context.close();
    }
    await failedCatalog(browser);
    console.log('PASS localized catalog failure and retry');
    await chatCopy(browser);
    console.log('PASS API-key-free chat copy, clipboard paste, download and pose grouping');
    await capture(browser);
    console.log('PASS desktop and mobile screenshots across three locales');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
