import http from 'node:http';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchReport, fetchCurrentStocks, fetchProductCard, fetchProductCatalog, fetchSupplies, fetchPrices, updatePrices, fetchPriceTask, fetchSellerInfo } from './wb-api.js';
import { analyzeReport, analyzeInventory, compareAnalyses, evaluateRules, forecastCashflow, simulateProduct } from './analyze.js';
import { findUnexplainedCharges } from './charges.js';
import { reconcileCatalog } from './reconciliation.js';
import { buildPricePlan, validatePricePlan } from './repricer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const vendorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'xlsx', 'dist');
const port = Number(process.env.PORT) || 3847;
const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.data');
const historyFile = path.join(dataDir, 'history.jsonl');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const reportCache = new Map();
const sellerCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
function reportCacheKey(token, dateFrom, dateTo) { return createHash('sha256').update(`${token}\0${dateFrom}\0${dateTo}`).digest('hex'); }
async function cachedReport(input) {
  const key = reportCacheKey(input.token, input.dateFrom, input.dateTo), cached = reportCache.get(key);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return { rows: cached.rows, source: 'memory-cache' };
  const rows = await fetchReport(input); reportCache.set(key, { createdAt: Date.now(), rows });
  if (reportCache.size > 20) reportCache.delete(reportCache.keys().next().value);
  return { rows, source: 'wb-api' };
}

function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) throw new Error('Запрос слишком большой'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function previousPeriod(dateFrom, dateTo) {
  const from = new Date(`${dateFrom}T00:00:00Z`), to = new Date(`${dateTo}T00:00:00Z`);
  const days = Math.round((to - from) / 86400000) + 1;
  const previousTo = new Date(from); previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo); previousFrom.setUTCDate(previousFrom.getUTCDate() - days + 1);
  return { dateFrom: previousFrom.toISOString().slice(0, 10), dateTo: previousTo.toISOString().slice(0, 10) };
}

