// 技术指标单测 — 用可手算的小序列验证公式正确性与数据不足边界
import { describe, it, expect } from 'vitest';
import { calcIndicators, riskSnapshotFields } from '../src/ai/indicators.js';

// 造数:等差上涨 closes 10,11,12,...(open=close-0.5, high=close+1, low=close-1, volume=1000+10i)
function genBars(n, start = 10) {
  return Array.from({ length: n }, (_, i) => {
    const c = start + i;
    return { date: `2026-01-${String(i + 1).padStart(2, '0')}`, open: c - 0.5, close: c, high: c + 1, low: c - 1, volume: 1000 + i * 10 };
  });
}

describe('calcIndicators 基础', () => {
  it('空数组返回 null', () => {
    expect(calcIndicators([])).toBeNull();
  });

  it('涨跌幅:末根对前根', () => {
    const ind = calcIndicators(genBars(5, 10)); // 末根 close=14, 前根 13
    expect(ind.changePct).toBe(7.69); // (14-13)/13 = 7.6923… → 7.69
    expect(ind.last).toBe(14);
  });

  it('MA5 = 最后5根收盘均值(其余不足为 null)', () => {
    const ind = calcIndicators(genBars(5, 10)); // 10..14
    expect(ind.ma.ma5).toBe(12);
    expect(ind.ma.ma10).toBeNull();
    expect(ind.ma.ma20).toBeNull();
    expect(ind.ma.ma60).toBeNull();
  });

  it('量比 = 末根量 / 前5根均量', () => {
    // 6 根:量 1000,1010,1020,1030,1040,1050 → 前5均 1020,末 1050
    const ind = calcIndicators(genBars(6, 10));
    expect(ind.volume.volRatio5).toBe(1.03); // 1050/1020 = 1.0294 → 1.03
    expect(ind.volume.lastVol).toBe(1050);
  });

  it('20日区间位置:连续上涨 → 接近 1(close 对比含 high 的区间)', () => {
    const ind = calcIndicators(genBars(30, 10));
    expect(ind.range20.position).toBeGreaterThan(0.9); // (39-19)/(40-19)=0.95
    expect(ind.range20.high).toBe(40); // 末根 high = close+1
    expect(ind.range20.low).toBeCloseTo(19, 0);
  });

  it('连续上涨 RSI = 100(全涨边界)', () => {
    const ind = calcIndicators(genBars(30, 10));
    expect(ind.rsi).toBe(100);
  });

  it('连续下跌 RSI = 0(全跌边界)', () => {
    const bars = genBars(30, 50).map((b) => ({ ...b, close: -b.close + 100, open: -b.open + 100, high: -b.high + 100, low: -b.low + 100 }));
    const ind = calcIndicators(bars);
    expect(ind.rsi).toBe(0);
  });

  it('MACD 加速上涨:dif>dea,hist>0(多头排列);等差序列 dif≈dea 属退化情形', () => {
    // 平方序列(增速递增)让 dif 明确大于 dea
    const bars = Array.from({ length: 40 }, (_, i) => {
      const c = 100 + (i + 1) ** 2 / 10;
      return { date: `d${i}`, open: c, close: c, high: c, low: c, volume: 1000 };
    });
    const ind = calcIndicators(bars);
    expect(ind.macd.dif).not.toBeNull();
    expect(ind.macd.dif).toBeGreaterThan(ind.macd.dea);
    expect(ind.macd.hist).toBeGreaterThan(0);
    // 等差序列:EMA 线性映射,dif 与 dea 收敛相等
    const lin = calcIndicators(genBars(40, 10));
    expect(lin.macd.hist).toBeGreaterThanOrEqual(0);
  });

  it('波动率:恒定涨幅序列有确定值且非负', () => {
    const ind = calcIndicators(genBars(40, 10)); // 每日 +1/前收,收益率递减
    expect(ind.volatility20).toBeGreaterThan(0);
  });

  it('近5日涨跌幅序列长度与值', () => {
    const ind = calcIndicators(genBars(10, 10));
    expect(ind.changePctSeries5).toHaveLength(5);
    expect(ind.changePctSeries5[4]).toBe(ind.changePct);
  });
});

describe('数据不足容错', () => {
  it('少于15根:rsi 为 null,不抛错', () => {
    const ind = calcIndicators(genBars(10, 10));
    expect(ind.rsi).toBeNull();
    expect(ind.ma.ma5).not.toBeNull();
  });

  it('少于21根:volatility20 为 null', () => {
    const ind = calcIndicators(genBars(20, 10));
    expect(ind.volatility20).toBeNull();
  });

  it('少于6根:量比为 null', () => {
    const ind = calcIndicators(genBars(5, 10));
    expect(ind.volume.volRatio5).toBeNull();
  });

  it('2 根即可计算 range20 与涨跌幅', () => {
    const ind = calcIndicators(genBars(2, 10));
    expect(ind.changePct).toBe(10);
    expect(ind.range20).not.toBeNull();
  });
});

describe('riskSnapshotFields(批量快照精简字段)', () => {
  it('正常提取子集', () => {
    const ind = calcIndicators(genBars(40, 10));
    const f = riskSnapshotFields(ind);
    expect(Object.keys(f).sort()).toEqual(['macdHist', 'range20Position', 'rsi', 'volRatio5', 'volatility20']);
    expect(f.rsi).toBe(100);
    expect(f.range20Position).toBeGreaterThan(0.9);
  });

  it('null 输入全 null', () => {
    expect(riskSnapshotFields(null)).toEqual({
      rsi: null, macdHist: null, volRatio5: null, volatility20: null, range20Position: null,
    });
  });
});
