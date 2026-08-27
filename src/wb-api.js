const ENDPOINT = 'https://finance-api.wildberries.ru/api/finance/v1/sales-reports/detailed';
const LEGACY_ENDPOINT = 'https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod';
const STOCKS_ENDPOINT = 'https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses';
const CARD_ENDPOINT = 'https://content-api.wildberries.ru/content/v2/get/cards/list';

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
  const response = await fetchImpl(STOCKS_ENDPOINT, { method: 'POST', headers: { Authorization: authorization(token), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ nmIds: ids }), signal: AbortSignal.timeout(60000) });
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
