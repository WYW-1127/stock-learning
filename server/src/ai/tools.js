// Agent 工具层 — 9 个工具的 LLM schema 定义 + 进程内执行分发
// 铁律:①工具注册表不含任何下单能力(物理隔离);②依赖 symbol 的工具不做名称猜测,
//      名称→代码由 LLM 先调 search_stock 解决(实体解析在运行时,不硬编码映射表)
import { market } from '../market.js';
import { store } from '../store.js';
import { getAccountOverview, getStatus } from '../service.js';
import { calcIndicators, riskSnapshotFields } from './indicators.js';

// ---- LLM 侧 schema(OpenAI function 格式) ----
export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'search_stock',
      description: '把股票名称/简称/拼音/代码解析为规范代码。用户消息出现股票名时必须先调用本工具得到 symbol,再调用其他依赖 symbol 的工具。',
      parameters: {
        type: 'object',
        properties: { keyword: { type: 'string', description: '名称或代码片段,如"平安银行"/"600519"/"byd"' } },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_account',
      description: '获取用户模拟账户全局概览:现金、总资产、每只持仓的数量/可用/T+1锁定/含费成本价/现价/浮盈。快速了解整个账户用这个。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_position',
      description: '获取指定股票的持仓详情,含每个买入批次(数量/买入日期/买入均价/含费成本)、聚合成本、现价、浮盈、可卖数量。深入分析某一只持仓用这个。',
      parameters: {
        type: 'object',
        properties: { symbol: { type: 'string', description: '规范代码,如 sz000001(先经 search_stock 获得)' } },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trade_history',
      description: '获取历史成交流水(含买入理由备注与已实现盈亏),用于复盘"用户何时/什么价/为什么买入"。',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: '可选,过滤指定股票' },
          limit: { type: 'number', description: '返回条数,默认20' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_stock_quote',
      description: '获取股票实时报价:现价/涨跌幅/开收高低/成交量额/换手率/市盈率市净率/振幅/涨跌停价/五档盘口摘要/报价时间。',
      parameters: {
        type: 'object',
        properties: { symbol: { type: 'string' } },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_stock_kline',
      description: '获取K线原始数据(前复权),用于技术分析。period: day 日K(默认) 或 week 周K。',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          period: { type: 'string', enum: ['day', 'week'] },
          limit: { type: 'number', description: '根数,默认60,最大250' },
        },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_indicators',
      description: '获取程序计算好的技术指标(MA5/10/20/60、MACD、RSI14、量比、20日区间位置、波动率、近5日涨跌幅)。需要指标时直接调用本工具,不要自己根据K线心算。',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          period: { type: 'string', enum: ['day', 'week'] },
        },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_context',
      description: '获取大盘环境:三大指数(上证/深成/创业板)现价与涨跌幅、当前盘中/盘后模式。分析个股前建议先了解大盘。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_portfolio_risk_snapshot',
      description: '一次性获取全部持仓的风险快照(每只的盈亏%、RSI、MACD柱、量比、波动率、20日区间位置,已按风险信号粗排)。用户问"持仓哪些风险大/要不要卖"等涉及全部持仓的问题,必须优先用本工具,不要逐只循环调用。',
      parameters: { type: 'object', properties: {} },
    },
  },
];

const SYMBOL_RE = /^[a-z]{2}\d{6}$/;
const round2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

