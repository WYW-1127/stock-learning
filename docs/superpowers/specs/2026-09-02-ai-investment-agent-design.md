# 自然语言 AI Investment Agent 设计文档

> 日期:2026-09-02(v2,吸收外部评审:实体解析显式化/批量快照工具/大盘上下文/去 score 化)
> 状态:待用户审阅
> 前提:**不重写网站、不更换技术栈、不破坏现有功能**;在现有模拟盘上增量接入。
> 需求原始文档:`C:\Users\wangy\Desktop\数据库ppt\为现有股票模拟盘增加「自然语言 AI Investment Agent」.md`;评审意见:`agent需求.md`(仓库根目录)

## 1. 目标与定位

把现有股票学习网站升级为:**用户用自然语言提问,Agent 自主理解意图、解析股票、调用系统工具获取真实数据(账户/持仓/行情/K线/技术指标/大盘),先查事实再做判断,输出结构化分析建议的 AI Investment Agent**。

核心不是"AI 会聊天",而是"**AI 能自己决定需要什么信息,并调用工具解决**"。

定位约束(用户已确认):
- **教练式风格**:说人话、结合用户真实持仓、引导思考,不做"保证赚"式断言。
- **只分析不交易**:第一版 Agent 不执行任何买卖。
- 学习工具属性:所有输出带免责意识。
- **事实层与推理层分离**(防幻觉):Agent 引用的价格/成本/盈亏/指标必须来自工具返回,`facts` 字段承载;禁止 LLM 凭记忆报数。

## 2. 用户体验场景(验收基准)

| # | 用户输入 | Agent 应做的 |
|---|---|---|
| S1 | 分析一下平安银行 | 名称→代码→行情+K线+指标→综合分析 |
| S2 | 我买了平安银行,现在能卖吗? | 查持仓批次/成本/T+1 可用+现价+趋势→卖出建议 |
| S3 | 我买的平安银行现在赚了多少? | 查持仓成本+现价→盈亏问答 |
| S4 | 我现在适合买入比亚迪吗? | 名称→代码+行情+指标+现金→买入参考判断 |
| S5 | 我已经有500股比亚迪,还能加仓吗? | 持仓+成本+浮盈+现金+行情→加仓分析 |
| S6 | 我现在持有的股票哪些风险比较大? | 查全部持仓→**批量风险快照**(单次工具)→逐只指标比较→排序输出 |
| S7 | 我手里的股票要不要卖? | 查账户发现多只持仓→**反问哪只**(不猜) |

通用要求:多轮上下文连续(`分析一下平安银行`→`那我之前买的价格是多少`→`现在卖掉怎么样`,不需要重复说股票名)。

## 3. 总体架构

```
web/src/components/AiChat.vue(全局浮动入口 + 聊天抽屉)
   │ POST /api/ai/chat {message} / DELETE /api/ai/chat / GET /api/ai/status
   ▼
server/src/index.js(3 条新路由)
   ▼
server/src/ai/agent.js ── 意图+实体识别 → Tool Calling 主循环(≤12 次/轮)→ LLM 综合分析
   ├── prompts.js    System Prompt(教练人设+实体解析铁律+批量工具优先+防编造铁律)
   ├── llm.js        智谱 GLM(OpenAI 兼容 chat/completions,支持 tools)
   ├── tools.js      9 个工具定义(JSON schema)+ 进程内执行分发
   │     ├─ 用户数据 Tools:get_account / get_position / get_trade_history
   │     ├─ 市场数据 Tools:search_stock / get_stock_quote / get_stock_kline /
   │     │                get_market_context / get_portfolio_risk_snapshot
   │     └── indicators.js(新)纯函数技术指标(程序算,LLM 只读)
   ├── context.js    多轮历史(data/chat.json,原子写)
   └── schemas.js    最终输出 JSON 的提取+校验+修复重试
```

**未来升级路径**(第一阶段不做):Tool Calling 之外增加 RAG 分支——把 `content/`(术语+课程)做成知识库,用户问"MACD 怎么看"时检索课程内容;届时 Agent = 实时/私有数据(Tools) + 学习知识库(RAG)。

## 4. 工具规格(tools.js)

