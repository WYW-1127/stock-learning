# Screen 4: 持仓与资产 (Portfolio & Assets)

Use the attached design system (DESIGN.md).

Top nav with 持仓 active (cinnabar underline).

Zone 1 — 账户总览 strip (4 stat cards, asymmetric 2fr 1fr 1fr 1fr): 总资产 ¥96,412.30 (28px mono, with sub-line "+11.2% vs 初始10万" in red) · 可用现金 ¥82,410.55 · 持仓市值 ¥14,001.75 · 总盈亏 +¥312.44 (red). The primary card embeds a small sparkline area chart of the asset curve (subtle cinnabar fill, 8% alpha).

Zone 2 — 当前持仓 (2) table: columns 股票 · 持仓/可用 · 成本价 · 现价 · 市值 · 浮动盈亏 · 操作:
- 贵州茅台 sh600519 · 100/0股 · ¥1,450.76 · ¥1,456.00 · ¥145,600.00... (adjust realistic: use 10股? No — keep 100 shares but scale: 成本 ¥145.08, 现价 ¥146.20, 市值 ¥14,620.00, +¥112.00 (+0.77%) red, 操作: 买入/卖出 ghost buttons. Fix 持仓市值 in Zone 1 to ¥14,620.00 and 总资产 ¥97,030.55 to stay consistent.)
- 平安银行 sz000001 · 100/100股 · ¥11.38 · ¥11.42 · ¥1,142.00 · +¥4.00 (+0.35%) red · 操作 buttons
Note the 贵州茅台 row shows 可用 0/100 with a tiny amber chip "T+1 今日买入不可卖" — teaches the rule visually. Numbers mono right-aligned; row dividers, no cards.

Zone 3 — 历史成交 table (last 5 rows): 时间 · 股票 · 方向(买入 red text/卖出 jade text pill) · 价格 · 数量 · 费用 · 金额 · 备注. One row has note "先小仓位练手" in muted italic.

Zone 4 — footer actions row: left "每日收盘后自动记录资产快照" (12px muted); right a subtle danger ghost button "重置账户" (whisper border, red text) + helper "将清空所有数据恢复到 ¥100,000" (11px muted).
