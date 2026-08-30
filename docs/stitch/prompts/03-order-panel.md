# Screen 3: 下单面板 (Order Panel modal)

Use the attached design system (DESIGN.md). Show the stock detail page dimmed under a 40% charcoal scrim, with a 420px order panel modal on the RIGHT side, sliding over.

Modal header: "买入 贵州茅台" (Data Up Red accent) + chip sh600519 + close ×; below it a context row: "当前价 ¥1,456.00 · 可用资金 ¥82,410.55" (mono, muted).

Panel body, vertical flow:
1. Segmented tabs: 买入 (active, red) | 卖出 (jade) — full width, 44px.
2. Price input, label above "买入价格 (元)": value 1,456.00 mono, with a helper line "涨停价 ¥1,601.60 · 跌停价 ¥1,310.40" (12px muted).
3. Quantity input, label "买入数量 (股)": value 100, helper "1手 = 100股 · 必须为100的整数倍".
4. Quick buttons row: 1手 · 5手 · 半仓 · 全仓 (ghost chips, 36px).
5. Fee preview box (surface #FAFAFA, 8px radius, border divider): title "费用预估" then mono rows with dotted leaders: 成交金额 ¥145,600.00 / 佣金 ¥36.40 / 过户费 ¥1.46 / 合计扣款 ¥145,637.86 — and a bold total row. Under it a one-line note "佣金万2.5,最低¥5;过户费万0.1" (12px muted).
6. Primary submit button full width 48px, red fill: "确认买入". Below: reassurance text "模拟盘 · 不涉及真实资金" (12px muted, centered).

Show ONE inline validation example at the bottom of the panel, styled as a soft warning row (amber tint): "现金不足:合计需 ¥145,637.86,可用 ¥82,410.55。试试更少的数量。" — human, friendly sentence.
