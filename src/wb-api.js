const ENDPOINT = 'https://finance-api.wildberries.ru/api/finance/v1/sales-reports/detailed';
const LEGACY_ENDPOINT = 'https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod';
const STOCKS_ENDPOINT = 'https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses';
const CARD_ENDPOINT = 'https://content-api.wildberries.ru/content/v2/get/cards/list';
const SUPPLIES_ENDPOINT = 'https://supplies-api.wildberries.ru/api/v1/supplies';
const PRICES_ENDPOINT = 'https://discounts-prices-api.wildberries.ru';

export function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`Некорректная дата: ${value}`);
  return value;
}

async function errorDetail(response) {
  try {
    const payload = await response.json();
    const value = payload?.message ?? payload?.detail ?? payload?.error ?? payload?.title;
    return value == null ? '' : String(value).slice(0, 300);
  } catch { return ''; }
}

function authorization(token) {
  return /^Bearer\s/i.test(token) ? token : `Bearer ${token}`;
}

export async function fetchReport({ token, dateFrom, dateTo, fetchImpl = fetch, pageLimit = 100000, maxPages = 100 }) {
  if (!token) throw new Error('Введите read-only токен WB API');
  validateDate(dateFrom); validateDate(dateTo);
  if (dateFrom > dateTo) throw new Error('Начальная дата позже конечной');
  async function load(legacy = false, financeFailure = null) {
    const rows = []; let rrdid = 0;
    for (let page = 0; page < maxPages; page++) {
      const url = new URL(legacy ? LEGACY_ENDPOINT : ENDPOINT);
      url.searchParams.set('rrdid', String(rrdid));
      const options = { headers: { Authorization: authorization(token), Accept: 'application/json' }, signal: AbortSignal.timeout(60000) };
      if (legacy) {
        url.searchParams.set('dateFrom', dateFrom); url.searchParams.set('dateTo', dateTo); url.searchParams.set('limit', String(pageLimit));
      } else {
        options.method = 'POST'; options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify({ dateFrom, dateTo, limit: pageLimit, rrdid });
      }
      const response = await fetchImpl(url, options);
      if (!response.ok) {
        const detail = await errorDetail(response);
        if (!legacy && page === 0 && (response.status === 401 || response.status === 403)) return load(true, { status: response.status, detail });
        if (response.status === 429) throw new Error('Лимит запросов WB исчерпан. Подождите немного; успешно загруженный период повторно берётся из памяти');
        if (response.status === 401 || response.status === 403) {
          const finance = financeFailure ? `Финансы: HTTP ${financeFailure.status}${financeFailure.detail ? ` — ${financeFailure.detail}` : ''}` : '';
          const statistics = `Статистика: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`;
          throw new Error(`WB отклонил токен. ${[finance, statistics].filter(Boolean).join('; ')}`);
        }
        throw new Error(`${legacy ? 'Старый' : 'Новый'} WB API вернул HTTP ${response.status}`);
      }
      const payload = await response.json();
      const batch = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : Array.isArray(payload.rows) ? payload.rows : [];
      if (!batch.length) return rows;
      rows.push(...batch);
      const next = Number(batch.at(-1)?.rrdId ?? batch.at(-1)?.rrd_id);
      if (!Number.isFinite(next) || next <= rrdid) throw new Error('Ошибка пагинации WB API');
      rrdid = next; if (batch.length < pageLimit) return rows;
    }
    throw new Error('Превышен безопасный лимит страниц WB API');
  }
  return load(false);
}

export async function fetchCurrentStocks({ token, nmIds = [], fetchImpl = fetch }) {
  if (!token) throw new Error('Введите токен WB категории «Аналитика» для остатков');
  const ids = [...new Set(nmIds.map(Number).filter(Number.isInteger).filter(id => id > 0))];
  const response = await fetchImpl(STOCKS_ENDPOINT, { method: 'POST', headers: { Authorization: authorization(token), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ nmIds: ids, chrtIds: [], limit: 1000, offset: 0 }), signal: AbortSignal.timeout(60000) });
  if (!response.ok) {
    let detail=''; try { const body=await response.clone().json(); detail=body?.message||body?.error||''; } catch {}
    if (response.status === 429) throw new Error('WB ограничил частоту запроса остатков. Подождите 20 секунд');
    if (response.status === 401 || response.status === 403) throw new Error(`WB отклонил запрос остатков (HTTP ${response.status})${detail?`: ${detail}`:''}. Проверьте категорию токена и кабинет`);
    throw new Error(`WB API остатков вернул HTTP ${response.status}`);
  }
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : Array.isArray(payload.stocks) ? payload.stocks : [];
  return rows.map(row => ({ nmId: String(row.nmId ?? row.nmID ?? ''), barcode: String(row.barcode ?? row.vendorCode ?? ''), warehouse: String(row.warehouseName ?? row.officeName ?? row.warehouse ?? ''), quantity: Number(row.quantity ?? row.qty ?? row.amount ?? 0) || 0, inWayToClient: Number(row.inWayToClient ?? 0) || 0, inWayFromClient: Number(row.inWayFromClient ?? 0) || 0, updatedAt: row.updatedAt ?? row.lastChangeDate ?? null }));
}

