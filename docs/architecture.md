# 技术架构文档(architecture)

> 维护状态:**维护中** — 架构决策变更直接改本文件并在"决策记录"追加条目。
> 需求见 `requirements.md`;进度与环境备忘见 `project-state.md`。

## 1. 技术选型与理由

- **后端 Node.js(≥20)+ Express,前端 Vue 3 + Vite + Pinia**:单人本地工具,前后端一种语言降低维护成本;后端取数无跨域问题;`启动.bat` 双击即用
- **数据源:真实行情**——腾讯(实时报价/五档,GBK 编码)+ 东方财富(K线/搜索);不模拟假数据,学习可迁移到实盘
- **交易规则后端集中**:前端不承担规则校验,防止"前端自觉"式不可靠
- **本地 JSON 文件存储**:单用户无需数据库;原子写入保证断电不坏档
- **UI 视觉基准 = Stitch 设计稿**(`design/stitch/`),实现时修正已知偏差;**不直接采用 Stitch 生成的 HTML 框架**,组件结构按本文档

### 关键决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-08-30 | 方案一(Node 全栈)优于 Python+akshare、纯前端 | 稳定性/数据可靠性/启动便捷的平衡;akshare 依赖上游易断;纯前端跨域不可控 |
| 2026-08-30 | 真实行情数据(非程序生成/非历史回放) | 学习体验最接近实盘 |
| 2026-08-30 | 完整交易规则(T+1/涨跌停/三项费用/板块手数) | 规则本身是学习内容 |
| 2026-08-30 | 随时可交易(盘后按收盘价)+ 界面标注 | 用户晚上/周末使用,严格开盘时段会不可用 |
| 2026-08-30 | 前端用 Stitch 生成设计稿,MCP 拉取后照稿开发 | 用户指定;视觉质量有基准 |
| 2026-08-30 | v1 撮合只做即时成交,不做挂单 | 范围控制;界面如实标注限制 |
| 2026-08-30 | **K线/分时/搜索全部切腾讯**(ifzq K线 + minute 分时 + smartbox 搜索);东财仅文档备选 | 实测:东财 push2his 在本机直连不可达(代理开关均如此);东财 suggest 对 Node fetch 的 TLS 指纹返回无股票数据的 JSONP 分支(curl 却正常)。腾讯系接口对 Node fetch 全部稳定 |
| 2026-08-30 | 引擎修正:FIFO 部分平仓后剩余批次 cost 按比例缩减(保持"该批剩余股数含费总成本"语义) | 原实现保持整批 cost,导致账户浮盈虚高;consumedCost 本按单价摊算不受影响,T5 验收发现并修正 |
| 2026-08-30 | ~~T+1 可用量在账户视图按自然日判定~~ **修正:账户视图与下单同用当前交易日判定**(T6 浏览器实测发现) | 周末盘后买入会回溯到上一交易日批次,自然日口径会出现"页面显示可卖、下单被 T+1 拒绝"的不一致 |
| 2026-09-02 | **接入自然语言 AI Investment Agent**(智谱 GLM,OpenAI 兼容):9 只读工具+agent 循环+结构化 JSON 输出;只分析不交易(工具表物理隔离无下单能力);key 存仓库外 `~/.stock-learning/ai.json`;spec 见 docs/superpowers/specs/2026-09-02-ai-investment-agent-design.md | 用户需求:自然语言问"能不能买/卖",Agent 自主查行情/持仓/指标再判断;技术指标程序计算防 LLM 心算;去 score 化(stanceText+三档置信度)防伪科学感 |
| 2026-09-02 | **AI 改为 SSE 流式输出,思考过程实时展示**(`/api/ai/chat` 带 `stream:true` 走 SSE,不带则兼容旧 JSON);GLM 思考增量(delta.reasoning_content)经 onEvent 逐级转发到前端折叠面板;默认思考深度开满(质量优先,用户确认"久一点没关系"),`reasoningEffort` 配置可降档 | 用户反馈分析慢且不可见;实测 glm-5.3-flash 不支持关思考(传 disabled 被忽略/官方文档禁止),只能流式把等待"变成看得见的思考";单次分析 40-90s,全程思考流+工具进度可见不焦虑 |
| 2026-09-02 | **防编造双保险**:①"零工具带数据"闸门——回复含 facts 或方向性结论但一次工具未调,打回重查(独立 1 次预算),仍不查则拦截降级;②工具触顶 12 次不放弃,强制模型基于已查数据直接收尾输出 JSON | 实测 reasoning_effort=low 时模型会跳过工具凭空编持仓数字(1700股等),违反防编造铁律;触顶原"请拆小"浪费已查数据。注:流式拼装 tool_calls 必须补 `type:'function'`,否则回传报智谱 1214"工具类型不能为空" |
| 2026-09-04 | **Docker 化部署 + 应用内 Basic Auth**:多阶段镜像(web 构建层→node:22-alpine 运行层,非 root);compose 挂数据卷 ./data:/data,AI key 与口令走 .env 环境变量注入(密钥不入库);镜像钉死 TZ=Asia/Shanghai(盘中/盘后与交易日判定依赖本地时间,容器默认 UTC 会全错);鉴权以 AUTH_USER/AUTH_PASS 是否配置为开关,不配置则不挂载 | 公网仅自己使用场景:Basic Auth 前端零改动(浏览器原生弹框记凭据,fetch/SSE 同源自动携带);鉴权放应用层而非反代层,同一镜像"本地无鉴权/服务器有鉴权"用环境变量切换;`/api/meta/status` 免口令白名单供 healthcheck。自引用依赖 `stock-learning: file:..`(server/web package.json,代码从未引用)已删——否则 Docker 内 npm ci 拖入整个仓库 |
| 2026-09-09 | **AI 教练纳入基本面**:新工具 `get_stock_fundamentals`(第 10 个,仍纯只读),数据源用**新浪财经 vFD 财务指标页**(GB2312 HTML);market.js 新增 `getFundamentals`:并行抓 当年+前两年 共 3 页,取最近两个年报+最新季报列,24h 缓存(财报按报告期更新);提示词铁律加"买卖/持有判断必须结合基本面" | 数据源实测淘汰赛:腾讯 F10 无公开稳定路径(控制器猜不中)、网易 502、同花顺 403(指纹封锁)、东财按 2026-08-30 既有决策弃用;新浪 Node fetch 直连实测通过(T4 教训:curl 通≠Node fetch 通,东财 suggest 对 Node fetch TLS 歧视)。两个数据坑:①新浪"销售毛利率"字段近年停更(全 --),用 100−主营业务成本率反推(茅台 2025 反推 91.18% 与真实一致;银行成本率缺失则 null,本就无此口径);②market.js 模块级 round2 无判空守卫(round2(null)=0),基本面解析需先 Number.isFinite 守卫。工具超时按工具差异化:基本面 8s(3 页并行,实测 ~500ms),其余 3s。E2E 验收:茅台综合分析 5 工具链含基本面,facts 数字全真,"基本面顶级但成长放缓+技术面偏弱"冲突如实分说 |

