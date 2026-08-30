// 撮合与持仓更新 — 纯函数(不可变更新,不碰IO)
// v1 撮合:即时成交。买:委托价≥最新价按最新价成交;卖:委托价≤最新价。盘后时"最新价"即收盘价。
import { calcFees, roundToCent } from './fees.js';

const REJECT = (reason) => ({ ok: false, reason });

// FIFO 从批次中扣减 qty,返回 { newLots, consumedCost }
// 剩余批次的 cost 同步按比例缩减,保持"该批剩余股数的含费总成本"语义
function consumeLots(lots, qty) {
  const newLots = [];
  let remaining = qty;
  let consumedCost = 0;
  // lots 已按买入时间先后排列(先进先出)
  for (const lot of lots) {
    if (remaining <= 0) {
      newLots.push(lot);
      continue;
    }
    const take = Math.min(lot.qty, remaining);
    consumedCost += (lot.cost / lot.qty) * take;
    remaining -= take;
    if (lot.qty - take > 0) {
      newLots.push({
        ...lot,
        qty: lot.qty - take,
        cost: roundToCent(lot.cost - (lot.cost / lot.qty) * take),
      });
    }
  }
  return { newLots, consumedCost: roundToCent(consumedCost) };
}

// @returns 成交:{ ok, trade, account, positions } 或拒绝 { ok:false, reason }
export function executeOrder({ order, quote, account, positions = {}, tradeDate, tradeContext = {} }) {
  // 即时撮合判断
  if (order.side === 'buy' && order.price < quote.last) {
    return REJECT(`当前价 ${quote.last} 高于你的委托价 ${order.price},未成交(暂不支持挂单等待)`);
  }
  if (order.side === 'sell' && order.price > quote.last) {
    return REJECT(`当前价 ${quote.last} 低于你的委托价 ${order.price},未成交(暂不支持挂单等待)`);
  }

  const price = quote.last;
  const amount = roundToCent(price * order.qty);
  const fees = calcFees(order.side, amount);

  let newAccount = { ...account };
  const newPositions = { ...positions };
  let trade = {
    ...tradeContext,
    symbol: order.symbol,
    name: quote.name || order.symbol,
    side: order.side,
    price,
    qty: order.qty,
    fees: { commission: fees.commission, stampTax: fees.stampTax, transferFee: fees.transferFee },
    amount,
    realizedPnl: null,
  };

  if (order.side === 'buy') {
    // 含费成本计入批次
    const lotCost = roundToCent(amount + fees.commission + fees.transferFee);
    const lot = { qty: order.qty, date: tradeDate, cost: lotCost };
    const pos = newPositions[order.symbol] || {
      symbol: order.symbol,
      name: quote.name || order.symbol,
      board: undefined,
      lots: [],
    };
    newPositions[order.symbol] = {
      ...pos,
      name: quote.name || pos.name,
      lots: [...pos.lots, lot],
    };
    newAccount.cash = roundToCent(account.cash - amount - fees.total);
  } else {
    // 卖出:FIFO 扣批次,实现盈亏 = 净得 − 对应批次含费成本
    const position = positions[order.symbol];
    const { newLots, consumedCost } = consumeLots(position.lots, order.qty);
    const netProceeds = roundToCent(amount - fees.total);
    trade.realizedPnl = roundToCent(netProceeds - consumedCost);
    trade.closeLots = { consumedCost };

    if (newLots.length === 0) delete newPositions[order.symbol];
    else newPositions[order.symbol] = { ...position, lots: newLots };

    newAccount.cash = roundToCent(account.cash + netProceeds);
  }

  return { ok: true, trade, account: newAccount, positions: newPositions };
}
