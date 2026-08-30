# Screen 1: 行情首页 (Market Home)

Use the attached design system (DESIGN.md) — light theme, 红涨绿跌, mono numerals.

Top nav (56px): left wordmark "模拟盘 · 股票学习" with a small cinnabar candlestick logo mark; center nav items: 行情 (active, cinnabar), 持仓, 复盘与学习 (three tabs only — stock detail is a drill-in page, order panel is a modal, neither is a tab); right: a quiet "新手引导" ghost button and virtual cash chip "可用资金 ¥82,410.55" (mono).

Below nav, a horizontal strip of 3 index cards, asymmetric widths (2fr 1fr 1fr): 上证指数 3,042.35 +25.10 (+0.83%) red, 深证成指 9,182.76 −41.32 (−0.45%) jade, 创业板指 1,758.59 +8.42 (+0.48%) red. Each card: index name (14px), large mono value, change line in Data Up Red / Data Down Jade.

Main area, two zones stacked:
1. Search bar, centered-left, 560px wide, 48px tall, placeholder "输入股票代码或名称,如 600519 或 贵州茅台", with a search icon. Below it a hint row of example chips: 贵州茅台 / 宁德时代 / 平安银行.
2. 自选股 table titled "我的自选 (4)" with columns 股票名称/代码 · 现价 · 涨跌幅 · 涨跌额 · 操作(删除). Rows in realistic data:
   - 贵州茅台 sh600519 · ¥1,456.00 · +1.64% · +23.50 (red)
   - 宁德时代 sz300750 · ¥188.42 · −0.86% · −1.63 (jade)
   - 平安银行 sz000001 · ¥11.42 · +0.35% · +0.04 (red)
   - 中芯国际 sh688981 · ¥46.18 · −2.12% · −1.00 (jade)
   Numeric columns right-aligned mono; 涨跌幅 cells get a subtle tinted pill background. Clicking a row conceptually opens the stock detail (add a subtle chevron).

Footer strip: status dot pulsing + "盘中 · 数据每5秒刷新" (12px muted). Bottom-right floating hint: a friendly empty-state style toast "第一次用?点右上角「新手引导」" with a soft shadow.
