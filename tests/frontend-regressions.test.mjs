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
function loadDeclarations(file, names, context, calls = []) {
  const raw = fs.readFileSync(path.join(root, file), 'utf8');
  const source = file.endsWith('.vue') ? raw.split(/<script[^>]*>/)[1].split('</script>')[0] : raw;
  const ast = ts.createSourceFile(
    'fixture.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const candidates = [...ast.statements];
  if (!file.endsWith('.vue'))
    for (const node of ast.statements)
      if (ts.isFunctionDeclaration(node) && node.body) candidates.push(...node.body.statements);
  const statements = candidates.filter((node) =>
    ts.isVariableStatement(node)
      ? node.declarationList.declarations.some((declaration) =>
          names.includes(declaration.name.getText(ast)),
        )
      : (ts.isFunctionDeclaration(node) && names.includes(node.name.text)) ||
        (ts.isExpressionStatement(node) && calls.includes(rootCallName(node.expression))),
  );
  const code = statements
    .map((node) => ts.createPrinter().printNode(ts.EmitHint.Unspecified, node, ast))
    .join('\n');
  const js = ts.transpileModule(code, {
    fileName: 'fixture.tsx',
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(context), `${js}; return { ${names.join(', ')} };`)(
    ...Object.values(context),
  );
}

function rootCallName(expression) {
  while (ts.isCallExpression(expression) || ts.isPropertyAccessExpression(expression))
    expression = expression.expression;
  return ts.isIdentifier(expression) ? expression.text : undefined;
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
    [
      'listRequest',
      'pendingScroll',
      'normalizeCid',
      'getListParams',
      'applyFileList',
      'getFileList',
    ],
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
    [
      'listRequest',
      'pendingScroll',
      'normalizeCid',
      'getListParams',
      'applyFileList',
      'getFileList',
      'executeSearch',
    ],
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

function httpFixture(
  response,
  userStore = { accessToken: 'fixture-access', refreshToken: 'fixture-refresh', logout() {} },
) {
  const messages = [];
  const logs = [];
  const requests = [];
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
          default: () => (elements) => ({
            response: () => {
              requests.push({ ...elements, headers: { ...elements.headers } });
              return response
                ? Promise.resolve(new Response(JSON.stringify(response)))
                : Promise.reject(fixtureError);
            },
            headers: async () => ({}),
            abort() {},
          }),
        };
      if (name === '@/composables/useDiscreteApi')
        return { useMessage: () => ({ error: (message) => messages.push(message) }) };
      if (name === '@/store/user')
        return {
          useUserStoreWithOut: () => userStore,
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
  return { api: loaded.alovaInst, fixtureError, messages, logs, userStore, requests };
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

function appExitFixture(label, active = false, confirm = async () => false) {
  const fixture = { calls: [], handler: undefined };
  const manager = (kind) => ({
    hasActiveDownloads: { value: active },
    hasActiveUploads: { value: false },
    pauseAllTasks: async () => {
      fixture.calls.push(`pause-${kind}`);
    },
  });
  const { useAppExit } = loadTsModule(
    'src/composables/useAppExit.ts',
    {
      '@tauri-apps/api/event': {
        listen: async (_event, handler) => {
          fixture.calls.push('listen');
          fixture.handler = handler;
          return () => {};
        },
      },
      '@tauri-apps/api/window': { getCurrentWindow: () => ({ label }) },
      '@tauri-apps/plugin-process': {
        exit: async () => {
          fixture.calls.push('exit');
        },
      },
      '@tauri-apps/plugin-dialog': {
        ask: async () => {
          fixture.calls.push('ask');
          return confirm();
        },
      },
      './useDownloadManager': { useDownloadManager: () => manager('downloads') },
      './useUploadManager': { useUploadManager: () => manager('uploads') },
      '@/store/setting': { useSettingStore: () => ({ generalSetting: {} }) },
    },
    { createSharedComposable: (create) => create },
  );
  fixture.app = useAppExit();
  return fixture;
}

test('only the main window handles application exit, preventing a second confirmation or exit from the player', async () => {
  const main = appExitFixture('main');
  const player = appExitFixture('video-player');
  for (const fixture of [main, player]) {
    await fixture.app.init();
    await fixture.app.init();
    if (fixture.handler) await fixture.handler();
  }
  assert.deepEqual(main.calls, ['listen', 'exit']);
  assert.deepEqual(player.calls, []);
});

test('repeated close requests share one confirmation and cancellation allows retry', async () => {
  let confirmation = deferred();
  const fixture = appExitFixture('main', true, () => confirmation.promise);
  await fixture.app.init();
  const first = fixture.handler();
  await fixture.handler();
  assert.deepEqual(fixture.calls, ['listen', 'ask']);
  confirmation.resolve(false);
  await first;
  confirmation = deferred();
  const retry = fixture.handler();
  confirmation.resolve(true);
  await retry;
  assert.deepEqual(fixture.calls, [
    'listen',
    'ask',
    'ask',
    'pause-downloads',
    'pause-uploads',
    'exit',
  ]);
});

test('asking for a download directory still validates cloud names before joining and displays the validation error', async () => {
  const { assertDownloadName } = loadTsModule('src/utils/downloadPath.ts', {
    '@tauri-apps/api/path': { sep: () => '\\' },
  });
  const calls = [];
  const { handleDownload } = loadDeclarations(
    'src/composables/useDownloadActions.ts',
    ['handleDownload'],
    {
      settingStore: { downloadSetting: { askSavePath: true, downloadPath: 'C:\\Downloads' } },
      assertDownloadName,
      open: async () => {
        calls.push('dialog');
        return 'C:\\Downloads';
      },
      downloadFile: async (_file, target) => {
        calls.push(target);
      },
      message: {
        info: () => {},
        error: (error) => {
          calls.push(error);
        },
      },
      console: { error: () => {} },
    },
  );
  for (const fc of ['0', '1']) {
    for (const fn of ['a:b', 'CON.txt', 'sub\\file.mp4']) {
      calls.length = 0;
      await handleDownload({ fn, fc });
      assert.deepEqual(calls, [`文件名不支持保存到本地：${fn}`]);
    }
  }
  calls.length = 0;
  await handleDownload({ fn: '中文 视频.mp4', fc: '1' });
  assert.deepEqual(calls, ['dialog', 'C:\\Downloads/中文 视频.mp4']);
});

test('batch download displays the specific nested-name validation error', async () => {
  const errors = [];
  const { handleBatchDownload } = loadDeclarations(
    'src/composables/useDownloadActions.ts',
    ['handleBatchDownload'],
    {
      settingStore: { downloadSetting: { askSavePath: false } },
      batchDownloadFiles: async () => {
        throw Error('文件名不支持保存到本地：a:b');
      },
      message: {
        info: () => {},
        error: (error) => {
          errors.push(error);
        },
      },
      console: { error: () => {} },
    },
  );
  await handleBatchDownload([{ fn: 'folder', fc: '0' }]);
  assert.deepEqual(errors, ['文件名不支持保存到本地：a:b']);
});

const vue = requireProject('vue');
const routerApi = requireProject('vue-router');
const searchUtils = loadTsModule('src/utils/search.ts', {});
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function searchRouter(start) {
  const router = routerApi.createRouter({
    history: routerApi.createMemoryHistory(),
    routes: [
      {
        name: 'Root',
        path: '/',
        component: {},
        children: [
          { name: 'Home', path: 'home', component: {} },
          { name: 'Search', path: 'search', component: {} },
          { name: 'Download', path: 'download', component: {} },
        ],
      },
    ],
  });
  await router.push(start);
  const route = vue.shallowReactive({
    get name() {
      return router.currentRoute.value.name;
    },
    get query() {
      return router.currentRoute.value.query;
    },
    get fullPath() {
      return router.currentRoute.value.fullPath;
    },
  });
  return { router, route };
}

async function headerFixture(start) {
  const fixture = await searchRouter(start);
  let now = 0,
    id = 0;
  const timers = new Map();
  const scope = vue.effectScope();
  const header = scope.run(() =>
    loadDeclarations(
      'src/layout/components/HeaderSearch/HeaderSearch.vue',
      [
        'keyword',
        'composing',
        'timer',
        'cancel',
        'returnPath',
        'submit',
        'schedule',
        'handleEnter',
        'startComposition',
        'endComposition',
      ],
      {
        ...vue,
        ...fixture,
        readSearchQuery: searchUtils.readSearchQuery,
        setTimeout: (run, delay) => {
          const key = ++id;
          timers.set(key, { run, due: now + delay });
          return key;
        },
        clearTimeout: (key) => timers.delete(key),
      },
      ['watch', 'onScopeDispose'],
    ),
  );
  return {
    ...fixture,
    ...header,
    stop: () => scope.stop(),
    advance: async (ms) => {
      now += ms;
      for (const [key, timer] of [...timers])
        if (timer.due <= now) {
          timers.delete(key);
          timer.run();
        }
      await settle();
    },
  };
}

test('header debounces the latest keyword, preserves page size/type, returns to the origin and cancels on disposal', async () => {
  const f = await headerFixture('/home?fid=origin');
  try {
    f.schedule('1');
    await f.advance(200);
    f.schedule('12');
    await f.advance(200);
    f.schedule('123');
    await f.advance(299);
    assert.equal(f.route.name, 'Home');
    await f.advance(1);
    assert.equal(f.route.name, 'Search');
    assert.equal(f.route.query.q, '123');
    assert.equal(f.route.query.from, '/home?fid=origin');
    await f.router.replace({
      name: 'Search',
      query: { ...f.route.query, type: 4, page: 3, size: 200 },
    });
    f.schedule('456');
    await f.advance(300);
    assert.equal(f.route.query.size, '200');
    assert.equal(f.route.query.type, '4');
    assert.equal(searchUtils.readSearchQuery(f.route.query).page, 1);
    f.schedule('');
    await settle();
    assert.equal(f.route.fullPath, '/home?fid=origin');
    f.schedule('late');
    f.stop();
    await f.advance(500);
    assert.equal(f.route.name, 'Home');
  } finally {
    f.stop();
  }
});

test('Chinese composition never submits partial text; Enter submits once and browser back restores the query', async () => {
  const f = await headerFixture('/home');
  try {
    f.startComposition();
    f.schedule('zhong');
    await f.advance(1000);
    f.handleEnter({ isComposing: true, keyCode: 229 });
    assert.equal(f.route.name, 'Home');
    f.endComposition({ target: { value: '中文' } });
    f.handleEnter({ isComposing: false, keyCode: 13, preventDefault() {} });
    await settle();
    assert.equal(f.route.query.q, '中文');
    await f.advance(500);
    await f.router.replace({
      name: 'Search',
      query: { ...f.route.query, type: 4, page: 3, size: 100 },
    });
    const handlers = loadDeclarations('src/views/Search/SearchView.vue', ['handleOpenFolder'], {
      router: f.router,
      message: { error: assert.fail },
      ...routerApi,
    });
    await handlers.handleOpenFolder('0', 'target');
    assert.equal(f.route.name, 'Home');
    assert.equal(f.route.query.locate, 'target');
    assert.equal(f.keyword.value, '');
    f.router.back();
    await settle();
    assert.equal(f.route.query.q, '中文');
    assert.equal(f.route.query.page, '3');
    assert.equal(f.route.query.type, '4');
    assert.equal(f.keyword.value, '中文');
  } finally {
    f.stop();
  }
});

test('search serializes requests and retains only the latest pending condition without stale responses', async () => {
  const requests = [];
  const { useFileSearch } = loadTsModule('src/composables/useFileSearch.ts', {
    vue,
    '@/api/file': {
      fileSearch: (query) => {
        const task = deferred();
        requests.push({ query, ...task });
        return task.promise;
      },
    },
  });
  const query = vue.ref({ search_value: 'A', limit: 50, offset: 0 });
  const scope = vue.effectScope();
  const result = scope.run(() => useFileSearch(() => query.value));
  try {
    query.value = { ...query.value, search_value: 'B' };
    await vue.nextTick();
    query.value = { ...query.value, search_value: 'C' };
    await vue.nextTick();
    assert.equal(requests.length, 1);
    requests[0].resolve({ data: [{ file_id: 'stale' }], count: 1 });
    await settle();
    assert.deepEqual(
      requests.map((task) => task.query.search_value),
      ['A', 'C'],
    );
    assert.deepEqual(result.data.value, []);
    assert.equal(result.loading.value, true);
    requests[1].resolve({ data: [{ file_id: 'latest' }], count: 4 });
    await settle();
    assert.equal(result.data.value[0].file_id, 'latest');
    assert.equal(result.count.value, 4);
    query.value = { ...query.value, search_value: 'D' };
    await vue.nextTick();
    query.value = null;
    await vue.nextTick();
    requests[2].resolve({ data: [{ file_id: 'after-leave' }], count: 1 });
    await settle();
    assert.deepEqual(result.data.value, []);
    assert.equal(result.loading.value, false);
  } finally {
    scope.stop();
  }
});

function locationFixture(total = 2600) {
  const files = Array.from({ length: total }, (_, index) => ({
    fid: String(index),
    fn: String(index),
    fc: '1',
  }));
  const requests = [];
  const fileList = async (params) => {
    requests.push(params);
    return {
      data: files.slice(params.offset, params.offset + params.limit),
      path: [{ cid: 0, name: '全部文件' }],
      count: files.length,
      offset: params.offset,
      limit: params.limit,
    };
  };
  const { findFilePage } = loadTsModule('src/utils/fileLocation.ts', {
    '@/api/file': { fileList },
  });
  return { files, requests, fileList, findFilePage };
}

test('file location finds a result past page one and reuses the matched batch with the current sort', async () => {
  const f = locationFixture();
  const found = await f.findFilePage(
    { cid: '0', o: 'file_name', asc: 1, custom_order: 2 },
    '1200',
    50,
    () => true,
  );
  assert.equal(found.page, 25);
  assert.equal(found.result.data[0].fid, '1200');
  assert.equal(found.result.data.length, 50);
  assert.deepEqual(
    f.requests.map((query) => query.offset),
    [0, 1150],
  );
  assert.ok(
    f.requests.every(
      (query) =>
        query.o === 'file_name' && query.asc === 1 && query.custom_order === 2 && query.cur === 1,
    ),
  );
});

test('file location handles a page crossing a batch boundary, missing files and canceled scans', async () => {
  const f = locationFixture();
  const found = await f.findFilePage({ cid: 'parent' }, '1149', 100, () => true);
  assert.equal(found.page, 12);
  assert.ok(found.result.data.some((file) => file.fid === '1149'));
  assert.equal(f.requests.at(-1).offset, 1100);
  assert.equal(f.requests.at(-1).limit, 100);
  await assert.rejects(
    f.findFilePage({ cid: 'parent' }, 'missing', 50, () => true),
    /重新搜索/,
  );
  const pending = deferred();
  let active = true;
  let count = 0;
  const helper = loadTsModule('src/utils/fileLocation.ts', {
    '@/api/file': {
      fileList: () => {
        count++;
        return pending.promise;
      },
    },
  });
  const result = helper.findFilePage({ cid: 'parent' }, 'target', 50, () => active);
  active = false;
  pending.resolve({ data: f.files.slice(0, 1150), count: 2600 });
  assert.equal(await result, undefined);
  assert.equal(count, 1);
});

function explorerFixture(overrides = {}) {
  const f = locationFixture();
  const lifecycle = {};
  const scrolled = [];
  const errors = [];
  const context = {
    params: { cid: '0', show_dir: 1, o: 'file_name', asc: 1, limit: 50 },
    pagination: { page: 1, pageSize: 50, itemCount: 0 },
    data: { value: [] },
    path: { value: [] },
    cid: { value: '0' },
    loading: { value: false },
    selectedItems: { value: new Set() },
    lastClickedId: { value: null },
    props: { starred: false },
    forderTemp: { value: new Map() },
    settingStore: { generalSetting: { customOrder: 1 } },
    fileList: f.fileList,
    findFilePage: f.findFilePage,
    viewRef: { value: { scrollToFile: (fid) => scrolled.push(fid) } },
    nextTick: vue.nextTick,
    ref: vue.ref,
    closeContextMenu() {},
    detailModalShow: { value: false },
    message: { error: (error) => errors.push(error) },
    onActivated: (run) => {
      lifecycle.activate = run;
    },
    onDeactivated: (run) => {
      lifecycle.deactivate = run;
    },
    explorerShortcuts: { register() {}, unregister() {}, isTop: () => true },
    shortcutToken: Symbol(),
    isCoveredByModal: () => false,
    ...overrides,
  };
  const methods = loadDeclarations(
    'src/components/FileExplorer/FileExplorer.vue',
    [
      'listRequest',
      'viewActive',
      'pendingScroll',
      'normalizeCid',
      'getListParams',
      'applyFileList',
      'getFileList',
      'revealFile',
      'scrollToSelection',
      'clearSelection',
      'shouldHandleShortcut',
    ],
    context,
    ['onActivated', 'onDeactivated'],
  );
  return { ...f, context, methods, lifecycle, scrolled, errors };
}

test('reveal selects the real page and defers scrolling until cached content becomes active', async () => {
  const f = explorerFixture();
  f.lifecycle.deactivate();
  assert.equal(f.methods.shouldHandleShortcut(), false);
  await f.methods.revealFile('1200');
  assert.equal(f.context.pagination.page, 25);
  assert.deepEqual([...f.context.selectedItems.value], ['1200']);
  assert.deepEqual(f.scrolled, []);
  await f.lifecycle.activate();
  assert.deepEqual(f.scrolled, ['1200']);
  assert.equal(f.methods.shouldHandleShortcut(), true);
});

test('failed reveal displays the parent list; canceled reveals neither fallback nor select stale files', async () => {
  const missing = explorerFixture();
  await missing.methods.revealFile('missing');
  assert.equal(missing.context.data.value.length, 50);
  assert.equal(missing.context.pagination.itemCount, 2600);
  assert.equal(missing.errors.length, 1);
  assert.deepEqual([...missing.context.selectedItems.value], []);
  const pending = deferred();
  const canceled = explorerFixture({ findFilePage: () => pending.promise });
  const request = canceled.methods.revealFile('1200');
  canceled.lifecycle.deactivate();
  pending.resolve({
    page: 25,
    result: { data: [{ fid: '1200' }], path: [], count: 2600, offset: 1200 },
  });
  await request;
  assert.equal(canceled.requests.length, 0);
  assert.deepEqual(canceled.context.data.value, []);
  assert.deepEqual(canceled.scrolled, []);
});

test('search source preserves file identity/pick code and routes pagination and media through the shared explorer', () => {
  const events = [];
  const params = { search_value: '123', type: 4, offset: 100, limit: 50 };
  const context = {
    props: { searchSource: { params, active: true } },
    emit: (...event) => events.push(event),
  };
  const handlers = loadDeclarations(
    'src/components/FileExplorer/FileExplorer.vue',
    ['searchFileToMyFile', 'handlePageChange', 'handlePageSizeChange', 'getMediaSource'],
    context,
  );
  const file = handlers.searchFileToMyFile({
    file_id: 'item',
    parent_id: 'parent',
    file_category: '1',
    file_name: '123.mp4',
    pick_code: 'pick',
    file_size: '123',
  });
  assert.equal(file.pid, 'parent');
  assert.equal(file.pc, 'pick');
  assert.equal(file.fs, 123);
  handlers.handlePageChange(4);
  handlers.handlePageSizeChange(100);
  assert.deepEqual(events, [
    ['search-page-change', 4],
    ['search-size-change', 100],
  ]);
  assert.deepEqual(handlers.getMediaSource(), { kind: 'search', params });
});

test('cached search and folder explorers restore shortcut ownership when switching pages', async () => {
  const { useExplorerShortcuts } = loadTsModule(
    'src/composables/useExplorerShortcuts.ts',
    {},
    {
      createGlobalState: (create) => {
        const state = create();
        return () => state;
      },
    },
  );
  const registry = useExplorerShortcuts();
  const homeToken = Symbol('home'),
    searchToken = Symbol('search');
  const home = explorerFixture({ explorerShortcuts: registry, shortcutToken: homeToken });
  const search = explorerFixture({ explorerShortcuts: registry, shortcutToken: searchToken });
  registry.register(homeToken);
  home.lifecycle.deactivate();
  registry.register(searchToken);
  await search.lifecycle.activate();
  assert.equal(search.methods.shouldHandleShortcut(), true);
  assert.equal(home.methods.shouldHandleShortcut(), false);
  search.lifecycle.deactivate();
  await home.lifecycle.activate();
  assert.equal(home.methods.shouldHandleShortcut(), true);
  assert.equal(search.methods.shouldHandleShortcut(), false);
  registry.register(homeToken);
  home.lifecycle.deactivate();
  assert.equal(registry.isTop(homeToken), false);
});

test('modal query markers belong only to the active cached explorer and survive switching owners', async () => {
  const { router, route } = await searchRouter('/search?q=123');
  const { useModalQuerySync } = loadTsModule(
    'src/composables/useModalQuerySync.ts',
    {},
    {
      watch: vue.watch,
      useRoute: () => route,
      useRouter: () => router,
    },
  );
  const homeActive = vue.ref(false),
    searchActive = vue.ref(true);
  const home = vue.ref(false),
    search = vue.ref(false),
    localOnly = vue.ref(true);
  const scope = vue.effectScope();
  try {
    scope.run(() => {
      useModalQuerySync(home, 'rename', () => homeActive.value && route.name === 'Home');
      useModalQuerySync(search, 'rename', () => searchActive.value && route.name === 'Search');
      useModalQuerySync(localOnly, 'rename', () => false);
    });
    search.value = true;
    await settle();
    assert.equal(route.query.rename, '1');
    assert.equal(home.value, false);
    assert.equal(search.value, true);
    await router.push('/home?rename=1');
    await settle();
    assert.equal(search.value, false);
    assert.equal(route.query.rename, '1');
    homeActive.value = true;
    await settle();
    assert.equal(home.value, true);
    assert.equal(localOnly.value, true);
    await router.push('/search?q=123&rename=1');
    await settle();
    assert.equal(home.value, false);
    assert.equal(search.value, true);
    assert.equal(route.query.rename, '1');
  } finally {
    scope.stop();
  }
});

test('modal keyboard shielding uses the instance captured during setup rather than the key event context', () => {
  class Element {
    constructor(inModal) {
      this.inModal = inModal;
    }
    closest() {
      return this.inModal ? {} : null;
    }
  }
  const root = new Element(false);
  let captures = 0;
  const handlers = loadDeclarations(
    'src/components/FileExplorer/FileExplorer.vue',
    ['instance', 'rootElement', 'isCoveredByModal'],
    {
      getCurrentInstance: () => {
        captures++;
        return { proxy: { $el: root } };
      },
      HTMLElement: Element,
      document: { querySelector: () => ({}) },
    },
  );
  assert.equal(handlers.isCoveredByModal(), true);
  assert.equal(captures, 1);
  root.inModal = true;
  assert.equal(handlers.isCoveredByModal(), false);
  assert.equal(captures, 1);
});

function loginFixture(queryStatus, { wait = async () => {}, exchange = async () => {} } = {}) {
  const { ref } = requireProject('vue');
  const errors = [];
  const navigation = [];
  const successes = [];
  const requests = [];
  let stop;
  let exchanges = 0;
  const state = {
    isScanSuccess: ref(false),
    isCencel: ref(false),
    isQrCodeExpired: ref(false),
  };
  const handlers = loadDeclarations(
    'src/views/Login/LoginView.vue',
    ['loginGeneration', 'pendingStatus', 'getQrCodeStatus'],
    {
      ...state,
      qrCodeData: { value: { uid: 'fixture-uid', sign: 'fixture-sign', time: 1 } },
      qrCodeStatus(params) {
        requests.push(params);
        const pending = Promise.resolve().then(() => queryStatus(requests.length));
        pending.abort = () => {};
        return pending;
      },
      delay: wait,
      async getToken() {
        exchanges++;
        await exchange();
      },
      showLoginError: (error) => errors.push(error),
      message: { success: (text) => successes.push(text) },
      router: { replace: async (location) => navigation.push(location) },
      console: { info() {} },
      onUnmounted: (callback) => (stop = callback),
    },
    ['onUnmounted'],
  );
  return {
    ...state,
    run: () => handlers.getQrCodeStatus(0),
    stop: () => stop(),
    errors,
    navigation,
    successes,
    requests,
    get exchanges() {
      return exchanges;
    },
  };
}

test('a transient QR status timeout keeps the same code and completes the first login', async () => {
  const fixture = loginFixture((attempt) => {
    if (attempt === 1) throw Error('fetchError: network timeout');
    return { data: { status: attempt === 2 ? 1 : 2 } };
  });
  await fixture.run();
  assert.equal(fixture.requests.length, 3);
  assert.deepEqual(fixture.requests[0], fixture.requests[2]);
  assert.equal(fixture.exchanges, 1);
  assert.deepEqual(fixture.navigation, [{ name: 'Home' }]);
  assert.deepEqual(fixture.errors, []);
  assert.deepEqual(fixture.successes, ['登录成功！']);
});

test('QR polling bounds consecutive transport failures and stops for expired or canceled codes', async () => {
  const networkError = Error('offline');
  const offline = loginFixture(() => {
    throw networkError;
  });
  await offline.run();
  assert.equal(offline.requests.length, 4);
  assert.deepEqual(offline.errors, [networkError]);
  assert.equal(offline.exchanges, 0);

  const expired = loginFixture(() => {
    throw { state: false, code: 40199002 };
  });
  await expired.run();
  assert.equal(expired.requests.length, 1);
  assert.equal(expired.isQrCodeExpired.value, true);
  assert.deepEqual(expired.errors, []);

  const canceled = loginFixture(() => ({ data: { status: -2 } }));
  await canceled.run();
  assert.equal(canceled.isCencel.value, true);
  assert.equal(canceled.exchanges, 0);
});

test('leaving a login generation stops retries and ignores late confirmations', async () => {
  const backoff = deferred();
  const waiting = deferred();
  const retry = loginFixture(
    () => {
      throw Error('offline');
    },
    {
      wait: () => {
        waiting.resolve();
        return backoff.promise;
      },
    },
  );
  const run = retry.run();
  await waiting.promise;
  retry.stop();
  backoff.resolve();
  await run;
  assert.equal(retry.requests.length, 1);
  assert.deepEqual(retry.errors, []);

  const response = deferred();
  const late = loginFixture(() => response.promise);
  const lateRun = late.run();
  late.stop();
  response.resolve({ data: { status: 2 } });
  await lateRun;
  assert.equal(late.exchanges, 0);
  assert.deepEqual(late.navigation, []);
});

test('token exchange errors end login without retrying a consumed authorization code', async () => {
  const failure = { state: false, code: 123, message: 'exchange failed' };
  const fixture = loginFixture(() => ({ data: { status: 2 } }), {
    exchange: async () => {
      throw failure;
    },
  });
  await fixture.run();
  assert.equal(fixture.exchanges, 1);
  assert.deepEqual(fixture.errors, [failure]);
  assert.deepEqual(fixture.navigation, []);
});

test('first login stores credentials before protected requests and failed login keeps the actual error', async () => {
  const token = { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 7200 };
  const fixture = httpFixture(
    { state: true, code: 0, data: token },
    {
      accessToken: '',
      refreshToken: '',
      expiresIn: 0,
    },
  );
  await fixture.api
    .Post('https://fixture.invalid/token', {}, { meta: { authRole: 'login' } })
    .send();
  assert.equal(fixture.userStore.accessToken, token.access_token);
  assert.equal(fixture.userStore.refreshToken, token.refresh_token);
  assert.equal(fixture.userStore.expiresIn, token.expires_in);
  await fixture.api.Get('https://fixture.invalid/info', { cacheFor: null }).send();
  assert.equal(fixture.requests[1].headers.Authorization, `Bearer ${token.access_token}`);

  const failure = { state: false, code: 123, message: 'authorization failed' };
  const failed = httpFixture(failure);
  await assert.rejects(
    failed.api
      .Post('https://fixture.invalid/token-failed', {}, { meta: { authRole: 'login' } })
      .send(),
    (error) => error.code === failure.code && error.message === failure.message,
  );
  assert.equal(failed.userStore.accessToken, 'fixture-access');
  assert.deepEqual(failed.messages, [failure.message]);
});

test('recoverable QR transport errors are left to the login view while remaining rejected', async () => {
  const fixture = httpFixture();
  const { qrCodeStatus } = loadTsModule('src/api/user.ts', {
    '@/utils/http/alova': { alovaInst: fixture.api },
    './config': { qrcodeBaseUrl: 'https://fixture.invalid' },
  });
  await assert.rejects(
    qrCodeStatus({ uid: 'fixture', time: 1, sign: 'fixture' }).send(),
    (error) => error === fixture.fixtureError,
  );
  assert.deepEqual(fixture.messages, []);
});
