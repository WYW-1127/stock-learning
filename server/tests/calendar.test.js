import { describe, it, expect } from 'vitest';
import { isTradingDay, prevTradingDay, nextTradingDay, resolveTradingDay } from '../src/engine/calendar.js';

// 2026-08-26(三)~ 09-01(二),周末 08-29/08-30 无K线
const dates = ['2026-08-26', '2026-08-27', '2026-08-28', '2026-08-31', '2026-09-01'];

describe('交易日历(由真实日K反推)', () => {
  it('有K线=交易日,无K线=非交易日', () => {
    expect(isTradingDay(dates, '2026-08-28')).toBe(true);
    expect(isTradingDay(dates, '2026-08-29')).toBe(false); // 周六
  });

  it('prevTradingDay 跨周末回退', () => {
    expect(prevTradingDay(dates, '2026-08-31')).toBe('2026-08-28');
  });

  it('nextTradingDay 跨周末前进', () => {
    expect(nextTradingDay(dates, '2026-08-28')).toBe('2026-08-31');
  });

  it('末尾之后无下一交易日返回 null', () => {
    expect(nextTradingDay(dates, '2026-09-01')).toBeNull();
  });

  it('resolveTradingDay:非交易日回退到上一交易日,交易日原样返回', () => {
    expect(resolveTradingDay(dates, '2026-08-29')).toBe('2026-08-28'); // 周六盘后
    expect(resolveTradingDay(dates, '2026-08-28')).toBe('2026-08-28');
  });
});
