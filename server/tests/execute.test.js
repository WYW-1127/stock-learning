import { describe, it, expect } from 'vitest';
import { executeOrder } from '../src/engine/execute.js';

const quote = { last: 10.5, limitUp: 11.0, limitDown: 10.0, name: '浦发银行' };
const account = { cash: 100000 };
const tradeDate = '2026-08-28';

describe('买入撮合', () => {
  it('委托价≥现价:按最新价成交,批次记含费成本,现金扣减', () => {
    const r = executeOrder({
      order: { symbol: 'sh600519', side: 'buy', price: 10.6, qty: 100 },
      quote, account, positions: {}, tradeDate,
    });
    expect(r.ok).toBe(true);
    expect(r.trade.price).toBe(10.5); // 按现价成交,不是委托价
    expect(r.trade.amount).toBe(1050);
    expect(r.trade.fees).toEqual({ commission: 5, stampTax: 0, transferFee: 0.01 });
    // 批次成本 = 1050 + 佣金5 + 过户费0.01
    expect(r.positions.sh600519.lots).toEqual([{ qty: 100, date: '2026-08-28', cost: 1055.01 }]);
    expect(r.account.cash).toBe(100000 - 1050 - 5.01);
  });

  it('委托价低于现价:拒绝并提示不支持挂单', () => {
    const r = executeOrder({
      order: { symbol: 'sh600519', side: 'buy', price: 10.4, qty: 100 },
      quote, account, positions: {}, tradeDate,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('当前价 10.5 高于你的委托价 10.4,未成交(暂不支持挂单等待)');
  });

  it('盘后模式同一逻辑:委托价≥收盘价即按收盘价成交', () => {
    // quote.last 由行情层在盘后时传入收盘价,引擎无需感知模式
    const r = executeOrder({
      order: { symbol: 'sh600519', side: 'buy', price: 10.5, qty: 100 },
      quote, account, positions: {}, tradeDate,
    });
    expect(r.trade.price).toBe(10.5);
  });

  it('两次买入累加批次,不合并(保留 T+1 批次边界)', () => {
    const first = executeOrder({
      order: { symbol: 'sh600519', side: 'buy', price: 10.5, qty: 100 },
      quote, account, positions: {}, tradeDate,
    });
    const second = executeOrder({
      order: { symbol: 'sh600519', side: 'buy', price: 10.5, qty: 100 },
      quote, account: first.account, positions: first.positions, tradeDate: '2026-08-31',
    });
    expect(second.positions.sh600519.lots.length).toBe(2);
    expect(second.positions.sh600519.lots[0].date).toBe('2026-08-28');
    expect(second.positions.sh600519.lots[1].date).toBe('2026-08-31');
  });
});

describe('卖出撮合(FIFO)', () => {
  // 两个批次:更早的 100 股成本 1005,较近的 50 股成本 530
  const positions = {
    sh600519: {
      symbol: 'sh600519',
      name: '浦发银行',
      lots: [
        { qty: 100, date: '2026-08-26', cost: 1005 },
        { qty: 50, date: '2026-08-27', cost: 530 },
      ],
    },
  };

  it('卖出 120 股:先扣最早批次,实现盈亏=净得−对应含费成本', () => {
    const r = executeOrder({
      order: { symbol: 'sh600519', side: 'sell', price: 10.5, qty: 120 },
      quote, account, positions, tradeDate,
    });
    expect(r.ok).toBe(true);
    // 费用:佣金 5(0.315<5)、印花税 0.63、过户费 0.01,合计 5.64
    expect(r.trade.fees).toEqual({ commission: 5, stampTax: 0.63, transferFee: 0.01 });
    // 净得 = 1260 − 5.64 = 1254.36;消耗成本 = 1005 + (530/50)*20 = 1217
    expect(r.trade.realizedPnl).toBe(37.36);
    // 剩余批次:最早批次清空,第二批次剩 30 股
    expect(r.positions.sh600519.lots).toEqual([{ qty: 30, date: '2026-08-27', cost: 530 }]);
    expect(r.account.cash).toBe(100000 + 1254.36);
  });

  it('全部卖出后持仓删除', () => {
    const r = executeOrder({
      order: { symbol: 'sh600519', side: 'sell', price: 10.5, qty: 150 },
      quote, account, positions, tradeDate,
    });
    expect(r.positions.sh600519).toBeUndefined();
  });

  it('委托价高于现价:拒绝并提示不支持挂单', () => {
    const r = executeOrder({
      order: { symbol: 'sh600519', side: 'sell', price: 10.6, qty: 100 },
      quote, account, positions, tradeDate,
    });
    expect(r.reason).toBe('当前价 10.5 低于你的委托价 10.6,未成交(暂不支持挂单等待)');
  });
});

describe('纯函数性', () => {
  it('执行后原账户/持仓对象不被修改', () => {
    const pos = { sh600519: { symbol: 'sh600519', lots: [{ qty: 100, date: '2026-08-26', cost: 1005 }] } };
    const acc = { cash: 100000 };
    executeOrder({ order: { symbol: 'sh600519', side: 'buy', price: 10.5, qty: 100 }, quote, account: acc, positions: pos, tradeDate });
    expect(acc.cash).toBe(100000);
    expect(pos.sh600519.lots.length).toBe(1);
  });
});
