# Screen 2: 个股详情 (Stock Detail with K-Line)

Use the attached design system (DESIGN.md). This is the data-heaviest screen — density 7.

Top nav same as home; breadcrumb-ish header row inside content: "贵州茅台" (22px, 700) + chip "sh600519" + board chip "主板" + amber badge "盘中" (with pulsing dot). Right side of this header: two buttons — 买入 (Data Up Red fill) and 卖出 (Data Down Jade fill), both 44px.

Body: 60/40 grid split.

LEFT (60%): Large candlestick chart panel (~520px tall) on white surface: Chinese A-share red/green candles (red candle = close>open), volume bars beneath in matching tints, a 5/10/20-day MA legend line (MA5 ¥1,442.10 MA10 ¥1,430.55 MA20 ¥1,408.22, thin colored lines). Top-left of panel: segmented control 分时 | 日K (active) | 周K. Chart axis labels in 11px muted mono; last price tag on right axis "¥1,456.00" in a red pill.

RIGHT (40%) rail, stacked:
1. Quote block: giant mono price ¥1,456.00 (28px, red) + "+23.50 (+1.64%)" pill; then 4-column mini-grid: 今开 1,435.00 · 昨收 1,432.50 · 最高 1,461.60 · 最低 1,428.10. Every label has a dotted underline (term popover trigger affordance).
2. 五档盘口 panel: two stacked mini tables — 卖五→卖一 above (jade-tinted volume bars), 买一→买五 below (red-tinted bars), prices mono 13px, volume bars scale with quantity, header "五档盘口".
3. Metrics list, 2-column rows with border dividers: 成交量 2.84万手 · 换手率 0.23% · 市盈率 22.6 · 市净率 8.1 · 振幅 2.34% · 总市值 1.83万亿 — all values mono, labels dotted-underline.

Below both columns: a slim education strip: "💡" replaced by a small book icon + text "第一次看K线?阅读 3 分钟入门" + ghost button (links to 学习 page).
