# 项目状态(project-state)

> **每次开发会话:开场先读我,收工必更新我。** 最后更新:2026-08-30

## 一句话现状

**AI Investment Agent 全部完成并真机验收通过**(glm-5.3-flash,七场景 S1–S7 全过:意图识别/实体解析/工具调用/数字防编造/盘后语义/不代客交易)。项目 v1 + AI 功能交付。

## 已完成

- [x] 需求澄清与设计文档(brainstorming 全流程,用户已确认)
- [x] 技术方案:Node 全栈(方案一),真实行情,完整交易规则,随时可交易
- [x] Stitch 设计稿:5 屏已拉取审阅(`design/stitch/`),4 处已知偏差实现时修正(见 requirements.md §6)
- [x] Stitch MCP 接入:代理补丁 + 包装脚本(仓库外 `~/.zcode/stitch-proxy/`),doctor 体检通过
- [x] 文档体系:README / AGENTS / requirements / architecture / 本文件 / implementation-plan
- [x] GitHub 仓库:`WYW-1127/stock-learning`(私有),main 分支已推送
- [x] **T1 项目骨架**:Express 服务(8090,静态托管+SPA回退+status接口)、Vue3 壳(设计令牌/三tab布局/4页桩)、内容(25条术语+6篇课程)、启动.bat;安装/构建/启动验收通过
- [x] **T2 交易引擎 + 单元测试**:engine/{fees,validate,execute,calendar}.js 纯函数;vitest 38 用例全绿(费用最低佣金边界/四舍五入、板块手数、涨跌停边界、T+1 批次、FIFO 盈亏、资金校验、日历跨周末)。实现中发现并修正两处规则认知:①卖出允许任意股数(零股),整数倍限制仅约束买入;②卖出校验先查持仓再查价格边界(错误信息更友好)
- [x] **T3 本地存储**:server/src/store.js — 五文件(account/positions/trades/watchlist/snapshots)读写;临时文件+rename 原子写(Windows EPERM 重试兜底);写前 .bak;init() 损坏自动从 .bak 恢复/回退默认并返回 notice;reset(保留自选);DATA_DIR 环境变量可覆盖目录;index.js 启动时 init 并 ASCII 输出恢复提示;vitest 13 用例全绿。实现决策:.bak 存"上一次写入前"内容(只能回退一步);流水 addTrade 追加、getTrades(limit) 最新在前;自选默认 ["sh600519","sz000001"]
- [x] **T4 行情服务**:server/src/market.js — 腾讯实时报价(GBK 解码、五档、涨跌停、批量 60 自动分批、3s TTL 按只缓存)、腾讯 ifzq K线(日/周前复权、日K当日缓存、指数无 qfqday 回退 day 键)、腾讯 minute 分时(差分分钟量、均价线)、腾讯 smartbox 搜索(只留沪深A股 GP-A、\uXXXX 名称解码、board 与引擎同源);fetch 可注入工厂便于 mock;vitest 15 用例全绿。**重大数据源变更**:原计划东财 K线/搜索,实测 push2his 本机直连不可达(代理开关均如此)、suggest 对 Node fetch 的 TLS 指纹返回无股票数据的 JSONP 分支(curl 正常),全部切腾讯,详见 architecture.md §1 决策记录与 §8 环境备忘
- [x] **T5 API 层组装**:content.js(术语/课程读取,含课程列表与 id 白名单防穿越)、review.js(平仓批次 FIFO/加权持有天数/统计,纯函数+10 单测)、service.js(盘后判定+交易日解析、下单内存串行队列、账户视图含可用量/成本价/浮盈、当日资产快照)、index.js 挂全部 §4 路由+SPA 回退;**验收 14/14 全过**(临时 DATA_DIR 预置批次,买入→T+1 人话拒绝→卖出 FIFO 盈亏→账户→流水→复盘→重置→内容;脚本留 server/scripts/t5-verify.mjs 可复跑)。**引擎修正**:consumeLots 部分平仓后剩余批次 cost 按比例缩减(原整批成本导致浮盈虚高),全量回归通过
- [x] **T6 前端五屏**:api/format/fees 工具 + 三 Pinia store(行情 5s 轮询 visibilitychange 暂停/账户/内容)+ 组件(TermPopover 术语卡、SearchBox 联想、GuidedTour 6 步导览 localStorage、KLineChart klinecharts、OrderPanel 下单抽屉含费用预览/人话拒绝/成交回执)+ 五屏(行情指数主次卡/自选/搜索;个股 60/40 布局+分时日K周K+五档量条+指标术语卡;持仓摘要+SVG资产曲线+T+1角标+历史+重置二次确认;复盘统计+平仓表+课程阅读进度+术语辞典搜索)+ App 壳(现金接store/盘后角标/引导按钮);服务端补 watchlist CRUD 路由。**浏览器实测**:五页渲染无错、K线蜡烛/MA/成交量正常红涨绿跌、买入平安银行 100 股全链路通(回执/现金/持仓/角标)。**两个坑**:①klinecharts v10 移除 applyNewData/setPriceVolumePrecision,须用 setDataLoader+setSymbol/setPeriod 重写;②T+1 可用量前端曾按自然日算,与后端交易日口径在周末盘后不一致(页面显示可卖、下单被拒),已统一为交易日口径(决策记录已修正)
- [x] **T7 联调收尾**:服务端 EADDRINUSE 友好提示(端口被占给人话指引,实测生效);README 更新为正式快速开始+常见问题;**手动清单浏览器回归全过**——复盘统计与手算一致(预置买卖用例:胜率100%/+984.29/持有2天)、持仓页数字勾稽(总盈亏=已实现+浮动)、重置双确认(错填拦截/输"重置"通过/自选保留)、新手引导 6 步走通、术语卡弹出(换手率)、盘后角标(T6 已验);76/76 单测全绿。**未真实验证项**:断网横幅(代码路径在:quotesError→degraded banner,上游故障自动触发,待自然发生观察);周一盘中 live 模式与 T+1 解锁

