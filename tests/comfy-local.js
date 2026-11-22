const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const site = new URL(process.env.U || 'http://localhost:8787');
const fixtures = path.join(__dirname, 'fixtures');
const cloudKey = 'sk-comfy-test-cloud-secret';
const sampleName = 'try-on-qwen-2509-api.json';
const sample = require('../workflows/try-on-qwen-2509-api.json');

async function main() {
  const image = await fs.readFile(path.join(fixtures, 'mk1.png'));
  const requests = [];
  let historyReads = 0, poseUploads = 0;
  const outputs = new Map();
  const mockComfy = http.createServer(async (req, res) => {
    // ブラウザーの CORS 検査を通るよう、PoseWear の実際のオリジンだけを許可します。
    if (req.headers.origin === site.origin) {
      res.setHeader('Access-Control-Allow-Origin', site.origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url, 'http://127.0.0.1');
    requests.push({ method: req.method, path: url.pathname, headers: req.headers, body, query: url.searchParams });
    let value;
    switch (url.pathname.startsWith('/history/') ? '/history/' : url.pathname) {
      case '/system_stats':
        value = { system: {}, devices: [] };
        break;
      case '/upload/image':
        value = {
          type: 'input',
          subfolder: 'posewear',
          name: body.includes('posewear-pose-') ? 'pose-' + (++poseUploads) + '.jpg' :
            body.includes('posewear-person-') ? 'person.jpg' : 'garment.jpg'
        };
        break;
      case '/prompt': {
        const id = 'posewear-' + (outputs.size + 1);
        const graph = JSON.parse(body).prompt;
        const output = Object.keys(graph).find(key => graph[key].class_type === 'SaveImage');
        outputs.set(id, { [output]: { images: [{ filename: 'result.png', subfolder: 'try-on', type: 'output' }] } });
        value = { prompt_id: id };
        break;
      }
      case '/history/': {
        const id = url.pathname.split('/')[2];
        // 計算中は履歴が空で、次の問い合わせで初めて結果が届きます。
        if (++historyReads === 1) {
          value = {};
          break;
        }
        value = {
          [id]: { status: { status_str: 'success' }, outputs: outputs.get(id) }
        };
        break;
      }
      case '/view':
        res.writeHead(200, { 'Content-Type': 'image/png' }).end(image);
        return;
      default:
        res.writeHead(404).end();
        return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
  });

  let browser;
  try {
    await new Promise((resolve, reject) => {
      mockComfy.once('error', reject);
      mockComfy.listen(0, '127.0.0.1', resolve);
    });
    const endpoint = 'http://127.0.0.1:' + mockComfy.address().port;
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
    const page = await browser.newPage({ locale: 'ja-JP' });
    page.setDefaultTimeout(15000);
    const errors = [], proxyRequests = [], requestFailures = [], browserMessages = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/proxy') proxyRequests.push(request.url());
    });
    page.on('console', message => { if (message.type() === 'error') browserMessages.push(message.text()); });
    page.on('requestfailed', request => requestFailures.push(request.url() + ' ' + request.failure()?.errorText));
    await page.addInitScript(key => {
      if (sessionStorage.getItem('comfy-test-initialized')) return;
      sessionStorage.setItem('comfy-test-initialized', '1');
      localStorage.setItem('wbCfg', JSON.stringify({
        prov: 'openai', key, base: 'https://api.openai.com/v1', model: 'gpt-image-1-mini', proxy: true
      }));
    }, cloudKey);

    await page.goto(new URL('/#studio', site).href);
    await page.locator('#wbCfg').click();
    await page.click('#cfConnectionNew');
    await page.locator('label:has([name=prov][value=comfy])').click();
    await page.fill('#cfConnectionName', 'ローカルPC');
    assert.ok(await page.locator('#cfKey').isHidden());
    await page.locator('#cfBase').fill(endpoint);
    await page.click('#cfConnectionSave');
    const localId = await page.inputValue('#cfConnection');
    await page.locator('#cfTest').click();
    await page.locator('#cfMsg.good, #cfMsg.bad').filter({ hasNotText: '接続中' }).waitFor();
    // 接続失敗時は、画面の理由とブラウザーが報告した通信エラーを表示します。
    assert.equal(await page.locator('#cfMsg').innerText(), 'ComfyUI に接続できました。',
      '接続テスト: ' + [...requestFailures, ...browserMessages].filter(message => message.includes(endpoint)).join(', ') +
      ' リクエスト: ' + requests.map(r => r.path + ' from ' + r.headers.origin).join(', '));
    assert.deepEqual(requests.map(r => r.path), ['/system_stats']);

    // 設定画面のリンクから実際に取得したワークフローを、そのまま読み込みます。
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('a[download][href$="' + sampleName + '"]').click()
    ]);
    assert.equal(download.suggestedFilename(), sampleName);
    const workflowPath = await download.path();
    assert.deepEqual(JSON.parse(await fs.readFile(workflowPath, 'utf8')), sample);
    await page.locator('#cfComfyWorkflow').setInputFiles({
      name: sampleName, mimeType: 'application/json', buffer: await fs.readFile(workflowPath)
    });
    await page.locator('#cfComfyName').filter({ hasText: sampleName }).waitFor();
    assert.equal(await page.locator('#cfComfyName').innerText(), sampleName);
    await page.locator('#cfComfyPerson').selectOption('1');
    await page.locator('#cfComfyGarment').selectOption('1');
    assert.equal(await page.locator('#cfComfyOutput').inputValue(), '14');
    await page.locator('#cfSave').click();
    await page.getByText('人物用と服装用に別々の LoadImage ノードを選び、SaveImage ノードを1つ選択してください。', { exact: true }).waitFor();
    assert.equal(requests.length, 1);

    await page.locator('#cfComfyGarment').selectOption('2');
    await page.locator('#cfSave').click();
    assert.ok(await page.locator('#cfg').isVisible());
    const readSaved = () => page.evaluate(() => JSON.parse(localStorage.wbGenerationSettings));
    const initial = await readSaved();
    assert.equal(initial.profiles.filter(profile => profile.connectionId === localId).length, 1);
    const legacySampleId = await page.inputValue('#cfProfile');
    const originalProfile = initial.profiles.find(profile => profile.id === initial.activeId);
    assert.notEqual(legacySampleId, initial.activeId);
    assert.equal(initial.connections.find(connection => connection.id === originalProfile.connectionId).prov, 'openai');
    const localProfile = initial.profiles.find(profile => profile.id === legacySampleId);

    // 未保存の変更があれば、「使う」では確定せず、管理画面で保存を案内します。
    await page.fill('#cfProfileName', '未保存の名前');
    await page.click('#cfUse');
    assert.ok(await page.locator('#cfg').isVisible());
    assert.equal(await page.locator('#cfMsg').innerText(), '変更を先に保存してください');
    assert.deepEqual(await readSaved(), initial);
    await page.fill('#cfProfileName', localProfile.name);
    await page.click('#cfUse');
    await page.locator('#cfg').waitFor({ state: 'hidden' });
    assert.equal((await readSaved()).activeId, legacySampleId);

    await page.reload();
    await page.locator('#wbCfg').click();
    assert.equal(await page.locator('#cfBase').inputValue(), endpoint);
    assert.equal(await page.locator('#cfComfyName').innerText(), sampleName);
    assert.equal(await page.locator('#cfComfyPerson').inputValue(), '1');
    assert.equal(await page.locator('#cfComfyGarment').inputValue(), '2');
    assert.equal(await page.locator('#cfComfyOutput').inputValue(), '14');
    await page.locator('#cfgX').click();

    await page.locator('#wbFile').setInputFiles(path.join(fixtures, 'person.png'));
    await page.locator('#wbGFile').setInputFiles(path.join(fixtures, 'mk2.png'));
    await page.locator('#wbGo').click();
    await page.locator('#wbHist button').waitFor();
    assert.deepEqual(requests.map(r => [r.method, r.path]), [
      ['GET', '/system_stats'],
      ['POST', '/upload/image'],
      ['POST', '/upload/image'],
      ['POST', '/prompt'],
      ['GET', '/history/posewear-1'],
      ['GET', '/history/posewear-1'],
      ['GET', '/view']
    ]);
    const prompt = structuredClone(sample);
    prompt['1'].inputs.image = 'posewear/person.jpg';
    prompt['2'].inputs.image = 'posewear/garment.jpg';
    assert.deepEqual(JSON.parse(requests[3].body).prompt, prompt);
    assert.equal(requests.at(-1).query.get('filename'), 'result.png');
    assert.equal(requests.at(-1).query.get('subfolder'), 'try-on');
    assert.equal(requests.at(-1).query.get('type'), 'output');

    // ローカル接続にクラウドのキーやプロキシ設定が漏れないことを確認します。
    assert.deepEqual(proxyRequests, []);
    for (const request of requests) {
      assert.equal(request.headers.authorization, undefined);
      assert.equal(request.headers['x-target-url'], undefined);
      assert.ok(!request.body.includes(cloudKey));
    }

    await page.reload();
    await page.locator('#wbHist button').click();
    await page.locator('#wbAfter').waitFor();
    assert.match(await page.locator('#wbMeta').innerText(), /ComfyUI.*try-on-qwen-2509-api/);
    assert.ok(await page.locator('#wbSentD').isHidden());
    await page.locator('#wbCfg').click();
    await page.selectOption('#cfConnection', originalProfile.connectionId);
    assert.equal(await page.locator('#cfKey').inputValue(), cloudKey);
    assert.equal(await page.locator('#cfModel').inputValue(), 'gpt-image-1-mini');
    // 同じ人物と衣装でポーズを2つ選び、各2枚の送信内容と履歴を確認します。
    await page.selectOption('#cfConnection', localId);
    await page.click('#cfProfileNew');
    const poseFile = 'posewear-qwen21-pose-api.json';
    const poseWorkflow = await page.request.get(new URL('/workflows/' + poseFile, site).href);
    assert.equal(poseWorkflow.status(), 200);
    await page.locator('#cfComfyWorkflow').setInputFiles({
      name: poseFile, mimeType: 'application/json', buffer: await poseWorkflow.body()
    });
    await page.waitForFunction(() => document.querySelector('#cfComfyPose').value === '490');
    for (const [role, id] of Object.entries({
      Person:'470', Garment:'475', Pose:'490', Output:'461', Prompt:'488', Aspect:'13', Seed:'459:458'
    })) assert.equal(await page.inputValue('#cfComfy' + role), id);
    await page.fill('#cfProfileName', 'Qwen・PEあり');
    await page.click('#cfSave');
    const enhancedId = await page.inputValue('#cfProfile');
    assert.equal((await readSaved()).activeId, legacySampleId);

    // PEなしも別名で登録し、管理画面からPEありを選び直して生成します。
    await page.click('#cfProfileNew');
    const noPeFile = 'posewear-qwen21-pose-no-pe-api.json';
    const [noPeDownload] = await Promise.all([
      page.waitForEvent('download'), page.click('a[download][href$="' + noPeFile + '"]')
    ]);
    await page.setInputFiles('#cfComfyWorkflow', {
      name: noPeFile, mimeType: 'application/json', buffer: await fs.readFile(await noPeDownload.path())
    });
    await page.waitForFunction(() => document.querySelector('#cfComfyPose').value === '490');
    await page.fill('#cfProfileName', 'Qwen・PEなし');
    await page.click('#cfSave');
    const directId = await page.inputValue('#cfProfile');
    assert.notEqual(enhancedId, directId);
    assert.ok(await page.locator('#cfg').isVisible());
    assert.equal((await readSaved()).activeId, legacySampleId);
    await page.selectOption('#cfProfile', enhancedId);
    assert.equal((await readSaved()).activeId, legacySampleId);
    // 管理画面の3つのノード選択欄が、画面幅によらず同じ列に並ぶことを確認します。
    for (const width of [1280, 390]) {
      await page.setViewportSize({width, height: 900});
      const boxes = [];
      for (const role of ['Person', 'Garment', 'Pose']) {
        boxes.push(await page.locator('#cfComfy' + role).boundingBox());
      }
      assert.ok(boxes.every(Boolean), `すべてのノード選択欄が表示されます (幅 ${width})`);
      assert.ok(boxes.every(box => Math.abs(box.x - boxes[0].x) < 1),
        `ノード選択欄の左端が揃います (幅 ${width})`);
      assert.ok(boxes[0].y + boxes[0].height <= boxes[1].y &&
        boxes[1].y + boxes[1].height <= boxes[2].y, `ノード選択欄が縦に並びます (幅 ${width})`);
    }
    await page.setViewportSize({width: 1280, height: 900});
    await page.click('#cfUse');
    await page.locator('#cfg').waitFor({ state: 'hidden' });
    assert.equal((await readSaved()).activeId, enhancedId);
    assert.equal(await page.inputValue('#wbWorkflow'), enhancedId);
    await page.setInputFiles('#wbFile', path.join(fixtures, 'person.png'));
    await page.setInputFiles('#wbGFile', path.join(fixtures, 'mk2.png'));
    await page.locator('.step[data-s="3"] .sh [data-pick="pose"]').click();
    const choices = page.locator('#pkG button[data-k]');
    await choices.nth(0).click();
    await choices.nth(1).click();
    await page.click('#pkDone');
    const angle = page.locator('#wbPo [data-ang]').first();
    await angle.selectOption({index:1});
    await page.selectOption('#wbN', '2');
    await page.selectOption('#wbAR', '2:3');
    const beforeBatch = requests.length;
    await page.click('#wbGo');
    await page.waitForFunction(() => document.querySelectorAll('#wbHist [data-t]').length === 5);
    const batch = requests.slice(beforeBatch);
    assert.equal(batch.filter(r => r.path === '/upload/image').length, 4);
    const graphs = batch.filter(r => r.path === '/prompt').map(r => JSON.parse(r.body).prompt);
    assert.equal(graphs.length, 4);
    assert.deepEqual(graphs.map(g => g['490'].inputs.image), ['pose-1','pose-1','pose-2','pose-2'].map(n=>'posewear/' + n + '.jpg'));
    assert.equal(new Set(graphs.map(g=>g['459:458'].inputs.seed)).size, 4);
    assert.equal(new Set(graphs.map(g=>g['488'].inputs.value)).size, 2);
    for (const graph of graphs) {
      assert.equal(graph['470'].inputs.image, 'posewear/person.jpg');
      assert.equal(graph['475'].inputs.image, 'posewear/garment.jpg');
      assert.deepEqual(graph['486'].inputs['images.image3'], ['490',0]);
      assert.deepEqual(graph['459:474'].inputs['images.image_3'], ['490',0]);
      assert.match(graph['488'].inputs.value, /image 3/i);
      assert.equal(graph['459:468'].inputs.switch, true);
      assert.match(graph['13'].inputs.aspect_ratio, /^2:3 /);
    }
    // 素材や追加指示を入力したままPEを切り替え、次の送信で選んだグラフを確認します。
    await page.click('#wbAdv summary');
    await page.fill('#wbExtra', '白いバッグを持つ');
    await page.selectOption('#wbWorkflow', directId);
    assert.equal(await page.inputValue('#wbExtra'), '白いバッグを持つ');
    assert.equal(await page.locator('#wbPersons img').count(), 1);
    assert.equal(await page.locator('#wbG img').count(), 1);
    assert.equal(await page.locator('#wbPo [data-ang]').count(), 2);
    // 生成した4枚がまとめて取得でき、他の試着履歴が ZIP に混ざらないことを確認します。
    const [zipDownload] = await Promise.all([page.waitForEvent('download'), page.click('#wbZip')]);
    const zip = await fs.readFile(await zipDownload.path());
    const endOfDirectory = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    assert.ok(endOfDirectory >= 0);
    assert.equal(zip.readUInt16LE(endOfDirectory + 10), 4);
    const beforeDirect = requests.length;
    await page.selectOption('#wbN', '1');
    await page.click('#wbGo');
    await page.waitForFunction(() => document.querySelectorAll('#wbHist [data-t]').length === 7);
    const directGraphs = requests.slice(beforeDirect).filter(r => r.path === '/prompt').map(r => JSON.parse(r.body).prompt);
    assert.equal(directGraphs.length, 2);
    for (const graph of directGraphs) {
      assert.equal(graph['486'], undefined);
      assert.deepEqual(graph['459:474'].inputs.prompt, ['488', 0]);
      assert.deepEqual(graph['459:474'].inputs['images.image_3'], ['490', 0]);
      assert.match(graph['488'].inputs.value, /白いバッグを持つ/);
    }
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#wbHist [data-t]').length === 7);
    await page.locator('#wbHist [data-t]').nth(2).click();
    assert.match(await page.locator('#wbMeta').innerText(), /Qwen・PEあり/);
    // ポーズをすべて外しても同じ設定を使え、古い第3画像は再送されません。
    while (await page.locator('#wbPo [data-rm]').count()) await page.locator('#wbPo [data-rm]').first().click();
    await page.setInputFiles('#wbFile', path.join(fixtures, 'person.png'));
    await page.setInputFiles('#wbGFile', path.join(fixtures, 'mk2.png'));
    await page.selectOption('#wbN', '1');
    await page.click('#wbGo');
    await page.waitForFunction(() => document.querySelectorAll('#wbHist [data-t]').length === 8);
    assert.equal(await page.inputValue('#wbWorkflow'), directId);
    const noPose = JSON.parse(requests.filter(r => r.path === '/prompt').at(-1).body).prompt;
    assert.equal(noPose['490'], undefined);
    assert.equal(noPose['486'], undefined);
    assert.deepEqual(noPose['459:474'].inputs.prompt, ['488', 0]);
    assert.equal(noPose['459:474'].inputs['images.image_3'], undefined);
    assert.equal(poseUploads, 4);

    // 名前を変更してから削除しても、生成時の名前を履歴から確認できます。
    await page.click('#wbCfg');
    await page.fill('#cfProfileName', 'PEなし 改名');
    await page.click('#cfSave');
    assert.equal(await page.inputValue('#cfProfile'), directId);
    const [backupFile] = await Promise.all([page.waitForEvent('download'), page.click('#cfExp')]);
    const backup = await fs.readFile(await backupFile.path(), 'utf8');
    assert.ok(!backup.includes(cloudKey));
    assert.equal(JSON.parse(backup).settings.profiles.filter(profile => profile.connectionId === localId).length, 3);
    page.once('dialog', dialog => dialog.accept());
    await page.click('#cfDelete');
    assert.notEqual(await page.inputValue('#cfProfile'), directId);
    await page.click('#cfgX');
    await page.locator('#wbHist [data-t]').first().click();
    assert.match(await page.innerText('#wbMeta'), /Qwen・PEなし/);
    await page.click('#wbCfg');
    page.once('dialog', dialog => dialog.accept());
    await page.setInputFiles('#cfImpF', {
      name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(backup)
    });
    await page.waitForFunction(id => document.querySelector('#cfProfile').value === id, directId);
    assert.equal(await page.inputValue('#cfProfileName'), 'PEなし 改名');

    // 以前の単一設定を持つブラウザーでも、再登録せず元の割り当てを使えます。
    await page.evaluate(({base, workflow, name}) => {
      localStorage.removeItem('wbGenerationSettings');
      localStorage.wbCfg = JSON.stringify({ prov: 'comfy' });
      localStorage.setItem('wbComfy', JSON.stringify({
        base, workflow, name, mapping: {person: '1', garment: '2', output: '14'}
      }));
    }, {base: endpoint, workflow: sample, name: sampleName});
    await page.reload();
    await page.click('#wbCfg');
    assert.equal(await page.textContent('#cfComfyName'), sampleName);
    assert.equal(await page.inputValue('#cfComfyGarment'), '2');
    await page.click('#cfSave');
    assert.equal(await page.locator('#wbWorkflow option').count(), 1);
    page.once('dialog', dialog => dialog.accept());
    await page.click('#cfDelete');
    await page.click('#cfgX');
    assert.ok(await page.locator('#wbCfg').isVisible());
    assert.deepEqual(proxyRequests, []);
    assert.deepEqual(errors, []);
    console.log('ComfyUI browser regression passed (local HTTP mock, CORS, workflow, history, key isolation).');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => mockComfy.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
