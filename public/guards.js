const byId = (id) => document.getElementById(id);
const wrapTokenGuard = (buttonId, tokenId, category) => {
  const button = byId(buttonId);
  if (!button || typeof button.onclick !== 'function') return;
  const original = button.onclick;
  button.onclick = async (event) => {
    const token = byId(tokenId);
    if (!token?.value.trim()) {
      const message = byId('message');
      if (message) { message.className = 'error'; message.textContent = `Для этого запроса нужен токен WB категории «${category}».`; }
      token?.focus();
      return;
    }
    return original.call(button, event);
  };
};
wrapTokenGuard('loadStocks', 'analyticsToken', 'Аналитика');
wrapTokenGuard('loadReconciliation', 'suppliesToken', 'Поставки');
wrapTokenGuard('loadPrices', 'repricerToken', 'Цены и скидки');
