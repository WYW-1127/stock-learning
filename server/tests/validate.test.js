import { describe, it, expect } from 'vitest';
import { validateOrder } from '../src/engine/validate.js';

const quote = { last: 10.5, limitUp: 11.0, limitDown: 10.0, name: '浦发银行' };
const account = { cash: 100000 };
const tradeDate = '2026-08-28';
const buy = (over = {}) => ({ symbol: 'sh600519', side: 'buy', price: 10.5, qty: 100, ...over });

describe('数量规则', () => {
  it('主板 150 股拒绝(须 100 整数倍)', () => {
    const r = validateOrder({ order: buy({ qty: 150 }), quote, account, tradeDate });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('买入数量必须是 100 股的整数倍');
  });

  it('创业板同样 100 整数倍', () => {
    const r = validateOrder({ order: buy({ symbol: 'sz300750', qty: 150 }), quote, account, tradeDate });
    expect(r.reason).toBe('买入数量必须是 100 股的整数倍');
  });

  it('科创板 199 股拒绝,200/201 股合法', () => {
    const r199 = validateOrder({ order: buy({ symbol: 'sh688981', qty: 199 }), quote, account, tradeDate });
    expect(r199.reason).toBe('科创板买入数量至少 200 股,超出部分按 1 股递增');
    expect(validateOrder({ order: buy({ symbol: 'sh688981', qty: 200 }), quote, account, tradeDate }).ok).toBe(true);
    expect(validateOrder({ order: buy({ symbol: 'sh688981', qty: 201 }), quote, account, tradeDate }).ok).toBe(true);
  });

  it('非正数量拒绝', () => {
    expect(validateOrder({ order: buy({ qty: 0 }), quote, account, tradeDate }).ok).toBe(false);
    expect(validateOrder({ order: buy({ qty: -100 }), quote, account, tradeDate }).ok).toBe(false);
  });
});

describe('价格规则', () => {
  it('价格三位小数拒绝', () => {
    const r = validateOrder({ order: buy({ price: 10.505 }), quote, account, tradeDate });
    expect(r.reason).toBe('委托价格精确到分(0.01 元),请调整');
  });

  it('超出涨停价拒绝', () => {
    const r = validateOrder({ order: buy({ price: 11.01 }), quote, account, tradeDate });
    expect(r.reason).toBe('委托价 11.01 超出今日涨停价 11.00,请调整价格');
  });

  it('低于跌停价拒绝', () => {
    const r = validateOrder({ order: buy({ price: 9.99 }), quote, account, tradeDate });
    expect(r.reason).toBe('委托价 9.99 超出今日跌停价 10.00,请调整价格');
  });

  it('涨跌停边界价可成交(含边界)', () => {
    expect(validateOrder({ order: buy({ price: 11.0 }), quote, account, tradeDate }).ok).toBe(true);
    expect(validateOrder({ order: buy({ price: 10.0 }), quote, account, tradeDate }).ok).toBe(true);
  });
});

describe('资金校验', () => {
  it('现金不足拒绝并给出人话提示', () => {
    const r = validateOrder({ order: buy({ price: 10.5, qty: 100 }), quote, account: { cash: 500 }, tradeDate });
    expect(r.reason).toBe('现金不足:需 ¥1,055.01,可用 ¥500.00');
  });

  it('资金恰好够时可买', () => {
    const r = validateOrder({ order: buy({ price: 10.5, qty: 100 }), quote, account: { cash: 1055.01 }, tradeDate });
    expect(r.ok).toBe(true);
  });
});

describe('T+1 与持仓校验', () => {
  const positions = {
    sh600519: {
      symbol: 'sh600519',
      lots: [
        { qty: 100, date: '2026-08-28', cost: 1055 }, // 今天买的
        { qty: 100, date: '2026-08-27', cost: 1048 }, // 昨天买的
      ],
    },
  };

  it('未持仓卖出拒绝', () => {
    const r = validateOrder({ order: { symbol: 'sz000001', side: 'sell', price: 11.5, qty: 100 }, quote, account, positions: {}, tradeDate });
    expect(r.reason).toBe('没有持有该股票,无法卖出');
  });

  it('只持有今日买入的股票,卖出被 T+1 拒绝', () => {
    const r = validateOrder({
      order: { symbol: 'sh600519', side: 'sell', price: 10.5, qty: 100 },
      quote, account,
      positions: { sh600519: { lots: [{ qty: 100, date: '2026-08-28', cost: 1055 }] } },
      tradeDate,
    });
    expect(r.reason).toBe('今天买入的 100 股明天才能卖(A股 T+1 规则)');
  });

  it('跨过周末/非交易日后的次日可卖(交易日历判定按日期字符串)', () => {
    // 2026-08-28(五)买入,下一交易日 08-31(一),08-31 时 08-28 批次已可用
    const r = validateOrder({
      order: { symbol: 'sh600519', side: 'sell', price: 10.5, qty: 100 },
      quote, account,
      positions: { sh600519: { lots: [{ qty: 100, date: '2026-08-28', cost: 1055 }] } },
      tradeDate: '2026-08-31',
    });
    expect(r.ok).toBe(true);
  });

  it('可用不足(部分 T+1)拒绝并说明', () => {
    const r = validateOrder({
      order: { symbol: 'sh600519', side: 'sell', price: 10.5, qty: 150 },
      quote, account, positions, tradeDate,
    });
    expect(r.reason).toBe('卖出数量超过今日可用:持有 200 股,今日可用 100 股(T+1 规则)');
  });

  it('卖出超过持有数量拒绝', () => {
    const r = validateOrder({
      order: { symbol: 'sh600519', side: 'sell', price: 10.5, qty: 300 },
      quote, account, positions, tradeDate,
    });
    expect(r.reason).toBe('卖出数量超过持有数量:当前持有 200 股');
  });

  it('卖昨日批次 100 股合法', () => {
    const r = validateOrder({
      order: { symbol: 'sh600519', side: 'sell', price: 10.5, qty: 100 },
      quote, account, positions, tradeDate,
    });
    expect(r.ok).toBe(true);
  });
});
