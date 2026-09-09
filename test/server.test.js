import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import test from 'node:test';

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const { port } = socket.address();
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

test('HTTP-сервер поддерживает GET и HEAD без тела', async (context) => {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  context.after(() => child.kill());
  let response;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { response = await fetch(`http://127.0.0.1:${port}/`, { method: 'HEAD' }); break; } catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
  }
  assert.equal(response?.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(await response.text(), '');
  const page = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /WB Profit Firewall/);
});
test('сервер отклоняет пустые категорийные токены до запроса к WB', async (context) => {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  context.after(() => child.kill());
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
  }
  const response = await fetch(`http://127.0.0.1:${port}/api/stocks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /Аналитика/);
});
