const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;

function blank(row) {
  return { nmId: String(row.nm_id), article: String(row.sa_name ?? ''), subject: String(row.subject_name ?? ''), brand: String(row.brand_name ?? ''),
    sold: 0, returned: 0, grossSales: 0, payout: 0, logistics: 0, storage: 0, acceptance: 0, penalties: 0, deductions: 0,
    acquiring: 0, compensation: 0 };
}

export function aggregateReport(rows) {
  const products = new Map();
  for (const row of rows) {
    if (row.nm_id == null) continue;
    const key = String(row.nm_id); if (!products.has(key)) products.set(key, blank(row));
    const item = products.get(key); const isReturn = /возврат/i.test(String(row.doc_type_name ?? ''));
    const quantity = Math.abs(n(row.quantity));
    if (n(row.retail_amount) !== 0) isReturn ? item.returned += quantity : item.sold += quantity;
    item.grossSales += n(row.retail_amount);
    item.payout += n(row.ppvz_for_pay);
    item.logistics += Math.abs(n(row.delivery_rub)); item.storage += Math.abs(n(row.storage_fee));
    item.acceptance += Math.abs(n(row.acceptance)); item.penalties += Math.abs(n(row.penalty));
    item.deductions += Math.abs(n(row.deduction)); item.acquiring += Math.abs(n(row.acquiring_fee));
    item.compensation += n(row.additional_payment);
  }
  return [...products.values()];
}

export function analyzeReport(rows, settings = {}) {
  const taxRate = Math.max(0, n(settings.taxPercent)) / 100;
  const targetRate = Math.max(0, n(settings.targetMargin)) / 100;
  const costs = settings.costs ?? {}, adCosts = settings.adCosts ?? {};
  const products = aggregateReport(rows).map(item => {
    const netUnits = Math.max(0, item.sold - item.returned);
    const charges = item.logistics + item.storage + item.acceptance + item.penalties + item.deductions + item.acquiring;
    const netFromWb = item.payout + item.compensation - charges;
    const hasCost = Number.isFinite(Number(costs[item.nmId]));
    const unitCost = hasCost ? Math.max(0, n(costs[item.nmId])) : null;
    const cogs = hasCost ? unitCost * netUnits : null;
    const ads = Math.max(0, n(adCosts[item.nmId]));
    const tax = Math.max(0, item.grossSales) * taxRate;
    const profit = hasCost ? netFromWb - cogs - ads - tax : null;
    const margin = profit == null || item.grossSales <= 0 ? null : profit / item.grossSales * 100;
    const wbLoad = item.grossSales > 0 ? Math.max(0, 1 - netFromWb / item.grossSales) : 0;
    const denominator = 1 - wbLoad - taxRate - targetRate;
    const safePrice = hasCost && netUnits > 0 && denominator > 0 ? (unitCost + ads / netUnits) / denominator : null;
    const severity = !hasCost ? 'unknown' : profit < 0 ? 'loss' : margin < targetRate * 100 ? 'warning' : 'healthy';
    const reasons = [];
    if (!hasCost) reasons.push('Не указана себестоимость');
    if (item.penalties > 0) reasons.push(`Штрафы: ${round(item.penalties)} ₽`);
    if (item.deductions > 0) reasons.push(`Удержания: ${round(item.deductions)} ₽`);
    if (item.logistics > item.grossSales * .2 && item.grossSales > 0) reasons.push('Логистика выше 20% продаж');
    if (ads > item.grossSales * .15 && item.grossSales > 0) reasons.push('Реклама выше 15% продаж');
    return { ...item, netUnits, charges: round(charges), netFromWb: round(netFromWb), unitCost, cogs: cogs == null ? null : round(cogs),
      ads: round(ads), tax: round(tax), profit: profit == null ? null : round(profit), margin: margin == null ? null : round(margin),
      safePrice: safePrice == null ? null : round(safePrice), severity, reasons };
  });
  const severityOrder = { loss: 0, warning: 1, unknown: 2, healthy: 3 };
  products.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || (a.profit ?? 0) - (b.profit ?? 0));
  const sum = field => round(products.reduce((total, item) => total + n(item[field]), 0));
  const known = products.filter(item => item.profit != null);
  return { generatedAt: new Date().toISOString(), rows: rows.length, settings: { taxPercent: taxRate * 100, targetMargin: targetRate * 100 },
    summary: { products: products.length, knownCosts: known.length, lossProducts: products.filter(x => x.severity === 'loss').length,
      grossSales: sum('grossSales'), netFromWb: sum('netFromWb'), charges: sum('charges'), profit: known.length ? round(known.reduce((s, x) => s + x.profit, 0)) : null }, products };
}
