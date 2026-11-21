'use strict';
(() => {
  const POLL_INTERVAL = 1500;
  const GENERATION_TIMEOUT = 15 * 60 * 1000;
  const TEST_TIMEOUT = 10000;
  const IMAGE_EXTENSIONS = new Map([
    ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
    ['image/gif', 'gif'], ['image/bmp', 'bmp'], ['image/avif', 'avif']
  ]);
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const error = code => Object.assign(new Error(code), {code});

  function normalizeBase(base) {
    // URL の正規化で別表記の IP やユーザー情報が隠れる前に、入力を確認します。
    const value = typeof base === 'string' ? base.trim() : '';
    if (!/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?\/?$/i.test(value)) {
      throw error('invalidBase');
    }
    try {
      const url = new URL(value);
      if (url.port === '0') throw error('invalidBase');
      return url.origin;
    } catch {
      throw error('invalidBase');
    }
  }

  function parseWorkflow(json) {
    let workflow;
    try {
      workflow = JSON.parse(json);
    } catch {
      throw error('invalidWorkflow');
    }
    // 画面用のワークフローではなく、ノード ID をキーとする API 形式を受け付けます。
    if (!isRecord(workflow) || !Object.keys(workflow).length || !Object.entries(workflow).every(
      ([id, node]) => id && isRecord(node) && typeof node.class_type === 'string' &&
        node.class_type.trim() && isRecord(node.inputs)
    )) {
      throw error('invalidWorkflow');
    }
    return workflow;
  }

  function validateMapping(workflow, mapping) {
    const roles = {person: 'LoadImage', garment: 'LoadImage', output: 'SaveImage'};
    if (!isRecord(workflow) || !isRecord(mapping) || mapping.person === mapping.garment ||
      !Object.entries(roles).every(([role, classType]) => {
        const id = mapping[role];
        return typeof id === 'string' && id && Object.hasOwn(workflow, id) &&
          workflow[id]?.class_type === classType && isRecord(workflow[id].inputs);
      })) {
      throw error('invalidMapping');
    }
  }

  async function request(base, path, signal, code, options, result = 'json') {
    try {
      // プロキシ、認証情報、リダイレクトを使わず、選択したローカル接続先だけに通信します。
      const response = await fetch(base + path, {
        ...options, signal, credentials: 'omit', redirect: 'error',
        cache: 'no-store', referrerPolicy: 'no-referrer'
      });
      if (!response.ok) throw error(code);
      return result === 'blob' ? await response.blob() : await response.json();
    } catch {
      signal.throwIfAborted();
      throw error(code);
    }
  }

  function operation(duration, signal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(error('timeout')), duration);
    return {
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      finish: () => clearTimeout(timer)
    };
  }

  async function test(base, signal) {
    const origin = normalizeBase(base);
    const limit = operation(TEST_TIMEOUT, signal);
    try {
      const stats = await request(origin, '/system_stats', limit.signal, 'connection');
      if (!isRecord(stats?.system) || !Array.isArray(stats?.devices)) throw error('connection');
    } finally {
      limit.finish();
    }
  }

  function isFileName(value) {
    return typeof value === 'string' && value.length > 0 &&
      value !== '.' && value !== '..' && !/[\x00-\x1f/\\:]/.test(value);
  }

  function isSubfolder(value) {
    // ComfyUI が返す Windows の区切り文字を含む相対サブフォルダにも対応します。
    return typeof value === 'string' &&
      (value === '' || value.split(/[/\\]/).every(isFileName));
  }

  async function upload(base, image, role, signal) {
    const form = new FormData();
    // Mac の LAN 内 HTTP 配信でも使える乱数 API でアップロード名を区別します。
    const nonce = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
    const filename = `posewear-${role}-${nonce}.${IMAGE_EXTENSIONS.get(image.type)}`;
    form.append('image', image, filename);
    form.append('type', 'input');
    const record = await request(base, '/upload/image', signal, 'upload', {method: 'POST', body: form});
    if (record?.type !== 'input' || !isFileName(record.name) || !isSubfolder(record.subfolder)) {
      throw error('upload');
    }
    return record.subfolder ? record.subfolder.replaceAll('\\', '/') + '/' + record.name : record.name;
  }

  function waitForPoll(signal) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, POLL_INTERVAL);
      function abort() {
        clearTimeout(timer);
        reject(signal.reason);
      }
      signal.addEventListener('abort', abort, {once: true});
    });
  }

  async function generate({base, workflow, mapping, person, garment, signal, onProgress}) {
    const origin = normalizeBase(base);
    validateMapping(workflow, mapping);
    const {person: personNode, garment: garmentNode, output: outputNode} = mapping;
    for (const image of [person, garment]) {
      if (!(image instanceof Blob) || !image.size || !IMAGE_EXTENSIONS.has(image.type)) {
        throw error('invalidImage');
      }
    }

    const limit = operation(GENERATION_TIMEOUT, signal);
    try {
      limit.signal.throwIfAborted();
      // 生成に使うコピーだけにファイル名を設定し、保存済みのワークフローはそのまま使います。
      const prompt = structuredClone(workflow);
      onProgress?.('uploading');
      prompt[personNode].inputs.image = await upload(origin, person, 'person', limit.signal);
      prompt[garmentNode].inputs.image = await upload(origin, garment, 'garment', limit.signal);

      onProgress?.('submitting');
      const job = await request(origin, '/prompt', limit.signal, 'submit', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({prompt})
      });
      const promptId = job?.prompt_id;
      if (typeof promptId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(promptId)) throw error('submit');

      onProgress?.('waiting');
      // 自分が送信したジョブだけを確認し、選んだ保存ノードの先頭画像を取得します。
      let entry;
      while (!entry) {
        const history = await request(origin, '/history/' + promptId, limit.signal, 'history');
        if (!isRecord(history)) throw error('history');
        if (Object.hasOwn(history, promptId)) {
          entry = history[promptId];
          if (!isRecord(entry)) throw error('history');
        } else {
          await waitForPoll(limit.signal);
        }
      }
      if (entry.status?.status_str === 'error') throw error('execution');
      const output = entry.outputs?.[outputNode]?.images?.[0];
      if (!output) throw error('noOutput');
      if (output.type !== 'output' || !isFileName(output.filename) || !isSubfolder(output.subfolder)) {
        throw error('download');
      }

      onProgress?.('downloading');
      const query = new URLSearchParams({
        filename: output.filename, subfolder: output.subfolder, type: 'output'
      });
      const result = await request(origin, '/view?' + query, limit.signal, 'download', undefined, 'blob');
      if (!result.size || !IMAGE_EXTENSIONS.has(result.type)) throw error('download');
      return result;
    } finally {
      // キャンセルはブラウザの通信に適用し、ComfyUI 全体のキューには操作を加えません。
      limit.finish();
    }
  }

  window.ComfyUI = {normalizeBase, parseWorkflow, validateMapping, test, generate};
})();
