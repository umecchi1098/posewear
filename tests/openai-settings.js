const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  try {
    const page = await browser.newPage({ locale: 'ja-JP', serviceWorkers: 'block' });
    page.setDefaultTimeout(10000);
    const fixtures = path.join(__dirname, 'fixtures');
    const image = await fs.readFile(path.join(fixtures, 'mk1.png'), 'base64');
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    // 旧版の保存設定には画質・検討量がない。空のAPIキーでもモデル名を編集できる。
    await page.addInitScript(() => {
      if (!localStorage.wbCfg && !localStorage.wbGenerationSettings) {
        localStorage.wbCfg = JSON.stringify({ prov: 'openai', key: '', model: 'old-manual-id' });
      }
    });

    const edits = [];
    const modelRequests = [];
    let respondToLookup;
    let lookupFailure = false;
    const responseGate = new Promise(resolve => { respondToLookup = resolve; });
    const mockEndpoint = 'https://model-list.example/v1';
    // 実際の外部通信は行わず、ブラウザーが送信した接続先・認証・パラメーターを確認する。
    await page.route('**/api/proxy', async route => {
      const request = route.request();
      const target = request.headers()['x-target-url'];
      if (target === mockEndpoint + '/models') {
        modelRequests.push(request.headers().authorization);
        await responseGate;
        if (lookupFailure) {
          return route.fulfill({ status: 403, json: { error: { message: 'Model list denied' } } });
        }
        return route.fulfill({ json: { data: [
          { id: 'gpt-image-old', created: 10 }, { id: 'text-model', created: 30 },
          { id: 'gpt-image-new', created: 20 }
        ] } });
      }
      assert.equal(target, mockEndpoint + '/images/edits', '指定値エラー時も別APIで再送しない');
      const body = new Response(request.postDataBuffer(), {
        headers: { 'content-type': request.headers()['content-type'] }
      });
      const form = await body.formData();
      const fields = {};
      for (const key of ['quality', 'complexity']) {
        if (form.has(key)) fields[key] = form.get(key);
      }
      edits.push({ model: form.get('model'), fields });
      if (fields.quality === 'future-quality') {
        return route.fulfill({ status: 400, json: { error: {
          param: 'quality', message: 'Unsupported image quality for this model'
        } } });
      }
      await route.fulfill({ json: { data: [{ b64_json: image }] } });
    });

    const model = page.locator('#cfModel');
    const list = page.locator('#cfOpenAIModels');
    const quality = page.locator('#cfQuality');
    const complexity = page.locator('#cfComplexity');
    const open = () => page.locator('#wbCfg').click();
    const save = async () => {
      // 保存と使用を分けた管理画面で、保存してから閉じます。
      await page.click('#cfSave');
      await page.click('#cfgX');
    };
    await page.goto((process.env.U || 'http://localhost:8787') + '/#studio');
    await open();
    assert.equal(await quality.inputValue(), '');
    assert.equal(await complexity.inputValue(), '');
    await model.fill('keyless-manual-id');
    await save();
    await open();
    assert.equal(await model.inputValue(), 'keyless-manual-id');

    // 接続の保存前でも、編集中のキーと接続先を使ってモデル一覧を取得します。
    await page.locator('#cfKey').fill('sk-openai-settings-test');
    await page.locator('#cfBase').fill(mockEndpoint);
    const pending = page.waitForRequest(r => r.headers()['x-target-url'] === mockEndpoint + '/models');
    await model.focus();
    await pending;
    await model.fill('manual-while-loading');
    respondToLookup();
    await list.locator('option[value="gpt-image-new"]').waitFor({ state: 'attached' });
    assert.deepEqual(await list.locator('option').evaluateAll(opts => opts.map(opt => opt.value)),
      ['gpt-image-new', 'gpt-image-old']);
    assert.equal(modelRequests[0], 'Bearer sk-openai-settings-test');
    assert.equal(await model.inputValue(), 'manual-while-loading');
    await list.selectOption('gpt-image-new');
    assert.equal(await model.inputValue(), 'gpt-image-new');
    await page.click('#cfConnectionSave');
    await save();

    // 一覧を取得できない場合にも、手入力したモデルが再読み込み後の試着に使われる。
    lookupFailure = true;
    await open();
    await model.focus();
    await page.locator('#cfModelStatus').filter({ hasText: 'Model list denied' }).waitFor();
    assert.equal(await model.inputValue(), 'gpt-image-new');
    await model.fill('my-manual-model');
    await save();
    await page.reload();
    await open();
    assert.equal(await model.inputValue(), 'my-manual-model');
    await save();
    await page.locator('#wbFile').setInputFiles(path.join(fixtures, 'person.png'));
    await page.locator('#wbGFile').setInputFiles(path.join(fixtures, 'mk2.png'));

    // 画面から保存して実際に試着し、空欄の省略と明示的な値の両方を確認する。
    const cases = [{}, { quality: 'auto' }, { complexity: 'future-effort' },
      { quality: 'future-quality', complexity: 'high' }, { quality: 'high', complexity: 'low' }];
    for (const fields of cases) {
      await open();
      await quality.fill(fields.quality || '');
      await complexity.fill(fields.complexity || '');
      await save();
      await open();
      assert.equal(await quality.inputValue(), fields.quality || '');
      assert.equal(await complexity.inputValue(), fields.complexity || '');
      await save();
      const sentBefore = edits.length;
      const response = page.waitForResponse(r => r.request().headers()['x-target-url'] === mockEndpoint + '/images/edits');
      await page.locator('#wbGo').click();
      await response;
      await page.locator('#wbBusy').waitFor({ state: 'hidden' });
      assert.deepEqual(edits.slice(sentBefore), [{ model: 'my-manual-model', fields }]);
      if (fields.quality === 'future-quality') {
        assert.match(await page.locator('#wbErr').innerText(), /Unsupported image quality/);
      } else {
        assert.ok(await page.locator('#wbErr').isHidden());
        assert.match(await page.locator('#wbAfter').getAttribute('src'), /^blob:/);
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS OpenAIモデル候補の取得・手入力・保存、試着時の任意設定とエラー修正');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
