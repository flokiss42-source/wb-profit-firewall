export function buildPricePlan(products, { maxChangePercent = 10, minPrice = 1 } = {}) {
  const limit = Math.max(0, Number(maxChangePercent) || 0);
  return (products ?? []).map(product => {
    const current = Number(product.currentPrice ?? product.price);
    const safe = Number(product.safePrice);
    if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(safe) || safe <= 0) return { nmID: Number(product.nmId), status: 'skipped', reason: 'Нет текущей или безопасной цены' };
    const target = Math.max(Number(minPrice) || 1, Math.round(safe));
    const bounded = Math.round(Math.min(current * (1 + limit / 100), Math.max(current * (1 - limit / 100), target)));
    return { nmID: Number(product.nmId), oldPrice: current, newPrice: bounded, discount: Number(product.discount) || 0, status: bounded === current ? 'unchanged' : 'ready', reason: bounded === target ? 'Безопасная цена в пределах лимита' : 'Ограничено дневным лимитом' };
  });
}
