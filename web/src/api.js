// API 客户端 — 统一 fetch 封装;业务失败(P200+ok:false)原样返回,网络/5xx 抛错
async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`请求失败(${res.status})`);
  }
  return res.json();
}

export const api = {
  // 行情
  getStatus: () => request('/api/meta/status'),
  getIndices: () => request('/api/market/indices'),
  getQuotes: (symbols) => request(`/api/market/quotes?symbols=${symbols.join(',')}`),
  getKline: (symbol, klt, limit = 120) =>
    request(`/api/market/kline?symbol=${symbol}&klt=${klt}&limit=${limit}`),
  search: (q) => request(`/api/market/search?q=${encodeURIComponent(q)}`),
  // 自选
  getWatchlist: () => request('/api/watchlist'),
  addWatch: (symbol) =>
    request('/api/watchlist', { method: 'POST', body: JSON.stringify({ symbol }) }),
  removeWatch: (symbol) => request(`/api/watchlist/${symbol}`, { method: 'DELETE' }),
  // 账户与交易
  getAccount: () => request('/api/account'),
  placeOrder: (body) =>
    request('/api/orders', { method: 'POST', body: JSON.stringify(body) }),
  getTrades: (limit = 100) => request(`/api/trades?limit=${limit}`),
  getReview: () => request('/api/review/summary'),
  resetAccount: () => request('/api/account/reset', { method: 'POST', body: '{}' }),
  // 内容
  getTerms: () => request('/api/content/terms'),
  getLessons: () => request('/api/content/lessons'),
  getLesson: (id) => request(`/api/content/lessons/${id}`),
};
