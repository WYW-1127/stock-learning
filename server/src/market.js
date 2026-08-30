// 行情服务 — 腾讯实时报价/五档/涨跌停(GBK)、腾讯 K线/分时(ifzq)、东财搜索(suggest)
// 注:K线原计划用东财 push2his,实测该域名族在本机网络直连不可达(开/关代理均如此),
//     而腾讯 ifzq 与东财 searchapi 实测稳定,故 K线/分时切腾讯、搜索留东财(决策记录见 architecture.md §1)
// 缓存:报价 3s TTL(按只);日K 当日有效;周K 60s;分时 5s
// 上游:5s 超时,失败重试×2(退避 500ms/1s),重试仍失败则抛错,由路由层降级处理
import iconv from 'iconv-lite';
import { boardOf } from './engine/fees.js';

// 三大指数:上证指数 / 深证成指 / 创业板指
export const INDEX_SYMBOLS = ['sh000001', 'sz399001', 'sz399006'];

const QUOTE_BATCH = 60; // 腾讯单次批量上限约 60 只

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round2 = (x) => Math.round(x * 100) / 100;
// smartbox 返回的名称是字面 \uXXXX 转义序列(ASCII),需还原为中文
const unescapeUnicode = (s) => {
  if (!s || !s.includes('\\u')) return s;
  try { return JSON.parse(`"${s}"`); } catch { return s; }
};
const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

