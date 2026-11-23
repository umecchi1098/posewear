// v18：托盘简易生图（悬浮工作台）——选组合 → 托盘内生成 → 存入记录 → 查看/下载；错误与未配置路径
const { chromium } = require('playwright'); const path = require('path'), FX = path.join(__dirname, 'fixtures') + '/'; const fs = require('fs');
(async () => {
  const U = process.env.U || 'http://localhost:8787'; const b = await chromium.launch({ executablePath: process.env.CHROME_PATH }); const R = [], errs = [];
  const P = [fs.readFileSync(FX + 'mk1.png').toString('base64'), fs.readFileSync(FX + 'mk2.png').toString('base64')]; let mode = 'ok', cnt = 0, hits = [];
  const handler = async (route) => { const req = route.request(); const u = req.url(); if (req.method() == 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    hits.push(u); const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (mode == '500') return route.fulfill({ status: 500, headers: H, body: '{"error":{"message":"internal"}}' });
    return route.fulfill({ status: 200, headers: H, body: JSON.stringify({ data: [{ b64_json: P[(cnt++) % 2] }] }) }) };
  async function setup(withKey) { const c = await b.newContext({locale:'zh-CN',  viewport: { width: 1366, height: 900 } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.route(/api\.openai\.com|\/api\/proxy/, handler);
    await p.addInitScript((withKey) => { if (!sessionStorage.x) { sessionStorage.x = 1; if (withKey) localStorage.setItem('wbCfg', JSON.stringify({ prov: 'openai', key: 'sk-test-123', base: '', model: '', field: 'image[]', proto: 'edits', proxy: false })); localStorage.setItem('introX', '1') } }, withKey);
    await p.goto(U + '/#costume'); await p.waitForFunction(() => window.WB && window.APP, null, { timeout: 15000 });
    await p.waitForSelector('.card [data-a="sel"]', { timeout: 15000 }); return { c, p } }
  const sel = async (p, tab) => { await p.evaluate(t => APP.setTab(t), tab); await p.waitForSelector('.card [data-a="sel"]', { timeout: 15000 }); await p.waitForTimeout(400); await p.click('.card [data-a="sel"]'); await p.waitForTimeout(400) };
  // —— 主流程
  { const { c, p } = await setup(true); hits = [];
    await sel(p, 'costume'); await sel(p, 'pose');
    R.push(['tray visible', await p.$eval('#tray', e => !e.hidden), '']);
    await p.waitForFunction(() => document.querySelector('#tgPrompt').value.length > 30, null, { timeout: 15000 }).catch(() => {});
    const pv = await p.$eval('#tgPrompt', e => e.value);
    R.push(['prompt prefilled', pv.length > 30 && /outfit|pose|服装|姿势/i.test(pv), pv.slice(0, 80)]);
    R.push(['prov label', /OpenAI/.test(await p.$eval('#tgProv', e => e.textContent)), await p.$eval('#tgProv', e => e.textContent)]);
    await p.click('#tgGo');
    await p.waitForFunction(() => document.querySelectorAll('#tgRes [data-tg]').length >= 1, null, { timeout: 20000 }).catch(() => {});
    const stat = await p.$eval('#tgStat', e => e.textContent);
    R.push(['quick gen result', await p.$$eval('#tgRes [data-tg]', es => es.length) >= 1 && /完成/.test(stat), stat + ' | api hits ' + hits.length]);
    const hn = await p.evaluate(async () => (await WB.db.hist()).length);
    R.push(['saved to history', hn >= 1, 'records ' + hn]);
    await p.click('#tgRes [data-tg]'); await p.waitForTimeout(300);
    R.push(['viewer opens', await p.$eval('#tgView', e => !e.hidden), '']);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.click('#tgDl')]).catch(() => [null]);
    R.push(['viewer download', !!dl, dl && dl.suggestedFilename()]);
    await p.click('#tgViewX');
    // —— 错误路径
    mode = '500'; await p.click('#tgGo'); await p.waitForFunction(() => /生成失败/.test(document.querySelector('#tgStat').textContent), null, { timeout: 20000 }).catch(() => {});
    R.push(['error shown', /生成失败/.test(await p.$eval('#tgStat', e => e.textContent)), await p.$eval('#tgStat', e => e.textContent)]);
    mode = 'ok'; await c.close() }
  // —— 未配置路径：点生成应打开 API 设置
  { const { c, p } = await setup(false);
    await sel(p, 'costume');
    await p.click('#tgGo'); await p.waitForTimeout(600);
    R.push(['nokey opens cfg', await p.$eval('#cfg', e => !e.hidden), '']);
    await c.close() }
  R.push(['no pageerror', !errs.length, errs.slice(0, 3).join(' | ')]);
  let f = 0; for (const [n, ok, d] of R) { console.log((ok ? 'PASS' : 'FAIL') + ' ' + n + (ok ? '' : ' :: ' + d)); if (!ok) f++ }
  console.log(`v18: ${R.length - f}/${R.length} passed`); await b.close(); process.exit(f ? 1 : 0);
})();
