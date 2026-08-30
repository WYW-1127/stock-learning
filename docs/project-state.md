# 项目状态(project-state)

> **每次开发会话:开场先读我,收工必更新我。** 最后更新:2026-08-30

## 一句话现状

T4 行情服务完成(66/66 单测全绿 + 真机四接口冒烟通过);**下一步:T5 API 层组装(全部路由 + 下单串行队列)**。

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

## 下一步(按序)

1. **T5 API 层组装(当前任务)**— server/src/index.js 挂载全部路由(architecture.md §4);下单内存队列串行;账户/持仓/流水/复盘统计/重置/术语/课程;盘后模式判定(交易日历+时间);验收:curl 走通下单→持仓→卖出→复盘全流程,拒绝原因为人话
2. T6 前端五屏按设计稿实现(klinecharts 真实K线)
3. T7 联调收尾:启动.bat 打磨、手动清单回归

> 注意:本机 8090 端口有一个 T1 时期的旧服务实例仍在运行,验证新代码时需重启服务(或换 PORT)。

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