## 2. 目录结构

```
股票学习/
├── server/                  # Node.js + Express
│   ├── src/market.js        # 行情服务:腾讯实时/五档(GBK解码)、东财K线/搜索;内存缓存+TTL;失败重试×2
│   ├── src/engine/          # 交易引擎(纯函数,无IO)★重点测试对象
│   │   ├── fees.js          #   费用计算
│   │   ├── validate.js      #   规则校验(涨跌停/手数/T+1/资金)
│   │   ├── execute.js       #   撮合与持仓更新(FIFO)
│   │   └── calendar.js      #   交易日历(日K反推,按年缓存)
│   ├── src/store.js         # JSON文件存储(data/目录,临时文件+rename原子写,写前备份)
│   ├── src/content.js       # 术语表/课程markdown读取
│   └── src/index.js         # 路由、静态托管 web/dist、启动
├── web/                     # Vue 3 + Vite + Pinia
│   └── src/views/           # Market / StockDetail / Portfolio / Review(=Review+Learn)
│   │   + components: KLineChart、OrderPanel、TermPopover、GuidedTour、FeePreview
│   └── vite.config.js       # dev 代理 /api → localhost:8090
├── content/
│   ├── terms.json           # 术语表
│   └── lessons/*.md         # 课程文章
├── data/                    # 账户数据(自动生成,git忽略)
├── design/stitch/           # Stitch 设计稿基准(5屏 jpg+html)+ index.json
├── docs/                    # 本文档体系
├── 启动.bat                 # 缺依赖则安装→缺构建则构建→起服务→开浏览器 localhost:8090
└── package.json             # 根工作区脚本:start / dev / build / test
```

