# 实施计划(implementation-plan)

> 按 architecture.md 拆解的开发任务。执行顺序即编号顺序;每完成一项勾掉并更新 project-state.md。
> 每项任务的"验收"是硬门槛:不过不算完成。

## T1 项目骨架

**范围**:根 package.json 脚本、server/(Express 启动 + /api/meta/status + 托管 web/dist)、web/(Vite+Vue3+Router+Pinia+设计令牌样式+三 tab 布局壳+四页桩)、content/(terms.json 25 条 + 6 篇课程)、启动.bat

**验收**:npm 安装成功;`npm run build` 产出 web/dist;`npm start` 后 http://localhost:8090 返回页面且 /api/meta/status 返回 JSON

## T2 交易引擎 + 单元测试

**范围**:server/src/engine/{fees,validate,execute,calendar}.js,纯函数无 IO;vitest 覆盖 architecture.md §9 全部用例(最低佣金边界、四舍五入、涨跌停边界、ST±5%、科创板 200/201/199 股、主板 150 股、T+1 当日不可卖/跨周末、FIFO 多批次盈亏、资金不足、清仓)

**验收**:`npm test` 全绿;边界用例逐条对照测试文件名可核对

## T3 本地存储

**范围**:server/src/store.js — account/positions/trades/watchlist/snapshots 读写;临时文件+rename 原子写;写前 .bak;启动损坏恢复;reset

**验收**:store 单测(原子写、损坏恢复、重置)全绿

## T4 行情服务

**范围**:server/src/market.js — 腾讯实时/五档/涨跌停(GBK 解码)、东财 K线(日/周/分时,前复权)、搜索(仅沪深A股+板块标记)、缓存(TTL)、超时重试退避;mock fetch 单测(GBK 解析、字段映射、缓存命中、重试)

**验收**:mock 测试全绿;真机 curl 三大接口返回正确字段

## T5 API 层组装

**范围**:server/src/index.js 挂载全部路由(architecture.md §4);下单内存队列串行;账户/持仓/流水/复盘统计/重置/术语/课程

**验收**:curl 走通下单→持仓→卖出→复盘统计全流程;拒绝原因为人话文案

## T6 前端五屏实现

**范围**:按 design/stitch/*.jpg 实现——行情页(指数卡/自选/搜索)、个股页(klinecharts 真实K线/五档/指标术语卡)、下单面板(费用预览/校验回显/成交回执)、持仓页(摘要+曲线/持仓/历史/重置)、复盘学习页(统计/平仓表/课程/术语/引导);5 秒轮询+页面隐藏暂停;盘后模式角标;新手引导组件

**验收**:对照 5 张设计稿逐屏目检;手动清单(architecture.md §9 UI 部分)通过

## T7 联调与收尾

**范围**:启动.bat 全流程打磨(装依赖→构建→起服务→开浏览器);断网降级;README 快速开始定稿;全量测试+全量手动清单回归

**验收**:双击 启动.bat 在干净环境(clone 后)一次跑通

## 里程碑对应

- M1(可看):T1 — 页面壳能打开
- M2(可信):T2+T3 — 引擎算得对、数据存得住
- M3(可玩):T4+T5 — 真实行情+能买卖
- M4(好用):T6+T7 — 按设计稿交付
