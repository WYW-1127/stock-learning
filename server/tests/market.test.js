// 行情服务 mock 测试:GBK 解析、字段映射、缓存命中、超时重试、分批、搜索过滤
// fetch 全部 mock,不发起真实网络请求;样本取自 2026-08-28 真机 curl 结果
import { describe, it, expect } from 'vitest';
import iconv from 'iconv-lite';
import { createMarket, INDEX_SYMBOLS } from '../src/market.js';

// ---- mock 工具 ----
function gbkRes(text) {
  const bytes = iconv.encode(text, 'gbk');
  return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}
function utf8Res(obj) {
  return { ok: true, arrayBuffer: async () => Buffer.from(JSON.stringify(obj)) };
}
function rawRes(text) {
  return { ok: true, arrayBuffer: async () => Buffer.from(text) };
}
function mockFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [match, handler] of routes) {
      if (url.includes(match)) return handler(url);
    }
    throw new Error('unexpected url: ' + url);
  };
  fn.calls = calls;
  return fn;
}
// 任意 ≥50 字段的报价 payload(以茅台真实值填充)
const MOUTAI = '1~贵州茅台~600519~1297.40~1292.30~1289.00~16126~8576~7550~1297.35~5~1297.20~1~1297.10~3~1297.01~3~1297.00~11~1297.40~9~1297.50~11~1297.55~2~1297.68~1~1297.70~1~~20260828161500~5.10~0.39~1297.89~1288.00~1297.40/16126/2086008422~16126~208601~0.13~19.92~~1297.89~1288.00~0.77~16218.56~16218.56~6.46~1421.53~1163.07~0.54~-1~x~x';
const qtRoutes = (payloadOf) => [[
  'qt.gtimg.cn',
  (url) => {
    // 腾讯接口的 q= 位于路径(无 ?),按路径提取: /q=sh600519,sz000001
    const syms = decodeURIComponent(new URL(url).pathname).replace(/^\//, '').slice(2).split(',');
    return gbkRes(syms.map((s) => `v_${s}="${payloadOf(s)}"`).join(''));
  },
]];
// 可注入的时钟
function makeClock(start = 1000000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
  };
}

