import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.env.WB_PROFIT_URL ?? 'https://profit.46-8-98-79.sslip.io';
const profile = await mkdtemp(path.join(tmpdir(), 'wb-profit-ui-'));
const port = 9334;
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', `--remote-debugging-port=${port}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, '--window-size=1440,1000', url], { stdio: 'ignore' });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
let nextId = 0;
const pending = new Map();
async function command(method, params = {}) {
  const id = ++nextId;
  const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  socket.send(JSON.stringify({ id, method, params }));
  return result;
}
async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}
async function waitFor(expression, timeout = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await evaluate(expression);
    if (value) return value;
    await delay(250);
  }
  throw new Error(`UI timeout: ${expression}`);
}

try {
  let pages;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await delay(250); }
  }
  const page = pages?.find((item) => item.type === 'page' && item.url.startsWith(url));
  if (!page) throw new Error('Chrome page was not created');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id || !pending.has(message.id)) return;
    const job = pending.get(message.id); pending.delete(message.id);
    message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result);
  };
  await command('Runtime.enable');
  await waitFor("document.readyState==='complete' && typeof document.getElementById('analyze')?.onclick==='function'");

  const guarded = await evaluate("document.querySelector('nav [data-section=actions]').click();document.getElementById('setup').classList.contains('workspace-hidden')===false");
  if (!guarded) throw new Error('Pre-audit navigation guard failed');

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const token = (process.env.WB_PROFIT_TOKEN ?? await rl.question('WB token: ')).trim(); rl.close();
  if (!token) throw new Error('Token is required');
  await evaluate(`document.getElementById('token').value=${JSON.stringify(token)};document.getElementById('compare').checked=false;document.getElementById('analyze').click();true`);
  const result = await waitFor("document.getElementById('message').className==='success'?document.getElementById('message').textContent:document.getElementById('message').className==='error'?('ERROR:'+document.getElementById('message').textContent):''");
  if (result.startsWith('ERROR:')) throw new Error(result);

  const checks = {};
  for (const section of ['overview', 'actions', 'products', 'diagnostics', 'tools']) {
    checks[section] = await evaluate(`document.querySelector('nav [data-section=${section}]').click();document.querySelector('nav [data-section=${section}]').classList.contains('active')`);
  }
  checks.productModal = await evaluate("document.querySelector('nav [data-section=products]').click();document.querySelector('#rows tr')?.click();!document.querySelector('.product-modal').classList.contains('hidden')");
  await evaluate("document.getElementById('modalClose').click();document.querySelector('nav [data-section=tools]').click();document.getElementById('simulate').click();true");
  checks.simulator = await waitFor("document.getElementById('simulation').textContent.length>0");
  if (Object.values(checks).some((value) => !value)) throw new Error(`UI checks failed: ${JSON.stringify(checks)}`);

  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Page.reload', { ignoreCache: true });
  await waitFor("document.readyState==='complete'");
  const mobile = await evaluate("({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,setupWidth:Math.round(document.getElementById('setup').getBoundingClientRect().width)})");
  if (mobile.scrollWidth > mobile.viewport) throw new Error(`Mobile overflow: ${JSON.stringify(mobile)}`);
  console.log(`UI_E2E_OK tabs=${Object.keys(checks).join(',')} mobile_overflow=false`);
} finally {
  try { socket?.close(); } catch {}
  chrome.kill();
  await delay(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