export async function fetchProductCard({ token, nmId, fetchImpl = fetch }) {
  if (!token) throw new Error('Введите токен WB категории «Контент» для фотографий');
  if (!Number.isInteger(Number(nmId)) || Number(nmId) <= 0) throw new Error('Некорректный nmID товара');
  const response = await fetchImpl(CARD_ENDPOINT, { method: 'POST', headers: { Authorization: authorization(token), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ settings: { cursor: { limit: 100 }, filter: { textSearch: String(nmId), withPhoto: -1 } } }), signal: AbortSignal.timeout(60000) });
  if (!response.ok) {
    if (response.status === 429) throw new Error('WB ограничил запросы карточек. Подождите немного');
    if (response.status === 401 || response.status === 403) throw new Error('Нужен токен WB категории «Контент»');
    throw new Error(`WB API карточек вернул HTTP ${response.status}`);
  }
  const payload = await response.json();
  const cards = Array.isArray(payload.cards) ? payload.cards : Array.isArray(payload.data) ? payload.data : [];
  // Never show a different seller's card when textSearch returns an inexact match.
  const card = cards.find(item => String(item.nmID ?? item.nmId) === String(nmId));
  const photos = Array.isArray(card?.photos) ? card.photos.map(photo => String(photo.big ?? photo.c516x688 ?? photo.square ?? photo.tm ?? '')).filter(url => /^https:\/\//i.test(url)) : [];
  return { nmId: String(nmId), title: String(card?.title ?? card?.subjectName ?? ''), photos };
}

async function wbJson(response, label) {
  if (response.ok) return response.json();
  let detail = ''; try { const body = await response.clone().json(); detail = body?.message || body?.error || ''; } catch {}
  if (response.status === 401 || response.status === 403) throw new Error(`WB отклонил запрос поставок (HTTP ${response.status}). Нужен токен категории «Поставки»`);
  if (response.status === 429) throw new Error(`WB ограничил запросы ${label}. Повторите через минуту`);
  throw new Error(`WB API ${label} вернул HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
}

export async function fetchPrices({ token, nmIds = [], fetchImpl = fetch }) {
  if (!token) throw new Error('Введите токен WB категории «Цены и скидки»');
  const ids = [...new Set(nmIds.map(Number).filter(Number.isInteger).filter(id => id > 0))];
  const response = await fetchImpl(`${PRICES_ENDPOINT}/api/v2/list/goods/filter`, { method: 'POST', headers: { Authorization: authorization(token), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ nmList: ids }), signal: AbortSignal.timeout(60000) });
  const payload = await wbJson(response, 'цен');
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data?.listGoods) ? payload.data.listGoods : Array.isArray(payload.data) ? payload.data : [];
  return rows.map(row => {
    const sizes = Array.isArray(row.sizes) ? row.sizes : [];
    const size = sizes.find(item => Number(item.price) > 0) ?? sizes[0] ?? {};
    const price = Number(row.price ?? size.price ?? 0) || 0;
    const discountedPrice = Number(row.discountedPrice ?? size.discountedPrice ?? row.salePrice ?? price) || 0;
    return { nmId: String(row.nmID ?? row.nmId ?? ''), vendorCode: String(row.vendorCode ?? ''), brand: String(row.brand ?? row.brandName ?? ''), price, discount: Number(row.discount ?? 0), discountedPrice, clubDiscount: Number(row.clubDiscount ?? 0), clientPrice: Number(row.finishedPrice ?? row.priceWithDiscount ?? size.clubDiscountedPrice ?? discountedPrice) || 0, editableSizePrice: Boolean(row.editableSizePrice), updatedAt: row.updatedAt ?? null };
  });
}

export async function updatePrices({ token, data, fetchImpl = fetch }) {
  if (!token) throw new Error('Введите write-токен категории «Цены и скидки»');
  if (!Array.isArray(data) || !data.length || data.length > 1000) throw new Error('Нужен непустой список до 1000 товаров');
  const response = await fetchImpl(`${PRICES_ENDPOINT}/api/v2/upload/task`, { method: 'POST', headers: { Authorization: authorization(token), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ data }), signal: AbortSignal.timeout(60000) });
  return wbJson(response, 'обновления цен');
}

/** FBW supplies and accepted quantities. Requires a token in the «Поставки» category. */
export async function fetchSupplies({ token, dateFrom, dateTo, statusIDs, maxSupplies = 50, fetchImpl = fetch }) {
  if (!token) throw new Error('Введите токен WB категории «Поставки» для сверки движения');
  const body = {};
  if (Array.isArray(statusIDs) && statusIDs.length) body.statusIDs = statusIDs;
  if (dateFrom && dateTo) body.dates = [{ from: `${dateFrom}T00:00:00+03:00`, to: `${dateTo}T23:59:59+03:00` }];
  const listResponse = await fetchImpl(`${SUPPLIES_ENDPOINT}?limit=1000&offset=0`, { method: 'POST', headers: { Authorization: authorization(token), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const payload = await wbJson(listResponse, 'списка поставок');
  const supplies = Array.isArray(payload) ? payload : Array.isArray(payload.supplies) ? payload.supplies : [];
  const rows = [];
  for (const supply of supplies.slice(0, Math.max(1, Math.min(200, maxSupplies)))) {
    const id = supply.ID ?? supply.id ?? supply.supplyID;
    if (!id) continue;
    const goodsResponse = await fetchImpl(`${SUPPLIES_ENDPOINT}/${encodeURIComponent(id)}/goods?limit=1000&offset=0`, { headers: { Authorization: authorization(token), Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
    const goods = await wbJson(goodsResponse, 'товаров поставки');
    for (const item of (Array.isArray(goods) ? goods : [])) rows.push({ supplyId: String(id), nmId: String(item.nmID ?? item.nmId ?? ''), barcode: String(item.barcode ?? ''), shipped: Number(item.quantity ?? item.supplierBoxAmount ?? 0) || 0, accepted: Number(item.acceptedQuantity ?? item.readyForSaleQuantity ?? 0) || 0, unloading: Number(item.unloadingQuantity ?? 0) || 0, supplyDate: supply.supplyDate ?? supply.factDate ?? null });
  }
  return { supplies: supplies.slice(0, maxSupplies), rows };
}