async function saveHistory(entry) { await mkdir(dataDir, { recursive: true }); await appendFile(historyFile, `${JSON.stringify(entry)}\n`, 'utf8'); }
async function readHistory() { try { return (await readFile(historyFile, 'utf8')).split(/\r?\n/).filter(Boolean).slice(-30).reverse().map(JSON.parse); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } }

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/analyze') {
      const input = await body(req);
      const report = await cachedReport({ token: input.token, dateFrom: input.dateFrom, dateTo: input.dateTo });
      const rows = report.rows;
      const analysis = analyzeReport(rows, input.settings);
      analysis.unexplainedCharges = findUnexplainedCharges(rows);
      analysis.reportSource = report.source;
      analysis.alerts = evaluateRules(analysis.products, input.settings?.rules);
      analysis.forecast = forecastCashflow(analysis, { days: Math.round((new Date(input.dateTo) - new Date(input.dateFrom)) / 86400000) + 1, reservePercent: input.settings?.reservePercent });
      if (input.compare) {
        const period = previousPeriod(input.dateFrom, input.dateTo);
        const cached = (await readHistory()).find(entry => entry.period?.dateFrom === period.dateFrom && entry.period?.dateTo === period.dateTo && Array.isArray(entry.products));
        if (cached) {
          const previous = { summary: cached.summary, products: cached.products };
          analysis.comparison = { period, source: 'local-history', ...compareAnalyses(analysis, previous) };
        } else analysis.comparisonError = 'Нет локального снимка предыдущего периода — дополнительный запрос отключён для защиты от лимита WB';
      }
      if (input.saveHistory) await saveHistory({ generatedAt: analysis.generatedAt, period: { dateFrom: input.dateFrom, dateTo: input.dateTo }, summary: analysis.summary, products: analysis.products, alerts: analysis.alerts.length });
      return json(res, 200, analysis);
    }
    if (req.method === 'POST' && req.url === '/api/seller-info') {
      const input = await body(req); if (!input.token) throw new Error('Нужен токен WB');
      const key = createHash('sha256').update(String(input.token)).digest('hex');
      const cached = sellerCache.get(key); if (cached && Date.now() - cached.createdAt < 60000) return json(res, 200, cached.value);
      const value = await fetchSellerInfo({ token: input.token }); sellerCache.set(key, { createdAt: Date.now(), value });
      if (sellerCache.size > 50) sellerCache.delete(sellerCache.keys().next().value);
      return json(res, 200, value);
    }
    if (req.method === 'POST' && req.url === '/api/simulate') { const input = await body(req); return json(res, 200, simulateProduct(input.product, input.scenario)); }
    if (req.method === 'POST' && req.url === '/api/stocks') { const input = await body(req); const stocks = await fetchCurrentStocks({ token: input.token, nmIds: input.nmIds }); return json(res, 200, { generatedAt: new Date().toISOString(), rows: stocks.length, stocks }); }
    if (req.method === 'POST' && req.url === '/api/inventory-analysis') { const input = await body(req); return json(res, 200, { inventory: analyzeInventory(input.stocks ?? [], input.products ?? [], input.days) }); }
    if (req.method === 'POST' && req.url === '/api/product-card') { const input = await body(req); return json(res, 200, await fetchProductCard({ token: input.token, nmId: input.nmId })); }
    if (req.method === 'POST' && req.url === '/api/catalog') { const input = await body(req); const [cards, prices] = await Promise.all([fetchProductCatalog({ token: input.contentToken }), fetchPrices({ token: input.priceToken, nmIds: [] })]); const byId = new Map(prices.map(item => [item.nmId, item])); return json(res, 200, { products: cards.map(card => ({ ...card, ...(byId.get(card.nmId) ?? { nmId: card.nmId, price: 0, discount: 0, discountedPrice: 0, clientPrice: 0 }) })) }); }
    if (req.method === 'POST' && req.url === '/api/reconciliation') {
      const input = await body(req);
      const supplies = await fetchSupplies({ token: input.token, dateFrom: input.dateFrom, dateTo: input.dateTo, maxSupplies: input.maxSupplies });
      const sales = (input.products ?? []).map(product => ({ nmId: product.nmId, barcode: product.barcode, quantity: product.sold ?? product.quantity ?? 0 }));
      const returns = (input.products ?? []).map(product => ({ nmId: product.nmId, barcode: product.barcode, quantity: product.returned ?? 0 }));
      const stocks = (input.stocks ?? []).map(stock => ({ nmId: stock.nmId, barcode: stock.barcode, quantity: stock.quantity, inTransit: Number(stock.inWayToClient ?? 0) + Number(stock.inWayFromClient ?? 0) }));
      const rows = reconcileCatalog({ shipped: supplies.rows, accepted: supplies.rows, sales, returns, stocks });
      const summary = { total: rows.length, matched: rows.filter(row => row.status === 'matched').length, potentialLoss: rows.filter(row => row.status === 'potential-loss').length, extra: rows.filter(row => row.status === 'extra-or-unrecorded').length, supplied: supplies.supplies.length };
      const supplyList = supplies.supplies.map(item => ({ id: String(item.supplyID ?? item.ID ?? item.id ?? item.preorderID ?? ''), statusID: item.statusID ?? null, supplyDate: item.supplyDate ?? null, factDate: item.factDate ?? null, warehouseName: item.actualWarehouseName ?? item.warehouseName ?? '', quantity: Number(item.quantity ?? 0), accepted: Number(item.acceptedQuantity ?? 0) }));
      return json(res, 200, { generatedAt: new Date().toISOString(), summary, supplies: supplyList, rows });
    }
    if (req.method === 'POST' && req.url === '/api/repricer/plan') { const input = await body(req); const prices = await fetchPrices({ token: input.token, nmIds: (input.products ?? []).map(x => x.nmId) }); const byId = new Map(prices.map(x => [x.nmId, x])); return json(res, 200, { plan: buildPricePlan((input.products ?? []).map(x => ({ ...x, ...(byId.get(String(x.nmId)) ?? {}) })), input) }); }
    if (req.method === 'POST' && req.url === '/api/prices') { const input = await body(req); return json(res, 200, { prices: await fetchPrices({ token: input.token, nmIds: input.nmIds ?? [] }) }); }
    if (req.method === 'POST' && req.url === '/api/repricer/apply') { const input = await body(req); if (input.confirm !== 'APPLY') throw new Error('Для изменения цен передайте confirm=APPLY'); const plan = validatePricePlan((input.plan ?? []).filter(x => x.status === 'ready')); if (plan.some(x => x.oldPrice && Math.abs(x.newPrice / x.oldPrice - 1) > 0.2)) throw new Error('Изменение больше 20% заблокировано защитой'); const result = await updatePrices({ token: input.token, data: plan.map(x => ({ nmID: x.nmID, price: x.newPrice, discount: x.discount })) }); return json(res, 200, { result, applied: plan.length, plan }); }
    if (req.method === 'POST' && req.url === '/api/repricer/status') { const input = await body(req); return json(res, 200, await fetchPriceTask({ token: input.token, uploadID: input.uploadID })); }
    if (req.method === 'POST' && req.url === '/api/telegram') {
      const input = await body(req); if (!input.botToken || !input.chatId || !input.message) throw new Error('Нужны bot token, chat ID и сообщение');
      const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(input.botToken)}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: input.chatId, text: String(input.message).slice(0, 4000) }), signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Telegram вернул HTTP ${response.status}`); return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && req.url === '/api/history') return json(res, 200, await readHistory());
    if (req.method !== 'GET') return json(res, 405, { error: 'Метод не поддерживается' });
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/vendor/xlsx.full.min.js') { const data = await readFile(path.join(vendorRoot, 'xlsx.full.min.js')); res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }); return res.end(data); }
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) return json(res, 403, { error: 'Запрещено' });
    const data = await readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') return json(res, 404, { error: 'Не найдено' });
    const status = /ограничил|лимит запросов|too many requests/i.test(error.message) ? 429 : /отклонил.*(?:401|403)|нужен токен/i.test(error.message) ? 403 : 400;
    json(res, status, { error: error.message });
  }
});

server.listen(port, '127.0.0.1', () => console.log(`WB Profit Firewall: http://127.0.0.1:${port}`));
