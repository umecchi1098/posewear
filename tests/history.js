const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const fixtures = path.join(__dirname, 'fixtures');
const target = (process.env.U || 'http://localhost:8787') + '/#studio';
const comfyBase = 'http://127.0.0.1:8188';

async function readZip(download) {
  assert.match(download.suggestedFilename(), /\.zip$/i);
  const zip = await fs.readFile(await download.path());
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'ZIP の終端レコードがある');
  const count = zip.readUInt16LE(end + 10);
  const entries = new Map();
  // 中央ディレクトリから各ファイルの位置を求め、無圧縮の画像データを読み出します。
  let offset = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50);
    assert.equal(zip.readUInt16LE(offset + 10), 0);
    const nameLength = zip.readUInt16LE(offset + 28);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    assert.ok(!entries.has(name), `ZIP 内の画像名は重複しない: ${name}`);
    const header = zip.readUInt32LE(offset + 42);
    assert.equal(zip.readUInt32LE(header), 0x04034b50);
    const data = header + 30 + zip.readUInt16LE(header + 26) + zip.readUInt16LE(header + 28);
    entries.set(name, zip.subarray(data, data + zip.readUInt32LE(offset + 20)));
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  assert.equal(offset, end);
  return entries;
}

async function main() {
  const [image, otherImage, inputImage] = await Promise.all(['mk1.png', 'mk2.png', 'person.png']
    .map(file => fs.readFile(path.join(fixtures, file))));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  try {
    const page = await browser.newPage({ locale: 'ja-JP', timezoneId: 'UTC', serviceWorkers: 'block' });
    page.setDefaultTimeout(10000);
    const errors = [];
    const edits = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/proxy', async route => {
      edits.push(route.request().headers()['x-target-url']);
      await route.fulfill({ json: { data: [{ b64_json: otherImage.toString('base64') }] } });
    });
    await page.addInitScript(() => {
      if (!localStorage.wbCfg && !localStorage.wbGenerationSettings) {
        localStorage.wbCfg = JSON.stringify({ prov: 'openai', key: 'sk-history-test', proxy: true });
      }
    });

    const keys = () => page.evaluate(() => WB._W.hist.map(record => record.t));
    const deleteRecord = async key => {
      await page.locator(`[data-t="${key}"]`).hover();
      await page.locator(`[data-del="${key}"]`).click();
    };
    const busy = page.locator('#wbBusy');
    const limit = page.locator('#wbLimit');
    const waitForHistory = (count, newestAfter = 0) => page.waitForFunction(({ count, newestAfter }) => {
      const rows = document.querySelectorAll('#wbHist button[data-t]');
      return WB._W.hist.length === count && rows.length === Math.min(30, count) && Number(rows[0]?.dataset.t || 0) > newestAfter;
    }, { count, newestAfter });
    const downloadZip = async selector => {
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
      return readZip(download);
    };
    const uploadInputs = async () => {
      await page.setInputFiles('#wbFile', path.join(fixtures, 'person.png'));
      await page.setInputFiles('#wbGFile', path.join(fixtures, 'mk2.png'));
    };
    await page.goto(target);
    await page.waitForSelector('#wbHist .fine');
    assert.ok(await page.locator('#wbHistZip').isDisabled());

    // 旧版が保存していた履歴を用意し、同じ分に生成した結果、別の日の結果、削除する結果を含めます。
    const first = Date.parse('2021-01-01T12:00:00Z');
    const next = Date.parse('2021-01-02T08:35:00Z');
    const deleted = Date.parse('2021-01-03T09:15:00Z');
    await page.evaluate(({ first, next, deleted, png, other, input }) => new Promise((resolve, reject) => {
      const req = indexedDB.open('lk-studio', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const tx = req.result.transaction('h', 'readwrite');
        const store = tx.objectStore('h');
        const blob = bytes => new Blob([Uint8Array.from(atob(bytes), c => c.charCodeAt(0))], { type: 'image/png' });
        const image = blob(png);
        const reference = blob(input);
        for (let i = 0; i < 37; i++) store.put({
          t: first + i, mode: 'tryon', before: reference, after: image, prompt: 'アーカイブに含めない本文'
        });
        store.put({ t: next, mode: 'gen', after: blob(other) });
        store.put({ t: deleted, mode: 'tryon', after: reference });
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => { req.result.close(); resolve(); };
      };
    }), {
      first, next, deleted, png: image.toString('base64'),
      other: otherImage.toString('base64'), input: inputImage.toString('base64')
    });
    await page.reload();
    await waitForHistory(39);
    await deleteRecord(deleted);
    await waitForHistory(38);
    const backup = await downloadZip('#wbHistZip');
    assert.equal(backup.size, 38);
    assert.equal([...backup.keys()].filter(name => name.includes('20210101-1200')).length, 37);
    assert.equal([...backup.keys()].filter(name => name.includes('20210102-0835')).length, 1);
    for (const [name, bytes] of backup) {
      assert.match(name, /\.png$/i);
      const expected = name.includes('20210102-0835') ? otherImage : image;
      assert.deepEqual(bytes, expected, '削除済み画像は含まれず、保存画像のバイト列が一致する');
    }
    console.log('PASS 生成履歴 ZIP の画像、生成日時、重複しない名前、削除済み画像の除外');

    await uploadInputs();
    await page.selectOption('#wbN', '2');
    // 38件から2枚生成する場合はそのまま送信でき、履歴は40件になります。
    await page.click('#wbGo');
    await waitForHistory(40, deleted + 1);
    assert.ok(await limit.isHidden());
    assert.equal(edits.length, 2);
    const beforeOverflow = await keys();
    assert.equal(beforeOverflow.at(-1), first);
    await busy.waitFor({ state: 'hidden' });

    // 40件を超える操作では、ZIP を保存しても確認画面に留まり、キャンセルで履歴と通信を変更しません。
    await page.selectOption('#wbN', '1');
    await page.click('#wbGo');
    await limit.waitFor();
    assert.equal(await page.locator('#wbLimitText').innerText(),
      '現在の履歴は40件です。予定の1枚を追加する前に、履歴をZIPで保存できます。');
    assert.equal(edits.length, 2);
    const confirmedBackup = await downloadZip('#wbLimitZip');
    assert.equal(confirmedBackup.size, 40);
    assert.equal([...confirmedBackup.values()].filter(bytes => bytes.equals(otherImage)).length, 3);
    assert.ok(await limit.isVisible());
    assert.ok(await busy.isHidden());
    assert.equal(edits.length, 2);
    await page.click('#wbLimitCancel');
    await limit.waitFor({ state: 'hidden' });
    assert.deepEqual(await keys(), beforeOverflow);
    assert.equal(edits.length, 2);

    await page.click('#wbGo');
    await limit.waitFor();
    await page.click('#wbLimitGo');
    await limit.waitFor({ state: 'hidden' });
    await waitForHistory(41, beforeOverflow[0]);
    await busy.waitFor({ state: 'hidden' });
    const afterOverflow = await keys();
    assert.deepEqual(edits, Array(3).fill('https://api.openai.com/v1/images/edits'));
    assert.deepEqual(afterOverflow.slice(1), beforeOverflow);

    // 直前に続行を選んでいても、次のダイアログを Esc で閉じるとキャンセルになります。
    await page.click('#wbGo');
    await limit.waitFor();
    await page.keyboard.press('Escape');
    await limit.waitFor({ state: 'hidden' });
    assert.deepEqual(await keys(), afterOverflow);
    assert.ok(await busy.isHidden());
    assert.equal(edits.length, 3);
    console.log('PASS 上限ちょうどの生成、件数警告、送信前停止、ZIP 保存後の待機、キャンセルと Esc、41件を保持');

    // 履歴198件で5ポーズを1枚ずつ試着し、ComfyUI のジョブ単位で上限が計算されることを確認します。
    const comfyRequests = [];
    let promptCount = 0;
    await page.route(comfyBase + '/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      comfyRequests.push(pathname);
      const headers = {
        'access-control-allow-origin': new URL(target).origin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'Content-Type'
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (pathname === '/upload/image') return route.fulfill({ headers, json: {
        name: 'input.png', subfolder: '', type: 'input'
      } });
      if (pathname === '/prompt') return route.fulfill({ headers, json: { prompt_id: 'job-' + ++promptCount } });
      if (pathname.startsWith('/history/')) return route.fulfill({ headers, json: {
        [pathname.split('/').at(-1)]: { status: { status_str: 'success' }, outputs: {
          '461': { images: [{ filename: 'result.png', subfolder: '', type: 'output' }] }
        } }
      } });
      assert.equal(pathname, '/view');
      await route.fulfill({ headers, contentType: 'image/png', body: otherImage });
    });
    const workflow = require('../workflows/posewear-qwen21-pose-no-pe-api.json');
    await page.evaluate(({ base, workflow }) => {
      // 旧版の保存状態から ComfyUI を移行するブラウザーを再現します。
      localStorage.removeItem('wbGenerationSettings');
      localStorage.wbCfg = JSON.stringify({ prov: 'comfy' });
      localStorage.wbComfy = JSON.stringify({ version: 1, base, activeId: 'test', workflows: [{
        id: 'test', name: '履歴回帰用ワークフロー', fileName: 'test.json', workflow,
        mapping: { person: '470', garment: '475', pose: '490', output: '461', seed: '459:458' }
      }] });
    }, { base: comfyBase, workflow });
    await page.reload();
    await waitForHistory(41);
    // 古い日時の履歴を足して、200件を超えるときだけ古い画像が削除されることを確認します。
    await page.evaluate(async first => {
      const sample = (await WB.db.hist())[0];
      await WB.db.tx('readwrite', store => {
        for (let i = 1; i <= 157; i++) store.put({...sample, t:first - i});
      });
    }, first);
    await page.reload();
    await waitForHistory(198);
    const beforeBatch = await keys();
    await uploadInputs();
    await page.locator('.step[data-s="3"] .sh [data-pick="pose"]').click();
    const choices = page.locator('#pkG button[data-k]');
    for (let i = 0; i < 5; i++) await choices.nth(i).click();
    await page.click('#pkDone');
    await page.selectOption('#wbN', '1');
    await page.click('#wbGo');
    await limit.waitFor();
    assert.equal(await page.locator('#wbLimitText').innerText(),
      '現在の履歴は198件です。予定の5枚がすべて保存されると、古い3件が履歴から削除されます。');
    assert.equal((await downloadZip('#wbLimitZip')).size, 198);
    assert.ok(await limit.isVisible());
    assert.deepEqual(comfyRequests, []);
    await page.click('#wbLimitGo');
    await waitForHistory(200, afterOverflow[0]);
    await busy.waitFor({ state: 'hidden' });
    assert.equal(promptCount, 5);
    assert.deepEqual((await keys()).slice(5), beforeBatch.slice(0, 195));
    assert.deepEqual(errors, []);
    console.log('PASS ComfyUI の198件＋5ポーズで削除見込み3件、ZIPは198件、続行後は最新200件');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
