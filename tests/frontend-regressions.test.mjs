import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const requireProject = createRequire(path.join(root, 'package.json'));

// 执行现有 SFC 中的加载函数，注入可控请求以验证返回顺序，不启动窗口。
function loadDeclarations(file, names, context) {
  const source = fs
    .readFileSync(path.join(root, file), 'utf8')
    .split(/<script[^>]*>/)[1]
    .split('</script>')[0];
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true);
  const statements = ast.statements.filter((node) =>
    ts.isVariableStatement(node)
      ? node.declarationList.declarations.some((declaration) =>
          names.includes(declaration.name.getText(ast)),
        )
      : ts.isFunctionDeclaration(node) && names.includes(node.name.text),
  );
  const code = statements
    .map((node) => ts.createPrinter().printNode(ts.EmitHint.Unspecified, node, ast))
    .join('\n');
  const js = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(context), `${js}; return { ${names.join(', ')} };`)(
    ...Object.values(context),
  );
}

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

function updateFixture(portable) {
  const source = fs.readFileSync(path.join(root, 'src/composables/useCheckUpdate.tsx'), 'utf8');
  const ast = ts.createSourceFile(
    'update.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let updateFunction;
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'checkForUpdate')
      updateFunction = node;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const code = ts.transpileModule(
    ts.createPrinter().printNode(ts.EmitHint.Unspecified, updateFunction, ast),
    {
      fileName: 'fixture.tsx',
      compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: 'h' },
    },
  ).outputText;
  const calls = [];
  const context = {
    isPortable: portable,
    releasesUrl: 'https://fixture.invalid/releases',
    isChecking: { value: false },
    openUrl: async (url) => calls.push(['open', url]),
    resolveUpdateProxy: async () => {
      calls.push(['proxy']);
    },
    check: async () => {
      calls.push(['check']);
      return { version: 'fixture' };
    },
    confirmAndInstall: async () => calls.push(['install']),
    console,
  };
  const run = new Function(...Object.keys(context), code + '; return checkForUpdate;')(
    ...Object.values(context),
  );
  return { run, calls, checking: context.isChecking };
}

test('portable manual update opens the release page without checking or installing', async () => {
  const fixture = updateFixture(true);
  await fixture.run({ silent: false });
  assert.deepEqual(fixture.calls, [['open', 'https://fixture.invalid/releases']]);
});

test('portable startup never checks, downloads or installs updates', async () => {
  const fixture = updateFixture(true);
  await fixture.run({ silent: true });
  assert.deepEqual(fixture.calls, []);
  assert.equal(fixture.checking.value, false);
});

test('installed builds retain the existing update confirmation path', async () => {
  const fixture = updateFixture(false);
  await fixture.run();
  assert.deepEqual(fixture.calls, [['proxy'], ['check'], ['install']]);
  assert.equal(fixture.checking.value, false);
});

test('late file-list responses cannot replace the current folder or clear its loading state', async () => {
  const pending = [];
  const context = {
    params: { cid: 'A' },
    pagination: { page: 1, pageSize: 50 },
    data: { value: [] },
    path: { value: [] },
    cid: { value: 'A' },
    loading: { value: false },
    props: { starred: false },
    forderTemp: { value: new Map() },
    clearSelection() {},
    settingStore: { generalSetting: { customOrder: 1 } },
    fileList: () => {
      const request = deferred();
      pending.push(request);
      return request.promise;
    },
  };
  const { getFileList } = loadDeclarations(
    'src/components/FileExplorer/FileExplorer.vue',
    ['listRequest', 'normalizeCid', 'getListParams', 'getFileList'],
    context,
  );
  const first = getFileList();
  context.params.cid = 'B';
  const second = getFileList();
  pending[0].resolve({ data: ['A'], path: [{ cid: 'A' }], count: 1 });
  await first;
  assert.equal(context.loading.value, true);
  assert.deepEqual(context.data.value, []);
  pending[1].resolve({ data: ['B'], path: [{ cid: 'B' }], count: 1 });
  await second;
  assert.deepEqual(context.data.value, ['B']);
  assert.equal(context.path.value[0].cid, 'B');
  assert.equal(context.loading.value, false);
});

