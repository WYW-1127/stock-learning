# 模拟盘 · 股票学习

给股票零基础用户的 A 股模拟炒股学习网页:**真实行情**、**完整 A 股交易规则**、零本金风险,配套术语知识卡、交易复盘与新手引导教程。

> 状态:✅ v1 功能完成(行情/交易/持仓/复盘学习五屏可用)——进度与遗留事项见 [docs/project-state.md](docs/project-state.md)

## 功能一览

- **行情首页**:三大指数、自选股 5 秒实时刷新、代码/名称搜索(回车直达)
- **个股详情**:分时/日K/周K(klinecharts)、五档盘口、全部指标可点出术语卡
- **模拟交易**:完整 A 股规则(T+1、涨跌停、佣金/印花税/过户费、按手申报),下单前费用实时预览,拒绝原因说人话
- **持仓资产**:含费成本、浮动盈亏、资产曲线、历史成交、一键重置
- **复盘学习**:胜率统计、交易理由回看、6 篇新手课程、27 条术语词典、分步新手引导

## 快速开始

1. 安装 [Node.js](https://nodejs.org/)(≥ 20,LTS 即可)
2. 双击 `启动.bat` —— 首次运行自动安装依赖并构建页面(需几分钟),之后秒开
3. 浏览器自动打开 http://localhost:8090 ,关闭黑窗口即退出

**常见问题**

- 提示 `Port 8090 is already in use`:说明已有一个实例在跑,关掉旧的启动窗口再双击即可
- 行情区显示橙色横幅"行情获取失败":免费行情接口偶发波动,页面会自动重试并保留旧数据
- 盘后/周末使用:界面有"盘后模式"角标,买卖按最近收盘价撮合;周末买入的股票要到下一交易日才能卖(T+1)

## 服务器部署(Docker)

打包成 Docker 镜像部署到云服务器,公网访问 + 口令保护(Basic Auth)+ 数据卷持久化:

```bash
cp .env.example .env   # 填网页口令与 AI 密钥
docker compose up -d --build
```

完整步骤、镜像离线搬运、HTTPS 建议与故障排查见 **[docs/deploy.md](docs/deploy.md)**。

## AI 教练(可选)

内置自然语言 AI 投资助手:右下角「AI 教练」直接用大白话提问("我买的平安银行现在能卖吗?"),它会自主查询你的持仓、实时行情和技术指标再给出分析参考。两步启用:

1. 到 [bigmodel.cn](https://bigmodel.cn) 注册并创建 API Key(有免费额度)
2. 创建文件 `C:\Users\<你>\.stock-learning\ai.json`(路径以页面提示为准):
   ```json
   { "apiKey": "你的Key", "model": "glm-5.3-flash" }
   ```
   保存后重启服务。默认 `glm-5.3-flash`(GLM-5 系,能力强、价格约为旗舰 1/10);想换只改 model 字段:免费用 `glm-4.7-flash`,最强用 `glm-5.3`。

Key 只存在本机,不进项目仓库。AI 只做分析参考、不能替你下单;输出仅供学习,不构成投资建议。

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
数据源:腾讯行情(实时报价/五档、K线、分时、搜索)
开发命令:`npm test`(123 项单测)/ `npm run dev:server` + `npm run dev:web`(热更新)

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
