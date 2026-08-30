// 交易引擎统一入口:校验 → 撮合。纯函数组合,无IO。
import { validateOrder } from './validate.js';
import { executeOrder } from './execute.js';

// @param inputs { order, quote, account, positions, tradeDate, tradeContext? }
// @returns { ok:true, trade, account, positions } | { ok:false, reason }
export function processOrder(inputs) {
  const check = validateOrder(inputs);
  if (!check.ok) return check;
  return executeOrder(inputs);
}

export { boardOf, calcFees, fmtMoney, roundToCent, DEFAULT_FEE_CONFIG } from './fees.js';
export { validateOrder, availableQty, totalQty } from './validate.js';
export { executeOrder } from './execute.js';
export { isTradingDay, prevTradingDay, nextTradingDay, resolveTradingDay } from './calendar.js';
