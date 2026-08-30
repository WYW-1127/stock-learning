# Stitch 设计稿生成指南

本目录存放用 Google Stitch 生成 UI 设计稿所需的全部材料。
设计文档见 `../superpowers/specs/2026-08-30-stock-trading-simulator-design.md`。

## 文件说明

| 文件 | 用途 |
|---|---|
| `DESIGN.md` | 设计系统(全局)。粘贴到 Stitch 作为项目设计上下文,所有屏幕共用 |
| `prompts/01-market-home.md` | 行情首页提示词 |
| `prompts/02-stock-detail.md` | 个股详情页提示词 |
| `prompts/03-order-panel.md` | 下单面板提示词 |
| `prompts/04-portfolio.md` | 持仓与资产页提示词 |
| `prompts/05-review-learn.md` | 复盘与学习页提示词 |

## 操作步骤

1. 打开 https://stitch.withgoogle.com ,用 Google 账号登录
2. 新建一个 Project(建议命名"模拟炒股学习室")
3. **第一条消息**:把 `DESIGN.md` 全文粘贴进去发送(作为设计基调)
4. 逐条粘贴 `prompts/01` 到 `prompts/05` 的内容,每次生成一个屏幕;不满意的屏幕可以追加修改(如"把图表再高一点")
5. 五个屏幕都满意后:
   - 头像 → **Stitch settings** → 生成 **API key**,发给 Claude/ZCode 用于配置 MCP
   - 把项目里每个屏幕的**分享链接或屏幕编号**发给 Claude/ZCode

## 之后发生什么

MCP 配好后会自动拉取设计稿截图和代码,开发时以设计稿为视觉基准实现 Vue 组件(设计稿的代码框架不直接采用,按规格文档的架构来)。

## 设计约定速记

- 红涨绿跌(A股惯例),买入=红、卖出=绿
- 所有数字等宽字体(tabular-nums)
- 浅色主题,主色朱红 #C2402A,禁止紫色/霓虹
- 中文界面,每个指标可点出术语卡
