import { readFile } from 'node:fs/promises';

const baseUrl = process.env.WB_PROFIT_URL ?? 'http://127.0.0.1:3847';
const envFile = process.env.WB_PROFIT_ENV_FILE;
const key = process.env.WB_PROFIT_ENV_KEY ?? 'WB_API_KEY_AKLENFARM';
if (!envFile) throw new Error('WB_PROFIT_ENV_FILE is required');
const line = (await readFile(envFile, 'utf8')).split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`));
const token = line?.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, '');
if (!token) throw new Error(`Token ${key} was not found`);
const response = await fetch(`${baseUrl}/api/reconciliation`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token, dateFrom: process.env.WB_PROFIT_DATE_FROM ?? '2026-09-01', dateTo: process.env.WB_PROFIT_DATE_TO ?? '2026-09-08', products: [], stocks: [] }),
});
const data = await response.json();
if (response.status === 403) {
  console.log('LIVE_SUPPLIES_SMOKE_OK access=denied_category_token=true raw_rows=false');
} else if (!response.ok) {
  throw new Error(`Supplies HTTP ${response.status}: ${data.error ?? 'unknown error'}`);
} else {
  if (!data.summary || !Array.isArray(data.rows) || !Array.isArray(data.supplies)) throw new Error('Incomplete supplies contract');
  console.log(`LIVE_SUPPLIES_SMOKE_OK access=granted rows_contract=true supplies=${data.supplies.length} movement_rows=${data.rows.length}`);
}