test('late folder results cannot replace an active search', async () => {
  const folder = deferred();
  const search = deferred();
  const context = {
    params: { cid: 'A' },
    pagination: { page: 1, pageSize: 50 },
    data: { value: [] },
    path: { value: [] },
    cid: { value: 'A' },
    loading: { value: false },
    props: { starred: false },
    forderTemp: { value: new Map() },
    clearSelection() {},
    settingStore: { generalSetting: { customOrder: 1 } },
    searchKeyword: { value: 'video' },
    searchFileToMyFile: (item) => item,
    fileList: () => folder.promise,
    fileSearch: () => search.promise,
  };
  const { getFileList, executeSearch } = loadDeclarations(
    'src/components/FileExplorer/FileExplorer.vue',
    ['listRequest', 'normalizeCid', 'getListParams', 'getFileList', 'executeSearch'],
    context,
  );
  const first = getFileList();
  const second = executeSearch(0);
  search.resolve({ data: ['search result'], count: 1 });
  await second;
  folder.resolve({ data: ['old folder'], path: [], count: 1 });
  await first;
  assert.deepEqual(context.data.value, ['search result']);
});

test('recycle-bin failures release loading and retain the existing list', async () => {
  const data = { value: ['existing'] };
  const loading = { value: false };
  const { getFileList } = loadDeclarations(
    'src/views/RecycleBin/RecycleBin.vue',
    ['listRequest', 'getFileList'],
    {
      params: {},
      pagination: { page: 1, pageSize: 50 },
      data,
      loading,
      recycleBinList: async () => {
        throw Error('network failure');
      },
      checkedRowKeys: { value: [] },
    },
  );
  await assert.rejects(getFileList(), /network failure/);
  assert.equal(loading.value, false);
  assert.deepEqual(data.value, ['existing']);
});

test('cloud-download pagination only accepts the latest response', async () => {
  const requests = [];
  const data = { value: [] };
  const pagination = { page: 1 };
  const context = {
    data,
    pagination,
    count: { value: 0 },
    loading: { value: false },
    console,
    taskList: () => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    },
  };
  const { getTaskList } = loadDeclarations(
    'src/views/CloudDownload/CloudDownload.vue',
    ['listRequest', 'getTaskList'],
    context,
  );
  const first = getTaskList();
  pagination.page = 2;
  const second = getTaskList();
  requests[1].resolve({ data: { tasks: ['page 2'], count: 30, page_count: 2 } });
  await second;
  requests[0].resolve({ data: { tasks: ['page 1'], count: 10, page_count: 1 } });
  await first;
  assert.deepEqual(data.value, ['page 2']);
  assert.equal(context.count.value, 30);
});

