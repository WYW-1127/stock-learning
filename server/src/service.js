// 业务组装 — 盘后判定、下单串行队列、账户视图、资产快照
// store(存储)+ market(行情)+ engine(纯函数引擎)在此汇合;路由层只做参数收发
import { store } from './store.js';
import { market } from './market.js';
import { processOrder, boardOf, roundToCent, totalQty, availableQty } from './engine/index.js';
import { closeLotDetails } from './review.js';

const SYMBOL_RE = /^[a-z]{2}\d{6}$/;
const A_SHARE_SESSIONS = [[570, 690], [780, 900]]; // 9:30-11:30 / 13:00-15:00(分钟数,午休按最新价可成交,视为 live)

const localDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 当前行情状态:mode live|afterHours;tradeDate 为本次应使用的交易日
// 日历来自日K(当日缓存);日历拉取失败时降级为"周一至周五即交易日"(节假日会误判,可接受)
export async function getStatus() {
  const now = new Date();
  const today = localDateStr(now);
  let dates = [];
  try {
    dates = await market.getTradingDates();
  } catch {}
  const isTradingDay = dates.length
    ? dates.includes(today)
    : now.getDay() >= 1 && now.getDay() <= 5;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const inSession = isTradingDay && A_SHARE_SESSIONS.some(([a, b]) => minutes >= a && minutes < b);
  // 当前交易日:今天在日历中→今天;否则(周末/节假日)→之前最近的交易日
  const tradeDate = resolveDate(dates, today);
  return { mode: inSession ? 'live' : 'afterHours', time: now.toISOString(), tradeDate };
}

// 给定日期(或之前最近交易日);无日历时返回今天
function resolveDate(dates, today) {
  if (!dates.length) return today;
  let prev = null;
  for (const d of dates) {
    if (d <= today) prev = d;
    else break;
  }
  return prev || today;
}

// ---- 资产快照:cash + Σ(持仓总股数×现价),按日记录 ----
async function computeTotalAssets() {
  const account = store.getAccount();
  const positions = store.getPositions();
  const symbols = Object.keys(positions);
  let marketValue = 0;
  if (symbols.length) {
    const quotes = await market.getQuotes(symbols).catch(() => ({}));
    for (const s of symbols) {
      const last = quotes[s]?.last;
      if (last != null) marketValue += totalQty(positions[s]) * last;
    }
  }
  return roundToCent(account.cash + marketValue);
}

// 更新当日快照;行情失败时静默跳过(保留旧值),由调用方决定是否展示降级提示
export async function refreshSnapshot() {
  try {
    store.setSnapshot(localDateStr(new Date()), await computeTotalAssets());
  } catch {}
}

// ---- 账户视图 ----
export async function getAccountOverview() {
  const account = store.getAccount();
  const positions = store.getPositions();
  const symbols = Object.keys(positions);
  let quotes = {};
  let marketOk = true;
  if (symbols.length) {
    try {
      quotes = await market.getQuotes(symbols);
    } catch {
      marketOk = false; // 行情失败:现价字段置 null,页面显示"—",不阻塞账户数据
    }
  }
  let marketValue = 0;
  const today = localDateStr(new Date());
  const rows = symbols.map((symbol) => {
    const pos = positions[symbol];
    const total = totalQty(pos);
    const cost = Math.round(pos.lots.reduce((s, l) => s + l.cost, 0) * 100) / 100;
    const costPrice = Math.round((cost / total) * 100) / 100;
    const last = quotes[symbol]?.last ?? null;
    const value = last != null ? Math.round(total * last * 100) / 100 : null;
    if (value != null) marketValue += value;
    const pnl = value != null ? Math.round((value - cost) * 100) / 100 : null;
    // T+1 可用量按自然日判定即可:买入日期必是交易日,"早于今天"与"早于当前交易日"等价
    const avail = availableQty(pos, today);
    return {
      symbol,
      name: pos.name,
      board: boardOf(symbol),
      totalQty: total,
      availableQty: avail,
      lockedQty: total - avail,
      costPrice,
      last,
      marketValue: value,
      pnl,
      pnlPct: pnl != null ? Math.round((pnl / cost) * 10000) / 100 : null,
    };
  });
  return {
    ok: true,
    account,
    positions: rows,
    totalAssets: roundToCent(account.cash + marketValue),
    marketOk,
  };
}

// ---- 下单(内存队列串行,防止并发读写导致资金双花) ----
let queue = Promise.resolve();
const enqueue = (fn) => {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
};

let tradeSeq = 0;
function nextTradeId() {
  const all = store.getTrades();
  tradeSeq = all.length ? Number(all[all.length - 1].id.slice(1)) + 1 : 1;
  return `t${String(tradeSeq).padStart(4, '0')}`;
}

// @param body { symbol, side, price, qty, note? }
// @returns { ok:true, trade } | { ok:false, reason }(人话)
export function placeOrder(body) {
  return enqueue(() => handleOrder(body));
}

async function handleOrder(body) {
  const { symbol, side, price, qty, note } = body || {};
  // 引擎不校验的字段在此挡下(side 非法会让引擎误走卖出分支,必须先拦)
  if (typeof symbol !== 'string' || !SYMBOL_RE.test(symbol)) {
    return { ok: false, reason: '股票代码格式不正确,请重新搜索选择' };
  }
  if (side !== 'buy' && side !== 'sell') {
    return { ok: false, reason: '订单方向不正确,请刷新页面重试' };
  }

  const status = await getStatus();
  let quote;
  try {
    quote = (await market.getQuotes([symbol]))[symbol];
  } catch {
    return { ok: false, reason: '行情暂时获取失败,请稍后再试(已保留你的资金与持仓)' };
  }
  if (!quote || quote.last == null) {
    return { ok: false, reason: '暂时获取不到该股票的最新行情,请稍后再试' };
  }

  const account = store.getAccount();
  const positions = store.getPositions();
  const result = processOrder({
    order: { symbol, side, price, qty },
    quote,
    account,
    positions,
    tradeDate: status.tradeDate,
    tradeContext: {
      id: nextTradeId(),
      time: new Date().toISOString(),
      tradeDate: status.tradeDate,
      mode: status.mode,
      note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 200) : null,
    },
  });
  if (!result.ok) return result;

  // 卖出:补记被平批次明细(FIFO 日期),复盘统计持有天数要用
  const trade = result.trade;
  if (side === 'sell') {
    trade.closeLots.lots = closeLotDetails(positions[symbol], qty);
  }

  store.saveAccount(result.account);
  store.savePositions(result.positions);
  store.addTrade(trade);
  await refreshSnapshot();
  return { ok: true, trade };
}
