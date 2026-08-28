const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
export function buildPricePlan(products, options = {}) {
  const limit = Math.min(50, Math.max(0, finite(options.maxChangePercent) ?? 10));
  const floor = Math.max(1, finite(options.minPrice) ?? 1);
  const strategy = options.strategy ?? 'margin';
  const undercut = Math.max(0, finite(options.undercut) ?? 1);
  return (products ?? []).map(product => {
    const nmID = finite(product.nmId), current = finite(product.currentPrice ?? product.price), safe = finite(product.safePrice), rrp = finite(product.rrp), competitor = finite(product.competitorPrice);
    if (!nmID || !current || current <= 0) return { nmID, status: 'skipped', reason: 'Нет корректной текущей цены' };
    let target = strategy === 'rrp' ? rrp : strategy === 'competitor' ? (competitor == null ? null : competitor - undercut) : safe;
    if (target == null || target <= 0) return { nmID, oldPrice: current, status: 'skipped', reason: strategy === 'competitor' ? 'Нет проверенной цены конкурента' : 'Нет безопасной цены' };
    target = Math.max(floor, Math.round(target));
    const min = Math.round(current * (1 - limit / 100)), max = Math.round(current * (1 + limit / 100)), next = Math.min(max, Math.max(min, target));
    return { nmID, oldPrice: current, newPrice: next, discount: Math.min(99, Math.max(0, Math.round(finite(product.discount) ?? 0))), status: next === current ? 'unchanged' : 'ready', strategy, reason: next === target ? 'Целевая цена в пределах лимита' : 'Ограничено защитным лимитом' };
  });
}
export function validatePricePlan(plan) {
  if (!Array.isArray(plan) || plan.length === 0 || plan.length > 1000) throw new Error('План должен содержать от 1 до 1000 товаров');
  const ids = new Set();
  for (const item of plan) { if (!Number.isInteger(item.nmID) || item.nmID <= 0 || ids.has(item.nmID)) throw new Error('План содержит дублирующийся или неверный nmID'); if (!Number.isFinite(item.newPrice) || item.newPrice < 1 || !Number.isInteger(item.newPrice)) throw new Error(`Некорректная цена для nmID ${item.nmID}`); ids.add(item.nmID); }
  return plan;
}