describe('实时报价(腾讯,GBK)', () => {
  it('GBK 正确解码,字段映射到现价/涨跌停/五档等', async () => {
    const fetchImpl = mockFetch(qtRoutes(() => MOUTAI));
    const market = createMarket({ fetchImpl, retryDelays: [1, 1] });
    const q = (await market.getQuotes(['sh600519'])).sh600519;
    expect(q.name).toBe('贵州茅台');
    expect(q.last).toBe(1297.4);
    expect(q.prevClose).toBe(1292.3);
    expect(q.open).toBe(1289);
    expect(q.change).toBe(5.1);
    expect(q.changePct).toBe(0.39);
    expect(q.high).toBe(1297.89);
    expect(q.low).toBe(1288);
    expect(q.volume).toBe(16126); // 手
    expect(q.amount).toBe(208601 * 10000); // 万元 → 元
    expect(q.turnoverRate).toBe(0.13);
    expect(q.pe).toBe(19.92);
    expect(q.pb).toBe(6.46);
    expect(q.amplitude).toBe(0.77);
    expect(q.floatMv).toBe(16218.56);
    expect(q.totalMv).toBe(16218.56);
    expect(q.time).toBe('2026-08-28 16:15:00');
    expect(q.limitUp).toBe(1421.53); // 1292.30 × 1.1
    expect(q.limitDown).toBe(1163.07); // × 0.9
    expect(q.bid[0]).toEqual({ price: 1297.35, qty: 5 });
    expect(q.bid[4]).toEqual({ price: 1297, qty: 11 });
    expect(q.ask[0]).toEqual({ price: 1297.4, qty: 9 });
    expect(q.ask[4]).toEqual({ price: 1297.7, qty: 1 });
  });

  it('指数无涨跌停(-1/0)归一为 null', async () => {
    const idxPayload = [
      '1', '上证指数', '000001', '3952.18', '3956.57', '3950.24', '510581645', '0', '0',
      ...Array(20).fill('0'), '',
      '20260828161402', '-4.39', '-0.11', '3970.31', '3947.80', 'x',
      '510581645', '97036515', '1.05', '17.52', '', '3970.31', '3947.80', '0.57',
      '618483.97', '701350.87', '0.00', '-1', '-1', 'x', 'x', 'x',
    ].join('~');
    const fetchImpl = mockFetch(qtRoutes(() => idxPayload));
    const market = createMarket({ fetchImpl, retryDelays: [1, 1] });
    const q = (await market.getQuotes(['sh000001'])).sh000001;
    expect(q.name).toBe('上证指数');
    expect(q.last).toBe(3952.18);
    expect(q.changePct).toBe(-0.11);
    expect(q.limitUp).toBeNull();
    expect(q.limitDown).toBeNull();
  });

  it('TTL 内复用缓存不重复请求,过期后重新拉取', async () => {
    const clock = makeClock();
    const fetchImpl = mockFetch(qtRoutes(() => MOUTAI));
    const market = createMarket({ fetchImpl, now: clock.now, retryDelays: [1, 1] });
    await market.getQuotes(['sh600519']);
    await market.getQuotes(['sh600519']);
    expect(fetchImpl.calls.length).toBe(1); // TTL 内命中
    clock.advance(3001);
    await market.getQuotes(['sh600519']);
    expect(fetchImpl.calls.length).toBe(2); // 过期重拉
  });

  it('超过 60 只自动分批请求', async () => {
    const symbols = Array.from({ length: 65 }, (_, i) => `sz${String(i).padStart(6, '0')}`);
    const fetchImpl = mockFetch(qtRoutes(() => MOUTAI));
    const market = createMarket({ fetchImpl, retryDelays: [1, 1] });
    const result = await market.getQuotes(symbols);
    expect(fetchImpl.calls.length).toBe(2);
    const first = decodeURIComponent(new URL(fetchImpl.calls[0]).pathname).slice(3).split(',').length;
    const second = decodeURIComponent(new URL(fetchImpl.calls[1]).pathname).slice(3).split(',').length;
    expect([first, second]).toEqual([60, 5]);
    expect(Object.keys(result).length).toBe(65);
  });

  it('上游失败自动重试:前两次失败第三次成功', async () => {
    let attempts = 0;
    const fetchImpl = async () => {
      attempts++;
      if (attempts <= 2) throw new Error('boom');
      return gbkRes(`v_sh600519="${MOUTAI}"`);
    };
    const market = createMarket({ fetchImpl, retryDelays: [1, 1] });
    const q = (await market.getQuotes(['sh600519'])).sh600519;
    expect(attempts).toBe(3);
    expect(q.last).toBe(1297.4);
  });

  it('重试次数用尽仍失败:向上抛错(由路由层降级)', async () => {
    const fetchImpl = async () => { throw new Error('down'); };
    const market = createMarket({ fetchImpl, retryDelays: [1, 1] });
    await expect(market.getQuotes(['sh600519'])).rejects.toThrow('down');
  });
});

describe('三大指数', () => {
  it('按固定顺序返回上证/深成/创业板', async () => {
    const idx = (name, last) => ['1', name, 'x', String(last), '1', '1', '0', '0', '0', ...Array(20).fill('0'), '', '20260828150000', '1', '1', '1', '1', 'x', ...Array(40).fill('x')].join('~');
    const fetchImpl = mockFetch(qtRoutes((s) => idx(INDEX_SYMBOLS.indexOf(s), 100)));
    const market = createMarket({ fetchImpl, retryDelays: [1, 1] });
    const list = await market.getIndices();
    expect(list.map((q) => q.symbol)).toEqual(INDEX_SYMBOLS);
  });
});

