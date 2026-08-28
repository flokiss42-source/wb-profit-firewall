import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPricePlan, validatePricePlan } from '../src/repricer.js';

test('ограничивает изменение цены и считает стратегию маржи', () => {
  const [item] = buildPricePlan([{ nmId: 10, price: 1000, safePrice: 2000 }], { maxChangePercent: 10 });
  assert.equal(item.newPrice, 1100); assert.equal(item.status, 'ready');
});
test('не снижает цену конкурента без проверенной цены', () => assert.equal(buildPricePlan([{ nmId: 10, price: 1000 }], { strategy: 'competitor' })[0].status, 'skipped'));
test('отклоняет дубли в write-плане', () => assert.throws(() => validatePricePlan([{ nmID: 1, newPrice: 100 }, { nmID: 1, newPrice: 110 }])));
