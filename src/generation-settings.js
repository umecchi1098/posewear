'use strict';
(() => {
  // 接続と生成設定は同じ保存単位にまとめ、選択中の ID が宙に浮かないようにします。
  const KEY = 'wbGenerationSettings';
  const providers = {openai:'OpenAI', gemini:'Gemini', seedream:'Seedream', custom:'Custom', comfy:'ComfyUI'};
  const empty = () => ({version:1, connections:[], profiles:[], activeId:null});
  const error = code => Object.assign(new Error(code), {code});
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' ? value.trim() : '';
  // Windows から HTTP で開いた場合にも使える乱数 API で ID を作ります。
  const newId = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');

  function connection(value) {
    if (!record(value) || !text(value.id) || !Object.hasOwn(providers, value.prov)) throw error('invalidConnection');
    const name = text(value.name);
    if (!name) throw error('invalidConnectionName');
    const {id, prov} = value;
    // ローカル接続には、クラウドのキーやプロキシ設定を持たせません。
    if (prov === 'comfy') return {id, name, prov, base:window.ComfyUI.normalizeBase(value.base)};
    return {
      id, name, prov, base:text(value.base), key:text(value.key), proxy:value.proxy === true,
      proto:value.proto === 'json' ? 'json' : 'edits', field:value.field === 'image' ? 'image' : 'image[]'
    };
  }

  function profile(value, connections) {
    if (!record(value) || !text(value.id)) throw error('invalidProfile');
    const parent = connections.find(item => item.id === value.connectionId);
    if (!parent) throw error('invalidConnection');
    const name = text(value.name);
    if (!name) throw error('invalidProfileName');
    const {id, connectionId} = value;
    if (parent.prov === 'comfy') return {...window.ComfyWorkflows.profile(value), connectionId};
    return {
      id, name, connectionId, model:text(value.model),
      quality:parent.prov === 'openai' ? text(value.quality) : '',
      complexity:parent.prov === 'openai' ? text(value.complexity) : ''
    };
  }

  function readState(value) {
    // 保存ファイルは外部入力です。ID の重複と参照先をまとめて調べてから採用します。
    if (!record(value) || value.version !== 1 || !Array.isArray(value.connections) || !Array.isArray(value.profiles)) {
      throw error('invalidSettings');
    }
    const connections = value.connections.map(connection);
    const profiles = value.profiles.map(item => profile(item, connections));
    if ([connections, profiles].some(items => new Set(items.map(item => item.id)).size !== items.length)) {
      throw error('invalidSettings');
    }
    if (value.activeId !== null && !profiles.some(item => item.id === value.activeId)) throw error('invalidProfile');
    return {version:1, connections, profiles, activeId:value.activeId};
  }

  function legacyCloud(cloud) {
    const state = empty();
    if (!record(cloud) || !Object.hasOwn(providers, cloud.prov)) throw error('invalidConnection');
    if (cloud.prov === 'comfy' && !(cloud.cloudProv || cloud.key || cloud.model)) return state;
    // 旧版は ComfyUI 利用中も、一つ前のクラウド接続を同じレコードに保持していました。
    const prov = cloud.prov === 'comfy' ? cloud.cloudProv || 'openai' : cloud.prov;
    if (prov === 'comfy') throw error('invalidConnection');
    const parent = connection({...cloud, id:'legacy-cloud', name:providers[prov], prov});
    state.connections.push(parent);
    const saved = profile({...cloud, id:'legacy-cloud-profile', connectionId:parent.id,
      name:text(cloud.model) || parent.name}, state.connections);
    state.profiles.push(saved);
    if (cloud.prov !== 'comfy') state.activeId = saved.id;
    return state;
  }

  function addLegacyWorkflows(state, local, wasLocal) {
    const old = window.ComfyWorkflows.fromBackup(local);
    const parent = connection({id:'legacy-comfy', name:'ComfyUI', prov:'comfy', base:old.base});
    state.connections.push(parent);
    // 旧ワークフロー名とファイル名は別々に保ち、選択中の ID も復元します。
    for (const item of old.workflows) {
      const id = state.profiles.some(p => p.id === item.id) ? newId() : item.id;
      state.profiles.push({...item, id, connectionId:parent.id});
      if (wasLocal && old.activeId === item.id) state.activeId = id;
    }
    return state;
  }

  let loadIssue = null;
  let unreadableSettings = false;
  let migratedKeys = [];

  function persist(state, restoring = false) {
    // 壊れた保存データは画面を開くだけでは上書きせず、確認済みの復元操作で置き換えます。
    if (unreadableSettings && !restoring) throw error('invalidSettings');
    localStorage.setItem(KEY, JSON.stringify(state));
    unreadableSettings = false;
    if (restoring) loadIssue = null;
    // 新しい保存に成功した後だけ旧キーを消し、読み取れなかった旧データはそのまま残します。
    for (const key of migratedKeys) localStorage.removeItem(key);
    migratedKeys = [];
    return state;
  }

  function load() {
    loadIssue = null;
    unreadableSettings = false;
    migratedKeys = [];
    let stored, cloudRaw, localRaw;
    try {
      stored = localStorage.getItem(KEY);
      if (stored !== null) return readState(JSON.parse(stored));
      cloudRaw = localStorage.getItem('wbCfg');
      localRaw = localStorage.getItem('wbComfy');
    } catch {
      unreadableSettings = true;
      loadIssue = '无法读取已保存的设置。请重新打开页面或从备份恢复。';
      return empty();
    }

    // 分けて移行すると、古いワークフロー JSON の破損で有効なクラウド設定まで失うことがありません。
    let migrated = empty(), wasLocal = false;
    if (cloudRaw !== null) {
      try {
        const cfg = JSON.parse(cloudRaw);
        migrated = legacyCloud(cfg);
        wasLocal = cfg.prov === 'comfy';
        migratedKeys.push('wbCfg');
      } catch {
        loadIssue = '部分旧设置无法读取，已保留原始数据。';
      }
    }
    if (localRaw !== null) {
      try {
        addLegacyWorkflows(migrated, JSON.parse(localRaw), wasLocal);
        migratedKeys.push('wbComfy');
      } catch {
        loadIssue = '部分旧设置无法读取，已保留原始数据。';
      }
    }
    if (migratedKeys.length) {
      try {
        persist(migrated);
      } catch {
        // 容量不足でも移行できた設定をその場で使えるようにし、元のキーは次の保存まで保持します。
        loadIssue = '旧设置已载入，但新格式尚未保存。';
      }
    }
    return migrated;
  }

  function saveConnection(state, draft) {
    const id = draft.id || newId();
    const previous = state.connections.find(item => item.id === id);
    if (draft.id && (!previous || previous.prov !== draft.prov)) throw error('invalidConnection');
    const updated = connection({...draft, id});
    const connections = previous ? state.connections.map(item => item.id === id ? updated : item) : [...state.connections, updated];
    return {state:persist({...state, connections}), connection:updated};
  }

  function saveProfile(state, draft) {
    const id = draft.id || newId();
    const previous = state.profiles.find(item => item.id === id);
    if (draft.id && (!previous || previous.connectionId !== draft.connectionId)) throw error('invalidProfile');
    const updated = profile({...draft, id}, state.connections);
    const profiles = previous ? state.profiles.map(item => item.id === id ? updated : item) : [...state.profiles, updated];
    // 保存だけでは、スタジオで現在使用している生成設定を切り替えません。
    return {state:persist({...state, profiles}), profile:updated};
  }

  function resolve(state, id = state.activeId) {
    const profile = state.profiles.find(item => item.id === id);
    return profile ? {profile, connection:state.connections.find(item => item.id === profile.connectionId)} : null;
  }

  function select(state, id) {
    if (!resolve(state, id)) throw error('invalidProfile');
    return persist({...state, activeId:id});
  }

  function removeProfile(state, id) {
    if (!resolve(state, id)) throw error('invalidProfile');
    return persist({...state, profiles:state.profiles.filter(item => item.id !== id), activeId:state.activeId === id ? null : state.activeId});
  }

  function removeConnection(state, id) {
    if (state.profiles.some(item => item.connectionId === id)) throw error('connectionInUse');
    return persist({...state, connections:state.connections.filter(item => item.id !== id)});
  }

  function exportBackup(state, withKeys, localOnly) {
    const connections = state.connections.filter(item => !localOnly || item.prov === 'comfy').map(item => {
      const copy = {...item};
      if (!withKeys) delete copy.key;
      return copy;
    });
    const profiles = state.profiles.filter(item => connections.some(c => c.id === item.connectionId));
    const activeId = profiles.some(item => item.id === state.activeId) ? state.activeId : null;
    return {app:'衣姿 PoseWear', type:'generation-settings', scope:localOnly ? 'comfy' : 'all',
      settings:{version:1, connections, profiles, activeId}};
  }

  function importBackup(current, backup) {
    if (!record(backup)) throw error('invalidSettings');
    if (backup.type === 'generation-settings') {
      const restored = readState(backup.settings);
      if (backup.scope === 'comfy') {
        if (restored.connections.some(item => item.prov !== 'comfy')) throw error('invalidConnection');
        const clouds = current.connections.filter(item => item.prov !== 'comfy');
        const kept = current.profiles.filter(item => clouds.some(c => c.id === item.connectionId));
        // ComfyUI だけのバックアップで、既存のクラウド設定を失わないようにします。
        const merged = readState({...restored, connections:[...clouds, ...restored.connections], profiles:[...kept, ...restored.profiles],
          activeId:restored.activeId ?? (kept.some(p => p.id === current.activeId) ? current.activeId : null)});
        return persist(merged, true);
      }
      if (backup.scope !== 'all') throw error('invalidSettings');
      // キーを除いたバックアップでは、同じ ID・サービス・送信先がすべて一致するときだけ既存キーを引き継ぎます。
      for (const item of restored.connections) {
        const source = backup.settings.connections.find(c => c.id === item.id);
        if (item.prov === 'comfy' || Object.hasOwn(source, 'key')) continue;
        const same = current.connections.find(c => c.id === item.id && c.prov === item.prov && c.base === item.base);
        if (same) item.key = same.key;
      }
      return persist(restored, true);
    }
    const cfg = backup.cfg || backup;
    const restored = cfg.prov === 'comfy' ? addLegacyWorkflows(empty(), backup.comfy, true) : legacyCloud(cfg);
    if (!restored.connections.length) throw error('invalidSettings');
    // 旧形式には接続 ID がありません。別の保存設定やキーとの混同を避け、独立した接続として取り込みます。
    const connections = [...current.connections];
    const profiles = [...current.profiles];
    let activeId = current.activeId;
    for (const item of restored.connections) {
      const id = newId();
      connections.push({...item, id});
      for (const saved of restored.profiles.filter(p => p.connectionId === item.id)) {
        const profileId = newId();
        profiles.push({...saved, id:profileId, connectionId:id});
        if (saved.id === restored.activeId) activeId = profileId;
      }
    }
    return persist({...current, connections, profiles, activeId}, true);
  }

  window.GenerationSettings = {get loadIssue() {return loadIssue;}, load, saveConnection, saveProfile, resolve, select, removeProfile, removeConnection, exportBackup, importBackup};
})();