- 端口:服务 8090;开发模式 Vite 5173 代理 /api
- 交易引擎为纯函数:`(订单, 最新行情, 账户状态, 日历) → 成交结果 | 拒绝原因`;服务层负责加锁串行下单与落盘

## 3. 核心数据流

- **看盘**:前端每 5 秒轮询(标签页隐藏时暂停,visibilitychange)→ 后端行情服务(内存缓存 TTL 内复用)→ 腾讯/东财接口
- **下单**:前端提交 → 服务层入内存队列串行 → 交易引擎用最新报价校验+撮合 → store 原子落盘 → 返回成交明细(费用拆解)或人话拒绝原因
- **资产曲线**:每日首次加载或有成交时更新当日快照到 snapshots

## 4. API 设计(REST,JSON)

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/market/indices | 三大指数报价 |
| GET | /api/market/quotes?symbols=sh600519,... | 批量实时报价(含五档、涨跌停价) |
| GET | /api/market/kline?symbol=&klt=day\|week\|minute&limit= | K线(东财;101日/102周/1分时;前复权) |
| GET | /api/market/search?q= | 搜代码/名称,仅沪深A股,含板块标记 |
| GET | /api/meta/status | { mode: live\|afterHours, time } 盘中/盘后 |
| GET | /api/account | 现金、持仓(含批次)、初始资金 |
| POST | /api/orders | 下单 { symbol, side, price, qty, note? } → 成交明细/拒绝原因 |
| GET | /api/trades?limit= | 历史成交 |
| GET | /api/review/summary | 平仓明细+胜率/平均持有天数等统计 |
| POST | /api/account/reset | 重置为初始 10 万 |
| GET | /api/content/terms | 术语表 |
| GET | /api/content/lessons/:id | 课程 markdown |

错误约定:业务拒绝 HTTP 200 + `{ ok: false, reason: "人话原因" }`;5xx 仅用于服务端故障。

## 5. 数据模型(data/*.json)

```jsonc
// account.json
{ "initialCash": 100000, "cash": 88234.50, "createdAt": "2026-08-30T10:00:00+08:00" }

// positions.json   // 按股票聚合,lots 支撑 T+1 与 FIFO
{
  "sh600519": {
    "symbol": "sh600519", "name": "贵州茅台", "board": "main",
    "lots": [ { "qty": 100, "date": "2026-08-28", "cost": 10007.63 } ]
  }
}

// trades.json      // 追加式流水
{
  "id": "t0001", "time": "...", "symbol": "sh600519", "name": "贵州茅台",
  "side": "buy", "price": 100.0, "qty": 100,
  "fees": { "commission": 5.0, "stampTax": 0, "transferFee": 0.1 },
  "amount": 10000.0, "mode": "live", "note": "看好白酒板块",
  "realizedPnl": null   // 卖出时填充,附 closeLots 对应买入批次
}

// watchlist.json: ["sh600519", "sz000001"]
// snapshots.json: { "2026-08-30": 99500.0 }
```

金额处理:计算过程用整数分或逐项四舍五入到分;严禁裸浮点累加后不取整。

## 6. 上游数据源

