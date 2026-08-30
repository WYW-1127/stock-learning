# Design System: 模拟炒股学习室 (A-Share Trading Simulator for Beginners)

> Paste this entire document into Stitch as the project's design context/theme before generating any screen. All screens must follow these rules.

## 1. Visual Theme & Atmosphere

A calm, trustworthy **financial learning terminal** — the density and information discipline of a professional trading desk (density 7/10), softened for a complete beginner (friendly microcopy, every metric clickable for explanation). Layout variance is moderate (4/10): functional asymmetry, data-dense tables with generous row breathing room. Motion is fluid and restrained (5/10): spring-physics transitions, animated number tickers, subtle live-data pulse — never flashy.

The atmosphere reads as: *a well-lit study room with a Bloomberg terminal in the corner*. Light theme. Simplified Chinese UI throughout; all prices in ¥ (CNY). Desktop-first (1440px reference), collapsing to single column below 768px.

**DOMAIN RULE (critical):** A-share convention — **red means UP, green means DOWN** (红涨绿跌). This is the opposite of Western apps. Every price change, every buy/sell action follows this. Buy/买入 = red family. Sell/卖出 = green family.

## 2. Color Palette & Roles

- **Paper Canvas** (#FAFAFA) — App background, Zinc-50 warmth
- **Pure Surface** (#FFFFFF) — Cards, panels, table headers
- **Charcoal Ink** (#18181B) — Primary text, Zinc-950, never pure black
- **Muted Steel** (#71717A) — Secondary text, labels, metadata, unchanged/flat prices
- **Whisper Border** (rgba(24,24,27,0.08)) — 1px card borders, table row dividers
- **Cinnabar Accent** (#C2402A) — THE single accent: primary buttons, active nav, focus rings, brand marks. Saturation ~63%, warm vermilion, never neon
- **Data Up Red** (#D64545) — Rising prices, gains, 买入 action. Text usage ≥ 4.5:1 on white
- **Data Down Jade** (#1E7A5A) — Falling prices, losses, 卖出 action
- **Amber Notice** (#B45309) — "盘后模式" (after-hours) badges, gentle warnings. Sparingly
- Banned: purple, neon glows, gradient buttons, pure black backgrounds, Western green-up/red-down convention

## 3. Typography Rules

- **Display/UI:** Satoshi + Noto Sans SC fallback — track-tight headings, hierarchy through weight (600/700) and color, not size inflation
- **Body:** Same stack — relaxed leading (1.6), body never below 14px
- **Numbers/Data:** JetBrains Mono, `font-variant-numeric: tabular-nums` — MANDATORY for every price, percentage, table figure. Prices render like `¥1,456.00`, changes like `+23.50 (+1.64%)`
- Price text sizes: quotes 22–28px mono; table cells 14px mono; fee breakdowns 13px mono
- Banned: Inter, generic serifs, decorative fonts anywhere in the data UI

## 4. Component Stylings

- **Buttons:** Flat fills, no outer glow. Primary = Cinnabar fill white text; 买入 = Data Up Red fill; 卖出 = Data Down Jade fill; secondary = 1px Whisper border ghost. Active state: 1px translate-down, shadow tightens. Disabled: 40% opacity, no color shift. Min height 44px
- **Data tables:** Row dividers (Whisper Border), NO card-per-row. Header row: 12px Muted Steel, letter-spaced. Numeric columns right-aligned mono. Row hover: #F4F4F5 wash
- **Cards:** Used only for zone hierarchy (index summary, stat cards) — 12px radius, Whisper border, shadow so faint it reads as separation, never elevation drama. High-density zones (order book, positions) use border dividers instead
- **五档盘口 (5-level order book):** Two stacked mini-tables (卖五→卖一 top, 买一→买五 bottom), volume bars as subtle background fills scaled to quantity — red-tinted bar behind ask prices' volume, jade-tinted behind bids
- **Inputs:** Label above (13px, Muted Steel), input 44px tall with mono numerals, focus ring 2px Cinnabar. Helper text below in 12px. Errors inline below the field in Data Up Red with a human-readable sentence
- **Term popovers (术语卡):** Dotted-underline trigger text; popover 320px, white surface, Whisper border, 8px radius, title + 2–3 sentence plain-language explanation + tiny example
- **Loaders:** Skeleton blocks matching final layout (shimmer via translateX), never circular spinners
- **Empty states:** Friendly composition — small line illustration + one sentence + one action button (e.g. 自选为空 → "搜索一只你感兴趣的股票")
- **Badges:** 盘后模式 = Amber Notice tint background 10%, 12px text; board badges (主板/创业板/科创板) = neutral Zinc outline chips

## 5. Layout Principles

- CSS Grid architecture; app shell: top nav (56px) + content area max-width 1400px centered, 24px gutters
- No overlapping elements; every zone owns clean space — modals sit on 40% Charcoal Ink scrim
- Index/summary strips: asymmetric — primary index card wider (2fr) than siblings (1fr 1fr), never 3 identical equal cards
- Stock detail: 60/40 split — K-line chart dominant left, quote + order book rail right; indicators grid below in 4-column flow
- Order panel: 420px right-side modal, not full-screen
- Below 768px: everything single column, chart 320px tall, tables become stacked key-value rows, no horizontal scroll, touch targets ≥ 44px

## 6. Motion & Interaction

- Spring physics: stiffness 100, damping 20 for all interactive transitions (modals slide up 16px + fade 200ms; popovers scale from 0.96)
- **Number tickers:** price changes crossfade + 2% vertical slide; flash the cell background tint (red/green at 8% alpha, 600ms fade)
- Staggered list reveals: 30ms cascade per row, max 8 rows
- Perpetual micro-loops: 6px live-dot pulse on "盘中" status; skeleton shimmer on loading zones; nothing else loops — restraint
- Animate only `transform` and `opacity`. No layout-property animation, no parallax, no custom cursors

## 7. Anti-Patterns (Banned)

- Western color convention (green-up/red-down) — this is a Chinese A-share app
- Emojis anywhere in the UI
- Inter font, generic serifs, pure black (#000000)
- Neon glows, purple, saturated gradient buttons
- 3 identical equal-width cards in a row; card-per-row tables
- Fake numbers (99.99%, ¥10,000.00 exactly) — use realistic A-share data: 贵州茅台 sh600519 ¥1,456.00, 平安银行 sz000001 ¥11.42, 上证指数 +0.83%
- Generic placeholder names (John Doe, Acme); AI clichés (赋能、无缝、极致)
- Filler UI text (scroll arrows, "下滑探索"); overlapping text/images
- Centered marketing hero — this is a tool, every screen starts with data
