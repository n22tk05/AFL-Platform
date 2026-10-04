#!/usr/bin/env node

/**
 * AFL-Platform Unified Launcher (Khởi chạy toàn bộ hệ thống với 1 câu lệnh)
 *
 * Khởi động đồng thời:
 * 1. Microservice VietOCR (Python FastAPI trên cổng 8000)
 * 2. Nền tảng AFL Web (Next.js 14 trên cổng 3001)
 * 3. Tự động kiểm tra môi trường, health check và dọn dẹp tiến trình an toàn khi tắt (Ctrl+C).
 */

import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// Màu sắc hiển thị Terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

function log(prefix, color, message) {
  const time = new Date().toLocaleTimeString('vi-VN');
  console.log(`${colors.dim}[${time}]${colors.reset} ${color}${prefix}${colors.reset} ${message}`);
}

function logAfl(msg) { log('[AFL Platform]', colors.magenta, msg); }
function logOcr(msg) { log('[VietOCR 8000]', colors.cyan, msg); }
function logWeb(msg) { log('[Next.js 3001]', colors.green, msg); }
function logWarn(msg) { log('[Cảnh báo]', colors.yellow, msg); }
function logErr(msg) { log('[Lỗi]', colors.red, msg); }

// Hàm hủy tiến trình con an toàn trên Windows/Linux
export function killTree(childProcess, platform = process.platform, execute = execFileSync) {
  if (!childProcess || !childProcess.pid) return;
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) return;
  try {
    if (platform === 'win32') {
      execute('taskkill', ['/pid', String(childProcess.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(-childProcess.pid, 'SIGKILL');
    }
  } catch {
    // Tiến trình đã thoát trước đó
  }
}

// Kiểm tra Health Check qua HTTP
export function checkHttpHealth(url, { timeoutMs = 2000, ocr = false, signal } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    let done = false;
    let deadline;
    const finish = (ready) => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      signal?.removeEventListener('abort', abort);
      resolve(ready);
    };
    const abort = () => { finish(false); req.destroy(); };
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 65536) { finish(false); req.destroy(); }
      });
      res.on('error', () => finish(false));
      res.on('end', () => {
        if (res.statusCode !== 200) return finish(false);
        if (!ocr) return finish(true);
        try {
          const health = JSON.parse(body);
          finish(health.status === 'ok' && health.ready === true);
        } catch { finish(false); }
      });
    });
    req.on('error', () => finish(false));
    signal?.addEventListener('abort', abort, { once: true });
    deadline = setTimeout(abort, timeoutMs);
  });
}

// Không tiếp tục chờ nếu tiến trình đã lỗi/thoát hoặc người dùng đã dừng.
export async function waitForServer(url, {
  state, signal, ocr = false, timeoutMs = 120000, intervalMs = 1000, check = checkHttpHealth,
} = {}) {
  const end = Date.now() + timeoutMs;
  while (!signal?.aborted && !state?.stopped && Date.now() < end) {
    const ready = await Promise.race([
      check(url, { ocr, signal, timeoutMs: Math.min(2000, end - Date.now()) }),
      ...(state ? [state.completion.then(() => false)] : []),
    ]);
    if (signal?.aborted || state?.stopped) return false;
    if (ready) return true;
    await new Promise((resolve) => {
      const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, Math.min(intervalMs, Math.max(0, end - Date.now())));
      signal?.addEventListener('abort', finish, { once: true });
      if (signal?.aborted) finish();
      state?.completion.then(finish);
    });
  }
  return false;
}

export function observeChild(child, onStopped = () => {}) {
  let complete;
  const state = { stopped: false, code: null, error: null, completion: new Promise((resolve) => { complete = resolve; }) };
  const stop = (code, error = null) => {
    if (state.stopped) return;
    state.stopped = true;
    state.code = code;
    state.error = error;
    complete();
    onStopped(state);
  };
  child.once('error', (error) => stop(null, error));
  child.once('exit', (code) => stop(code));
  return state;
}

