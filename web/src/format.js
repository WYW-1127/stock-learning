// 展示格式化 — 金额/百分比/涨跌语义色(红涨绿跌)
const fmt2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '--');

export const fmtMoney = (x) => (Number.isFinite(x) ? `¥${fmt2(x)}` : '--');

// 带千分位:¥1,456.00
export const fmtMoneyK = (x) =>
  Number.isFinite(x)
    ? `¥${x.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '--';

export const fmtNum = (x, digits = 2) =>
  Number.isFinite(x) ? x.toLocaleString('zh-CN', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }) : '--';

export const fmtPct = (x) => (Number.isFinite(x) ? `${fmt2(x)}%` : '--');

// 涨跌显示:+23.50 (+1.64%)
export const fmtChange = (change, pct) =>
  Number.isFinite(change) && Number.isFinite(pct)
    ? `${change >= 0 ? '+' : ''}${fmt2(change)} (${change >= 0 ? '+' : ''}${fmt2(pct)}%)`
    : '--';

// 语义 class:涨红跌绿平灰
export const clsOf = (x) => {
  if (!Number.isFinite(x) || Math.abs(x) < 1e-9) return 'flat';
  return x > 0 ? 'up' : 'down';
};

// 大数汉化:成交量(手)/成交额(元)/市值(亿元)
export const fmtHand = (x) => {
  if (!Number.isFinite(x)) return '--';
  if (x >= 1e8) return `${fmt2(x / 1e8)}亿手`;
  if (x >= 1e4) return `${fmt2(x / 1e4)}万手`;
  return `${fmt2(x)}手`;
};
export const fmtYuan = (x) => {
  if (!Number.isFinite(x)) return '--';
  if (x >= 1e12) return `${fmt2(x / 1e12)}万亿`;
  if (x >= 1e8) return `${fmt2(x / 1e8)}亿`;
  if (x >= 1e4) return `${fmt2(x / 1e4)}万`;
  return fmt2(x);
};
export const fmtYi = (x) => {
  // 市值接口单位已是亿元
  if (!Number.isFinite(x)) return '--';
  if (x >= 1e4) return `${fmt2(x / 1e4)}万亿`;
  return `${fmt2(x)}亿`;
};

export const boardName = { main: '主板', gem: '创业板', star: '科创板', bjs: '北交所' };

export const fmtTime = (iso) => {
  if (!iso) return '--';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
