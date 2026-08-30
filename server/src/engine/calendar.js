// 交易日历 — 纯函数,基于真实日K日期数组(升序 'YYYY-MM-DD')
// 有K线的日期即交易日,节假日无需手工维护

// 该日期是否交易日
export function isTradingDay(dates, date) {
  return dates.includes(date);
}

// 给定日期(或之后最近交易日)之前最近的一个交易日;不存在返回 null
export function prevTradingDay(dates, date) {
  let prev = null;
  for (const d of dates) {
    if (d < date) prev = d;
    else break;
  }
  return prev;
}

// 给定日期之后最近的一个交易日;不存在返回 null
export function nextTradingDay(dates, date) {
  for (const d of dates) {
    if (d > date) return d;
  }
  return null;
}

// 当前应使用的交易日(由行情层决定 live/afterHours 后传入基准日期)
// - 盘中:今天(若今天是交易日)
// - 盘后:最近的上一交易日
export function resolveTradingDay(dates, date) {
  if (isTradingDay(dates, date)) return date;
  return prevTradingDay(dates, date);
}