function httpFixture(response) {
  const messages = [];
  const logs = [];
  const fixtureError = Error('fixture network failure');
  const source = fs.readFileSync(path.join(root, 'src/utils/http/alova.ts'), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const loaded = {};
  const context = {
    exports: loaded,
    Error,
    console: { log: (...args) => logs.push(args), warn() {}, error() {} },
    require(name) {
      if (name === 'alova' || name === 'alova/client') return requireProject(name);
      if (name === './tauriHttpAdapter')
        return {
          __esModule: true,
          default: () => () => ({
            response: () =>
              response
                ? Promise.resolve(new Response(JSON.stringify(response)))
                : Promise.reject(fixtureError),
            headers: async () => ({}),
            abort() {},
          }),
        };
      if (name === '@/composables/useDiscreteApi')
        return { useMessage: () => ({ error: (message) => messages.push(message) }) };
      if (name === '@/store/user')
        return {
          useUserStoreWithOut: () => ({
            accessToken: 'fixture-access',
            refreshToken: 'fixture-refresh',
            logout() {},
          }),
        };
      if (name === '@/api/user')
        return {
          refreshToken: async () => {
            throw Error('unexpected refresh');
          },
        };
      if (name === '@/store/setting')
        return { useSettingStoreWithOut: () => ({ generalSetting: { apiRateLimit: 0 } }) };
      if (name === '@/utils/rateLimit')
        return {
          createRateLimiter: () => ({ acquire: async () => {} }),
          MAX_RATE_LIMIT_RETRY: 0,
          getBackoffDelay: () => 0,
        };
      if (name === 'es-toolkit') return { delay: async () => {} };
      throw Error(name);
    },
  };
  new Function(...Object.keys(context), js)(...Object.values(context));
  return { api: loaded.alovaInst, fixtureError, messages, logs };
}

test('transport failures remain rejected with the original error', async () => {
  const fixture = httpFixture();
  await assert.rejects(
    fixture.api.Get('https://fixture.invalid/failure', { cacheFor: null }).send(),
    (error) => error === fixture.fixtureError,
  );
  assert.deepEqual(fixture.messages, ['fixture network failure']);
});

test('request headers and credential responses are not printed to the console', async () => {
  const response = { state: true, code: 0, data: { access_token: 'fixture-secret' } };
  const fixture = httpFixture(response);
  assert.deepEqual(
    await fixture.api.Get('https://fixture.invalid/success', { cacheFor: null }).send(),
    response,
  );
  assert.deepEqual(fixture.logs, []);
});

test('recycle-bin selection and destructive actions retain their IDs and confirmations', async () => {
  const { computed, ref } = requireProject('vue');
  const checkedRowKeys = ref([]);
  const data = ref([
    { id: 'file-a', file_name: 'a.txt', type: '1', file_size: '4' },
    { id: 'folder-b', file_name: 'b', type: '2', file_size: '0' },
  ]);
  const dialogs = [];
  const restored = [];
  const deleted = [];
  let refreshed = 0;
  const { toggleRow, toggleSelectAll, handleRestore, handleDelete, handleClearRecycleBin } =
    loadDeclarations(
      'src/views/RecycleBin/RecycleBin.vue',
      [
        'items',
        'selectedItems',
        'toggleRow',
        'toggleSelectAll',
        'handleRestore',
        'handleDelete',
        'handleClearRecycleBin',
      ],
      {
        data,
        checkedRowKeys,
        computed,
        dialog: { warning: (options) => dialogs.push(options) },
        message: { success() {} },
        revertFile: async (params) => restored.push(params),
        deleteRecycleBinFile: async (params) => deleted.push(params),
        getFileList: () => refreshed++,
      },
    );
  toggleRow('file-a');
  assert.deepEqual(checkedRowKeys.value, ['file-a']);
  toggleSelectAll();
  assert.deepEqual(checkedRowKeys.value, ['file-a', 'folder-b']);
  toggleSelectAll();
  assert.deepEqual(checkedRowKeys.value, []);
  handleRestore('file-a');
  handleDelete('file-a,folder-b');
  handleClearRecycleBin();
  assert.deepEqual(restored, []);
  assert.deepEqual(deleted, []);
  assert.equal(dialogs[1].content, '文件将被彻底删除且不可恢复');
  assert.equal(dialogs[2].content, '文件将被彻底删除且不可恢复');
  for (const dialog of dialogs) await dialog.onPositiveClick();
  assert.deepEqual(restored, [{ tid: 'file-a' }]);
  assert.deepEqual(deleted, [{ tid: 'file-a,folder-b' }, undefined]);
  assert.equal(refreshed, 3);
});

test('transfer rows preserve original task references and native pause commands', async () => {
  const { computed } = requireProject('vue');
  for (const kind of ['Download', 'Upload']) {
    const source =
      kind === 'Download'
        ? { gid: 'download-id', name: 'video.mp4', status: 'active', size: 100, progress: 46.9 }
        : {
            id: 'upload-id',
            fileName: 'video.mp4',
            status: 'uploading',
            fileSize: 100,
            progress: 46.9,
          };
    const calls = [];
    const loaded = loadDeclarations(
      `src/views/${kind}/${kind}View.vue`,
      ['items', 'getTaskStatus', 'progressValue', 'handlePauseItem'],
      {
        computed,
        displayList: { value: [source] },
        detailLeft: () => '1 MB/s',
        detailRight: () => '剩余 3秒',
        invoke: async (...args) => calls.push(args),
        pauseFolder: async (...args) => calls.push(args),
        pauseTask: async (...args) => calls.push(args),
        console,
        message: { error() {} },
        getActionErrorMessage: (_error, fallback) => fallback,
      },
    );
    const row = loaded.items.value[0];
    assert.equal(row.source, source);
    assert.equal(row.taskStatus.text, '47%');
    await loaded.handlePauseItem(row.source);
    if (kind === 'Download') {
      assert.equal(source.status, 'pausing');
      assert.deepEqual(calls, [['download_pause_task', { gid: 'download-id' }]]);
    } else assert.equal(calls[0][0], source);
  }
});

function loadTsModule(file, imports, globals = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), outputText)(
    (name) => {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
    exports,
    ...Object.values(globals),
  );
  return exports;
}

