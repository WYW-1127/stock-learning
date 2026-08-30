// 复盘统计单测:FIFO 平仓批次、加权持有天数、汇总口径
import { describe, it, expect } from 'vitest';
import { closeLotDetails, holdingDays, summarize, closedTradeRows } from '../src/review.js';

describe('closeLotDetails(FIFO 平仓批次)', () => {
  const position = {
    lots: [
      { qty: 100, date: '2026-08-20', cost: 1005 },
      { qty: 50, date: '2026-08-25', cost: 530 },
    ],
  };

  it('卖 120 股:先吃光早批次 100,再取 20', () => {
    expect(closeLotDetails(position, 120)).toEqual([
      { date: '2026-08-20', qty: 100 },
      { date: '2026-08-25', qty: 20 },
    ]);
  });

  it('卖 50 股:只动最早批次', () => {
    expect(closeLotDetails(position, 50)).toEqual([{ date: '2026-08-20', qty: 50 }]);
  });

  it('无持仓返回空数组', () => {
    expect(closeLotDetails(undefined, 100)).toEqual([]);
  });
});

describe('holdingDays(加权持有天数)', () => {
  it('两批次按股数加权:100股持4天 + 20股持5天 = 4.2天', () => {
    const details = [
      { date: '2026-08-24', qty: 100 },
      { date: '2026-08-23', qty: 20 },
    ];
    expect(holdingDays('2026-08-28', details)).toBe(4.2); // (100×4 + 20×5) / 120
  });

  it('批次明细缺失返回 null', () => {
    expect(holdingDays('2026-08-28', [])).toBeNull();
  });
});

describe('summarize(汇总统计)', () => {
  it('无平仓:计数为 0,比率为 null', () => {
    const s = summarize([{ side: 'buy', realizedPnl: null }]);
    expect(s).toEqual({
      closedCount: 0, winCount: 0, winRate: null,
      totalRealizedPnl: 0, avgHoldDays: null, maxWin: null, maxLoss: null,
    });
  });

  it('两胜一负:胜率 66.7%,总盈亏/极值正确', () => {
    const trades = [
      { side: 'buy', realizedPnl: null },
      { side: 'sell', realizedPnl: 150.5 },
      { side: 'sell', realizedPnl: -80 },
      { side: 'sell', realizedPnl: 29.5 },
    ];
    const s = summarize(trades);
    expect(s.closedCount).toBe(3);
    expect(s.winCount).toBe(2);
    expect(s.winRate).toBe(66.7);
    expect(s.totalRealizedPnl).toBe(100);
    expect(s.maxWin).toBe(150.5);
    expect(s.maxLoss).toBe(-80);
  });

  it('平均持有天数按股数加权', () => {
    const trades = [{
      side: 'sell', qty: 120, realizedPnl: 10, tradeDate: '2026-08-28',
      closeLots: { lots: [{ date: '2026-08-24', qty: 100 }, { date: '2026-08-23', qty: 20 }] },
    }];
    expect(summarize(trades).avgHoldDays).toBe(4.2);
  });

  it('老数据无批次明细时跳过该笔天数,不 NaN', () => {
    const trades = [
      { side: 'sell', qty: 100, realizedPnl: 10, tradeDate: '2026-08-28', closeLots: {} },
      { side: 'sell', qty: 100, realizedPnl: 5, tradeDate: '2026-08-28', closeLots: { lots: [{ date: '2026-08-27', qty: 100 }] } },
    ];
    expect(summarize(trades).avgHoldDays).toBe(1);
  });
});

describe('closedTradeRows(平仓明细表)', () => {
  it('新单在前并附 holdDays', () => {
    const trades = [
      { id: 't1', side: 'buy', realizedPnl: null },
      { id: 't2', side: 'sell', realizedPnl: 10, qty: 100, tradeDate: '2026-08-28', closeLots: { lots: [{ date: '2026-08-27', qty: 100 }] } },
      { id: 't3', side: 'sell', realizedPnl: -5, qty: 100, tradeDate: '2026-08-28', closeLots: { lots: [{ date: '2026-08-28', qty: 100 }] } },
    ];
    const rows = closedTradeRows(trades);
    expect(rows.map((r) => r.id)).toEqual(['t3', 't2']);
    expect(rows[0].holdDays).toBe(0);
    expect(rows[1].holdDays).toBe(1);
  });
});
