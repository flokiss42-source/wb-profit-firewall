import { readFile } from 'node:fs/promises';

const baseUrl = process.env.WB_PROFIT_URL ?? 'http://127.0.0.1:3847';
let token = process.env.WB_PROFIT_FINANCE_TOKEN;
if (!token && process.env.WB_PROFIT_ENV_FILE) {
  const key = process.env.WB_PROFIT_ENV_KEY ?? 'WB_API_KEY_AKLEN';
  const line = (await readFile(process.env.WB_PROFIT_ENV_FILE, 'utf8')).split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`));
  token = line?.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, '');
}

if (!token) throw new Error('WB_PROFIT_FINANCE_TOKEN is required');

const response = await fetch(`${baseUrl}/api/analyze`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token,
    dateFrom: process.env.WB_PROFIT_DATE_FROM ?? '2026-09-01',
    dateTo: process.env.WB_PROFIT_DATE_TO ?? '2026-09-08',
    compare: false,
    saveHistory: false,
    settings: {
      taxPercent: 6,
      targetMargin: 15,
      costs: {},
      adCosts: {},
      reservePercent: 10,
      rules: { minMargin: 15, maxLogisticsPercent: 20, maxAdPercent: 15 },
    },
  }),
});

const data = await response.json();
if (!response.ok) throw new Error(`HTTP ${response.status}: ${data.error ?? 'unknown error'}`);
if (!Array.isArray(data.products) || !data.summary || !data.accuracy || !Array.isArray(data.alerts) || !data.forecast) {
  throw new Error('Incomplete analyze response contract');
}
if (!data.products.every((item) => item.unitCost !== null || item.profit === null)) {
  throw new Error('Unknown cost was not protected');
}

console.log(`LIVE_FINANCE_SMOKE_OK source=${data.reportSource} products_present=${data.products.length > 0} unknown_cost_protected=true`);

if (process.env.WB_PROFIT_ANALYTICS_KEY && process.env.WB_PROFIT_ENV_FILE) {
  const env = await readFile(process.env.WB_PROFIT_ANALYTICS_ENV_FILE ?? process.env.WB_PROFIT_ENV_FILE, 'utf8');
  const key = process.env.WB_PROFIT_ANALYTICS_KEY;
  const line = env.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`));
  const analyticsToken = line?.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, '');
  if (!analyticsToken) throw new Error(`Analytics token ${key} was not found`);
  const stocksResponse = await fetch(`${baseUrl}/api/stocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: analyticsToken, nmIds: data.products.slice(0, 1000).map((item) => item.nmId) }),
  });
  const stocks = await stocksResponse.json();
  if (!stocksResponse.ok || !Array.isArray(stocks.stocks)) {
    throw new Error(`Analytics smoke failed: ${stocks.error ?? `HTTP ${stocksResponse.status}`}`);
  }
  console.log(`LIVE_ANALYTICS_SMOKE_OK rows_contract=true empty_result_supported=${stocks.stocks.length === 0}`);
}