// Chạy CLI JavaScript trực tiếp: không spawn npm.cmd hoặc dùng shell.
export function nextCommand(projectDir = rootDir) {
  return { command: process.execPath, args: [path.join(projectDir, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', '3001'] };
}

export async function isPortAvailable(port) {
  // Windows có thể cho bind loopback dù wildcard listener đã chiếm cổng.
  // Kết nối trước, rồi mới kiểm tra bind; không tác động tiến trình đang chạy.
  for (const host of ['127.0.0.1', '::1']) {
    const listening = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      let done = false;
      const finish = (value) => { if (done) return; done = true; socket.destroy(); resolve(value); };
      socket.once('connect', () => finish(true));
      socket.once('error', (error) => finish(!['ECONNREFUSED', 'EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)));
      socket.setTimeout(500, () => finish(true));
    });
    if (listening) return false;
    const available = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.once('error', (error) => resolve(host === '::1' && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)));
      probe.listen({ port, host, exclusive: true }, () => probe.close(() => resolve(true)));
    });
    if (!available) return false;
  }
  return true;
}

// Banner giao diện khởi động
function printBanner() {
  console.clear();
  console.log(`${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.green}   🚀 AFL-PLATFORM — UNIFIED ALL-IN-ONE SYSTEM LAUNCHER${colors.reset}`);
  console.log(`${colors.yellow}   Hệ thống Hỗ trợ Kê khai Biểu mẫu Hành chính Thông minh cho Người cao tuổi${colors.reset}`);
  console.log(`${colors.cyan}========================================================================${colors.reset}\n`);
}

function printSummary(ocrReady, provider) {
  console.log(`\n${colors.bright}${colors.green}========================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.green}   ✨ WEB PLATFORM ĐÃ SẴN SÀNG${colors.reset}`);
  console.log(`${colors.bright}${colors.green}========================================================================${colors.reset}`);
  console.log(`  🏠 ${colors.bright}Trang chủ Kê khai:${colors.reset}           ${colors.cyan}http://localhost:3001${colors.reset}`);
  console.log(`  📸 ${colors.bright}Chụp & Nắn phôi giấy (WASM):${colors.reset} ${colors.cyan}http://localhost:3001/scan${colors.reset}`);
  console.log(`  🎙️  ${colors.bright}Hướng dẫn Điền phôi (Chữ đỏ):${colors.reset}${colors.cyan}http://localhost:3001/guide${colors.reset}`);
  console.log(`  📝 ${colors.bright}Bóc tách OCR & Xuất Markdown:${colors.reset}${colors.cyan}http://localhost:3001/scan-document${colors.reset}`);
  console.log(`  🏛️  ${colors.bright}Cổng Quản trị Biểu mẫu:${colors.reset}       ${colors.cyan}http://localhost:3001/admin/library${colors.reset}`);
  if (provider === 'vietocr' && ocrReady) {
    console.log(`  ⚙️  ${colors.bright}VietOCR Microservice API:${colors.reset}     ${colors.cyan}http://localhost:8000/docs${colors.reset}`);
  } else if (provider === 'vietocr') {
    console.log(`  ${colors.yellow}⚠ VietOCR chưa sẵn sàng. Các chức năng OCR sẽ báo lỗi dịch vụ.${colors.reset}`);
  } else {
    console.log(`  OCR provider cấu hình: ${provider}; chưa xác minh kết nối OCR cloud.`);
  }
  console.log(`${colors.bright}${colors.green}========================================================================${colors.reset}`);
  console.log(`  ${colors.dim}💡 Bấm ${colors.yellow}Ctrl + C${colors.reset}${colors.dim} để dừng đồng thời tất cả các dịch vụ an toàn.${colors.reset}\n`);
}

export async function main() {
  printBanner();
  require('@next/env').loadEnvConfig(rootDir, true);

  let vietOcrProcess = null;
  let nextProcess = null;
  let isShuttingDown = false;
  let ocrReady = false;
  const controller = new AbortController();
  const spawnOptions = { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true };

  // Đăng ký dọn dẹp khi nhận tín hiệu dừng
  const cleanup = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    controller.abort();
    console.log(`\n\n${colors.yellow}➜ Đang dừng toàn bộ dịch vụ AFL-Platform an toàn...${colors.reset}`);

    if (vietOcrProcess) {
      logOcr('Đang tắt tiến trình Python FastAPI...');
      killTree(vietOcrProcess);
      vietOcrProcess = null;
    }

    if (nextProcess) {
      logWeb('Đang tắt tiến trình Next.js...');
      killTree(nextProcess);
      nextProcess = null;
    }

    logAfl('Đã dừng các tiến trình do launcher tạo. Dịch vụ chạy sẵn được giữ nguyên.');
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  try {
    // Cùng thứ tự .env/.env.local với Next.js; không tự tạo cấu hình/đổi provider.
    const provider = process.env.DOCUMENT_OCR_PROVIDER || 'vietocr';
    if (provider !== 'vietocr') throw new Error('Project chỉ hỗ trợ VietOCR cho OCR. Đặt DOCUMENT_OCR_PROVIDER=vietocr và khởi động lại.');
    if (!await isPortAvailable(3001)) throw new Error('Cổng 3001 đang được sử dụng. Hãy dừng dịch vụ đó hoặc dùng terminal đang chạy sẵn.');
    if (controller.signal.aborted) return;

    // 2. Khởi động Microservice VietOCR
    const vietOcrDir = path.join(rootDir, 'services', 'vietocr-service');
    const pythonVenvExe = path.join(vietOcrDir, '.venv', 'Scripts', 'python.exe');
    const pythonUnixExe = path.join(vietOcrDir, '.venv', 'bin', 'python');
    const pythonExe = process.platform === 'win32' ? pythonVenvExe : pythonUnixExe;

    // Kiểm tra xem port 8000 đã có ai chạy trước chưa
    const ocrAlreadyRunning = provider === 'vietocr' && await checkHttpHealth('http://127.0.0.1:8000/health', { ocr: true, signal: controller.signal });
    if (controller.signal.aborted) return;

    if (provider !== 'vietocr') {
      logAfl(`OCR provider cấu hình: ${provider}; không khởi động VietOCR local.`);
    } else if (ocrAlreadyRunning) {
      ocrReady = true;
      logOcr(`${colors.green}✔ VietOCR Microservice đã chạy sẵn trên cổng 8000.${colors.reset}`);
    } else if (!await isPortAvailable(8000)) {
      logWarn('Cổng 8000 đã được sử dụng nhưng VietOCR chưa báo ready. Không khởi động thêm hoặc dừng dịch vụ đang chiếm cổng.');
    } else if (fs.existsSync(pythonExe)) {
      if (controller.signal.aborted) return;
      logOcr('Đang khởi động VietOCR Python FastAPI server...');
      try {
        vietOcrProcess = spawn(
          pythonExe,
        ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', '8000'],
          {
            cwd: vietOcrDir,
            ...spawnOptions,
          }
        );
      } catch (error) {
        logWarn(`Không tạo được tiến trình VietOCR: ${error.code || error.message}. Web vẫn được khởi động.`);
      }

      if (vietOcrProcess) {
        let policyLogged = false;
        let stderrTail = '';
        const ocrState = observeChild(vietOcrProcess, (state) => {
          ocrReady = false;
          if (!isShuttingDown) logWarn(`VietOCR đã dừng: ${state.error?.code || `mã ${state.code}`}. OCR chưa sẵn sàng; không có fallback giả lập.`);
        });
        vietOcrProcess.stdout?.on('data', (chunk) => {
          const line = chunk.toString().trim();
          if (line && !line.includes('GET /health')) {
            logOcr(line);
          }
        });

        vietOcrProcess.stderr?.on('data', (chunk) => {
          stderrTail = (stderrTail + chunk.toString()).slice(-8192);
          if (!policyLogged && /WinError 4551|Application Control policy/.test(stderrTail)) {
            policyLogged = true;
            logErr('Windows Application Control chặn DLL PyTorch. Xem services/vietocr-service/README.md; launcher không thay đổi policy bảo mật.');
          }
          const line = chunk.toString().trim();
          if (line && !line.includes('GET /health')) {
            logOcr(line);
          }
        });

        // Chờ VietOCR sẵn sàng
        logOcr('Đang chờ mô hình VietOCR nạp vào bộ nhớ...');
        ocrReady = await waitForServer('http://127.0.0.1:8000/health', { state: ocrState, ocr: true, signal: controller.signal });
        if (ocrReady) {
          logOcr(`${colors.green}✔ VietOCR Microservice đã sẵn sàng hoạt động (cổng 8000)!${colors.reset}`);
        } else if (!isShuttingDown) {
          logWarn(ocrState.stopped ? 'VietOCR đã lỗi khởi động. Tiếp tục mở Web với OCR chưa sẵn sàng.' : 'VietOCR chưa ready sau 120 giây. Tiếp tục mở Web; mô hình có thể vẫn đang nạp.');
        }
      }
    } else {
      logWarn(`Không tìm thấy Python .venv tại ${pythonExe}.`);
      logWarn('Web vẫn được khởi động; OCR sẽ báo dịch vụ chưa sẵn sàng. Provider không được tự đổi.');
    }
    if (controller.signal.aborted) return;

    // 3. Khởi động Web Platform (Next.js 14)
    logWeb('Đang khởi động Next.js Web Platform (cổng 3001)...');

    const next = nextCommand();
    if (!fs.existsSync(next.args[0])) throw new Error('Không tìm thấy Next.js CLI. Hãy cài dependencies bằng npm install.');
    nextProcess = spawn(next.command, next.args, {
      cwd: rootDir,
      ...spawnOptions,
      env: { ...process.env, PORT: '3001' },
    });
    const webState = observeChild(nextProcess, (state) => {
      if (!isShuttingDown) {
        logErr(`Next.js đã dừng: ${state.error?.code || `mã ${state.code}`}.`);
        process.exitCode = state.code || 1;
        cleanup();
      }
    });
    let webListening = false;
    let stdoutTail = '';

    nextProcess.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdoutTail = (stdoutTail + text).slice(-2048);
      if (/Ready in|started server on/.test(stdoutTail)) webListening = true;
      process.stdout.write(`${colors.dim}[Next.js]${colors.reset} ${text}`);
    });

    nextProcess.stderr.on('data', (chunk) => {
      process.stderr.write(`${colors.dim}[Next.js]${colors.reset} ${chunk.toString()}`);
    });

    const webReady = await waitForServer('http://127.0.0.1:3001/scan-document', {
      state: webState, signal: controller.signal,
      check: (url, options) => webListening ? checkHttpHealth(url, options) : Promise.resolve(false),
    });
    if (isShuttingDown) return;
    if (!webReady) throw new Error('Next.js chưa sẵn sàng sau 120 giây.');
    // Kiểm tra lại: VietOCR có thể vừa nạp xong trong lúc Web khởi động.
    if (provider === 'vietocr') ocrReady = await checkHttpHealth('http://127.0.0.1:8000/health', { ocr: true, signal: controller.signal });
    if (!isShuttingDown) printSummary(ocrReady, provider);
  } catch (error) {
    process.exitCode = 1;
    cleanup();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main().catch((err) => {
  logErr(`Lỗi khởi động hệ thống: ${err.message}`);
  process.exitCode = 1;
});