// ---- 执行器:名称 → (args) => 结果(出错返回 { error },不抛异常) ----
const EXECUTORS = {
  async search_stock({ keyword }) {
    const list = await market.search(String(keyword || '').slice(0, 20));
    return { candidates: list.slice(0, 8) };
  },

  async get_account() {
    const overview = await getAccountOverview();
    if (!overview.ok) return { error: '账户数据暂不可用' };
    return {
      cash: overview.account.cash,
      totalAssets: overview.totalAssets,
      positions: overview.positions.map((p) => ({
        symbol: p.symbol, name: p.name, totalQty: p.totalQty, availableQty: p.availableQty,
        lockedQty: p.lockedQty, costPrice: p.costPrice, last: p.last,
        pnl: p.pnl, pnlPct: p.pnlPct,
      })),
      marketOk: overview.marketOk,
    };
  },

  async get_position({ symbol }) {
    const s = String(symbol || '').toLowerCase();
    if (!SYMBOL_RE.test(s)) return { error: `symbol 格式不正确:${symbol}` };
    const positions = store.getPositions();
    const pos = positions[s];
    if (!pos) return { error: `用户没有持有 ${symbol}`, candidates: '可先调用 get_account 查看全部持仓' };
    const quote = (await market.getQuotes([s]).catch(() => ({})))[s] || {};
    const last = quote.last ?? null;
    const { tradeDate } = await getStatus();
    const lots = pos.lots.map((l) => ({
      qty: l.qty, buyDate: l.date,
      avgBuyPrice: round2(l.cost / l.qty), cost: l.cost,
    }));
    const totalQty = pos.lots.reduce((sum, l) => sum + l.qty, 0);
    const totalCost = Math.round(pos.lots.reduce((sum, l) => sum + l.cost, 0) * 100) / 100;
    return {
      symbol: s, name: pos.name, totalQty,
      availableQty: pos.lots.filter((l) => l.date < tradeDate).reduce((sum, l) => sum + l.qty, 0),
      lots, aggregatedCostPrice: round2(totalCost / totalQty),
      last, quoteTime: quote.time || null,
      pnl: last != null ? round2(totalQty * last - totalCost) : null,
      pnlPct: last != null ? round2(((totalQty * last - totalCost) / totalCost) * 100) : null,
    };
  },

  async get_trade_history({ symbol, limit }) {
    const n = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const all = store.getTrades(n);
    const s = symbol ? String(symbol).toLowerCase() : null;
    return {
      trades: all
        .filter((t) => !s || t.symbol === s)
        .map((t) => ({
          time: t.time, tradeDate: t.tradeDate, symbol: t.symbol, name: t.name, side: t.side,
          price: t.price, qty: t.qty, amount: t.amount,
          totalFees: round2(t.fees.commission + t.fees.stampTax + t.fees.transferFee),
          note: t.note || null, realizedPnl: t.realizedPnl ?? null,
        })),
    };
  },

  async get_stock_quote({ symbol }) {
    const s = String(symbol || '').toLowerCase();
    if (!SYMBOL_RE.test(s)) return { error: `symbol 格式不正确:${symbol}` };
    const q = (await market.getQuotes([s]).catch(() => ({})))[s];
    if (!q) return { error: `获取 ${symbol} 行情失败` };
    return {
      symbol: s, name: q.name, last: q.last, changePct: q.changePct, change: q.change,
      open: q.open, prevClose: q.prevClose, high: q.high, low: q.low,
      volume: q.volume, amount: q.amount, turnoverRate: q.turnoverRate,
      pe: q.pe, pb: q.pb, amplitude: q.amplitude,
      limitUp: q.limitUp, limitDown: q.limitDown,
      bid1: q.bid?.[0] || null, ask1: q.ask?.[0] || null,
      time: q.time,
    };
  },

  async get_stock_kline({ symbol, period = 'day', limit }) {
    const s = String(symbol || '').toLowerCase();
    if (!SYMBOL_RE.test(s)) return { error: `symbol 格式不正确:${symbol}` };
    const p = period === 'week' ? 'week' : 'day';
    const n = Math.min(Math.max(parseInt(limit, 10) || 60, 10), 250);
    const bars = await market.getKline(s, p, n).catch(() => null);
    if (!bars) return { error: `获取 ${symbol} K线失败` };
    return { symbol: s, period: p, count: bars.length, bars };
  },

  async calculate_indicators({ symbol, period = 'day' }) {
    const s = String(symbol || '').toLowerCase();
    if (!SYMBOL_RE.test(s)) return { error: `symbol 格式不正确:${symbol}` };
    const bars = await market.getKline(s, period === 'week' ? 'week' : 'day', 60).catch(() => null);
    if (!bars || bars.length < 2) return { error: `获取 ${symbol} K线失败,无法计算指标` };
    return { symbol: s, ...calcIndicators(bars) };
  },

  async get_market_context() {
    const [indices, status] = await Promise.all([
      market.getIndices().catch(() => []),
      getStatus(),
    ]);
    return {
      mode: status.mode, tradeDate: status.tradeDate,
      indices: indices.map((i) => ({ name: i.name, symbol: i.symbol, last: i.last, changePct: i.changePct })),
    };
  },

  async get_portfolio_risk_snapshot() {
    const positions = store.getPositions();
    const symbols = Object.keys(positions);
    if (!symbols.length) return { positions: [], note: '当前空仓' };
    const quotes = await market.getQuotes(symbols).catch(() => ({}));
    const status = await getStatus();
    const rows = [];
    for (const s of symbols) {
      const pos = positions[s];
      const last = quotes[s]?.last ?? null;
      const totalQty = pos.lots.reduce((sum, l) => sum + l.qty, 0);
      const totalCost = Math.round(pos.lots.reduce((sum, l) => sum + l.cost, 0) * 100) / 100;
      const bars = await market.getKline(s, 'day', 60).catch(() => null);
      const ind = calcIndicators(bars);
      rows.push({
        symbol: s, name: pos.name, totalQty,
        availableQty: pos.lots.filter((l) => l.date < status.tradeDate).reduce((sum, l) => sum + l.qty, 0),
        costPrice: round2(totalCost / totalQty), last,
        pnlPct: last != null ? round2(((totalQty * last - totalCost) / totalCost) * 100) : null,
        ...riskSnapshotFields(ind),
      });
    }
    // 风险粗排:RSI 偏高 + 20日位置偏高 + 波动率大 + 亏损深 = 靠前(仅排序,判断留给 LLM)
    const riskScore = (r) => {
      let sc = 0;
      if (r.rsi != null) sc += Math.max(0, r.rsi - 60) / 20;
      if (r.range20Position != null) sc += Math.max(0, r.range20Position - 0.7) * 5;
      if (r.volatility20 != null) sc += r.volatility20 * 20;
      if (r.pnlPct != null && r.pnlPct < 0) sc += Math.min(-r.pnlPct / 5, 2);
      return sc;
    };
    rows.sort((a, b) => riskScore(b) - riskScore(a));
    return { positions: rows, rankedBy: 'rsi/range/volatility/loss 复合信号,仅作排序参考' };
  },
};

/**
 * 执行一次工具调用
 * @returns {Promise<object>} 工具结果(含 error 字段表示业务失败;执行异常包装为 error 不抛出)
 */
export async function executeTool(name, args = {}) {
  const fn = EXECUTORS[name];
  if (!fn) return { error: `未知工具:${name}` };
  try {
    return await Promise.race([
      fn(args),
      new Promise((_, rej) => setTimeout(() => rej(new Error('工具执行超时(3s)')), 3000)),
    ]);
  } catch (err) {
    return { error: `工具执行失败:${err.message}` };
  }
}