全部工具**进程内直调**现有函数(不走 HTTP 自调用)。工具注册表**不包含任何下单能力**(物理隔离,而非提示词约束)。

### 实体解析铁律(防硬编码)

**Agent 必须先解决股票实体,再调用依赖 symbol 的工具**:用户消息中出现股票名称/简称/拼音时,LLM 应先 `search_stock` 得到 symbol,后续工具一律传 symbol;**实现层禁止写死"平安银行→sz000001"之类的名称映射表**——名称解析是 LLM+搜索工具的运行时行为,不是代码逻辑。多轮对话中已解析过的 symbol 通过对话上下文延续(`分析平安银行`→`那现在卖掉怎么样`,第二轮不再重新解析)。

| 工具 | 参数 | 返回要点 | 底层实现 |
|---|---|---|---|
| `search_stock` | `keyword: string`(名称/代码/拼音) | `[{symbol, name, board}]` ≤8 条 | `market.search()` |
| `get_account` | 无 | 现金/总资产/各持仓行(数量/可用/T+1锁/成本价/现价/浮盈) | `service.getAccountOverview()` |
| `get_position` | `symbol` | **批次明细**:每批 {qty, buyDate, avgBuyPrice, cost}、聚合成本、现价、浮盈、可用量 | `store.getPositions()[symbol]` + `market.getQuotes` 拼装 |
| `get_trade_history` | `symbol?`, `limit?=20` | 流水 [{time, symbol, name, side, price, qty, fees, note, realizedPnl}] 最新在前 | `store.getTrades(limit)` 按 symbol 过滤 |
| `get_stock_quote` | `symbol` | 现价/涨跌幅/开收高低/量额/换手/PE/PB/振幅/涨跌停/五档摘要/报价时间 | `market.getQuotes([symbol])` |
| `get_stock_kline` | `symbol`, `period: day\|week`, `limit?=60` | `[{date, open, close, high, low, volume}]` 升序 | `market.getKline()` |
| `calculate_indicators` | `symbol`, `period?=day`, `limit?=60` | 见 §5 指标对象 | `market.getKline()` → `indicators.js` |
| `get_market_context` | 无 | 三大指数 {name, last, changePct} + 当前模式(live/afterHours) | `market.getIndices()` + `service.getStatus()` |
| `get_portfolio_risk_snapshot` | 无 | **全部持仓的批量风险快照**:每只 {symbol, name, qty, costPrice, last, pnlPct, rsi, macdHist, volRatio5, volatility20, range20Position},按风险信号粗排 | `store.getPositions()` + 行情 + 逐只 `indicators.js`(K线有当日缓存,成本低) |

约定:
- 工具执行出错返回 `{ error: "人话原因" }` 给 LLM,让其决定重试或向用户说明,不抛异常打断循环。
- `get_position` 的每批 `avgBuyPrice = lot.cost/lot.qty`(cost 为含费总成本,含费口径与全站一致)。
- 报价类工具返回自带上游 `time` 字段,供 LLM 在回复中标注数据时点(盘后场景防误导)。

## 5. 技术指标规格(indicators.js,纯函数,全量单测)

输入:K线数组 `[{date, open, close, high, low, volume}]`(升序)。输出:

```jsonc
{
  "last": 11.35, "changePct": 0.52,          // 最后一根涨跌幅(对前收)
  "ma": { "ma5": 11.2, "ma10": 11.1, "ma20": 10.9, "ma60": 10.6 },
  "macd": { "dif": 0.05, "dea": 0.03, "hist": 0.02 },   // 参数 12/26/9,EMA 基
  "rsi": 57.3,                               // RSI14,收盘价
  "volume": { "lastVol": 83812, "volRatio5": 1.15 },    // 量比=末根/前5均
  "range20": { "high": 11.8, "low": 10.4, "position": 0.79 }, // 20日区间位置
  "changePctSeries5": [0.5, -0.2, 1.1, 0.3, 0.52],      // 近5日涨跌幅
  "volatility20": 0.018                      // 20日日收益率标准差
}
```

**铁律:所有数值程序计算,LLM 只读不算。** MACD/RSI 用教科书公式,单测用已知序列验算(含 EMA 平滑特性、RSI 全涨=100 边界、数据不足时字段为 null 且不报错)。数据不足(如 60 根不足)时相应字段返回 null,由 prompt 约定 LLM 略过该指标。

