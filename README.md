# 模拟盘 · 股票学习

给股票零基础用户的 A 股模拟炒股学习网页:**真实行情**、**完整 A 股交易规则**、零本金风险,配套术语知识卡、交易复盘与新手引导教程。

> 状态:🚧 开发中(设计与文档阶段完成,实施进行中——进度见 [docs/project-state.md](docs/project-state.md))

## 功能一览(规划)

- **行情首页**:三大指数、自选股实时刷新、代码/名称搜索
- **个股详情**:分时/日K/周K、五档盘口、全部指标可点出术语卡
- **模拟交易**:完整 A 股规则(T+1、涨跌停、佣金/印花税/过户费、按手申报),下单前费用实时预览,拒绝原因说人话
- **持仓资产**:含费成本、浮动盈亏、资产曲线、历史成交
- **复盘学习**:胜率统计、交易理由回看、6 篇新手课程、25+ 术语词典、分步新手引导

## 快速开始

开发完成后:双击 `启动.bat` → 浏览器打开 http://localhost:8090

(当前为开发阶段,启动脚本随骨架搭建一同提供)

## 文档导航

| 文档 | 用途 |
|---|---|
| [docs/requirements.md](docs/requirements.md) | 需求与功能规格(维护中) |
| [docs/architecture.md](docs/architecture.md) | 技术架构、数据模型、环境备忘(维护中) |
| [docs/project-state.md](docs/project-state.md) | **项目进度与交接状态(每次开发必读必更)** |
| [AGENTS.md](AGENTS.md) | AI 协作约定(代理会话自动加载) |
| [docs/superpowers/specs/](docs/superpowers/specs/) | 头脑风暴原始设计稿(历史存档) |
| [docs/stitch/](docs/stitch/) | Stitch 设计系统与页面生成提示词 |

## 技术栈

Node.js (Express) · Vue 3 (Vite, Pinia) · klinecharts · 本地 JSON 存储
数据源:腾讯行情(实时/五档)· 东方财富(K线/搜索)

## 目录结构

```
股票学习/
├── server/          # 后端:行情服务、交易引擎(纯函数+单测)、存储
├── web/             # 前端:五个页面(Vue 3)
├── content/         # 术语表、教程文章
├── data/            # 运行时账户数据(git 忽略)
├── design/stitch/   # UI 设计稿基准(5 屏)
└── docs/            # 文档体系
```

## 设计基准

界面遵循 [docs/stitch/DESIGN.md](docs/stitch/DESIGN.md):红涨绿跌(A股惯例)、浅色主题、朱红主色(#C2402A)、等宽数字、中文界面。
