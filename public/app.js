const $ = id => document.getElementById(id);
const rub = value => value == null ? '—' : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)} ₽`;
const num = value => value == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let lastData = null;

const today = new Date(), week = new Date(today); week.setDate(today.getDate() - 7);
$('dateTo').value = today.toISOString().slice(0, 10); $('dateFrom').value = week.toISOString().slice(0, 10);
$('settingsButton').onclick = () => $('setup').classList.toggle('expanded');

function parseMap(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [id, value] = line.split(/=|;|,/).map(part => part?.trim());
    if (id && Number.isFinite(Number(String(value).replace(',', '.')))) result[id] = Number(String(value).replace(',', '.'));
  }
  return result;
}

$('costFile').onchange = async event => {
  const text = await event.target.files[0]?.text(); if (!text) return;
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean); const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delimiter).map(x => x.trim().toLowerCase());
  const idIndex = headers.findIndex(x => /баркод|barcode|nmid|артикул/.test(x));
  const costIndex = headers.findIndex(x => /себестоимость|cost|закуп/.test(x));
  if (idIndex < 0 || costIndex < 0) return showMessage('В CSV нужны колонки «Баркод/nmID» и «Себестоимость».', 'error');
  $('costs').value = lines.slice(1).map(line => line.split(delimiter)).filter(row => row[idIndex] && row[costIndex]).map(row => `${row[idIndex].trim()} = ${row[costIndex].trim()}`).join('\n');
  showMessage(`Импортировано строк себестоимости: ${lines.length - 1}`, 'success');
};

function showMessage(text, type) { $('message').className = type; $('message').textContent = text; }

function render(data) {
  lastData = data; const s = data.summary;
  const values = [[rub(s.grossSales), 'за выбранный период'], [rub(s.netFromWb), 'расчёт после расходов'], [rub(s.charges), 'логистика и удержания'], [rub(s.profit), s.knownCosts ? `себестоимость: ${s.knownCosts}/${s.products}` : 'нужна себестоимость']];
  [...$('cards').children].forEach((card, index) => { card.querySelector('strong').textContent = values[index][0]; card.querySelector('em').textContent = values[index][1]; });
  $('empty').classList.add('hidden'); $('tableWrap').classList.remove('hidden'); $('insights').classList.remove('hidden'); $('tools').classList.remove('hidden');
  $('rows').innerHTML = data.products.map(product => `<tr><td><b>${product.nmId}</b><br><small>${escapeHtml(product.article || product.subject)}</small></td><td><code>${escapeHtml(product.barcode || '—')}</code></td><td>${rub(product.grossSales)}</td><td>${num(product.netUnits)}</td><td>${rub(product.charges)}</td><td><span class="pill ${product.severity}">${rub(product.profit)}</span></td><td>${product.margin == null ? '—' : `${num(product.margin)}%`}</td><td>${rub(product.safePrice)}</td><td class="reason">${escapeHtml(product.reasons.join(' · ') || 'Показатели в норме')}</td></tr>`).join('');
  const comparison = data.comparison;
  $('comparisonTitle').textContent = comparison?.delta.profit == null ? 'Недостаточно данных' : `${comparison.delta.profit >= 0 ? '+' : ''}${rub(comparison.delta.profit)} к прибыли`;
  $('comparison').innerHTML = comparison ? `Продажи: ${rub(comparison.delta.grossSales)}<br>Расходы WB: ${rub(comparison.delta.charges)}<br>${comparison.drivers.slice(0, 3).map(x => `nmID ${x.nmId}: ${rub(x.profitChange)}`).join('<br>')}` : escapeHtml(data.comparisonError || 'Сравнение отключено');
  $('alertTitle').textContent = `${data.alerts.length} предупреждений`;
  $('alerts').innerHTML = data.alerts.slice(0, 5).map(x => `${escapeHtml(x.nmId)} · ${escapeHtml(x.message)}`).join('<br>') || 'Критических правил не сработало';
  $('forecastTitle').textContent = rub(data.forecast.next30Days);
  $('forecast').innerHTML = `Прогноз на 7 дней: ${rub(data.forecast.next7Days)}<br>Рекомендуемый резерв: ${rub(data.forecast.recommendedReserve)}<br>После резерва: ${rub(data.forecast.availableAfterReserve)}`;
  $('riskExposure').textContent = rub(s.riskExposure);
  $('simProduct').innerHTML = data.products.map((p, index) => `<option value="${index}">${escapeHtml(p.nmId)} · ${escapeHtml(p.barcode || 'без баркода')}</option>`).join('');
}

$('analyze').onclick = async () => {
  const button = $('analyze'); button.disabled = true; button.textContent = 'Проверяем…'; showMessage('', '');
  try {
    const settings = { taxPercent: Number($('tax').value), targetMargin: Number($('margin').value), costs: parseMap($('costs').value), adCosts: parseMap($('ads').value),
      reservePercent: 10, rules: { minMargin: Number($('minMargin').value), maxLogisticsPercent: Number($('maxLogistics').value), maxAdPercent: Number($('maxAds').value) } };
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: $('token').value.trim(), dateFrom: $('dateFrom').value, dateTo: $('dateTo').value, compare: $('compare').checked, saveHistory: $('saveHistory').checked, settings }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Ошибка запроса'); render(data);
    showMessage(`Проверено строк: ${data.rows}. Убыточных вариантов: ${data.summary.lossProducts}.`, 'success');
  } catch (error) { showMessage(error.message, 'error'); }
  finally { button.disabled = false; button.textContent = 'Проверить прибыль'; }
};

$('simulate').onclick = async () => {
  if (!lastData) return;
  const product = lastData.products[Number($('simProduct').value)];
  const response = await fetch('/api/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product, scenario: { priceChangePercent: Number($('simPrice').value), adChange: Number($('simAds').value), returnRateChange: Number($('simReturns').value), targetMargin: Number($('margin').value) } }) });
  const result = await response.json(); $('simulation').textContent = result.available ? `${result.verdict}: прибыль ${rub(result.profit)}, маржа ${num(result.margin)}%` : result.reason;
};

$('sendTelegram').onclick = async () => {
  if (!lastData) return;
  const message = `WB Profit Firewall\nПродажи: ${rub(lastData.summary.grossSales)}\nПрибыль: ${rub(lastData.summary.profit)}\nУбыточных товаров: ${lastData.summary.lossProducts}\nРиск: ${rub(lastData.summary.riskExposure)}`;
  try { const response = await fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botToken: $('botToken').value.trim(), chatId: $('chatId').value.trim(), message }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); $('telegramResult').textContent = 'Сводка отправлена'; }
  catch (error) { $('telegramResult').textContent = error.message; }
};

$('loadHistory').onclick = async () => { const rows = await (await fetch('/api/history')).json(); $('history').innerHTML = rows.length ? rows.map(x => `${x.period.dateFrom}—${x.period.dateTo}: ${rub(x.summary.profit)}`).join('<br>') : 'История пока пуста'; };
