// 费用预览 — 前端镜像引擎规则(仅预览展示;成交以服务端计算为准)
// 佣金万2.5(最低5元)、印花税卖出千0.5、过户费万0.1(买卖双向),逐项四舍五入到分
export const FEE_CONFIG = {
  commissionRate: 0.00025,
  minCommission: 5,
  stampTaxRate: 0.0005, // 仅卖出
  transferFeeRate: 0.00001,
};

const roundCent = (x) => Math.round(x * 100) / 100;

// @param side 'buy'|'sell' @param amount 成交金额(元)
// @returns { commission, stampTax, transferFee, total }
export function calcFeesPreview(side, amount) {
  if (!(amount > 0)) return { commission: 0, stampTax: 0, transferFee: 0, total: 0 };
  const commission = roundCent(Math.max(amount * FEE_CONFIG.commissionRate, FEE_CONFIG.minCommission));
  const stampTax = side === 'sell' ? roundCent(amount * FEE_CONFIG.stampTaxRate) : 0;
  const transferFee = roundCent(amount * FEE_CONFIG.transferFeeRate);
  return { commission, stampTax, transferFee, total: roundCent(commission + stampTax + transferFee) };
}