describe('K线(腾讯 ifzq,前复权)', () => {
  const bars2 = [
    ['2026-08-26', '1300.000', '1302.800', '1314.450', '1295.000', '21731.000'],
    ['2026-08-27', '1304.000', '1292.300', '1305.000', '1288.000', '24767.000'],
  ];
  it('字段映射为 { date, open, close, high, low, volume }', async () => {
    const fetchImpl = mockFetch([['fqkline', () => utf8Res({ code: 0, data: { sh600519: { qfqday: bars2 } } })]]);
    const market = createMarket({ fetchImpl, retryDelays: [1, 1] });
    const bars = await market.getKline('sh600519', 'day', 120);
    expect(bars[0]).toEqual({ date: '2026-08-26', open: 1300, close: 1302.8, high: 1314.45, low: 1295, volume: 21731 });
    expect(bars).toHaveLength(2);
  });

  it('指数无复权键时回退 day/week 键', async () => {
    const fetchImpl = mockFetch([['fqkline', () => utf8Res({ code: 0, data: { sh000001: { day: bars2 } } })]]);
    const market = createMarket({ fetchImpl, retryDelays: [1, 1] });
    const dates = await market.getTradingDates();
    expect(dates).toEqual(['2026-08-26', '2026-08-27']);
  });

  it('日K当日缓存:同日不重复请求,跨零点重新拉取', async () => {
    const clock = makeClock(Date.UTC(2026, 7, 28, 6, 0, 0)); // 北京时间 2026-08-28 14:00
    const fetchImpl = mockFetch([['fqkline', () => utf8Res({ code: 0, data: { sh600519: { qfqday: bars2 } } })]]);
    const market = createMarket({ fetchImpl, now: clock.now, retryDelays: [1, 1] });
    await market.getKline('sh600519', 'day', 120);
    await market.getKline('sh600519', 'day', 120);
    expect(fetchImpl.calls.length).toBe(1);
    clock.advance(12 * 3600 * 1000); // 次日 02:00(北京 8-29)
    await market.getKline('sh600519', 'day', 120);
    expect(fetchImpl.calls.length).toBe(2);
  });
});

describe('分时(腾讯 minute)', () => {
  it('累计量差分为分钟量,均价=累计额/累计量/100,昨收取自 qt', async () => {
    const rows = ['0930 1289.00 81 10440900.00', '0931 1293.46 434 55993745.00'];
    const fetchImpl = mockFetch([[
      'minute/query',
      () => utf8Res({ code: 0, data: { sh600519: { data: { date: '20260828', data: rows }, qt: { sh600519: ['1', '贵州茅台', '600519', '1297.40', '1292.30'] } } } }),
    ]]);
    const market = createMarket({ fetchImpl, retryDelays: [1, 1] });
    const tl = await market.getMinuteTimeline('sh600519');
    expect(tl.date).toBe('20260828');
    expect(tl.prevClose).toBe(1292.3);
    expect(tl.points[0]).toEqual({ time: '09:30', price: 1289, volume: 81, avgPrice: 1289 }); // 10440900/8100
    expect(tl.points[1].volume).toBe(353); // 434 − 81
    expect(tl.points[1].avgPrice).toBe(1290.18); // 55993745/43400
  });

  it('TTL 内复用缓存', async () => {
    const clock = makeClock();
    const fetchImpl = mockFetch([['minute/query', () => utf8Res({ code: 0, data: { sh600519: { data: { data: [] } } } })]]);
    const market = createMarket({ fetchImpl, now: clock.now, retryDelays: [1, 1] });
    await market.getMinuteTimeline('sh600519');
    await market.getMinuteTimeline('sh600519');
    expect(fetchImpl.calls.length).toBe(1);
    clock.advance(5001);
    await market.getMinuteTimeline('sh600519');
    expect(fetchImpl.calls.length).toBe(2);
  });
});

