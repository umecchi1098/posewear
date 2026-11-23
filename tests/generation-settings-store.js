const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const files = ['comfy.js', 'comfy-workflows.js', 'generation-settings.js'];
const scripts = files.map(name => new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8'), {filename:name}));

// ブラウザーと同様に文字列として保存し、容量不足も再現できる小さなテスト用ストレージです。
function context(initial, failWrite = false) {
  const values = new Map(Object.entries(initial));
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      if (failWrite) throw Error('quota');
      values.set(key, value);
    },
    removeItem: key => values.delete(key)
  };
  const runtime = vm.createContext({window:{}, localStorage:storage, crypto:webcrypto, URL});
  for (const script of scripts) script.runInContext(runtime);
  return {store:runtime.window.GenerationSettings, values};
}

const graph = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'workflows', 'try-on-qwen-2509-api.json'), 'utf8'));
const comfy = {base:'http://localhost:8188', workflow:graph, name:'try-on.json', mapping:{person:'1', garment:'2', output:'14'}};
const cloud = {prov:'comfy', cloudProv:'openai', base:'https://example.test/v1', model:'manual', key:'test-secret', quality:'auto'};
const {store, values} = context({wbCfg:JSON.stringify(cloud), wbComfy:JSON.stringify(comfy)});
let state = store.load();
assert.equal(state.connections.length, 2);
assert.equal(store.resolve(state).profile.fileName, 'try-on.json');
assert.equal(state.profiles.find(p => p.model === 'manual').quality, 'auto');
assert.equal(values.has('wbCfg'), false);
assert.equal(JSON.stringify(store.load()), JSON.stringify(state));

// 旧版から移行した独自接続でも、再読込時に送信形式が変わらないことを確かめます。
for (const proto of ['xai', 'gemini']) {
  const migrated = context({wbCfg:JSON.stringify({prov:'custom', proto})}).store;
  migrated.load();
  assert.equal(migrated.resolve(migrated.load()).connection.proto, proto);
}

// 同一サービスの別接続と同名モデルでも、キーと任意項目は選んだ設定のものだけを使います。
const second = store.saveConnection(state, {name:'2', prov:'openai', base:'https://second.test', key:'second-secret'});
const saved = store.saveProfile(second.state, {name:'仕上げ', connectionId:second.connection.id, model:'manual', complexity:'high'});
assert.equal(saved.state.activeId, state.activeId);
state = store.select(saved.state, saved.profile.id);
assert.equal(store.resolve(state).connection.key, 'second-secret');
assert.equal(store.resolve(state).profile.complexity, 'high');
assert.throws(() => store.removeConnection(state, second.connection.id), /connectionInUse/);

// キー除外時は同一 ID でも別の送信先に秘密を引き継がず、ComfyUI 限定書き出しはクラウド情報を含みません。
const backup = store.exportBackup(state, false, false);
assert.ok(!JSON.stringify(backup).includes('secret'));
assert.equal(store.resolve(store.importBackup(state, backup)).connection.key, 'second-secret');
backup.settings.connections.find(c => c.id === second.connection.id).base = 'https://changed.test';
assert.equal(store.resolve(store.importBackup(state, backup)).connection.key, '');
const local = store.exportBackup(state, false, true);
assert.equal(local.settings.connections.length, 1);
assert.ok(!JSON.stringify(local).includes('second.test'));
assert.equal(store.resolve(store.importBackup(state, local)).connection.key, 'second-secret');

// 旧バックアップは独立した接続として取り込み、すでに追加済みのモデルやキーを上書きしません。
const restored = store.importBackup(state, {cfg:{...cloud, prov:'openai', key:''}});
assert.equal(restored.connections.length, 4);
assert.equal(store.resolve(restored).connection.key, '');
assert.equal(store.resolve(restored, saved.profile.id).connection.key, 'second-secret');
assert.equal(store.resolve(restored, 'legacy-cloud-profile').connection.key, 'test-secret');

// 間違った ID やノード割り当てを含むファイルは部分保存しません。
const invalid = store.exportBackup(restored, true, false);
invalid.settings.activeId = 'missing';
const before = values.get('wbGenerationSettings');
assert.throws(() => store.importBackup(restored, invalid));
assert.equal(values.get('wbGenerationSettings'), before);
const wrongNodes = {cfg:{prov:'comfy'}, comfy:{...comfy, mapping:{person:'1', garment:'1', output:'14'}}};
assert.throws(() => store.importBackup(restored, wrongNodes));
assert.equal(values.get('wbGenerationSettings'), before);

// 移行が一部失敗しても正常な設定は使え、容量不足や破損時に原本を消しません。
for (const [cfg, work, prov, badKey] of [
  ['{', JSON.stringify(comfy), 'comfy', 'wbCfg'],
  [JSON.stringify({...cloud, prov:'openai'}), '{', 'openai', 'wbComfy']
]) {
  const broken = context({wbCfg:cfg, wbComfy:work});
  assert.equal(broken.store.load().connections[0].prov, prov);
  assert.equal(broken.values.get(badKey), '{');
  assert.ok(broken.store.loadIssue);
}
const full = context({wbCfg:JSON.stringify({...cloud, prov:'openai'})}, true);
assert.equal(full.store.resolve(full.store.load()).connection.key, 'test-secret');
assert.ok(full.store.loadIssue);
assert.ok(full.values.has('wbCfg'));
const damaged = context({wbGenerationSettings:'{'});
const blank = damaged.store.load();
assert.throws(() => damaged.store.saveConnection(blank, {name:'保存', prov:'openai'}));
assert.equal(damaged.values.get('wbGenerationSettings'), '{');
damaged.store.importBackup(blank, {cfg:{...cloud, prov:'openai'}});
assert.equal(damaged.store.resolve(damaged.store.load()).profile.model, 'manual');
console.log('PASS generation settings storage, migration, isolated credentials and backup recovery');
