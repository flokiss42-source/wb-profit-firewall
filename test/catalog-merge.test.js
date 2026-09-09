import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeCatalog } from '../src/catalog.js';

test('каталог соединяет карточки и цены только по точному nmID', () => {
  const result = mergeCatalog(
    [{ nmId: '12', title: 'Товар 12', brand: 'A' }, { nmId: '123', title: 'Товар 123', brand: 'B' }],
    [{ nmId: '12', price: 1000, vendorCode: 'A-12' }, { nmId: '999', price: 500, vendorCode: 'P-999' }],
  );
  assert.equal(result.products.length, 3);
  assert.equal(result.products.find((item) => item.nmId === '12').price, 1000);
  assert.equal(result.products.find((item) => item.nmId === '123').priceStatus, 'missing');
  assert.equal(result.products.find((item) => item.nmId === '999').title, 'P-999');
  assert.deepEqual(result.coverage, { cards: 2, prices: 2, missingPrices: 1 });
});

test('каталог нормализует числовые nmID перед точным соединением', () => {
  const result = mergeCatalog([{ nmID: 42, title: 'Карточка' }], [{ nmId: '42', price: 700 }]);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].title, 'Карточка');
  assert.equal(result.products[0].price, 700);
});
