// v16：/api/proxy 端口与协议策略单元测试（node 直跑，不经浏览器）
// node tests/v16-proxy.mjs
import { onRequest } from '../functions/api/proxy.js';
// 実際の外部ホストへ接続せず、許可されたリクエストだけが転送処理に到達することを確認します。
globalThis.fetch = async url => new Response(String(url));
let pass = 0, fail = 0;
const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' :: ' + d : '')); c ? pass++ : fail++; };
const SELF = 'https://posewear.pages.dev';
async function call(target, headers = {}, withOrigin = true) {
  const h = new Headers(headers);
  if (withOrigin) h.set('origin', SELF);
  if (target) h.set('x-target-url', target);
  const req = new Request(SELF + '/api/proxy', { method: 'POST', headers: h, body: '{}' });
  const r = await onRequest({ request: req, waitUntil() {} });
  const t = await r.text().catch(() => '');
  return { status: r.status, body: t.slice(0, 120) };
}
let r = await call('https://example.com:8443/v1/images/generations', { 'x-proxy-custom': '1' });
ok('custom https 非443 端口放行', r.status === 200 && r.body === 'https://example.com:8443/v1/images/generations', r.status + ' ' + r.body);
r = await call('http://example.com:8080/v1/images/edits', { 'x-proxy-custom': '1' });
ok('custom http 非443 端口放行', r.status === 200 && r.body === 'http://example.com:8080/v1/images/edits', r.status + ' ' + r.body);
r = await call('https://api.openai.com:8443/v1/images/generations', {});
ok('官方域名带端口仍拒绝', r.status === 400, r.status + ' ' + r.body);
r = await call('http://192.168.1.5:8188/v1/images/generations', { 'x-proxy-custom': '1' });
ok('自定义内网地址仍拒绝', r.status === 403, r.status + ' ' + r.body);
r = await call('https://example.com:8443/v1/chat/completions', { 'x-proxy-custom': '1' });
ok('自定义非图片路径仍拒绝', r.status === 403, r.status + ' ' + r.body);
r = await call('https://example.com/v1/images/generations', { 'x-proxy-custom': '1' }, false);
ok('无同源来源仍拒绝', r.status === 403, r.status + ' ' + r.body);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
