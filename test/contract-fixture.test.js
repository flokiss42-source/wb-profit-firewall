import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { analyzeReport, buildControlTotals } from '../src/analyze.js';

test('обезличенная финансовая фикстура сходится по независимым контрольным суммам', async () => {
  const rows = JSON.parse(await readFile(new URL('./fixtures/finance-contract.json', import.meta.url), 'utf8'));
  const result = analyzeReport(rows, { taxPercent: 6, costs: { '4600000000001': 200, '4600000000002': 100 } });
  assert.deepEqual(result.controlTotals.raw, { payout: 1000, compensation: 100, charges: 275, netFromWb: 825 });
  assert.deepEqual(result.controlTotals.normalized, result.controlTotals.raw);
  assert.equal(result.controlTotals.difference, 0);
  assert.equal(result.controlTotals.status, 'matched');
  assert.equal(result.controlTotals.productRows, 3);
  assert.equal(result.controlTotals.technicalRows, 2);
  assert.equal(result.summary.grossSales, 1500);
  assert.equal(result.summary.netFromWb, 825);
  assert.equal(result.summary.charges, 275);
  assert.equal(result.summary.profit, 435);
});

test('расхождение контрольных сумм помечается как ошибка', () => {
  const totals = buildControlTotals([{ ppvz_for_pay: 100 }], [], []);
  assert.equal(totals.status, 'mismatch');
  assert.equal(totals.difference, 100);
});