test('Windows download names cannot escape the selected directory or become device names or streams', () => {
  const { assertDownloadName } = loadTsModule('src/utils/downloadPath.ts', {
    '@tauri-apps/api/path': { sep: () => '\\' },
  });
  for (const name of [
    '',
    '.',
    '..',
    '../outside',
    'sub/file.mp4',
    'sub\\file.mp4',
    'C:\\outside',
    'file:stream',
    'CON',
    'nul.txt',
    'COM1.mp4',
    'LPT².txt',
    'CONIN$',
    'file.',
    'file ',
    'file?.mp4',
    'line\nbreak',
    'a\0b',
  ])
    assert.throws(() => assertDownloadName(name), /文件名不支持保存到本地/);
  for (const name of ['中文 视频.mp4', 'CONCERT.mp4', 'COM10.txt', '.hidden', 'a.b.c'])
    assert.doesNotThrow(() => assertDownloadName(name));
});

test('download name checks retain valid POSIX names', () => {
  const { assertDownloadName } = loadTsModule('src/utils/downloadPath.ts', {
    '@tauri-apps/api/path': { sep: () => '/' },
  });
  for (const name of ['a:b', 'CON.txt', 'name.', 'name ', 'back\\slash'])
    assert.doesNotThrow(() => assertDownloadName(name));
  for (const name of ['..', '../outside', 'sub/file', 'a\0b'])
    assert.throws(() => assertDownloadName(name));
});

test('only the main window handles application exit, preventing a second confirmation or exit from the player', async () => {
  let subscriptions = 0;
  let exits = 0;
  for (const label of ['main', 'video-player']) {
    let callback;
    const emptyManager = {
      hasActiveDownloads: { value: false },
      hasActiveUploads: { value: false },
      pauseAllTasks: async () => {},
    };
    const { useAppExit } = loadTsModule(
      'src/composables/useAppExit.ts',
      {
        '@tauri-apps/api/event': {
          listen: async (_event, handler) => {
            subscriptions++;
            callback = handler;
            return () => {};
          },
        },
        '@tauri-apps/api/window': { getCurrentWindow: () => ({ label }) },
        '@tauri-apps/plugin-process': {
          exit: async () => {
            exits++;
          },
        },
        '@tauri-apps/plugin-dialog': {
          ask: async () => {
            throw Error('Unexpected confirmation');
          },
        },
        './useDownloadManager': { useDownloadManager: () => emptyManager },
        './useUploadManager': { useUploadManager: () => emptyManager },
        '@/store/setting': { useSettingStore: () => ({ generalSetting: {} }) },
      },
      { createSharedComposable: (create) => create },
    );
    const appExit = useAppExit();
    await appExit.init();
    await appExit.init();
    if (callback) await callback();
  }
  assert.equal(subscriptions, 1);
  assert.equal(exits, 1);
});
