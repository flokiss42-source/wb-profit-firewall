const idOf = (item) => String(item?.nmId ?? item?.nmID ?? '').trim();

export function mergeCatalog(cards = [], prices = []) {
  const cardById = new Map(cards.map((item) => [idOf(item), { ...item, nmId: idOf(item) }]).filter(([id]) => id));
  const priceById = new Map(prices.map((item) => [idOf(item), { ...item, nmId: idOf(item) }]).filter(([id]) => id));
  const ids = [...new Set([...cardById.keys(), ...priceById.keys()])];
  const products = ids.map((nmId) => ({
    ...(priceById.get(nmId) ?? { nmId, price: 0, discount: 0, discountedPrice: 0, clientPrice: 0, priceStatus: 'missing' }),
    ...(cardById.get(nmId) ?? { nmId, title: priceById.get(nmId)?.vendorCode ?? `nmID ${nmId}`, brand: '', vendorCode: priceById.get(nmId)?.vendorCode ?? '' }),
  }));
  return {
    products,
    coverage: { cards: cardById.size, prices: priceById.size, missingPrices: products.filter((item) => item.priceStatus === 'missing').length },
  };
}
