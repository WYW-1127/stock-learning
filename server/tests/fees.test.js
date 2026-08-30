import { describe, it, expect } from 'vitest';
import { calcFees, roundToCent, fmtMoney, boardOf } from '../src/engine/fees.js';

describe('费用计算', () => {
  it('成交额 2 万时佣金恰好达到最低 5 元', () => {
    const fees = calcFees('buy', 20000);
    expect(fees.commission).toBe(5);
    expect(fees.transferFee).toBe(0.2);
    expect(fees.stampTax).toBe(0);
    expect(fees.total).toBe(5.2);
  });

  it('佣金不足 5 元按 5 元收', () => {
    const fees = calcFees('buy', 10000);
    expect(fees.commission).toBe(5);
    expect(fees.total).toBe(5.1);
  });

  it('大额佣金按费率收取', () => {
    const fees = calcFees('buy', 123456);
    expect(fees.commission).toBe(30.86); // 30.864 → 30.86
    expect(fees.transferFee).toBe(1.23); // 1.23456 → 1.23
    expect(fees.total).toBe(32.09);
  });

  it('卖出加收印花税 0.05%', () => {
    const fees = calcFees('sell', 10000);
    expect(fees.stampTax).toBe(5);
    expect(fees.total).toBe(10.1);
  });

  it('卖出费用四舍五入到分', () => {
    const fees = calcFees('sell', 123456);
    expect(fees.stampTax).toBe(61.73); // 61.728 → 61.73
    expect(fees.total).toBe(93.82);
  });

  it('买入不收印花税', () => {
    expect(calcFees('buy', 10000).stampTax).toBe(0);
  });
});

describe('金额工具', () => {
  it('roundToCent 四舍五入到分', () => {
    expect(roundToCent(1.005)).toBe(1.01);
    expect(roundToCent(1.004)).toBe(1);
    expect(roundToCent(2.675)).toBe(2.68);
  });

  it('fmtMoney 千分位两位小数', () => {
    expect(fmtMoney(10007.5)).toBe('10,007.50');
    expect(fmtMoney(9500)).toBe('9,500.00');
    expect(fmtMoney(0)).toBe('0.00');
  });
});

describe('板块识别', () => {
  it('按代码前缀识别板块', () => {
    expect(boardOf('sh600519')).toBe('main');
    expect(boardOf('sz000001')).toBe('main');
    expect(boardOf('sz300750')).toBe('gem');
    expect(boardOf('sh688981')).toBe('star');
    expect(boardOf('bj430047')).toBe('bjs');
  });
});
