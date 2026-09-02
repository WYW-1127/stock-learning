// 技术指标计算 — 纯函数,K线数组进、指标对象出;数值一律程序计算,LLM 只读不算
// 输入约定:bars = [{date, open, close, high, low, volume}] 升序;数据不足时对应字段为 null(不报错)

const round = (x, digits = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** digits) / 10 ** digits : null);

// 简单移动平均:取最后 n 根的均值(不足 n 根返回 null)
function sma(values, n) {
  if (values.length < n) return null;
  const slice = values.slice(-n);
  return slice.reduce((s, v) => s + v, 0) / n;
}

// EMA(指数移动平均),标准 seed = 前 n 个的均值
function emaSeries(values, n) {
  if (values.length < n) return [];
  const out = [];
  let prev = values.slice(0, n).reduce((s, v) => s + v, 0) / n;
  out.push(prev);
  const k = 2 / (n + 1);
  for (let i = n; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

// RSI(14,Wilder 平滑):全涨=100,全跌=0;不足 15 根返回 null
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// MACD(12,26,9):EMA 基;不足 26+9 根返回 null 字段
function macd(closes) {
  const fast = emaSeries(closes, 12);
  const slow = emaSeries(closes, 26);
  if (!slow.length) return { dif: null, dea: null, hist: null };
  // 对齐:fast 从第 11 根起,slow 从第 25 根起;dif 序列取两者重叠段
  const offset = closes.length - fast.length; // fast 起始索引
  const dif = slow.map((s, i) => fast[i + (fast.length - slow.length)] - s);
  const deaSeries = emaSeries(dif, 9);
  if (!deaSeries.length) return { dif: round(dif[dif.length - 1], 4), dea: null, hist: null };
  const lastDif = dif[dif.length - 1];
  const lastDea = deaSeries[deaSeries.length - 1];
  return { dif: round(lastDif, 4), dea: round(lastDea, 4), hist: round((lastDif - lastDea) * 2, 4) };
}

// 20 日日收益率标准差(总体)
function volatility20(closes) {
  if (closes.length < 21) return null;
  const rets = [];
  for (let i = closes.length - 20; i < closes.length; i++) {
    rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
  return round(Math.sqrt(variance), 4);
}

/**
 * 计算全部指标
 * @param {Array<{date,open,close,high,low,volume}>} bars 升序K线
 * @returns {object} spec §5 定义的结构;bars 为空返回 null
 */
export function calcIndicators(bars) {
  if (!bars || bars.length === 0) return null;
  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume);
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const changePct = prev ? round(((last.close - prev.close) / prev.close) * 100) : null;

  // 近 5 日涨跌幅序列(每根对前一根)
  const changePctSeries5 = [];
  for (let i = Math.max(1, bars.length - 5); i < bars.length; i++) {
    changePctSeries5.push(round(((bars[i].close - bars[i - 1].close) / bars[i - 1].close) * 100));
  }

  // 20 日区间位置:现价在近 20 根高低区间中的位置(0=最低,1=最高)
  let range20 = null;
  if (bars.length >= 2) {
    const win = bars.slice(-20);
    const high = Math.max(...win.map((b) => b.high));
    const low = Math.min(...win.map((b) => b.low));
    range20 = {
      high: round(high),
      low: round(low),
      position: high > low ? round((last.close - low) / (high - low), 2) : 0.5,
    };
  }

  // 量比:最后一根成交量 / 前 5 根均量
  let volRatio5 = null;
  if (vols.length >= 6) {
    const prev5 = vols.slice(-6, -1).reduce((s, v) => s + v, 0) / 5;
    volRatio5 = prev5 > 0 ? round(last.volume / prev5) : null;
  }

  return {
    last: last.close,
    changePct,
    ma: {
      ma5: round(sma(closes, 5)),
      ma10: round(sma(closes, 10)),
      ma20: round(sma(closes, 20)),
      ma60: round(sma(closes, 60)),
    },
    macd: macd(closes),
    rsi: rsi(closes) == null ? null : round(rsi(closes), 1),
    volume: {
      lastVol: last.volume,
      volRatio5,
    },
    range20,
    changePctSeries5,
    volatility20: volatility20(closes),
  };
}

// 批量风险快照用的精简指标(get_portfolio_risk_snapshot 每只持仓取这些)
export function riskSnapshotFields(ind) {
  if (!ind) return { rsi: null, macdHist: null, volRatio5: null, volatility20: null, range20Position: null };
  return {
    rsi: ind.rsi,
    macdHist: ind.macd?.hist ?? null,
    volRatio5: ind.volume?.volRatio5 ?? null,
    volatility20: ind.volatility20,
    range20Position: ind.range20?.position ?? null,
  };
}