## 6. LLM 层(llm.js)

- 配置文件(仓库外,红线):`~/.stock-learning/ai.json`
  ```json
  { "apiKey": "智谱APIKey", "baseUrl": "https://open.bigmodel.cn/api/paas/v4", "model": "glm-5.3-flash" }
  ```
  环境变量 `ZHIPU_API_KEY` / `AI_MODEL` 可覆盖;未配置时 `/api/ai/status` 返回 `{configured:false}`,前端显示配置指引。
- 默认 `glm-5.3-flash`(GLM-5 系最新,FC 支持好,价格为旗舰 1/10;GLM-4.5-Flash 已于 2026-01-30 下线);真机验收不过则配置切 `glm-5.3`(更强)或 `glm-4.7-flash`(免费),**只改配置不改代码**。
- 请求:OpenAI 兼容 `POST {baseUrl}/chat/completions`,`messages` + `tools`;超时 60s;网络失败重试 1 次(退避 2s)。
- 不依赖 `response_format`(与 tools 同用兼容性存疑),JSON 约定走 prompt + 解析兜底(§8)。

## 7. Agent 主循环(agent.js)

```
输入 message → context.js 取最近 20 条历史 + 本条
循环(单轮工具调用上限 12 次):
  调 LLM(系统提示 + 历史 + 工具schema)
  ├─ 返回 tool_calls → tools.js 逐个执行 → 结果以 tool 角色消息回填 → 继续循环
  └─ 返回最终文本 → schemas.js 提取并校验 JSON
       ├─ 合法 → 落盘历史 → 返回 { ok:true, reply }
       └─ 非法 → 把校验错误追加为纠正消息,重试 1 次;仍失败 →
            返回降级结构(ok:true, reply={intent:'fallback', suggestion:原文, 提示解析失败})——不阻塞用户
历史落盘后若 >200 条,截断保留最近 100(文件不过度膨胀)
```

**工具调用策略(prompt 中约定 + 上限兜底)**:
- 上限 **12 次/轮**(支持多持仓逐只分析);批量场景**必须优先用 `get_portfolio_risk_snapshot` 一次拿全**,而不是逐只循环调用(S6 防失控的关键设计)。
- 触达上限仍未完成时:输出已完成部分的分析,并明确告知用户哪些股票没查到(不静默截断)。
- 个股分析的标准序:先 `search_stock`(实体)→ `get_position`/`get_account`(私有数据)→ `get_stock_quote`/`get_market_context`(实时)→ `calculate_indicators`(指标)→ 综合判断;LLM 按意图动态裁剪,不强制全调。

防失控:工具调用次数上限、同会话 10 秒节流(429 语义返回人话提示)、工具执行 3s 超时。

## 8. 最终输出 JSON Schema(schemas.js 校验)

```jsonc
{
  "intent": "sell_analysis",      // 枚举:general_analysis|buy_analysis|sell_analysis|
                                  //        position_analysis|add_position|reduce_position|
                                  //        risk_analysis|market_query|qa|fallback
  "symbol": "sz000001",            // 可空(qa 类)
  "decision": "hold",              // 枚举:buy|sell|hold|watch|split_sell|none(参考性质)
  "stanceText": "综合判断:偏向持有", // 人话综合判断(必须与 decision 一致),前端主展示
  "confidence": "medium",          // 枚举:high|medium|low,前端渲染为 高/中/低
  "facts": { ... },                // 本次实际查到的关键事实摘要(价格/持仓/指标/大盘),供前端展示;
                                  // reasons 引用的数字必须来自这里(事实层与推理层分离,防幻觉)
  "analysis": { "trend": "bullish", "technical": "..." },
  "reasons": ["...", "..."],       // 3 条左右,每条人话+数据依据
  "risks": ["...", "..."],
  "coachQuestions": ["你注意到换手率连续放大了吗?"],  // 教练式引导 0-3 条
  "suggestion": "暂时持有,可设 11.0 止盈线并关注 20 日线支撑。"
}
```

