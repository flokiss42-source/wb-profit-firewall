import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchProductCatalog } from '../src/wb-api.js';

const response = body => ({ ok: true, status: 200, json: async () => body });

test('Content API catalog follows cursor and keeps card identity', async () => {
  let calls = 0;
  const cards = await fetchProductCatalog({ token: 'content-token', fetchImpl: async (_url, options) => {
    calls += 1;
    const request = JSON.parse(options.body);
    if (calls === 1) {
      assert.deepEqual(request.settings.cursor, { limit: 100, updatedAt: '', nmID: 0 });
      return response({ cards: Array.from({ length: 100 }, (_, i) => ({ nmID: i + 1, title: `Товар ${i + 1}`, brand: 'Aklen', vendorCode: `A-${i + 1}`, sizes: [{ skus: [`SKU-${i + 1}`] }] })), cursor: { updatedAt: '2026-08-28T10:00:00Z', nmID: 100 } });
    }
    assert.equal(request.settings.cursor.nmID, 100);
    return response({ cards: [{ nmID: 101, title: 'Товар 101', brand: 'Samson', vendorCode: 'S-101' }] });
  } });
  assert.equal(calls, 2);
  assert.equal(cards.length, 101);
  assert.equal(cards[0].brand, 'Aklen');
  assert.equal(cards[100].title, 'Товар 101');
});
