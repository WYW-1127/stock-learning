// 复盘统计 — 纯函数(输入成交流水,输出统计与平仓明细,无IO)
// 持有天数 = 按股数加权的自然日天数(卖出交易日 − 买入批次日期)

// FIFO 取出被平批次明细 [{ date, qty }](与引擎 consumeLots 同序,供持有天数与明细展示)
export function closeLotDetails(position, qty) {
  if (!position) return [];
  const details = [];
  let remaining = qty;
  for (const lot of position.lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.qty, remaining);
    details.push({ date: lot.date, qty: take });
    remaining -= take;
  }
  return details;
}

// 单笔卖出的加权持有天数(自然日);批次明细缺失返回 null
export function holdingDays(sellDate, lotDetails) {
  if (!lotDetails || lotDetails.length === 0) return null;
  const sell = new Date(`${sellDate}T00:00:00`);
  let total = 0;
  let qtySum = 0;
  for (const lot of lotDetails) {
    const buy = new Date(`${lot.date}T00:00:00`);
    total += Math.max((sell - buy) / 86400000, 0) * lot.qty;
    qtySum += lot.qty;
  }
  return qtySum > 0 ? Math.round((total / qtySum) * 10) / 10 : null;
}

// 汇总统计:仅统计已平仓卖出单(realizedPnl != null)
// @returns { closedCount, winCount, winRate, totalRealizedPnl, avgHoldDays, maxWin, maxLoss }
// 空平仓时:winRate/avgHoldDays/maxWin/maxLoss 为 null
export function summarize(trades) {
  const closed = trades.filter((t) => t.side === 'sell' && t.realizedPnl != null);
  const wins = closed.filter((t) => t.realizedPnl > 0);
  const totalRealizedPnl = Math.round(closed.reduce((s, t) => s + t.realizedPnl, 0) * 100) / 100;

  let holdSum = 0;
  let holdQty = 0;
  for (const t of closed) {
    const days = holdingDays((t.tradeDate || t.time || '').slice(0, 10), t.closeLots?.lots);
    if (days == null) continue;
    holdSum += days * t.qty;
    holdQty += t.qty;
  }

  const pnls = closed.map((t) => t.realizedPnl);
  return {
    closedCount: closed.length,
    winCount: wins.length,
    winRate: closed.length ? Math.round((wins.length / closed.length) * 1000) / 10 : null, // 百分数,如 66.7
    totalRealizedPnl,
    avgHoldDays: holdQty ? Math.round((holdSum / holdQty) * 10) / 10 : null,
    maxWin: pnls.length ? Math.max(...pnls) : null,
    maxLoss: pnls.length ? Math.min(...pnls) : null,
  };
}

// 平仓明细表(新单在前):补每笔持有天数
export function closedTradeRows(trades) {
  return trades
    .filter((t) => t.side === 'sell' && t.realizedPnl != null)
    .slice()
    .reverse()
    .map((t) => ({
      ...t,
      holdDays: holdingDays((t.tradeDate || t.time || '').slice(0, 10), t.closeLots?.lots),
    }));
}