**不做 score 化评分**(v2 修订):第一版**不设数值评分**——LLM 没有经过验证的量化模型,`78/100` 这类数字会诱导用户当作"科学结论"。用 `stanceText`(人话综合判断)+ 三档 `confidence` 代替,卡片上显示"综合判断:偏向持有 / 置信度:中等"。

校验规则:intent/decision/confidence 必须在枚举内;stanceText 必填且非空;reasons/risks 为字符串数组;多余字段忽略;facts 若存在必须是对象。前端把该 JSON 渲染为富卡片,qa 类退化渲染为纯文本建议。

## 9. 多轮上下文(context.js)

- `data/chat.json`(复用临时文件+rename 原子写与 .bak 备份模式):`[{role:'user'|'assistant', content, ts}]`(工具调用过程**不**入库,只存最终问答,避免历史膨胀)。
- 传给 LLM 的历史:最近 20 条消息;工具结果只在单轮循环内存活。
- `DELETE /api/ai/chat` 清空历史。

## 10. 前端(AiChat.vue)

- 全站右下角浮动按钮「AI 教练」→ 右侧聊天抽屉(与 OrderPanel 同交互语言:scrim+drawer)。
- 消息流:用户气泡 / AI 结构化卡片(**综合判断(stanceText)+ 置信度三档徽章**、事实区、理由、风险、教练问题、建议、免责脚注「AI 仅供学习参考,不构成投资建议」)。**不展示任何数值评分**。
- 卡片在 `decision ∈ {buy,sell,split_sell}` 时显示「去模拟下单」→ 跳个股页并打开 OrderPanel 对应方向(**人工确认,Agent 不下单**)。
- 个股页顶部「问 AI」快捷入口:预填 `帮我分析一下 {name}({symbol})` 发送。
- `GET /api/ai/status` 未配置 → 抽屉内展示配置指引(文件路径+格式+注册链接),不弹错误。
- 加载态:"正在查询行情与持仓…"(工具循环期间可显示阶段提示,由后端 SSE 或简化为纯 loading,v1 用纯 loading)。

## 11. 安全与红线

- API key 只存 `~/.stock-learning/ai.json`,**不入库不进日志不回传前端**;status 只返回 `configured: true/false`。
- 不自动交易:工具注册表无下单能力(物理隔离)。
- 节流与会话上限防滥用;上游/LLM 全链路失败不影响行情/交易等既有功能(AI 是纯增量)。
- 输出免责声明为产品要求,system prompt 与前端卡片双保险。

## 12. 测试与验收

- **indicators.test.js**:MA/MACD/RSI/量比/区间位置/波动率的已知数据验算、数据不足边界。
- **tools.test.js**:mock market/store,验证 9 工具返回结构与错误包装;`get_portfolio_risk_snapshot` 多持仓批量(含无持仓/行情失败单只降级)、`get_market_context` 正常返回。
- **schemas.test.js**:合法/缺字段/越界/带 markdown 围栏的 JSON 提取;stanceText 缺失/decision 不一致时的修复重试路径。
- **agent.test.js**:mock llm(先返回 tool_calls 再返回最终 JSON),验证循环、**12 次上限**、JSON 修复重试、降级路径;模拟"名称→search→symbol 工具链"(实体解析顺序)。
- **真机验收**:配置真实 key 后逐条跑 §2 的 S1–S7,验证「正确意图→正确股票→正确工具→真实数据→合理建议」;重点核对:① Agent 引用的价格/持仓数字与页面一致(防编造);② S6 使用批量快照而非逐只循环(看日志工具调用序列);③ 多轮追问不重复解析实体。

## 13. 第一阶段明确不做

自动交易、复杂 RAG、多 Agent、强化学习、自动选股、自动资金管理、复杂量化策略、流式输出(SSE)、AI 主动定时推送。

## 14. 实施顺序(供 writing-plans 细化)

1. indicators.js + 单测 → 2. llm.js + 配置 → 3. tools.js + 单测 → 4. prompts.js + schemas.js + 单测 → 5. context.js + agent.js + 单测 → 6. 路由挂载 → 7. AiChat.vue + 个股页入口 → 8. 真机 S1–S7 验收 → 9. 文档(architecture 决策记录/README 配置/requirements 补节)+ 提交
