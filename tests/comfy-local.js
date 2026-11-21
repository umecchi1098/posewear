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
  let historyReads = 0;
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
    switch (url.pathname) {
      case '/system_stats':
        value = { system: {}, devices: [] };
        break;
      case '/upload/image':
        value = {
          type: 'input',
          subfolder: 'posewear',
          name: body.includes('posewear-person-') ? 'person.jpg' : 'garment.jpg'
        };
        break;
      case '/prompt':
        value = { prompt_id: 'posewear-test' };
        break;
      case '/history/posewear-test':
        // 計算中は履歴が空で、次の問い合わせで初めて結果が届きます。
        if (++historyReads === 1) {
          value = {};
          break;
        }
        value = {
          'posewear-test': {
            status: { status_str: 'success' },
            outputs: { 14: { images: [{ filename: 'result.png', subfolder: 'try-on', type: 'output' }] } }
          }
        };
        break;
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
    await page.locator('label:has([name=prov][value=comfy])').click();
    assert.ok(await page.locator('#cfKey').isHidden());
    await page.locator('#cfComfyBase').fill(endpoint);
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
    await page.locator('#cfComfyPerson').selectOption('1');
    await page.locator('#cfComfyGarment').selectOption('1');
    assert.equal(await page.locator('#cfComfyOutput').inputValue(), '14');
    await page.locator('#cfSave').click();
    await page.getByText('人物用と服装用に別々の LoadImage ノードを選び、SaveImage ノードを1つ選択してください。', { exact: true }).waitFor();
    assert.equal(requests.length, 1);

    await page.locator('#cfComfyGarment').selectOption('2');
    await page.locator('#cfSave').click();
    await page.locator('#cfg').waitFor({ state: 'hidden' });
    await page.reload();
    await page.locator('#wbCfg').click();
    assert.equal(await page.locator('#cfComfyBase').inputValue(), endpoint);
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
      ['GET', '/history/posewear-test'],
      ['GET', '/history/posewear-test'],
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
    assert.match(await page.locator('#wbMeta').innerText(), /ComfyUI.*try-on-qwen-2509-api\.json/);
    assert.ok(await page.locator('#wbSentD').isHidden());
    await page.locator('#wbCfg').click();
    await page.locator('label:has([name=prov][value=openai])').click();
    assert.equal(await page.locator('#cfKey').inputValue(), cloudKey);
    assert.equal(await page.locator('#cfModel').inputValue(), 'gpt-image-1-mini');
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
