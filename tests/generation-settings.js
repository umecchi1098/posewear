const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  try {
    const page = await browser.newPage({ locale: 'ja-JP', serviceWorkers: 'block' });
    page.setDefaultTimeout(12000);
    const fixtures = path.join(__dirname, 'fixtures');
    const image = await fs.readFile(path.join(fixtures, 'mk1.png'), 'base64');
    const previous = {
      prov: 'openai', proxy: true, base: 'https://personal.example/v1', key: 'personal-test-key',
      model: 'gpt-image-test-flare', quality: 'low', complexity: 'medium'
    };
    // 実際に使っていたクラウド設定と、別途保存したローカルワークフローを同時に移行します。
    await page.addInitScript(({ previous, workflow }) => {
      if (sessionStorage.initialized) return;
      sessionStorage.initialized = '1';
      localStorage.wbCfg = JSON.stringify(previous);
      localStorage.wbComfy = JSON.stringify({ version: 1, base: 'http://127.0.0.1:8188',
        activeId: 'local-workflow', workflows: [{ id: 'local-workflow', name: 'Windows試着',
          fileName: 'test.json', workflow, mapping: { person: '1', garment: '2', output: '14' } }] });
    }, { previous, workflow: require('../workflows/try-on-qwen-2509-api.json') });

    const errors = [], requests = [];
    let holdResponse;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/proxy', async route => {
      const req = route.request(), endpoint = req.headers()['x-target-url'];
      if (endpoint.endsWith('/models')) return route.fulfill({ json: { data: [] } });
      assert.ok(endpoint.endsWith('/images/edits'), endpoint);
      const form = await new Response(req.postDataBuffer(), {
        headers: { 'content-type': req.headers()['content-type'] }
      }).formData();
      requests.push({ endpoint, auth: req.headers().authorization, model: form.get('model'),
        quality: form.get('quality'), complexity: form.get('complexity'), prompt: form.get('prompt'),
        images: form.getAll('image[]').length });
      if (holdResponse) await holdResponse;
      await route.fulfill({ json: { data: [{ b64_json: image }] } });
    });

    const picker = page.locator('#wbWorkflow');
    const profile = page.locator('#cfProfile');
    const connection = page.locator('#cfConnection');
    const profileId = () => profile.inputValue();
    const open = () => page.click('#wbCfg');
    const save = () => page.click('#cfSave');
    const close = () => page.click('#cfgX');
    const use = () => page.click('#cfUse');
    async function createConnection(name, prov, endpoint, key) {
      await page.click('#cfConnectionNew');
      await page.locator('label:has([name=prov][value=' + prov + '])').click();
      await page.fill('#cfConnectionName', name);
      await page.fill('#cfBase', endpoint);
      await page.fill('#cfKey', key);
      await page.check('#cfProxy');
      await page.click('#cfConnectionSave');
    }
    async function createProfile(name, model) {
      await page.click('#cfProfileNew');
      await page.fill('#cfProfileName', name);
      await page.fill('#cfModel', model);
      await save();
      return profileId();
    }
    async function generate() {
      const before = requests.length;
      const received = page.waitForResponse(r => r.request().headers()['x-target-url']?.endsWith('/images/edits'));
      await page.click('#wbGo');
      await received;
      await page.locator('#wbBusy').waitFor({ state: 'hidden' });
      assert.ok(await page.locator('#wbErr').isHidden(), await page.locator('#wbErr').textContent());
      assert.equal(requests.length, before + 1);
      return requests.at(-1);
    }

    await page.goto((process.env.U || 'http://localhost:8787') + '/#studio');
    await open();
    const personalId = await connection.inputValue(), flare = await profileId();
    assert.equal(await picker.inputValue(), flare);
    assert.equal(await page.inputValue('#cfQuality'), previous.quality);
    assert.equal(await page.inputValue('#cfComplexity'), previous.complexity);
    assert.equal(await page.inputValue('#cfModel'), previous.model);
    assert.equal(await page.inputValue('#cfKey'), previous.key);
    await page.fill('#cfConnectionName', '個人用');
    await page.click('#cfConnectionSave');
    await page.fill('#cfProfileName', '確認用 Flare');
    await save();
    await createConnection('業務用', 'openai', 'https://office.example/v1', 'office-test-key');
    const office = await createProfile('業務用の生成設定', previous.model);
    await connection.selectOption(personalId);
    // 同じ接続・モデルでも、用途名と画質を変えた別設定を保存できます。
    const variant = await createProfile('Flare 高画質', previous.model);
    await page.fill('#cfQuality', 'max');
    await save();
    const sunburst = await createProfile('仕上げ用 Sunburst', 'gpt-image-test-sunburst');
    await page.fill('#cfQuality', 'high');
    await page.fill('#cfComplexity', 'high');
    await save();
    await createConnection('Gemini接続', 'gemini', 'https://gemini.example/v1beta', 'gemini-test-key');
    const gemini = await createProfile('Gemini試着', 'gemini-test-image');
    await close();
    assert.equal(await picker.inputValue(), flare, '別の設定を保存しても使用中の設定は維持される');
    const groups = await picker.locator('optgroup').evaluateAll(groups =>
      groups.map(group => [group.label, [...group.children].map(option => option.value)]));
    assert.deepEqual(groups.find(([name]) => name === '個人用')[1].sort(), [flare, variant, sunburst].sort());
    assert.deepEqual(groups.find(([name]) => name === '業務用')[1], [office]);
    await picker.selectOption(gemini);
    await picker.selectOption({ label: 'Windows試着' });
    await picker.selectOption(flare);
    assert.equal(requests.length, 0);

    await page.setInputFiles('#wbFile', path.join(fixtures, 'person.png'));
    await page.setInputFiles('#wbGFile', path.join(fixtures, 'mk2.png'));
    await page.locator('.step[data-s="3"] .sh [data-pick="pose"]').click();
    await page.locator('#pkG button[data-k]').first().click();
    await page.click('#pkDone');
    await page.click('#wbAdv summary');
    await page.uncheck('#wbNeutral');
    const prompt = 'Manual prompt: keep the same garment and pose.';
    await page.fill('#wbPrompt', prompt);
    const expected = {
      endpoint: previous.base + '/images/edits', auth: 'Bearer ' + previous.key, model: previous.model,
      quality: 'low', complexity: 'medium', prompt, images: 3
    };
    assert.deepEqual(await generate(), expected);
    const result = await page.getAttribute('#wbAfter', 'src');
    assert.match(result, /^blob:/);
    for (const choice of [gemini, { label: 'Windows試着' }, sunburst]) {
      await picker.selectOption(choice);
      assert.equal(await page.inputValue('#wbPrompt'), prompt);
      assert.equal(await page.getAttribute('#wbAfter', 'src'), result);
    }
    assert.equal(requests.length, 1, 'サービスをまたいだ切り替えだけでは生成しない');
    assert.equal(await page.locator('#wbPersons img').count(), 1);
    assert.equal(await page.locator('#wbG img').count(), 1);
    assert.equal(await page.locator('#wbPo [data-ang]').count(), 1);
    const finish = { ...expected, model: 'gpt-image-test-sunburst', quality: 'high', complexity: 'high' };
    assert.deepEqual(await generate(), finish);

    // 片方ずつリセットし、ダイアログを開き直した値と送信パラメーターをそれぞれ照合します。
    await open();
    await page.click('#cfQualityReset');
    assert.equal(await page.inputValue('#cfComplexity'), 'high');
    await save();
    await close();
    await open();
    assert.equal(await page.inputValue('#cfQuality'), '');
    assert.equal(await page.inputValue('#cfComplexity'), 'high');
    await close();
    assert.deepEqual(await generate(), { ...finish, quality: null });
    await open();
    await page.fill('#cfQuality', 'auto');
    await page.click('#cfComplexityReset');
    assert.equal(await page.inputValue('#cfQuality'), 'auto');
    await save();
    await close();
    await open();
    assert.equal(await page.inputValue('#cfQuality'), 'auto');
    assert.equal(await page.inputValue('#cfComplexity'), '');
    await use();
    assert.deepEqual(await generate(), { ...finish, quality: 'auto', complexity: null });

    // 同じ接続を使う2設定には更新が伝わり、別接続に秘密情報が混ざらないことを確かめます。
    await open();
    await page.fill('#cfKey', 'rotated-personal-key');
    await page.fill('#cfBase', 'https://personal-updated.example/v1');
    await page.click('#cfConnectionSave');
    await close();
    const update = { auth: 'Bearer rotated-personal-key', endpoint: 'https://personal-updated.example/v1/images/edits' };
    assert.deepEqual(await generate(), { ...finish, ...update, quality: 'auto', complexity: null });
    await picker.selectOption(flare);
    assert.deepEqual(await generate(), { ...expected, ...update });
    await picker.selectOption(office);
    assert.deepEqual(await generate(), { ...expected, auth: 'Bearer office-test-key',
      endpoint: 'https://office.example/v1/images/edits', quality: null, complexity: null });

    // 応答を一時保留して生成中の選択ロックを確認し、バッチ完了後に次の設定を選びます。
    await picker.selectOption(flare);
    await page.selectOption('#wbN', '3');
    let release;
    holdResponse = new Promise(resolve => { release = resolve; });
    const sentBefore = requests.length;
    const started = page.waitForRequest(r => r.headers()['x-target-url']?.endsWith('/images/edits'));
    await page.click('#wbGo');
    await started;
    assert.ok(await picker.isDisabled());
    release();
    await page.locator('#wbBusy').waitFor({ state: 'hidden' });
    assert.deepEqual(requests.slice(sentBefore), Array(3).fill({ ...expected, ...update }));
    await picker.selectOption(office);
    await page.reload();
    await picker.waitFor();
    assert.equal(await picker.inputValue(), office);
    assert.deepEqual(errors, []);
    console.log('PASS 生成設定の移行・接続の分離・切替・リセット・バッチ中の設定保持');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
