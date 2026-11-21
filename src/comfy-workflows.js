'use strict';
(() => {
  const KEY = 'wbComfy';
  const VERSION = 1;
  const DEFAULT_BASE = 'http://127.0.0.1:8188';
  const {normalizeBase, parseWorkflow, validateMapping} = window.ComfyUI;
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const error = code => Object.assign(new Error(code), {code});
  const newState = (base = DEFAULT_BASE) => ({version: VERSION, base, activeId: null, workflows: []});

  function profile(value) {
    const {id, name, fileName, workflow, mapping} = value;
    if (typeof id !== 'string' || !id.trim() || typeof fileName !== 'string') {
      throw error('invalidWorkflow');
    }
    if (typeof name !== 'string' || !name.trim()) throw error('invalidWorkflowName');
    const graph = parseWorkflow(JSON.stringify(workflow));
    validateMapping(graph, mapping);
    const bindings = {};
    for (const role of ['person', 'garment', 'output', 'pose', 'prompt', 'aspect', 'seed']) {
      if (typeof mapping[role] === 'string') bindings[role] = mapping[role];
    }
    return {id, name: name.trim(), fileName, workflow: graph, mapping: bindings};
  }

  function fromBackup(value) {
    if (!isRecord(value)) throw error('invalidWorkflow');
    const state = newState(normalizeBase(value.base));
    if (value.version === undefined && Object.hasOwn(value, 'workflow')) {
      // 旧設定には表示名がなく、name には読み込んだファイル名が入っています。
      const fileName = typeof value.name === 'string' ? value.name : '';
      const name = fileName.replace(/\.json$/i, '').trim() || 'ComfyUI';
      if (value.workflow !== null) {
        state.activeId = 'legacy';
        state.workflows = [profile({...value, id: state.activeId, name, fileName})];
      }
      return state;
    }

    if (value.version !== VERSION || !Array.isArray(value.workflows)) throw error('invalidWorkflow');
    const workflows = Array.from(value.workflows, item => {
      if (!isRecord(item)) throw error('invalidWorkflow');
      return profile(item);
    });
    const ids = new Set(workflows.map(item => item.id));
    if (ids.size !== workflows.length ||
      (ids.size ? !ids.has(value.activeId) : value.activeId !== null)) {
      throw error('invalidWorkflow');
    }
    return {...state, activeId: value.activeId, workflows};
  }

  function load() {
    // 旧形式から読み込んだ内容は、新しい形式での初回保存時に確定します。
    try {
      const stored = localStorage.getItem(KEY);
      return stored === null ? newState() : fromBackup(JSON.parse(stored));
    } catch {
      return newState();
    }
  }

  function active(state) {
    const current = state.workflows.find(item => item.id === state.activeId);
    return {...(current || {id: null, name: '', fileName: '', workflow: null, mapping: {}}), base: state.base};
  }

  function persist(state) {
    // 一つのキーへまとめて書くことで、選択状態と登録内容を同時に更新します。
    localStorage.setItem(KEY, JSON.stringify(state));
    return state;
  }

  function save(state, {id, name, fileName, workflow, mapping, base = state.base}) {
    const nextBase = normalizeBase(base);
    const workflows = [...state.workflows];
    const index = id == null ? -1 : workflows.findIndex(item => item.id === id);
    if (id != null && index < 0) throw error('invalidWorkflow');
    if (id == null) {
      // LAN 内で HTTP 配信する場合にも利用できる乱数 API で識別子を作ります。
      id = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
    }
    const updated = profile({id, name, fileName, workflow, mapping});
    workflows[index < 0 ? workflows.length : index] = updated;
    return persist({...state, base: nextBase, activeId: id, workflows});
  }

  function select(state, id) {
    if (!state.workflows.some(item => item.id === id)) throw error('invalidWorkflow');
    return persist({...state, activeId: id});
  }

  function remove(state, id) {
    const workflows = state.workflows.filter(item => item.id !== id);
    if (workflows.length === state.workflows.length) throw error('invalidWorkflow');
    const activeId = state.activeId === id ? workflows[0]?.id ?? null : state.activeId;
    return persist({...state, activeId, workflows});
  }

  const replace = state => persist(fromBackup(state));

  window.ComfyWorkflows = {load, active, save, select, remove, replace};
})();
