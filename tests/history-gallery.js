const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  try {
    const page = await browser.newPage({
      locale: 'ja-JP', hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block',
      viewport: { width: 1280, height: 800 }
    });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.wbCfg = JSON.stringify({ prov: 'openai', key: 'sk-gallery-test', proxy: true });
    });
    await page.goto((process.env.U || 'http://localhost:8787') + '/#studio');
    const gallery = page.locator('#wbGallery');
    const open = page.locator('#wbGalleryOpen');
    const slider = page.locator('#wbRange');
    const result = page.locator('#wbAfter');
    const history = page.locator('#wbHist [data-t]');
    const image = page.locator('#wbGalleryImage');
    const previous = page.locator('#wbGalleryPrev');
    const next = page.locator('#wbGalleryNext');
    const count = page.locator('#wbGalleryCount');
    const close = page.locator('#wbGalleryClose');
    const use = page.locator('#wbGalleryUse');
    await page.locator('#wbHist .fine').waitFor();
    assert.ok(await open.isHidden());
    assert.ok(await gallery.isHidden());

    // 寸法の違う生成画像を返すことで、実際に表示された画像と一覧上の順番を照合します。
    const samples = await page.evaluate(() => [[96, 96], [360, 960], [1024, 400], [640, 640]].map(([w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').fillRect(0, 0, w, h);
      return canvas.toDataURL().split(',')[1];
    }));
    let requests = 0;
    await page.route('**/api/proxy', route =>
      route.fulfill({ json: { data: [{ b64_json: samples[requests++] }] } }));
    await page.setInputFiles('#wbFile', path.join(__dirname, 'fixtures/person.png'));
    await page.setInputFiles('#wbGFile', path.join(__dirname, 'fixtures/mk2.png'));
    await page.click('#wbGo');
    await history.first().waitFor();
    await page.click('#wbCmpT');
    await open.focus();
    await page.keyboard.press('Enter');
    await gallery.waitFor();
    assert.ok(await count.isHidden() && await previous.isHidden() && await next.isHidden());
    assert.ok(await use.isHidden());
    await page.keyboard.press('Escape');
    assert.ok(await open.evaluate(el => el === document.activeElement));

    await page.selectOption('#wbN', '3');
    await page.click('#wbGo');
    await page.waitForFunction(() => document.querySelectorAll('#wbHist [data-t]').length === 4);
    await page.click('#wbRes [data-ri="1"]');
    const resultWidths = await page.locator('#wbRes img').evaluateAll(async images =>
      Promise.all(images.map(async img => { await img.decode(); return img.naturalWidth; })));
    const historyWidths = await history.locator('img').evaluateAll(async images =>
      Promise.all(images.map(async img => { await img.decode(); return img.naturalWidth; })));
    const assertFrame = async (index, widths) => {
      await page.waitForFunction(width => {
        const img = document.querySelector('#wbGalleryImage');
        return img.complete && img.naturalWidth === width;
      }, widths[index]);
      assert.equal((await count.innerText()).replace(/\s/g, ''), (index + 1) + '/' + widths.length);
      assert.equal(await previous.isDisabled(), index === 0);
      assert.equal(await next.isDisabled(), index === widths.length - 1);
      // object-fit:contain または画像自身の縦横比で、四隅が表示領域内に収まります。
      assert.ok(await image.evaluate(img => {
        const rect = img.getBoundingClientRect();
        const aspectMatches = Math.abs(rect.width - rect.height * img.naturalWidth / img.naturalHeight) < 2;
        return (getComputedStyle(img).objectFit === 'contain' || aspectMatches) &&
          rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= innerWidth + 1 &&
          rect.top >= 0 && rect.bottom <= innerHeight + 1;
      }));
    };
    await page.click('#wbCmpT');
    await slider.scrollIntoViewIfNeeded();
    const box = await slider.boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.5, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.78, y, { steps: 8 });
    await page.mouse.up();
    assert.ok(await gallery.isHidden());
    assert.ok(Number(await slider.inputValue()) > 50);
    await slider.press('ArrowLeft');
    const position = await slider.inputValue();
    const stageSource = await result.getAttribute('src');
    await page.mouse.click(box.x + box.width * 0.35, y);
    await assertFrame(1, resultWidths);
    await page.keyboard.press('ArrowRight');
    await assertFrame(2, resultWidths);
    await page.keyboard.press('ArrowRight');
    await assertFrame(2, resultWidths);
    await previous.click();
    await previous.click();
    await assertFrame(0, resultWidths);
    await page.keyboard.press('ArrowLeft');
    await assertFrame(0, resultWidths);
    await image.click();
    assert.ok(await gallery.isVisible());
    // 背景の操作要素に Tab が移らず、比較スライダーの値も変化しません。
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press(key);
        assert.ok(await gallery.evaluate(dialog => dialog.contains(document.activeElement)), key);
      }
    }
    await close.click();
    assert.ok(await slider.evaluate(el => el === document.activeElement), '比較操作の開始位置にフォーカスが戻る');
    assert.equal(await slider.inputValue(), position);
    assert.equal(await result.getAttribute('src'), stageSource);
    assert.equal(await page.getAttribute('#wbRes .on', 'data-ri'), '1');

    // スマートフォン幅で履歴をタップし、閉じたときの選択、フォーカス、スクロールを確認します。
    await page.setViewportSize({ width: 390, height: 844 });
    await history.nth(1).scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => scrollY);
    await history.nth(1).tap();
    await assertFrame(1, historyWidths);
    await previous.tap();
    await assertFrame(0, historyWidths);
    await next.tap();
    await next.tap();
    await assertFrame(2, historyWidths);
    assert.ok(await use.isVisible());
    await page.touchscreen.tap(2, 2);
    await gallery.waitFor({ state: 'hidden' });
    assert.ok(await history.nth(1).evaluate(el => document.activeElement === el));
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - scroll) <= 1);
    assert.equal(await result.getAttribute('src'), stageSource);

    // 同じ操作名が3言語で欠落せず切り替わることを、実際のアクセス可能な名前で確認します。
    await page.setViewportSize({ width: 1280, height: 800 });
    const namesByControl = [new Set(), new Set(), new Set(), new Set()];
    for (const language of ['ja', 'en', 'zh']) {
      await page.selectOption('#uiLocale', language);
      await history.nth(1).press('Enter');
      for (const [index, control] of [previous, next, close, use].entries()) {
        const name = await control.evaluate(el => (el.getAttribute('aria-label') || el.textContent).trim());
        assert.ok(name);
        namesByControl[index].add(name);
      }
      await page.keyboard.press('Escape');
    }
    assert.ok(namesByControl.every(names => names.size === 3));
    await history.nth(1).click();
    await next.click();
    await assertFrame(2, historyWidths);
    await use.click();
    await gallery.waitFor({ state: 'hidden' });
    assert.equal(await result.evaluate(async img => { await img.decode(); return img.naturalWidth; }), historyWidths[2]);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#wbDl')]);
    assert.equal((await fs.readFile(await download.path())).readUInt32BE(16), historyWidths[2]);
    assert.equal(await page.locator('#wbPersons img').count(), 1);
    assert.equal(await page.locator('#wbG img').count(), 1);
    await history.first().hover();
    await history.first().locator('[data-del]').click();
    await page.waitForFunction(() => document.querySelectorAll('#wbHist [data-t]').length === 3);
    assert.ok(await gallery.isHidden());
    assert.equal(requests, 4);
    assert.deepEqual(errors, []);
    console.log('PASS 生成結果・履歴ギャラリー、比較ドラッグ、タッチ・キー操作、3言語、履歴の呼び出しと保存');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
