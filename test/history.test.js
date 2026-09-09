import assert from 'node:assert/strict';
import test from 'node:test';
import { accountFingerprint, FORMULA_VERSION, historyEntry, historyForAccount } from '../src/history.js';

test('история разделяется по токену и не возвращает товарные строки', () => {
  const analysis = { generatedAt: '2026-09-09T00:00:00Z', summary: { profit: 100 }, products: [{ nmId: 'secret-product' }], alerts: [] };
  const first = historyEntry('token-a', { dateFrom: '2026-09-01', dateTo: '2026-09-07' }, analysis);
  const second = historyEntry('token-b', { dateFrom: '2026-09-01', dateTo: '2026-09-07' }, analysis);
  const visible = historyForAccount([first, second], 'token-a');
  assert.equal(visible.length, 1);
  assert.equal(visible[0].formulaVersion, FORMULA_VERSION);
  assert.equal('products' in visible[0], false);
  assert.equal('accountKey' in visible[0], false);
  assert.notEqual(accountFingerprint('token-a'), accountFingerprint('token-b'));
});

test('история отклоняет пустой токен', () => assert.throws(() => historyForAccount([], ''), /нужен токен/i));

test('лимит истории применяется после фильтра кабинета и периоды не дублируются', () => {
  const analysis = { generatedAt: '2026-09-09T00:00:00Z', summary: { profit: 100 }, products: [], alerts: [] };
  const own = Array.from({ length: 35 }, (_, index) => historyEntry('token-a', { dateFrom: `2026-08-${String(index + 1).padStart(2, '0')}`, dateTo: `2026-08-${String(index + 1).padStart(2, '0')}` }, analysis));
  const duplicate = historyEntry('token-a', own[0].period, { ...analysis, summary: { profit: 999 } });
  const noise = Array.from({ length: 50 }, (_, index) => historyEntry(`other-${index}`, { dateFrom: '2026-09-01', dateTo: '2026-09-02' }, analysis));
  const visible = historyForAccount([duplicate, ...noise, ...own], 'token-a');
  assert.equal(visible.length, 30);
  assert.equal(visible[0].summary.profit, 999);
  assert.equal(new Set(visible.map(entry => `${entry.period.dateFrom}:${entry.period.dateTo}`)).size, 30);
});
