// 费用计算 — 纯函数
// 规则:佣金万2.5(最低5元,双向)、印花税0.05%(仅卖出)、过户费万0.1(双向)
// 所有金额逐项四舍五入到分

export const DEFAULT_FEE_CONFIG = {
  commissionRate: 0.00025,
  commissionMin: 5,
  stampTaxRate: 0.0005,
  transferFeeRate: 0.00001,
};

export function roundToCent(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

// ¥1,007.50 格式(千分位 + 两位小数)
export function fmtMoney(n) {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// @param side 'buy' | 'sell'
// @param amount 成交额 = price * qty
export function calcFees(side, amount, config = DEFAULT_FEE_CONFIG) {
  const commission = Math.max(roundToCent(amount * config.commissionRate), config.commissionMin);
  const transferFee = roundToCent(amount * config.transferFeeRate);
  const stampTax = side === 'sell' ? roundToCent(amount * config.stampTaxRate) : 0;
  return {
    commission,
    stampTax,
    transferFee,
    total: roundToCent(commission + stampTax + transferFee),
  };
}

// 板块识别:main(沪深主板)/ gem(创业板)/ star(科创板)/ bjs(北交所,不支持交易)
export function boardOf(symbol) {
  const code = String(symbol).replace(/^(sh|sz|bj)/i, '');
  if (/^(43|83|87|92)/.test(code)) return 'bjs';
  if (code.startsWith('688')) return 'star';
  if (code.startsWith('30')) return 'gem';
  return 'main';
}
