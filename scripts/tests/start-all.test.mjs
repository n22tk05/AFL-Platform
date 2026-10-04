import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { checkHttpHealth, isPortAvailable, killTree, nextCommand, observeChild, waitForServer } from '../start-all.mjs';

async function withServer(handler, run, host = '127.0.0.1') {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, host, resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`, server.address().port); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test('OCR health requires a loaded predictor, not just HTTP 200', async () => {
  await withServer((req, res) => res.end(JSON.stringify({ status: 'degraded', ready: false })), async (url) => {
    assert.equal(await checkHttpHealth(url, { ocr: true }), false);
    assert.equal(await checkHttpHealth(url), true);
  });
});

test('OCR health accepts status ok and ready true', async () => {
  await withServer((req, res) => res.end(JSON.stringify({ status: 'ok', ready: true })), async (url) => {
    assert.equal(await checkHttpHealth(url, { ocr: true }), true);
  });
});

test('HTML, invalid JSON and error status are not OCR readiness', async () => {
  for (const [status, body] of [[200, '<html>ok</html>'], [503, '{"status":"ok","ready":true}']]) {
    await withServer((req, res) => { res.statusCode = status; res.end(body); }, async (url) => {
      assert.equal(await checkHttpHealth(url, { ocr: true }), false);
    });
  }
});

test('health deadline bounds a response that never finishes', async () => {
  await withServer((req, res) => { res.writeHead(200); res.write('{'); }, async (url) => {
    assert.equal(await checkHttpHealth(url, { ocr: true, timeoutMs: 30 }), false);
  });
});

test('health request stops on cancellation', async () => {
  await withServer(() => {}, async (url) => {
    const controller = new AbortController();
    const pending = checkHttpHealth(url, { signal: controller.signal });
    controller.abort();
    assert.equal(await pending, false);
  });
});

test('stopped child skips further readiness calls', async () => {
  const child = new EventEmitter();
  const state = observeChild(child);
  child.emit('exit', 1);
  let calls = 0;
  assert.equal(await waitForServer('unused', { state, check: async () => { calls++; return true; } }), false);
  assert.equal(calls, 0);
});

test('child exit ends outstanding readiness check immediately', async () => {
  const child = new EventEmitter();
  const state = observeChild(child);
  const pending = waitForServer('unused', { state, check: () => new Promise(() => {}) });
  child.emit('exit', 1);
  assert.equal(await pending, false);
});

test('spawn error is handled once and prevents waiting', async () => {
  const child = new EventEmitter();
  let stopped = 0;
  const state = observeChild(child, () => stopped++);
  const error = Object.assign(new Error('missing executable'), { code: 'ENOENT' });
  child.emit('error', error);
  child.emit('exit', 1);
  assert.equal(state.error, error);
  assert.equal(stopped, 1);
  assert.equal(await waitForServer('unused', { state }), false);
});

test('cancellation interrupts polling delay', async () => {
  const controller = new AbortController();
  const pending = waitForServer('unused', { signal: controller.signal, intervalMs: 10000, check: async () => false });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  assert.equal(await pending, false);
});

test('command uses node and separate CLI argument, including paths with spaces', () => {
  const spec = nextCommand('C:/Project with spaces/AFL');
  assert.equal(spec.command, process.execPath);
  assert.match(spec.args[0], /Project with spaces/);
  assert.deepEqual(spec.args.slice(1), ['dev', '-p', '3001']);
  assert.ok(!spec.args.includes('npm.cmd'));
});

test('cleanup targets only owned running process without shell interpolation', () => {
  const calls = [];
  const execute = (...args) => calls.push(args);
  killTree(null, 'win32', execute);
  killTree({ pid: 12, exitCode: 1, signalCode: null }, 'win32', execute);
  killTree({ pid: 13, exitCode: null, signalCode: null }, 'win32', execute);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'taskkill');
  assert.deepEqual(calls[0][1], ['/pid', '13', '/T', '/F']);
  assert.equal(calls[0][2].windowsHide, true);
});

test('occupied port is detected without stopping existing server', async () => {
  await withServer((req, res) => res.end('running'), async (url, port) => {
    assert.equal(await isPortAvailable(port), false);
    assert.equal(await checkHttpHealth(url), true);
  });
});

test('real node subprocess is observed without npm.cmd', async () => {
  const child = spawn(process.execPath, ['-e', 'process.exit(7)'], { windowsHide: true, stdio: 'ignore' });
  const state = observeChild(child);
  await state.completion;
  assert.equal(state.error, null);
  assert.equal(state.code, 7);
});

test('wildcard listener is detected even when Windows permits a loopback bind', async () => {
  await withServer((req, res) => res.end('running'), async (url, port) => {
    assert.equal(await isPortAvailable(port), false);
    assert.equal(await checkHttpHealth(url), true);
  }, '::');
});
