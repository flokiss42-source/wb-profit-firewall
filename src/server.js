import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchReport } from './wb-api.js';
import { analyzeReport } from './analyze.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.env.PORT) || 3847;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) throw new Error('Запрос слишком большой'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/analyze') {
      const input = await body(req);
      const rows = await fetchReport({ token: input.token, dateFrom: input.dateFrom, dateTo: input.dateTo });
      return json(res, 200, analyzeReport(rows, input.settings));
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Метод не поддерживается' });
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) return json(res, 403, { error: 'Запрещено' });
    const data = await readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') return json(res, 404, { error: 'Не найдено' });
    json(res, 400, { error: error.message });
  }
});

server.listen(port, '127.0.0.1', () => console.log(`WB Profit Firewall: http://127.0.0.1:${port}`));
