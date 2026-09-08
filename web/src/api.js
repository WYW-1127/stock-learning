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
  // AI Investment Agent
  aiStatus: () => request('/api/ai/status'),
  aiChat: (message) =>
    request('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message }) }),
  // 流式版:SSE 逐事件回调(思考增量/工具进度/最终答案),网络异常抛错
  aiChatStream: async (message, onEvent) => {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`请求失败(${res.status})`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        try {
          onEvent(JSON.parse(line.slice(5).trim()));
        } catch {} // 单个坏事件不中断整条流
      }
    }
  },
  aiClear: () => request('/api/ai/chat', { method: 'DELETE' }),
};
