import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const port = Number(process.env.PORT || 4173);
// --open (used by 啟動工作台.cmd): open the browser once the workbench answers, and title the console window.
const launched = process.argv.includes('--open');
const urlFor = p => `http://127.0.0.1:${p}/`;
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8', '.png':'image/png', '.txt':'text/plain; charset=utf-8' };

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  process.stderr.write(`PORT 須為 0–65535 的整數（目前為 ${process.env.PORT}）。\n`);
  process.exit(1);
}
function openBrowser(url) {
  if (!launched) return;
  const [command, args] = process.platform === 'win32' ? ['cmd.exe', ['/d', '/c', 'start', '""', url]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
  try { spawn(command, args, { detached:true, stdio:'ignore', windowsHide:true, windowsVerbatimArguments:true }).on('error', () => {}).unref(); } catch {}
}
const samePath = (a, b) => process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
// Plain http.get rather than fetch: no connection pool keeps this process alive, and it also works under Wine.
function workbenchOn(p) {
  return new Promise(resolve => {
    const request = http.get({ host:'127.0.0.1', port:p, path:'/__workbench', agent:false, timeout:1500 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; if (body.length > 65536) request.destroy(); });
      response.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      response.on('error', () => resolve(null));
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/__workbench') {
      response.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
      response.end(JSON.stringify({ app:'special-method-workbench', workspace:root, port:server.address().port }));
      return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(root, relative);
    if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403); response.end('Forbidden'); return; }
    if (!(await stat(target)).isFile()) throw new Error('Not a file');
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type':mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
    response.end(body);
  } catch { response.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); response.end('Not found'); }
});
// Port taken: the same workbench (this folder) is reused; anything else is named so the user knows what to close.
server.on('error', async error => {
  process.exitCode = 1;
  if (error.code !== 'EADDRINUSE') { process.stderr.write(`工作台服務無法啟動：${error.message}\n`); return; }
  const running = await workbenchOn(port);
  if (running?.app === 'special-method-workbench' && typeof running.workspace === 'string' && samePath(running.workspace, root)) {
    process.exitCode = 0;
    process.stdout.write(`特殊工法工作台已在執行：${urlFor(port)}\n`);
    openBrowser(urlFor(port));
    return;
  }
  const holder = running?.app === 'special-method-workbench' ? `另一個資料夾的工作台（${running.workspace}）` : '其他程式';
  process.stderr.write(`連接埠 ${port} 已被${holder}使用。請先關閉它，或在命令提示字元執行 set PORT=4174 後再啟動。\n`);
});
server.listen(port, '127.0.0.1', () => {
  const url = urlFor(server.address().port);
  process.stdout.write(`特殊工法工作台 ${url}\n`);
  if (launched) {
    try { process.title = '特殊工法工作台（使用中請勿關閉）'; } catch {}
    process.stdout.write('使用期間請保持這個視窗開啟；關閉視窗或按 Ctrl+C 即停止工作台。\n');
  }
  openBrowser(url);
});
process.on('SIGINT', () => { server.close(); server.closeAllConnections?.(); process.exit(0); });