| 用途 | 来源 | 备注 |
|---|---|---|
| 实时报价+五档+涨跌停价 | 腾讯 qt.gtimg.cn/q=sh600519 | GBK 编码需 iconv-lite;单次批量 ~60 只上限;`q=` 在路径上(无 `?`) |
| 日/周K线(前复权) | 腾讯 web.ifzq.gtimg.cn fqkline | `param=代码,day|week,,,数量,qfq`;UTF-8 JSON;指数无 qfqday 键,回退 day/week 键 |
| 分时 | 腾讯 ifzq minute/query | 每行"时间 现价 累计量(手) 累计额(元)";分钟量取差分,均价=累计额/累计量/100 |
| 搜索 | 腾讯 smartbox.gtimg.cn | GBK;`v_hint="市场~代码~名称(\uXXXX转义)~拼音~类型^..."`;只留 sh/sz 且类型 GP-A |

> ⚠️ 已弃用东财 push2his(K线)与 searchapi(搜索),原因见 §1 决策记录 2026-08-30 条目。

缓存:报价 3 秒 TTL(按只);日K 当日缓存;周K 60 秒;分时 5 秒;日历按年缓存至内存。所有上游请求 5 秒超时,失败重试 2 次(退避 500ms/1s)。

> ⚠️ 腾讯/东财接口在境内直连正常,**不要**给它们走代理;仅 Stitch/Google 相关请求需要代理(见 §8)。

## 7. 错误处理

- 上游失败(重试后仍失败):报价区横幅"行情获取失败,当前显示 HH:MM 数据",K线区重试按钮;不阻塞已入页面
- 盘后模式角标 + 下单面板顶部提示,防止误以为实时盘中
- 本地存储:临时文件 + rename 原子写,写前保留 .bak;启动时 JSON 损坏则从 .bak 恢复并提示
- 下单内存队列串行化,避免并发双花

## 8. 开发环境(Windows,关键!)

- Shell:Git Bash(`/c/Users/...` 路径形式);Node v22.14.0
- **系统代理 127.0.0.1:7897**(Clash 类工具):仅访问 Google/Stitch 时需要
- **Node 22 的 fetch 不认系统代理**。访问 Stitch 必须加:
  - `NODE_OPTIONS="--require C:/Users/wangy/.zcode/stitch-proxy/proxy-boot.cjs"`(undici EnvHttpProxyAgent 补丁,位于仓库外)
  - 且设置 `HTTPS_PROXY=http://127.0.0.1:7897`
- Stitch CLI 一键包装:`bash C:/Users/wangy/.zcode/stitch-proxy/stitch.sh <命令>`(自动带 key 与代理,**key 不入仓库、不显示在输出**)
- Stitch 项目 ID:`13228539535838239483`;屏幕 ID 对照:`design/stitch/index.json`
- GitHub:仓库 `WYW-1127/stock-learning`(私有),git 凭据用本机 store 模式,推送直接可用
- **东财接口坑(2026-08-30 实测)**:①push2his 域名族本机直连不可达,代理开关均如此,且非整体断网(同机房 push2/searchapi/datacenter 正常);②searchapi 对 Node fetch 无论何种 header 都返回"JSONP 包装 + 无股票数据的分支",curl 却返回纯 JSON 股票数据——判定为按 TLS/HTTP2 指纹分流,程序化客户端被歧视。**教训:验证上游接口必须用 Node fetch 实测,只跑 curl 会误判可用**

## 9. 测试策略

- **交易引擎全量单元测试(vitest)**:
  - 费用:最低佣金触发线(成交额 ¥20,000 恰好 ¥5)、四舍五入到分、买卖拆解
  - 涨跌停:边界价可成交/超一分拒绝;ST ±5%(接口边界);科创板 200/201 股合法、199 拒绝;主板 150 股拒绝
  - T+1:当日买入不可卖、跨周末/节假日次日可卖(真实日历);FIFO 多批次减扣与盈亏
  - 撮合:买价≥现价成交、<现价拒绝;盘后按收盘价
  - 资金不足拒绝;清仓后持仓删除、可用量正确
- 存储测试:原子写、损坏恢复、重置
- 行情服务测试(mock fetch):GBK 解析、字段映射、缓存命中、重试
- UI 手动清单:首次引导走通 / 盘后下单角标 / 断网横幅 / 术语卡弹出 / 复盘统计与手算一致 / 重置回 10 万

## 10. 未来版本(不在本期)

挂单撤单与集合竞价、场外基金申赎、基本面资料页、历史K线回放练习、移动端优化。
