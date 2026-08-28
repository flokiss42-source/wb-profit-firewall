/** Reconcile product movement without inventing missing quantities. */
function quantity(value, key) {
  if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(`Некорректное количество: ${key}`);
  return Number(value);
}

export function reconcileMovement({ shipped=0, accepted=0, sold=0, returned=0, stock=0, inTransit=0, writtenOff=0 }={}) {
  const values = { shipped, accepted, sold, returned, stock, inTransit, writtenOff };
  for (const [key, value] of Object.entries(values)) values[key] = quantity(value, key);
  const expectedStock = values.accepted - values.sold + values.returned - values.writtenOff;
  const accounted = values.stock + values.inTransit;
  const gap = Math.round((expectedStock - accounted) * 100) / 100;
  return {
    ...values,
    expectedStock: Math.round(expectedStock * 100) / 100,
    gap,
    supplyGap: Math.round((values.shipped - values.accepted) * 100) / 100,
    status: Math.abs(gap) < 0.01 ? 'matched' : gap > 0 ? 'potential-loss' : 'extra-or-unrecorded',
  };
}

function keyOf(row) {
  const nmId = String(row.nmId ?? row.nmID ?? row.nm_id ?? '').trim();
  const barcode = String(row.barcode ?? row.sku ?? '').trim();
  if (!nmId && !barcode) return null;
  return `${nmId}:${barcode}`;
}

function add(records, target, field) {
  for (const row of records ?? []) {
    const key = keyOf(row);
    if (!key) continue;
    const entry = target.get(key) ?? { nmId: String(row.nmId ?? row.nmID ?? row.nm_id ?? ''), barcode: String(row.barcode ?? row.sku ?? '') };
    entry[field] = (entry[field] ?? 0) + quantity(row[field] ?? row.quantity ?? row.amount ?? 0, field);
    target.set(key, entry);
  }
}

/** Reconcile independently loaded shipment, acceptance, sales, return and stock sources. */
export function reconcileCatalog({ shipped=[], accepted=[], sales=[], returns=[], stocks=[], writeOffs=[] }={}) {
  const entries = new Map();
  add(shipped, entries, 'shipped');
  add(accepted, entries, 'accepted');
  add(sales, entries, 'sold');
  add(returns, entries, 'returned');
  add(stocks, entries, 'stock');
  add(writeOffs, entries, 'writtenOff');
  return [...entries.values()].map(entry => ({ ...entry, ...reconcileMovement(entry) }));
}