## 下一步(按序)

1. (无硬性待办)可选项:内容型 RAG(术语/课程知识库接入 Agent)、周一盘中自然观察项继续有效、未来版本方向见 architecture.md §10

> AI 功能文件:server/src/ai/*.{indicators,llm,tools,prompts,schemas,context,agent}.js + web/src/components/AiChat.vue + 3 条 /api/ai/* 路由;spec:docs/superpowers/specs/2026-09-02-ai-investment-agent-design.md;验收脚本:node server/scripts/ai-verify.mjs
> 用户配置:`~/.stock-learning/ai.json`(已配 glm-5.3-flash,按量付费已充值;Coding Plan 额度官方限制仅编程工具可用,不适用本应用)

> T5 验收脚本:`node server/scripts/t5-verify.mjs`(需先以 `DATA_DIR` 指向预置目录起 8092 实例,脚本内有说明注释)。
> 当前 8090 实例运行中(默认 data/,含一笔测试买入);用户日常通过 启动.bat 启动。

## 待用户事项

- 无

## 关键信息速查

| 项 | 值 |
|---|---|
| GitHub | WYW-1127/stock-learning(私有) |
| Stitch 项目 ID | 13228539535838239483 |
| 屏幕对照 | design/stitch/index.json |
| 系统代理 | 127.0.0.1:7897(仅 Google/Stitch 流量) |
| Stitch CLI | `bash C:/Users/wangy/.zcode/stitch-proxy/stitch.sh <命令>` |
| Node | v22.14.0(fetch 代理补丁见 architecture.md §8) |

## 已知问题 / 风险

- ~~免费行情接口可能变动~~ T4 已实际撞上并切换:东财 push2his 本机不可达、suggest 按 TLS 指纹歧视 Node fetch;已全切腾讯(见 architecture.md §1/§8)。腾讯接口若未来变动,按"重试×2 + 降级显示旧数据"友好降级
- Node 22 无内置 fetch 代理:任何访问 Google 域名的脚本都要带补丁环境变量(见 AGENTS.md)
- ~~启动.bat 中文乱码~~ 已修复:文件需 GBK 编码 + CRLF(转换命令见 AGENTS.md 红线);Node 控制台输出改用 ASCII
- 搜索宽泛词(如"银行")会被腾讯 smartbox 的 ETF 结果占满(按相关度排序),输具体名称/代码正常;属上游排序行为,暂不处理

## 决策记录追加处

重大新决策追加到 `docs/architecture.md` §1 决策记录表,此处只写一行指针。

---

### 更新日志

- 2026-08-30:建立文档体系;完成设计/审稿/接入/GitHub 上传;下一步写实施计划
- 2026-08-30:完成实施计划(T1-T7)+ T1 项目骨架;下一步 T2 交易引擎+单测
- 2026-08-30:完成 T2 交易引擎(38 测试全绿);用户指示暂停,待确认后进入 T3
- 2026-08-30:修复启动.bat 中文乱码(转 GBK+CRLF,已实测启动正常);待用户确认后进入 T3
- 2026-08-30:完成 T3 本地存储(51 测试全绿,冒烟启动通过);下一步 T4 行情服务
- 2026-08-30:完成 T4 行情服务(66 测试全绿+真机冒烟);东财 K线/搜索实测不可用,全切腾讯(决策见 architecture.md);下一步 T5 API 层
- 2026-08-30:完成 T5 API 层(76 测试全绿+14 项流程验收);验收发现并修正引擎 FIFO 剩余批次成本语义;下一步 T6 前端
- 2026-08-30:完成 T6 前端五屏(浏览器实测+买入链路走通);修复 klinecharts v10 API 适配与 T+1 可用量口径;下一步 T7 联调收尾
- 2026-08-30:完成 T7(手动清单浏览器回归全过/README/端口占用提示);**T1-T7 全部完成,v1 交付**;待周一盘中自然观察 live/T+1解锁/断网横幅
- 2026-08-30:用户反馈课程太浅且未渲染 markdown → 课程页接入 marked(排版:小节红边标题/表格/琥珀提示块)+ 六篇课程全部重写(5.7KB→25.9KB,每篇 2000 字级:概念→演算→误区→本工具实操);浏览器验证渲染与测试全绿
- 2026-08-30:用户指认表格数字列未对齐 → 根因:三个页面表格样式只给 th 设了右对齐、td 漏设(默认左对齐),表头与数据错开;统一给 td 默认右对齐(.tl/.tc 覆盖),并补全课程代码块 pre 样式(ASCII 示意图等宽对齐+横向滚动);浏览器截图验证两处修复
- 2026-08-31:用户指认历史成交表仍不对齐 → 像素级测量(evaluate 读 rect/textAlign)定位真因:Portfolio/Review 的左对齐覆盖只写了 th.tl、漏了 td.tl,上次"td 默认右对齐"把时间/股票/备注列数据拉到右侧而表头仍在左;补 td.tl/td.tc 覆盖后复测 8 列对齐全 match。教训:**改默认样式时必须核对所有覆盖规则的完整性;对齐问题用 getComputedStyle 实测,别只靠目测截图**
- 2026-09-02:AI Agent 真机验收完成(glm-5.3-flash 充值后):**S1–S7 七场景全过**——意图/实体/工具链路正确(S4 比亚迪名称解析→6工具→数据全真)、S2/S7 正确处理盘后卖出语义、S3 单工具节制、S6 批量快照、多轮上下文延续("和之前结论一致")、每条附"下单请自行操作"(不代客交易)、facts 数字与页面一致(防编造)。S7 反问分支未触发系当前仅 1 只持仓(单只无需反问,行为合理)。过程中发现并处理:①Windows curl 发中文 GBK 乱码→验收脚本改 Node fetch;②免费 4.7-flash 高峰 429 限流→llm.js 退避重试(5s/15s),用户改充值 5.3-flash;③Coding Plan 额度官方限定编程工具,不能用于本应用
