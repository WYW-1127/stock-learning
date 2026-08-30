// T5 验收脚本:全流程 curl 等价断言(买入→T+1拒绝→卖出→账户→流水→复盘→重置→内容)
const BASE = 'http://localhost:8092';
let failed = 0;

function check(label, cond, detail) {
  if (cond) {
    console.log(`PASS ${label}`);
  } else {
    failed++;
    console.log(`FAIL ${label} :: ${detail}`);
  }
}

const get = async (path) => (await fetch(BASE + path)).json();
const post = async (path, body) =>
  (await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

const status = await get('/api/meta/status');
check('status 盘后模式+交易日', status.mode === 'afterHours' && status.tradeDate === '2026-08-28',
  JSON.stringify(status));

const idx = await get('/api/market/indices');
check('indices 三大指数', idx.ok && idx.indices.length === 3 && idx.indices.every((i) => i.last > 0),
  JSON.stringify(idx).slice(0, 120));

const s = await get('/api/market/search?q=' + encodeURIComponent('茅台'));
check('search 命中茅台', s.ok && s.list.some((x) => x.symbol === 'sh600519'), JSON.stringify(s));

const quotes = await get('/api/market/quotes?symbols=sh600519,sz000001');
const mt = quotes.quotes.sh600519;
const pa = quotes.quotes.sz000001;
check('quotes 五档/涨跌停', mt && mt.limitUp > mt.last && mt.bid.length === 5 && pa && pa.last > 0,
  JSON.stringify(quotes).slice(0, 150));

// 1. 买入平安银行 100 股(委托价=现价)
const buy = await post('/api/orders', { symbol: 'sz000001', side: 'buy', price: pa.last, qty: 100, note: '验收买入' });
check('买入成交', buy.ok === true && buy.trade.side === 'buy' && buy.trade.id === 't0001' && buy.trade.amount > 0,
  JSON.stringify(buy).slice(0, 200));

// 2. 立即卖出茅台(当日买入)→ T+1 拒绝
const t1 = await post('/api/orders', { symbol: 'sh600519', side: 'sell', price: mt.last, qty: 100 });
check('T+1 拒绝(人话)', t1.ok === false && t1.reason.includes('T+1'), JSON.stringify(t1));

// 3. 卖出平安银行 200 股(FIFO 吃 8-27 批次)
const sell = await post('/api/orders', { symbol: 'sz000001', side: 'sell', price: pa.last, qty: 200 });
check('卖出成交+盈亏', sell.ok === true && typeof sell.trade.realizedPnl === 'number' && sell.trade.closeLots.lots[0].date === '2026-08-27',
  JSON.stringify(sell).slice(0, 250));

// 4. 账户视图(验收日在 2026-08-30 周日:8-28 批次 T+1 已过,应全部可用;成本价应接近市价而非虚高)
const acc = await get('/api/account');
const paRow = acc.positions.find((p) => p.symbol === 'sz000001');
check('账户持仓/可用量', acc.ok && acc.totalAssets > 0 && paRow && paRow.totalQty === 400 && paRow.availableQty === 400 && paRow.lockedQty === 0 && paRow.costPrice > 11 && paRow.costPrice < 12,
  JSON.stringify({ total: acc.totalAssets, pa: paRow }));

// 5. 流水(最新在前)
const trades = await get('/api/trades?limit=10');
check('流水顺序', trades.ok && trades.trades.map((t) => t.id).join(',') === 't0002,t0001',
  JSON.stringify(trades.trades.map((t) => t.id)));

// 6. 复盘统计
const rv = await get('/api/review/summary');
check('复盘统计', rv.summary.closedCount === 1 && rv.summary.avgHoldDays === 1 && typeof rv.summary.totalRealizedPnl === 'number',
  JSON.stringify(rv.summary));

// 7. 非法方向拒绝
const bad = await post('/api/orders', { symbol: 'sz000001', side: 'xxx', price: 1, qty: 100 });
check('非法方向人话拒绝', bad.ok === false && bad.reason.includes('方向'), JSON.stringify(bad));

// 8. 重置
await post('/api/account/reset', {});
const acc2 = await get('/api/account');
check('重置回 10 万', acc2.account.cash === 100000 && acc2.positions.length === 0,
  JSON.stringify({ cash: acc2.account.cash, n: acc2.positions.length }));
const watch = JSON.parse((await import('node:fs')).readFileSync(process.env.TEMP + '/t5-data/watchlist.json', 'utf8'));
check('重置保留自选', watch.length === 2, JSON.stringify(watch));

// 9. 内容
const terms = await get('/api/content/terms');
const lessons = await get('/api/content/lessons');
const lesson1 = await get('/api/content/lessons/01-what-is-stock');
check('术语+课程', terms.terms.length >= 25 && lessons.lessons.length === 6 && lesson1.markdown.length > 100,
  `terms=${terms.terms.length} lessons=${lessons.lessons.length}`);

console.log(failed === 0 ? '\n=== 全部通过 ===' : `\n=== ${failed} 项失败 ===`);
process.exit(failed === 0 ? 0 : 1);
