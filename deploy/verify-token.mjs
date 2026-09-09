import { createInterface } from 'node:readline/promises';
import { fetchReport, fetchSellerInfo } from '../src/wb-api.js';

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const token = (process.env.WB_PROFIT_TOKEN ?? await rl.question('WB token: ')).trim();
rl.close();
if (!token) throw new Error('Token is required');

const dateTo = new Date().toISOString().slice(0, 10);
const from = new Date(`${dateTo}T00:00:00Z`);
from.setUTCDate(from.getUTCDate() - 7);
const dateFrom = from.toISOString().slice(0, 10);

const seller = await fetchSellerInfo({ token });
const directRows = await fetchReport({ token, dateFrom, dateTo });
const response = await fetch(`${process.env.WB_PROFIT_URL ?? 'https://profit.46-8-98-79.sslip.io'}/api/analyze`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token, dateFrom, dateTo, compare: false, saveHistory: false,
    settings: { taxPercent: 6, targetMargin: 15, costs: {}, adCosts: {}, reservePercent: 10, rules: { minMargin: 15, maxLogisticsPercent: 20, maxAdPercent: 15 } },
  }),
});
const analysis = await response.json();
if (!response.ok) throw new Error(`Server HTTP ${response.status}: ${analysis.error ?? 'unknown'}`);
if (analysis.rows !== directRows.length) throw new Error(`Row mismatch: direct=${directRows.length}, server=${analysis.rows}`);
if (!analysis.products.every((item) => item.unitCost !== null || item.profit === null)) throw new Error('Unknown cost protection failed');

console.log(`DIRECT_WB_OK seller_id=${seller.id || 'present'} rows_match=true products_present=${analysis.products.length > 0}`);