export function createMarket(options = {}) {
  const {
    fetchImpl = fetch,
    now = () => Date.now(),
    timeoutMs = 5000,
    retryDelays = [500, 1000],
    quotesTtlMs = 3000,
    minuteTtlMs = 5000,
    weekTtlMs = 60000,
  } = options;

  // 请求文本:超时 + 重试;gbk=true 时按 GBK 解码(腾讯行情接口)
  async function fetchText(url, { gbk = false } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      if (attempt > 0) await sleep(retryDelays[attempt - 1]);
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        return gbk ? iconv.decode(buf, 'gbk') : buf.toString('utf8');
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  // ---- 腾讯实时报价 ----
  // 字段以 ~ 分隔,关键下标(实测 2026-08 校准):
  // 1名称 3现价 4昨收 5今开 9~18买一~买五价量 19~28卖一~卖五价量 30时间
  // 31涨跌 32涨跌% 33最高 34最低 36成交量(手) 37成交额(万) 38换手 39PE
  // 43振幅 44流通市值(亿) 45总市值(亿) 46PB 47涨停 48跌停
  function parseQuote(symbol, payload) {
    const f = payload.split('~');
    if (f.length < 50) return null;
    const num = (i) => {
      const v = Number.parseFloat(f[i]);
      return Number.isFinite(v) ? v : null;
    };
    // 指数等无涨跌停的品种返回 -1/0,归一为 null
    const limit = (i) => {
      const v = num(i);
      return v && v > 0 ? v : null;
    };
    const five = (base) =>
      [0, 1, 2, 3, 4].map((i) => ({ price: num(base + i * 2), qty: num(base + i * 2 + 1) }));
    const raw = num(37);
    const t = f[30] || '';
    return {
      symbol,
      name: f[1],
      last: num(3),
      prevClose: num(4),
      open: num(5),
      high: num(33),
      low: num(34),
      change: num(31),
      changePct: num(32),
      volume: num(36), // 手
      amount: raw == null ? null : Math.round(raw * 10000), // 万元 → 元
      turnoverRate: num(38),
      pe: num(39),
      amplitude: num(43),
      floatMv: num(44), // 亿元
      totalMv: num(45), // 亿元
      pb: num(46),
      time: t.length >= 14
        ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)} ${t.slice(8, 10)}:${t.slice(10, 12)}:${t.slice(12, 14)}`
        : null,
      limitUp: limit(47),
      limitDown: limit(48),
      bid: five(9), // 买一~买五 { price, qty(手) }
      ask: five(19), // 卖一~卖五
    };
  }

  const quoteCache = new Map(); // symbol → { at, data }

  // 批量实时报价;TTL 内直接复用缓存,只请求缺失/过期的部分
  async function getQuotes(symbols) {
    const uniq = [...new Set(symbols)];
    const result = {};
    const need = [];
    const t = now();
    for (const s of uniq) {
      const c = quoteCache.get(s);
      if (c && t - c.at < quotesTtlMs) result[s] = c.data;
      else need.push(s);
    }
    for (const batch of chunk(need, QUOTE_BATCH)) {
      const text = await fetchText(`https://qt.gtimg.cn/q=${batch.join(',')}`, { gbk: true });
      for (const s of batch) {
        const m = text.match(new RegExp(`v_${s}="([^"]*)"`));
        if (!m) continue;
        const q = parseQuote(s, m[1]);
        if (q) {
          quoteCache.set(s, { at: t, data: q });
          result[s] = q;
        }
      }
    }
    return result;
  }

  // 三大指数,按固定顺序返回数组
  async function getIndices() {
    const quotes = await getQuotes(INDEX_SYMBOLS);
    return INDEX_SYMBOLS.map((s) => quotes[s]).filter(Boolean);
  }

  // ---- 腾讯 K线(ifzq,前复权) ----
  // 返回 [{ date, open, close, high, low, volume(手) }];klt: 'day' | 'week'
  // 日K 按当日缓存(盘中只变当天一根,跨零点失效);周K 短 TTL
  const klineCache = new Map(); // `${klt}:${symbol}:${limit}` → { day?, at?, data }

  async function getKline(symbol, klt = 'day', limit = 120) {
    const key = `${klt}:${symbol}:${limit}`;
    const t = now();
    const cached = klineCache.get(key);
    if (cached) {
      if (klt === 'day') {
        const d = new Date(t);
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (cached.day === today) return cached.data;
      } else if (t - cached.at < weekTtlMs) {
        return cached.data;
      }
    }
    const json = JSON.parse(
      await fetchText(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},${klt},,,${limit},qfq`)
    );
    const node = json?.data?.[symbol];
    const rows = node?.qfqday || node?.day || node?.qfqweek || node?.week || []; // 指数无复权,键为 day/week
    const bars = rows.map((r) => ({
      date: r[0],
      open: +r[1],
      close: +r[2],
      high: +r[3],
      low: +r[4],
      volume: +r[5],
    }));
    if (klt === 'day') {
      const d = new Date(t);
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      klineCache.set(key, { day: today, data: bars });
    } else {
      klineCache.set(key, { at: t, data: bars });
    }
    return bars;
  }

  // 交易日历数据源:日K日期数组(升序),供 engine/calendar 纯函数消费
  // 默认用上证指数(历史完整);日K当日缓存使同一天只拉一次
  async function getTradingDates(limit = 300) {
    const bars = await getKline('sh000001', 'day', limit);
    return bars.map((b) => b.date);
  }

  // ---- 腾讯分时 ----
  // 返回 { symbol, date?, prevClose, points: [{ time 'HH:MM', price, volume(手), avgPrice }] }
  // 源数据每行 "0930 1289.00 81 10440900.00" = 时间 现价 累计量(手) 累计额(元);均价 = 累计额/累计量/100
  const minuteCache = new Map(); // symbol → { at, data }

  async function getMinuteTimeline(symbol) {
    const t = now();
    const cached = minuteCache.get(symbol);
    if (cached && t - cached.at < minuteTtlMs) return cached.data;
    const json = JSON.parse(
      await fetchText(`https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${symbol}`)
    );
    const node = json?.data?.[symbol];
    const rows = node?.data?.data || [];
    const prevClose = Number.parseFloat(node?.qt?.[symbol]?.[4]) || null;
    let prevVol = 0;
    const points = rows.map((row) => {
      const [hm, price, cumVol, cumAmount] = row.split(' ');
      const vol = Math.max(+cumVol - prevVol, 0);
      prevVol = +cumVol;
      const avg = +cumVol > 0 ? round2(+cumAmount / (+cumVol * 100)) : +price;
      return { time: `${hm.slice(0, 2)}:${hm.slice(2)}`, price: +price, volume: vol, avgPrice: avg };
    });
    const data = { symbol, date: node?.data?.date || null, prevClose, points };
    minuteCache.set(symbol, { at: t, data });
    return data;
  }

  // ---- 搜索(腾讯 smartbox) ----
  // 注:原计划用东财 suggest,实测其对 Node fetch 的 TLS 指纹返回另一条无股票数据的 JSONP 分支(curl 正常),不可靠,弃用
  // 返回格式 v_hint="市场~代码~名称~拼音~类型^..."(GBK);A股类型为 GP-A,ETF/基金/指数/港股各有标记
  // 只保留沪深 A 股(市场 sh/sz 且类型 GP-A),board 与交易引擎同源(boardOf)
  async function search(q) {
    const url = `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(q)}&t=all`;
    const text = await fetchText(url, { gbk: true });
    const m = text.match(/v_hint="([^"]*)"/);
    if (!m || !m[1]) return [];
    return m[1]
      .split('^')
      .map((row) => row.split('~'))
      .filter((f) => f.length >= 5 && (f[0] === 'sh' || f[0] === 'sz') && f[4].startsWith('GP-A'))
      .map((f) => {
        const symbol = `${f[0]}${f[1]}`;
        return { symbol, code: f[1], name: unescapeUnicode(f[2]), board: boardOf(symbol) };
      });
  }

  return { getQuotes, getIndices, getKline, getTradingDates, getMinuteTimeline, search };
}

// 默认实例
export const market = createMarket();