describe('搜索(腾讯 smartbox)', () => {
  // 格式:市场~代码~名称(字面 \uXXXX 转义)~拼音~类型,^ 分隔;A股=GP-A
  const HINT_ROWS = [
    'sh~600519~\\u8d35\\u5dde\\u8305\\u53f0~gzmt~GP-A',
    'sz~000001~\\u5e73\\u5b89\\u94f6\\u884c~payh~GP-A',
    'hk~00700~\\u817e\\u8baf\\u63a7\\u80a1~txkg~GP', // 港股:市场不符,剔除
    'sh~510300~300ETF~300etf~ETF', // 基金,剔除
    'jj~700001~\\u67d0\\u57fa\\u91d1~mjj~KJ', // 场外基金,剔除
    'sz~399628~700\\u6210\\u957f~700cz~ZS', // 指数,剔除
  ];
  const smartboxRoutes = (hint) => [[
    'smartbox.gtimg.cn',
    (url) => gbkRes(`v_hint="${hint}"`),
  ]];

  it('只保留沪深A股(GP-A),board 与交易引擎同源', async () => {
    const fetchImpl = mockFetch(smartboxRoutes(HINT_ROWS.join('^')));
    const market = createMarket({ fetchImpl, retryDelays: [1, 1] });
    const list = await market.search('任意词');
    expect(list).toEqual([
      { symbol: 'sh600519', code: '600519', name: '贵州茅台', board: 'main' },
      { symbol: 'sz000001', code: '000001', name: '平安银行', board: 'main' },
    ]);
  });

  it('创业板/科创板 board 标记正确', async () => {
    const rows = ['sz~300750~宁德时代~ndsd~GP-A', 'sh~688981~中芯国际~zxgj~GP-A'];
    const fetchImpl = mockFetch(smartboxRoutes(rows.join('^')));
    const market = createMarket({ fetchImpl, retryDelays: [1, 1] });
    const list = await market.search('芯');
    expect(list.map((it) => [it.symbol, it.board])).toEqual([
      ['sz300750', 'gem'],
      ['sh688981', 'star'],
    ]);
  });

  it('无结果(空 v_hint)返回空数组', async () => {
    const fetchImpl = mockFetch(smartboxRoutes(''));
    const market = createMarket({ fetchImpl, retryDelays: [1, 1] });
    expect(await market.search('不存在的东西xyz')).toEqual([]);
  });
});

