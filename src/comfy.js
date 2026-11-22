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
  const REQUIRED_ROLES = ['person', 'garment', 'output'];
  const OPTIONAL_ROLES = ['pose', 'prompt', 'aspect', 'seed'];
  const ASPECTS = new Map([
    ['1:1', '1:1 (Square)'], ['2:3', '2:3 (Portrait Photo)'], ['3:2', '3:2 (Photo)'],
    ['3:4', '3:4 (Portrait Standard)'], ['4:3', '4:3 (Standard)'],
    ['9:16', '9:16 (Portrait Widescreen)'], ['16:9', '16:9 (Widescreen)'],
    ['21:9', '21:9 (Ultrawide)']
  ]);

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

  function matchesBinding(node, role) {
    if (!isRecord(node?.inputs)) return false;
    const {class_type: type, inputs} = node;
    switch (role) {
      case 'person':
      case 'garment':
      case 'pose':
        return type === 'LoadImage';
      case 'output':
        return type === 'SaveImage';
      case 'prompt':
        return (type === 'PrimitiveStringMultiline' && typeof inputs.value === 'string') ||
          (type === 'TextEncodeQwenImageEditPlus' && typeof inputs.prompt === 'string');
      case 'aspect':
        return type === 'ResolutionSelector' && typeof inputs.aspect_ratio === 'string';
      case 'seed':
        return type === 'KSampler' && Number.isSafeInteger(inputs.seed) && inputs.seed >= 0;
      default:
        return false;
    }
  }

  function validateMapping(workflow, mapping) {
    if (!isRecord(workflow) || !isRecord(mapping)) throw error('invalidMapping');
    if (mapping.pose && (mapping.pose === mapping.person || mapping.pose === mapping.garment)) {
      throw error('invalidPoseMapping');
    }
    const roles = [...REQUIRED_ROLES, ...OPTIONAL_ROLES.filter(role =>
      mapping[role] != null && mapping[role] !== '')];
    const ids = roles.map(role => mapping[role]);
    if (new Set(ids).size !== ids.length || !roles.every(role => {
      const id = mapping[role];
      return typeof id === 'string' && id && Object.hasOwn(workflow, id) &&
        matchesBinding(workflow[id], role);
    })) {
      throw error('invalidMapping');
    }
  }

  async function request(base, path, signal, code, options, result = 'json') {
    try {
      signal.throwIfAborted();
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

  const isLink = (value, id, slot) =>
    Array.isArray(value) && value.length === 2 && value[0] === id && value[1] === slot;

  function omitPose(graph, poseId) {
    // ポーズ入力を外すときは、既知の省略可能な第3画像の接続だけを取り除きます。
    const poseInputs = new Map([
      ['TextEncodeQwenImageEditPlus', 'image3'],
      ['TextGenerateV2', 'images.image3'],
      ['TextEncodeQwenImage21', 'images.image_3']
    ]);
    for (const node of Object.values(graph)) {
      for (const [input, value] of Object.entries(node.inputs)) {
        if (!Array.isArray(value) || value[0] !== poseId) continue;
        if (!isLink(value, poseId, 0) || input !== poseInputs.get(node.class_type)) {
          throw error('invalidMapping');
        }
        delete node.inputs[input];
      }
    }
    delete graph[poseId];
  }

  function applyAspect(graph, mapping, aspect) {
    // 解像度ノードから空の潜在画像を経由し、サンプラーが使う分岐を特定します。
    const samplers = mapping.seed ? [graph[mapping.seed]] : Object.values(graph);
    const branches = new Set();
    for (const node of samplers) {
      if (node.class_type !== 'KSampler') continue;
      const link = node.inputs.latent_image;
      if (!Array.isArray(link) || link[1] !== 0) continue;
      const branch = graph[link[0]];
      const switched = branch?.class_type === 'ComfySwitchNode';
      const emptyLink = switched ? branch.inputs.on_true : link;
      if (!Array.isArray(emptyLink) || emptyLink[1] !== 0) continue;
      const empty = graph[emptyLink[0]];
      if (empty?.class_type === 'EmptyLatentImage' &&
        isLink(empty.inputs.width, mapping.aspect, 0) &&
        isLink(empty.inputs.height, mapping.aspect, 1)) {
        branches.add(branch);
      }
    }
    if (branches.size !== 1) throw error('invalidMapping');
    const [branch] = branches;
    if (branch.class_type === 'ComfySwitchNode') branch.inputs.switch = true;
    graph[mapping.aspect].inputs.aspect_ratio = ASPECTS.get(aspect);
  }

  async function runJob(origin, prompt, outputNode, signal, onProgress) {
    onProgress?.('submitting');
    const job = await request(origin, '/prompt', signal, 'submit', {
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
      const history = await request(origin, '/history/' + promptId, signal, 'history');
      if (!isRecord(history)) throw error('history');
      if (Object.hasOwn(history, promptId)) {
        entry = history[promptId];
        if (!isRecord(entry)) throw error('history');
      } else {
        await waitForPoll(signal);
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
    const result = await request(origin, '/view?' + query, signal, 'download', undefined, 'blob');
    if (!result.size || !IMAGE_EXTENSIONS.has(result.type)) throw error('download');
    return result;
  }

  const isImage = image =>
    image instanceof Blob && image.size > 0 && IMAGE_EXTENSIONS.has(image.type);

  async function generateBatch({
    base, workflow, mapping, person, garment, jobs, signal, onProgress, onResult, onError
  }) {
    const origin = normalizeBase(base);
    validateMapping(workflow, mapping);
    if (!isImage(person) || !isImage(garment)) throw error('invalidImage');
    if (!Array.isArray(jobs) || !jobs.length) throw error('invalidJob');
    signal?.throwIfAborted();

    // 一括処理の開始時点の設定を保存し、人物画像と服装画像は一度だけ送ります。
    const source = structuredClone(workflow);
    const bindings = {...mapping};
    const queued = Array.from(jobs, job => isRecord(job) ? {...job} : null);
    const poses = new Map();
    const uploads = operation(GENERATION_TIMEOUT, signal);
    try {
      onProgress?.('uploading', 0);
      source[bindings.person].inputs.image = await upload(origin, person, 'person', uploads.signal);
      source[bindings.garment].inputs.image = await upload(origin, garment, 'garment', uploads.signal);
    } finally {
      uploads.finish();
    }

    for (const [index, job] of queued.entries()) {
      signal?.throwIfAborted();
      const limit = operation(GENERATION_TIMEOUT, signal);
      const progress = stage => onProgress?.(stage, index);
      try {
        if (!job) throw error('invalidJob');
        const {pose, prompt, aspect, seed} = job;
        if ((pose != null && !bindings.pose) ||
          (bindings.prompt && prompt != null && typeof prompt !== 'string') ||
          (bindings.aspect && aspect != null && aspect !== 'auto' && !ASPECTS.has(aspect)) ||
          (bindings.seed && seed != null && (!Number.isSafeInteger(seed) || seed < 0))) {
          throw error('invalidJob');
        }

        // 出力比率やポーズの変更が次のジョブに残らないよう、ジョブごとに複製します。
        const graph = structuredClone(source);
        if (bindings.prompt && prompt != null) {
          const node = graph[bindings.prompt];
          node.inputs[node.class_type === 'PrimitiveStringMultiline' ? 'value' : 'prompt'] = prompt;
        }
        if (bindings.seed && seed != null) graph[bindings.seed].inputs.seed = seed;
        if (bindings.aspect && aspect != null && aspect !== 'auto') applyAspect(graph, bindings, aspect);
        if (bindings.pose) {
          if (pose == null) {
            omitPose(graph, bindings.pose);
          } else {
            if (!isImage(pose)) throw error('invalidImage');
            if (!poses.has(pose)) {
              progress('uploading');
              poses.set(pose, await upload(origin, pose, 'pose', limit.signal));
            }
            graph[bindings.pose].inputs.image = poses.get(pose);
          }
        }

        const result = await runJob(origin, graph, bindings.output, limit.signal, progress);
        signal?.throwIfAborted();
        await onResult?.(result, index);
      } catch (failure) {
        signal?.throwIfAborted();
        if (!onError) throw failure;
        await onError(failure, index);
      } finally {
        // タイムアウトとキャンセルはブラウザの通信に適用します。
        limit.finish();
      }
    }
    signal?.throwIfAborted();
  }

  async function generate({pose, prompt, aspect, seed, onProgress, ...options}) {
    let result;
    await generateBatch({
      ...options,
      jobs: [{pose, prompt, aspect, seed}],
      onProgress: stage => onProgress?.(stage),
      onResult: blob => { result = blob; }
    });
    return result;
  }

  window.ComfyUI = {normalizeBase, parseWorkflow, matchesBinding, validateMapping, test, generate, generateBatch};
})();
