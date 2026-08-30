// 订单校验 — 纯函数。拒绝原因一律说人话(需求文档 §3.3)
import { boardOf, calcFees, fmtMoney, roundToCent } from './fees.js';

const REJECT = (reason) => ({ ok: false, reason });

// 买入申报数量规则(卖出允许任意股数,含零股)
function validateBuyQty(board, qty) {
  if (!Number.isInteger(qty) || qty <= 0) return '请输入有效的买入数量';
  if (board === 'star') {
    if (qty < 200) return '科创板买入数量至少 200 股,超出部分按 1 股递增';
    return null;
  }
  if (qty % 100 !== 0) return '买入数量必须是 100 股的整数倍';
  return null;
}

function validateSellQty(qty) {
  if (!Number.isInteger(qty) || qty <= 0) return '请输入有效的卖出数量';
  return null;
}

// 可卖数量:仅统计买入日期早于当前交易日的批次(T+1)
export function availableQty(position, tradeDate) {
  if (!position) return 0;
  return position.lots
    .filter((l) => l.date < tradeDate)
    .reduce((s, l) => s + l.qty, 0);
}

export function totalQty(position) {
  if (!position) return 0;
  return position.lots.reduce((s, l) => s + l.qty, 0);
}

// @param order  { symbol, side: 'buy'|'sell', price, qty, note? }
// @param quote  { last, limitUp, limitDown, name? }  盘后时 last=收盘价
// @param account { cash }
// @param positions { [symbol]: { lots: [{qty, date, cost}] } }
// @param tradeDate 'YYYY-MM-DD' 当前交易日
export function validateOrder({ order, quote, account, positions = {}, tradeDate }) {
  const board = boardOf(order.symbol);

  // 数量规则:买入按板块申报单位;卖出允许任意股数(含零股)
  const qtyError = order.side === 'buy' ? validateBuyQty(board, order.qty) : validateSellQty(order.qty);
  if (qtyError) return REJECT(qtyError);

  // 价格基础合法性
  if (!(order.price > 0)) return REJECT('请输入有效的委托价格');
  if (Math.abs(roundToCent(order.price) - order.price) > 1e-9) {
    return REJECT('委托价格精确到分(0.01 元),请调整');
  }

  // 卖出:先查持仓与 T+1(比价格区间更根本的错误先说)
  if (order.side === 'sell') {
    const position = positions[order.symbol];
    if (!position) return REJECT('没有持有该股票,无法卖出');

    const total = totalQty(position);
    const avail = availableQty(position, tradeDate);
    if (order.qty > total) {
      return REJECT(`卖出数量超过持有数量:当前持有 ${total} 股`);
    }
    if (avail === 0) {
      return REJECT(`今天买入的 ${total} 股明天才能卖(A股 T+1 规则)`);
    }
    if (order.qty > avail) {
      return REJECT(`卖出数量超过今日可用:持有 ${total} 股,今日可用 ${avail} 股(T+1 规则)`);
    }
  }

  // 涨跌停区间(优先用接口返回的边界)
  if (quote.limitUp != null && order.price > quote.limitUp) {
    return REJECT(`委托价 ${fmtMoney(order.price)} 超出今日涨停价 ${fmtMoney(quote.limitUp)},请调整价格`);
  }
  if (quote.limitDown != null && order.price < quote.limitDown) {
    return REJECT(`委托价 ${fmtMoney(order.price)} 超出今日跌停价 ${fmtMoney(quote.limitDown)},请调整价格`);
  }

  const amount = roundToCent(order.price * order.qty);

  if (order.side === 'buy') {
    const fees = calcFees('buy', amount);
    const need = roundToCent(amount + fees.total);
    if (need > account.cash) {
      return REJECT(`现金不足:需 ¥${fmtMoney(need)},可用 ¥${fmtMoney(account.cash)}`);
    }
    return { ok: true };
  }

  return { ok: true };
}
