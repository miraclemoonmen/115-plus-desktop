// Runs only against a disposable CI profile. All credentials and cloud replies are fixtures.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

assert.equal(process.platform, 'win32');
let root = path.resolve(process.argv[2]);
const reportFile = path.resolve(process.argv[3] ?? 'portable-smoke-results.json');
// Refuse to replace an existing user's profile when invoked outside a fresh CI extraction.
assert.equal(
  (
    await fs.readdir(path.join(root, 'data')).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    })
  ).length,
  0,
  'The smoke test requires an empty, disposable data directory',
);
const results = [];
let activeChild;
let nativeOutput = '';
const fixture = {
  accessToken: 'portable-fixture-access',
  refreshToken: 'portable-fixture-refresh',
};
const payload = Buffer.alloc(8 * 1024 * 1024, 0x5a);
const sha1 = createHash('sha1').update(payload).digest('hex').toUpperCase();
const server = http.createServer((req, res) => {
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Number(range[2]) : payload.length - 1;
  res.writeHead(range ? 206 : 200, {
    'content-type': 'application/octet-stream',
    'content-length': end - start + 1,
    'accept-ranges': 'bytes',
    ...(range ? { 'content-range': `bytes ${start}-${end}/${payload.length}` } : {}),
  });
  if (req.method === 'HEAD') return res.end();
  let offset = start;
  const timer = setInterval(() => {
    if (offset > end) {
      clearInterval(timer);
      res.end();
      return;
    }
    const next = Math.min(offset + 32 * 1024, end + 1);
    res.write(payload.subarray(offset, next));
    offset = next;
  }, 15);
  res.on('close', () => clearInterval(timer));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const fixtureUrl = `http://127.0.0.1:${server.address().port}/file`;

async function until(check, label, timeout = 45000) {
  const end = Date.now() + timeout;
  let error;
  while (Date.now() < end) {
    try {
      const value = await check();
      if (value) return value;
    } catch (e) {
      error = e;
    }
    await delay(150);
  }
  throw new Error(`Timed out: ${label}`, { cause: error });
}

async function check(name, run) {
  await run();
  results.push({ name, passed: true });
  console.log(`PASS ${name}`);
}

async function openApp() {
  const portServer = net.createServer();
  await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-File',
      path.join(import.meta.dirname, 'start-portable-test.ps1'),
      '-Exe',
      path.join(root, '115+.exe'),
    ],
    {
      // Deliberately unrelated to the executable directory.
      cwd: process.env.TEMP,
      env: {
        ...process.env,
        HTTP_PROXY: 'http://127.0.0.1:9',
        HTTPS_PROXY: 'http://127.0.0.1:9',
        ALL_PROXY: 'http://127.0.0.1:9',
        NO_PROXY: '127.0.0.1,localhost',
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --host-resolver-rules="MAP *.115.com ~NOTFOUND"`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  activeChild = child;
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      nativeOutput = (nativeOutput + chunk).slice(-20000);
      const found = /PORTABLE_APP_PID=(\d+)/.exec(nativeOutput);
      if (found) child.appPid = Number(found[1]);
    });
  const target = await until(
    async () => {
      if (child.exitCode !== null) throw Error(`Application exited: ${child.exitCode}`);
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      return targets.find(
        (entry) => entry.type === 'page' && entry.url.includes('tauri.localhost'),
      );
    },
    'bundled WebView2 startup',
    60000,
  );
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve);
    socket.addEventListener('error', reject);
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const item = JSON.parse(data);
    const waiter = pending.get(item.id);
    if (waiter) {
      clearTimeout(waiter.timer);
      pending.delete(item.id);
      if (item.error) waiter.reject(Error(JSON.stringify(item.error)));
      else waiter.resolve(item.result);
    }
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error(`CDP request timed out: ${method}`));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await request('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const invoke = (command, args = {}) =>
    evaluate(
      `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})`,
    );
  await until(
    () => evaluate(`!!document.querySelector('#app')?.__vue_app__`),
    'frontend bootstrap',
  );
  const close = async () => {
    // Send WM_CLOSE to this disposable CI app, exercising the actual close/exit bridge.
    const closed = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `(Get-Process -Id ${child.appPid}).CloseMainWindow()`],
      { encoding: 'utf8' },
    );
    assert.equal(closed.trim(), 'True');
    await until(() => child.exitCode !== null, 'application exit', 15000);
    socket.close();
    await delay(1200);
  };
  return { child, evaluate, invoke, close };
}

let app;
let failure;
try {
  app = await openApp();
  await check('all native application directories resolve inside adjacent data', async () => {
    for (const directory of [13, 14, 15, 16, 17]) {
      const value = await app.invoke('plugin:path|resolve_directory', { directory });
      assert.ok(
        path.resolve(value).toLowerCase().startsWith(path.join(root, 'data').toLowerCase()),
      );
    }
    for (const file of ['downloads.db', 'uploads.db'])
      assert.ok((await fs.stat(path.join(root, 'data', file))).size > 0);
  });
  await check('WebView2 processes use the shipped runtime', async () => {
    const runtime = path.join(root, 'runtime').toLowerCase();
    const paths = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'").ExecutablePath | ConvertTo-Json -Compress`,
      ],
      { encoding: 'utf8' },
    );
    const processes = [JSON.parse(paths)].flat();
    assert.ok(processes.some((file) => file?.toLowerCase().startsWith(runtime)));
  });
  await check('portable updater cannot invoke an installer', async () => {
    await assert.rejects(
      app.invoke('plugin:updater|check'),
      /not found|not registered|unknown|找不到|未找到/i,
    );
  });
  await check('native credentials and browser storage persist under data', async () => {
    await app.invoke('plugin:pinia|patch', { id: 'user', state: fixture });
    await app.invoke('plugin:pinia|save_now', { id: 'user' });
    const userPath = await app.invoke('plugin:pinia|get_store_path', { id: 'user' });
    assert.ok(userPath.toLowerCase().startsWith(path.join(root, 'data').toLowerCase()));
    const saved = await fs.readFile(userPath, 'utf8');
    assert.ok(saved.includes(fixture.accessToken) && saved.includes(fixture.refreshToken));
    await app.evaluate(`localStorage.setItem('portable-fixture', 'persisted')`);
  });

  // Supply local fixture URLs and a simulated cloud instant-upload response through
  // the same events used by the existing frontend. No real 115 account is used.
  await app.evaluate(`(async () => {
    const api = window.__TAURI_INTERNALS__;
    await api.invoke('proxy_set_config', {config: {followSystemProxy:false, unifiedProxy:'direct', downloadProxy:'', uploadProxy:'', updateProxy:''}});
    await api.invoke('plugin:event|listen', {event:'download:url-needed', target:{kind:'Any'}, handler:api.transformCallback(e => {
      void api.invoke('download_provide_url', {requestId:e.payload.requestId, url:${JSON.stringify(fixtureUrl)}});
    })});
    await api.invoke('plugin:event|listen', {event:'upload:api-needed', target:{kind:'Any'}, handler:api.transformCallback(e => {
      if(e.payload.kind === 'init') void api.invoke('upload_provide_api_response', {requestId:e.payload.requestId, payload:{pick_code:'fixture', status:2, file_id:'fixture-file'}});
    })});
  })()`);
  const downloadPath = path.join(root, 'data', '传输测试 中文', 'fixture.bin');
  let gid;
  await check('native ranged download can pause and resume with SHA1 verification', async () => {
    gid = await app.invoke('download_enqueue_file', {
      fid: 'fixture-download',
      name: 'fixture.bin',
      pickCode: 'fixture',
      size: payload.length,
      savePath: downloadPath,
      expectedSha1: sha1,
      parentGid: null,
      token: 'fixture',
      userAgent: 'portable-ci',
      split: 4,
      maxGlobalConnections: 4,
    });
    await until(
      async () =>
        (await app.invoke('download_get_top_level_tasks')).some(
          (task) => task.gid === gid && task.status === 'active',
        ),
      'active download',
    );
    await delay(350);
    await app.invoke('download_pause_task', { gid });
    await until(
      async () =>
        (await app.invoke('download_get_top_level_tasks')).some(
          (task) => task.gid === gid && task.status === 'paused',
        ),
      'paused download',
    );
    await app.invoke('download_resume_task', {
      gid,
      token: 'fixture',
      userAgent: 'portable-ci',
      split: 4,
      maxGlobalConnections: 4,
    });
    await until(async () => {
      const task = (await app.invoke('download_get_top_level_tasks')).find(
        (item) => item.gid === gid,
      );
      if (task?.status === 'error') throw Error(task.errorMessage);
      return task?.status === 'complete';
    }, 'completed resumed download');
    assert.equal(
      createHash('sha1')
        .update(await fs.readFile(downloadPath))
        .digest('hex')
        .toUpperCase(),
      sha1,
    );
  });
  await check(
    'native upload hashes a Unicode path and completes simulated instant upload',
    async () => {
      const [id] = await app.invoke('upload_enqueue_files', {
        files: [{ path: downloadPath, name: '中文 fixture.bin', size: payload.length }],
        targetCid: '0',
      });
      await until(
        async () =>
          (await app.invoke('upload_get_top_level_tasks')).some(
            (task) => task.id === id && task.status === 'complete',
          ),
        'simulated instant upload',
      );
    },
  );
  await app.close();
  app = null;

  results.push({
    name: 'closing the main window really exits and releases file locks',
    passed: true,
  });

  await check(
    'credentials, browser storage and completed tasks survive moving the entire folder',
    async () => {
      const relocated = path.join(path.dirname(root), '搬迁后的便携目录 中文');
      await fs.rename(root, relocated);
      root = relocated;
      app = await openApp();
      const user = await app.invoke('plugin:pinia|get_store_state', { id: 'user' });
      assert.equal(user.accessToken, fixture.accessToken);
      assert.equal(user.refreshToken, fixture.refreshToken);
      assert.equal(await app.evaluate(`localStorage.getItem('portable-fixture')`), 'persisted');
      assert.ok(
        (await app.invoke('download_get_top_level_tasks')).some(
          (task) => task.gid === gid && task.status === 'complete',
        ),
      );
      assert.ok(
        (await app.invoke('upload_get_top_level_tasks')).some((task) => task.status === 'complete'),
      );
      await app.close();
      app = null;
    },
  );
} catch (error) {
  failure = String(error.stack ?? error);
  console.error('NATIVE OUTPUT:', nativeOutput);
  try {
    console.error(
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-File',
          path.join(import.meta.dirname, 'portable-diagnostics.ps1'),
          '-AppPid',
          String(activeChild?.appPid ?? activeChild?.pid ?? 0),
          '-Root',
          root,
        ],
        { encoding: 'utf8' },
      ),
    );
  } catch (diagnosticError) {
    console.error(diagnosticError.message);
  }
  throw error;
} finally {
  if (app) {
    try {
      await app.close();
    } catch {
      app.child.kill();
    }
  }
  if (activeChild?.exitCode === null) {
    if (activeChild.appPid)
      execFileSync('taskkill.exe', ['/PID', String(activeChild.appPid), '/T', '/F']);
    activeChild.kill();
  }
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.writeFile(
    reportFile,
    JSON.stringify({ platform: process.platform, results, failure, nativeOutput }, null, 2) + '\n',
  );
}
