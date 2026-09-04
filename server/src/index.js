import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './store.js';
import { market } from './market.js';
import * as service from './service.js';
import { summarize, closedTradeRows } from './review.js';
import { getTerms, listLessons, getLesson } from './content.js';
import { loadAiConfig, configFilePath } from './ai/llm.js';
import { runAgent } from './ai/agent.js';
import { clearHistory } from './ai/context.js';
import { createAuth } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8090;

// 存储初始化:目录/默认文件就绪;损坏时自动从 .bak 恢复或回退默认(提示用 ASCII,控制台可能是 GBK)
const storeNotices = store.init();
for (const n of storeNotices) {
  console.log(`[store] ${n.file} ${n.action}`);
}

const app = express();
app.use(express.json());

// 公网口令保护:配置 AUTH_USER/AUTH_PASS 才启用;不配置则与本地使用行为一致
const auth = createAuth(process.env.AUTH_USER, process.env.AUTH_PASS);
if (auth) app.use(auth);

// async 路由统一兜底:5xx 仅服务端故障,业务拒绝一律 200 + { ok:false, reason }
const wrap = (fn) => (req, res) => {
  fn(req, res).catch((err) => {
    console.error(`[api] ${req.method} ${req.path} failed: ${err.message}`);
    res.status(500).json({ ok: false, error: 'internal error' });
  });
};

// ---- 行情 ----
app.get('/api/meta/status', wrap(async (req, res) => {
  res.json({ ok: true, ...await service.getStatus() });
}));

app.get('/api/market/indices', wrap(async (req, res) => {
  res.json({ ok: true, indices: await market.getIndices() });
}));

app.get('/api/market/quotes', wrap(async (req, res) => {
  const symbols = String(req.query.symbols || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z]{2}\d{6}$/.test(s))
    .slice(0, 100);
  const quotes = symbols.length ? await market.getQuotes(symbols) : {};
  res.json({ ok: true, quotes });
}));

// klt: day | week | minute(minute 返回分时 timeline)
app.get('/api/market/kline', wrap(async (req, res) => {
  const symbol = String(req.query.symbol || '').toLowerCase();
  const klt = ['day', 'week', 'minute'].includes(req.query.klt) ? req.query.klt : 'day';
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 120, 1), 800);
  if (!/^[a-z]{2}\d{6}$/.test(symbol)) {
    return res.json({ ok: false, reason: '股票代码格式不正确' });
  }
  if (klt === 'minute') {
    return res.json({ ok: true, timeline: await market.getMinuteTimeline(symbol) });
  }
  res.json({ ok: true, bars: await market.getKline(symbol, klt, limit) });
}));

app.get('/api/market/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ ok: true, list: [] });
  res.json({ ok: true, list: await market.search(q) });
}));

// ---- 自选 ----
app.get('/api/watchlist', wrap(async (req, res) => {
  res.json({ ok: true, watchlist: store.getWatchlist() });
}));

app.post('/api/watchlist', wrap(async (req, res) => {
  const symbol = String(req.body?.symbol || '').toLowerCase();
  if (!/^[a-z]{2}\d{6}$/.test(symbol)) {
    return res.json({ ok: false, reason: '股票代码格式不正确' });
  }
  const list = store.getWatchlist();
  if (list.includes(symbol)) return res.json({ ok: true, watchlist: list });
  if (list.length >= 30) {
    return res.json({ ok: false, reason: '自选最多 30 只,请先移除一些' });
  }
  list.push(symbol);
  store.saveWatchlist(list);
  res.json({ ok: true, watchlist: list });
}));

app.delete('/api/watchlist/:symbol', wrap(async (req, res) => {
  const symbol = String(req.params.symbol || '').toLowerCase();
  const list = store.getWatchlist().filter((s) => s !== symbol);
  store.saveWatchlist(list);
  res.json({ ok: true, watchlist: list });
}));

// ---- 账户与交易 ----
app.get('/api/account', wrap(async (req, res) => {
  const overview = await service.getAccountOverview();
  await service.refreshSnapshot(); // 每日首次加载更新资产曲线;失败静默
  res.json(overview);
}));

app.post('/api/orders', wrap(async (req, res) => {
  res.json(await service.placeOrder(req.body));
}));

app.get('/api/trades', wrap(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 0, 0), 1000);
  res.json({ ok: true, trades: store.getTrades(limit) });
}));

app.get('/api/review/summary', wrap(async (req, res) => {
  const trades = store.getTrades();
  res.json({
    ok: true,
    summary: summarize(trades),
    closedTrades: closedTradeRows(trades),
    snapshots: store.getSnapshots(),
  });
}));

app.post('/api/account/reset', wrap(async (req, res) => {
  store.reset();
  console.log('[store] account reset to initial cash');
  res.json({ ok: true });
}));

// ---- 学习内容 ----
app.get('/api/content/terms', wrap(async (req, res) => {
  res.json({ ok: true, terms: getTerms() });
}));

// ---- AI 教练(自然语言 Agent) ----
app.get('/api/ai/status', wrap(async (req, res) => {
  const cfg = loadAiConfig();
  res.json({ ok: true, configured: !!cfg, model: cfg ? cfg.model : null, configPath: configFilePath() });
}));

app.post('/api/ai/chat', wrap(async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.json({ ok: false, reason: '请输入你的问题' });
  if (!loadAiConfig()) {
    return res.json({ ok: false, reason: 'AI 未配置:请在配置文件中填入智谱 API Key 后重启服务(路径见 /api/ai/status)', notConfigured: true });
  }
  // 流式(SSE):思考增量/工具进度实时下发,answer/error 收尾;前端读 stream:true
  if (req.body?.stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    const r = await runAgent(message, send);
    if (r.ok) send({ type: 'answer', reply: r.reply, toolCalls: r.toolCalls });
    else send({ type: 'error', reason: r.reason });
    res.end();
    return;
  }
  res.json(await runAgent(message)); // 非流式兼容(验收脚本/调试)
}));

app.delete('/api/ai/chat', wrap(async (req, res) => {
  clearHistory();
  res.json({ ok: true });
}));

app.get('/api/content/lessons', wrap(async (req, res) => {
  res.json({ ok: true, lessons: listLessons() });
}));

app.get('/api/content/lessons/:id', wrap(async (req, res) => {
  const lesson = getLesson(req.params.id);
  if (!lesson) return res.status(404).json({ ok: false, error: 'lesson not found' });
  res.json({ ok: true, ...lesson });
}));

// ---- 前端静态资源 ----
const dist = path.join(__dirname, '../../web/dist');
app.use(express.static(dist));
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(dist, 'index.html'));
  }
  next();
});

const server = app.listen(PORT, () => {
  // 控制台可能是 GBK 代码页,启动提示用 ASCII 避免乱码
  console.log(`Server ready: http://localhost:${PORT}`);
});
// 端口被旧实例占用时给出人话提示(启动.bat 场景常见),不吐一堆堆栈
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[error] Port ${PORT} is already in use.`);
    console.log('[error] Close the old program window (or run: taskkill /F /IM node.exe) and start again.');
  } else {
    console.log(`[error] ${err.message}`);
  }
  process.exit(1);
});
