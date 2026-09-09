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
