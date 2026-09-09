import { createInterface } from 'node:readline/promises';
import { fetchReport, fetchSellerInfo } from '../src/wb-api.js';
import { analyzeReport } from '../src/analyze.js';

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
const analysis = analyzeReport(directRows, { taxPercent: 6, targetMargin: 15, costs: {}, adCosts: {} });
if (!analysis.products.every((item) => item.unitCost !== null || item.profit === null)) throw new Error('Unknown cost protection failed');

console.log(`DIRECT_WB_OK seller_id=${seller.id || 'present'} source=${directRows.source} rows=${directRows.length} products_present=${analysis.products.length > 0} unknown_cost_protected=true`);
