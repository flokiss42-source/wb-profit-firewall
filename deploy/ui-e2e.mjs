import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.env.WB_PROFIT_URL ?? 'https://profit.46-8-98-79.sslip.io';
const demo = new URL(url).searchParams.has('demo');
const expectError = process.env.WB_PROFIT_EXPECT_ERROR === '1';
const testHistory = process.env.WB_PROFIT_TEST_HISTORY === '1';
const profile = await mkdtemp(path.join(tmpdir(), 'wb-profit-ui-'));
const port = 10000 + Math.floor(Math.random() * 40000);
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
  let expectedErrorSeen = false;
  let pages;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await delay(250); }
  }
  const page = pages?.find((item) => item.type === 'page' && item.url.startsWith(new URL(url).origin));
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

  if (!demo) {
    const guarded = await evaluate("document.querySelector('nav [data-section=actions]').click();document.getElementById('setup').classList.contains('workspace-hidden')===false");
    if (!guarded) throw new Error('Pre-audit navigation guard failed');
  }

  if (!demo) {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const token = (process.env.WB_PROFIT_TOKEN ?? await rl.question('WB token: ')).trim(); rl.close();
    if (!token) throw new Error('Token is required');
    await evaluate(`document.getElementById('token').value=${JSON.stringify(token)};document.getElementById('compare').checked=false;document.getElementById('saveHistory').checked=${testHistory};document.getElementById('analyze').click();true`);
    const result = await waitFor("document.getElementById('message').className==='success'?document.getElementById('message').textContent:document.getElementById('message').className==='error'?('ERROR:'+document.getElementById('message').textContent):''");
    if (expectError) {
      if (!result.startsWith('ERROR:')) throw new Error(`Expected an error, got: ${result}`);
      if (/fetch failed|failed to fetch/i.test(result)) throw new Error(`Raw transport error reached the UI: ${result}`);
      expectedErrorSeen = true;
    } else if (result.startsWith('ERROR:')) throw new Error(result);
  }

  if (expectedErrorSeen) {
    console.log('UI_NEGATIVE_E2E_OK friendly_api_error=true raw_fetch_error=false');
  } else {
  const checks = {};
  checks.provenance = await evaluate(`document.getElementById('dataProvenance').textContent.includes('Источник:')${demo?'':"&&!document.getElementById('dataProvenance').textContent.includes('демо-данные')"}`);
  for (const section of ['overview', 'actions', 'products', 'diagnostics', 'tools']) {
    checks[section] = await evaluate(`document.querySelector('nav [data-section=${section}]').click();document.querySelector('nav [data-section=${section}]').classList.contains('active')`);
  }
  if (testHistory) {
    await evaluate("document.querySelector('nav [data-section=tools]').click();document.getElementById('loadHistory').click();true");
    checks.history = Boolean(await waitFor("document.getElementById('history').textContent.includes('формула 1.1.0')"));
  }
  checks.unallocatedPanel = await evaluate("document.querySelector('nav [data-section=diagnostics]').click();Boolean(document.getElementById('unallocatedOperations'))");
  checks.controlTotals = await evaluate("[...document.querySelectorAll('#diagnosticCards small')].some(node=>node.textContent==='Сверка сырых строк')");
  checks.productModal = await evaluate("document.querySelector('nav [data-section=products]').click();document.querySelector('#rows tr')?.click();!document.querySelector('.product-modal').classList.contains('hidden')");
  await evaluate("document.getElementById('modalClose').click();document.querySelector('nav [data-section=tools]').click();document.getElementById('simulate').click();true");
  checks.simulator = await waitFor("document.getElementById('simulation').textContent.length>0");
  if (Object.values(checks).some((value) => !value)) throw new Error(`UI checks failed: ${JSON.stringify(checks)}`);

  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate("document.querySelector('nav [data-section=products]').click();true");
  const mobile = await evaluate("({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,setupWidth:Math.round(document.getElementById('setup').getBoundingClientRect().width),tableClient:document.getElementById('tableWrap').clientWidth,tableScroll:document.getElementById('tableWrap').scrollWidth})");
  if (mobile.scrollWidth > mobile.viewport) throw new Error(`Mobile overflow: ${JSON.stringify(mobile)}`);
  if (mobile.tableScroll <= mobile.tableClient) throw new Error(`Product table is not horizontally scrollable: ${JSON.stringify(mobile)}`);
  console.log(`UI_E2E_OK tabs=${Object.keys(checks).join(',')} mobile_overflow=false mobile_table_scroll=true`);
  }
} finally {
  try { await command('Browser.close'); } catch {}
  try { socket?.close(); } catch {}
  chrome.kill();
  await delay(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