describe('基本面(新浪 vFD 财务指标)', () => {
  // 页面结构取自 2026-09-09 真机:报告日期行为 plain <td>,指标名在 <a> 内,值为 plain <td>
  const fundPage = (dates, cells) => {
    const head = `<tr><td width='200px'><strong>报告日期</strong></td>${dates.map((d) => `<td>${d}</td>`).join('')}</tr>`;
    const rows = Object.entries(cells)
      .map(([label, vals]) => `<tr><td width='200px' style='padding-left:30px;'><a target='_blank' href='/corp/view/vFD_FinancialGuideLineHistory.php?stockid=000001&typecode=x'>${label}</a></td>${vals.map((v) => `<td>${v}</td>`).join('')}</tr>`)
      .join('');
    return `<html><body><table>${head}${rows}</table></body></html>`;
  };
  const sinaRoutes = (pagesByYear) => [[
    'vFD_FinancialGuideLine',
    (url) => gbkRes(pagesByYear[Number(url.match(/ctrl\/(\d{4})/)[1])] ?? '<html><body>空页面无表格</body></html>'),
  ]];
  const PAGES = {
    2026: fundPage(['2026-06-30', '2026-03-31'], {
      '摊薄每股收益(元)': ['1.3241', '0.7484'],
      '每股净资产_调整前(元)': ['28.2498', '28.037'],
      '主营业务成本率(%)': ['--', '--'], // 银行股无成本率 → 毛利率 null
      '销售净利率(%)': ['35.12', '36.01'],
      '净资产收益率(%)': ['4.85', '2.61'],
      '主营业务收入增长率(%)': ['-6.03', '-3.51'],
      '净利润增长率(%)': ['-8.65', '-4.20'],
      '资产负债率(%)': ['95.5', '95.4'],
    }),
    2025: fundPage(['2025-12-31'], {
      '摊薄每股收益(元)': ['2.60'],
      '主营业务成本率(%)': ['8.8204'],
      '净资产收益率(%)': ['9.51'],
      '主营业务收入增长率(%)': ['-3.61'],
    }),
    2024: fundPage(['2024-12-31'], {
      '摊薄每股收益(元)': ['2.47'],
      '净资产收益率(%)': ['9.85'],
      '主营业务收入增长率(%)': ['-3.61'],
    }),
  };
  const clock2026 = () => makeClock(Date.UTC(2026, 8, 9, 2, 0, 0)); // 北京时间 2026-09-09 10:00

  it('解析字段并选最新季报+最近两个年报;缺失/-- 为 null;URL 去掉 sh/sz 前缀', async () => {
    const fetchImpl = mockFetch(sinaRoutes(PAGES));
    const market = createMarket({ fetchImpl, now: clock2026().now, retryDelays: [1, 1] });
    const f = await market.getFundamentals('sz000001');
    expect(f.symbol).toBe('sz000001');
    expect(f.periods.map((p) => `${p.date}:${p.type}`)).toEqual(['2026-06-30:中报', '2025-12-31:年报', '2024-12-31:年报']);
    const [interim, y2025, y2024] = f.periods;
    expect(interim.eps).toBe(1.32); // round2
    expect(interim.grossMargin).toBeNull(); // 成本率 '--' → 毛利率 null
    expect(interim.revenueGrowth).toBe(-6.03);
    expect(interim.debtRatio).toBe(95.5);
    expect(interim.bvps).toBe(28.25);
    expect(y2025.eps).toBe(2.6);
    expect(y2025.grossMargin).toBe(91.18); // 100 − 8.8204 成本率反推
    expect(y2024.roe).toBe(9.85);
    expect(y2024.grossMargin).toBeNull(); // 页面无该指标行 → null
    expect(fetchImpl.calls.every((u) => u.includes('stockid/000001/'))).toBe(true);
    expect(fetchImpl.calls).toHaveLength(3); // 3 个年度页各一次
  });

  it('24h 缓存:期内不重抓,过期后重新拉取', async () => {
    const clock = clock2026();
    const fetchImpl = mockFetch(sinaRoutes(PAGES));
    const market = createMarket({ fetchImpl, now: clock.now, retryDelays: [1, 1] });
    await market.getFundamentals('sz000001');
    await market.getFundamentals('sz000001');
    expect(fetchImpl.calls).toHaveLength(3);
    clock.advance(24 * 3600 * 1000 + 1);
    await market.getFundamentals('sz000001');
    expect(fetchImpl.calls).toHaveLength(6);
  });

  it('某年页面无数据(如次新股)跳过,其余年份照常返回', async () => {
    const fetchImpl = mockFetch(sinaRoutes({ ...PAGES, 2024: null })); // null → 命中默认空页
    const market = createMarket({ fetchImpl, now: clock2026().now, retryDelays: [1, 1] });
    const f = await market.getFundamentals('sz000001');
    expect(f.periods.map((p) => `${p.date}:${p.type}`)).toEqual(['2026-06-30:中报', '2025-12-31:年报']);
  });

  it('三年页面均无报告期 → 抛错(由工具层转 error)', async () => {
    const fetchImpl = mockFetch(sinaRoutes({}));
    const market = createMarket({ fetchImpl, now: clock2026().now, retryDelays: [1, 1] });
    await expect(market.getFundamentals('sz000001')).rejects.toThrow('报告期');
  });
});
