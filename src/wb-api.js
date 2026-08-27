const ENDPOINT = 'https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod';

export function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`Некорректная дата: ${value}`);
  return value;
}

export async function fetchReport({ token, dateFrom, dateTo, fetchImpl = fetch, pageLimit = 100000, maxPages = 100 }) {
  if (!token) throw new Error('Введите read-only токен WB API');
  validateDate(dateFrom); validateDate(dateTo);
  if (dateFrom > dateTo) throw new Error('Начальная дата позже конечной');
  const rows = []; let rrdid = 0;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(ENDPOINT);
    url.searchParams.set('dateFrom', dateFrom); url.searchParams.set('dateTo', dateTo);
    url.searchParams.set('limit', String(pageLimit)); url.searchParams.set('rrdid', String(rrdid));
    const response = await fetchImpl(url, { headers: { Authorization: token, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'WB отклонил токен или у него нет категории «Статистика»' : `WB API вернул HTTP ${response.status}`);
    const batch = await response.json(); if (!Array.isArray(batch)) throw new Error('WB API вернул неожиданный формат');
    if (!batch.length) return rows;
    rows.push(...batch);
    const next = Number(batch.at(-1)?.rrd_id);
    if (!Number.isFinite(next) || next <= rrdid) throw new Error('Ошибка пагинации WB API');
    rrdid = next; if (batch.length < pageLimit) return rows;
  }
  throw new Error('Превышен безопасный лимит страниц WB API');
}
